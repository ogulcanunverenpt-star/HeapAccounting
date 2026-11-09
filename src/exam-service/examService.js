import { randomUUID } from 'node:crypto';
import { calculateRating, gradeExam, publicExam, validateExamDefinition } from '../serverroot/src/game/examRules.js';
import { checkCashSale } from '../serverroot/src/game/cashSale.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function transaction(pool, fn) {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    const result = await fn(connection);
    await connection.query('COMMIT');
    return result;
  } catch (error) {
    try { await connection.query('ROLLBACK'); } catch (rollbackError) { console.error('Database rollback failed:', rollbackError); }
    throw error;
  } finally {
    connection.release();
  }
}

function validatedFiles(files) {
  if (!Array.isArray(files) || files.length > 5) throw new HttpError(400, 'Invalid files');
  let total = 0;
  return files.map(file => {
    if (!file || typeof file.filename !== 'string' || file.filename.length > 100 ||
        !/^[a-zA-Z0-9._-]+$/.test(file.filename) || typeof file.base64 !== 'string' ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64)) {
      throw new HttpError(400, 'Invalid file');
    }
    const content = Buffer.from(file.base64, 'base64');
    total += content.length;
    if (!content.length || content.length > 5 * 1024 * 1024 || total > 10 * 1024 * 1024) throw new HttpError(400, 'File size limit exceeded');
    const pdf = file.filename.toLowerCase().endsWith('.pdf') && file.contentType === 'application/pdf' && content.subarray(0, 5).toString('ascii') === '%PDF-';
    const csv = file.filename.toLowerCase().endsWith('.csv') && file.contentType === 'text/csv';
    if (!pdf && !csv) throw new HttpError(400, 'Only PDF and CSV files are supported');
    return { id: randomUUID(), filename: file.filename, contentType: file.contentType, content };
  });
}

export function createExamService(pool) {
  const sqlite = pool.dialect === 'sqlite';
  const nowSql = sqlite ? "CAST(unixepoch('subsec') * 1000 AS INTEGER)" : 'clock_timestamp()';
  async function lockPractice(connection) {
    await connection.query(`SELECT id FROM practice_gate WHERE id = 1${sqlite ? '' : ' FOR UPDATE'}`);
  }
  async function grantIfComplete(connection, userId) {
    const builtin = await connection.query('SELECT exercise_id FROM practice_completions WHERE user_id = $1 AND exercise_id = $2', [userId, 'cash-sale']);
    if (!builtin.rows.length) return;
    const remaining = await connection.query(
      `SELECT p.id FROM practice_exercises p LEFT JOIN practice_completions c
       ON c.exercise_id = ${sqlite ? 'p.id' : 'CAST(p.id AS text)'} AND c.user_id = $1
       WHERE p.active AND c.exercise_id IS NULL LIMIT 1`, [userId],
    );
    if (!remaining.rows.length) await connection.query('INSERT INTO exam_players (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
  }
  async function lockAssistant(connection, userId) {
    await connection.query(`INSERT INTO exam_assistant_leases (user_id, expires_at) VALUES ($1, ${nowSql}) ON CONFLICT (user_id) DO NOTHING`, [userId]);
    await connection.query(`SELECT user_id FROM exam_assistant_leases WHERE user_id = $1${sqlite ? '' : ' FOR UPDATE'}`, [userId]);
  }
  async function finish(connection, attempt, now, answers, expired) {
    const elapsed = Math.max(0, Math.floor(now.getTime() - attempt.started_at.getTime()));
    const durationMs = Math.min(elapsed, attempt.definition.timeLimitSeconds * 1000);
    const grading = expired ? { score: 0, details: [] } : gradeExam(attempt.definition, answers);
    const playerResult = await connection.query(`SELECT rating FROM exam_players WHERE user_id = $1${sqlite ? '' : ' FOR UPDATE'}`, [attempt.user_id]);
    if (!playerResult.rows.length) throw new Error('Attempt player missing');
    const before = playerResult.rows[0].rating;
    const after = calculateRating(before, attempt.definition.difficultyRating, grading.score);
    await connection.query('UPDATE exam_players SET rating = $1 WHERE user_id = $2', [after, attempt.user_id]);
    if (after >= 500) await connection.query('INSERT INTO prime_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [attempt.user_id]);
    const updated = await connection.query(
      `UPDATE exam_attempts SET status = $1, completed_at = $2, answers = $3, score = $4, duration_ms = $5,
       rating_before = $6, rating_after = $7 WHERE id = $8 RETURNING *`,
      [expired ? 'expired' : 'finished', now, JSON.stringify(expired ? {} : answers), grading.score, durationMs, before, after, attempt.id],
    );
    return { ...updated.rows[0], definition: attempt.definition };
  }

  function result(attempt) {
    const response = {
      id: attempt.id, examId: attempt.exam_id, status: attempt.status,
      examTitle: attempt.definition.title,
      startedAt: attempt.started_at, completedAt: attempt.completed_at,
      score: attempt.score, durationMs: attempt.duration_ms === null ? null : Number(attempt.duration_ms),
      ratingBefore: attempt.rating_before, ratingAfter: attempt.rating_after,
    };
    if (attempt.status !== 'active') {
      response.answers = attempt.answers;
      response.solutions = attempt.definition.questions.map(question => ({ questionId: question.id, answer: question.answer }));
    }
    return response;
  }

  async function lockedAttempt(connection, id, userId) {
    const found = await connection.query(
      `SELECT a.*, e.definition FROM exam_attempts a
       JOIN exams e ON e.id = a.exam_id WHERE a.id = $1 AND a.user_id = $2${sqlite ? '' : ' FOR UPDATE OF a'}`, [id, userId],
    );
    if (!found.rows.length) throw new HttpError(404, 'Attempt not found');
    const now = await connection.query(sqlite
      ? "SELECT CAST(unixepoch('subsec') * 1000 AS INTEGER) AS db_now"
      : 'SELECT clock_timestamp() AS db_now');
    found.rows[0].db_now = now.rows[0].db_now;
    return found.rows[0];
  }

  async function finalizeIfExpired(connection, attempt) {
    if (attempt.status !== 'active' || attempt.db_now.getTime() < attempt.started_at.getTime() + attempt.definition.timeLimitSeconds * 1000) return attempt;
    return finish(connection, attempt, attempt.db_now, {}, true);
  }

  return {
    async ensureExampleExam(raw) {
      const definition = validateExamDefinition(raw);
      await pool.query('INSERT INTO exams (id, definition, created_by) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
        ['e8b3ad82-e116-4ed8-b2bb-754f5b954b6e', JSON.stringify(definition), 'system']);
    },
    async profile(userId, isAdmin) {
      let { rows } = await pool.query('SELECT rating, qualified_at FROM exam_players WHERE user_id = $1', [userId]);
      if (!rows.length) {
        await transaction(pool, async connection => { await lockPractice(connection); await grantIfComplete(connection, userId); });
        ({ rows } = await pool.query('SELECT rating, qualified_at FROM exam_players WHERE user_id = $1', [userId]));
      }
      const progress = await pool.query('SELECT exercise_id FROM practice_completions WHERE user_id = $1 AND exercise_id = $2', [userId, 'cash-sale']);
      if (rows.length && rows[0].rating >= 500) await pool.query('INSERT INTO prime_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
      const prime = await pool.query('SELECT user_id FROM prime_wallets WHERE user_id = $1', [userId]);
      return { userId, isAdmin, qualified: rows.length > 0, rating: rows[0]?.rating ?? null, builtinPracticeCompleted: rows.length > 0 || progress.rows.length > 0, primeUnlocked: prime.rows.length > 0 };
    },
    async qualify(userId, rows) {
      if (checkCashSale(rows) !== 'correct') throw new HttpError(400, 'Practice solution is incorrect');
      await transaction(pool, async connection => {
        await lockPractice(connection);
        await connection.query('INSERT INTO practice_completions (user_id, exercise_id) VALUES ($1, $2) ON CONFLICT (user_id, exercise_id) DO NOTHING', [userId, 'cash-sale']);
        await grantIfComplete(connection, userId);
      });
      return this.profile(userId, false);
    },
    async practices(userId, isAdmin) {
      const { rows } = await pool.query(
        `SELECT p.id, p.definition, p.active, c.exercise_id AS completed FROM practice_exercises p
         LEFT JOIN practice_completions c ON c.exercise_id = ${sqlite ? 'p.id' : 'CAST(p.id AS text)'} AND c.user_id = $1
         ${isAdmin ? '' : 'WHERE p.active'} ORDER BY p.created_at, p.id`, [userId],
      );
      return rows.map(row => ({ id: row.id, active: Boolean(row.active), completed: Boolean(row.completed), exam: publicExam(row.definition) }));
    },
    async createPractice(userId, raw) {
      let definition;
      try { definition = validateExamDefinition(raw); } catch (error) { throw new HttpError(400, error.message); }
      const id = randomUUID();
      await transaction(pool, async connection => {
        await lockPractice(connection);
        await connection.query('INSERT INTO practice_exercises (id, definition, created_by) VALUES ($1, $2, $3)', [id, JSON.stringify(definition), userId]);
      });
      return { id };
    },
    async setPracticeActive(id, active) {
      if (typeof active !== 'boolean') throw new HttpError(400, 'Invalid active state');
      await transaction(pool, async connection => {
        await lockPractice(connection);
        const found = await connection.query('UPDATE practice_exercises SET active = $1 WHERE id = $2 RETURNING id', [sqlite ? Number(active) : active, id]);
        if (!found.rows.length) throw new HttpError(404, 'Practice not found');
      });
      return { id, active };
    },
    async completePractice(userId, id, answers) {
      await transaction(pool, async connection => {
        await lockPractice(connection);
        const found = await connection.query('SELECT definition FROM practice_exercises WHERE id = $1 AND active', [id]);
        if (!found.rows.length) throw new HttpError(404, 'Practice not found');
        let grading;
        try { grading = gradeExam(found.rows[0].definition, answers); } catch (error) { throw new HttpError(400, error.message); }
        if (grading.score !== 100) throw new HttpError(400, 'Practice solution is incorrect');
        await connection.query('INSERT INTO practice_completions (user_id, exercise_id) VALUES ($1, $2) ON CONFLICT (user_id, exercise_id) DO NOTHING', [userId, id]);
        await grantIfComplete(connection, userId);
      });
      return this.profile(userId, false);
    },
    async cryptoWatchlist(userId) {
      await this.profile(userId, false);
      const { rows } = await pool.query('SELECT symbol FROM crypto_watchlist WHERE user_id = $1 ORDER BY symbol', [userId]);
      return rows.map(row => row.symbol);
    },
    async updateCryptoWatchlist(userId, symbol, add) {
      if (typeof symbol !== 'string' || !/^[A-Z0-9]{2,30}$/.test(symbol) || typeof add !== 'boolean') throw new HttpError(400, 'Invalid watchlist request');
      return transaction(pool, async connection => {
        const wallet = await connection.query(`SELECT user_id FROM prime_wallets WHERE user_id = $1${sqlite ? '' : ' FOR UPDATE'}`, [userId]);
        if (!wallet.rows.length) throw new HttpError(403, 'Reach 500 Elo to unlock Prime');
        if (add) {
          const existing = await connection.query('SELECT symbol FROM crypto_watchlist WHERE user_id = $1', [userId]);
          if (existing.rows.length >= 100 && !existing.rows.some(row => row.symbol === symbol)) throw new HttpError(409, 'Watchlist limit reached');
          await connection.query('INSERT INTO crypto_watchlist (user_id, symbol) VALUES ($1, $2) ON CONFLICT (user_id, symbol) DO NOTHING', [userId, symbol]);
        } else {
          await connection.query('DELETE FROM crypto_watchlist WHERE user_id = $1 AND symbol = $2', [userId, symbol]);
        }
        return { symbol, added: add };
      });
    },
    async createExam(userId, raw, files) {
      let definition;
      try { definition = validateExamDefinition(raw); } catch (error) { throw new HttpError(400, error.message); }
      const safeFiles = validatedFiles(files);
      const id = randomUUID();
      return transaction(pool, async connection => {
        await connection.query('INSERT INTO exams (id, definition, created_by) VALUES ($1, $2, $3)', [id, JSON.stringify(definition), userId]);
        for (const file of safeFiles) {
          await connection.query('INSERT INTO exam_files (id, exam_id, filename, content_type, content) VALUES ($1, $2, $3, $4, $5)', [file.id, id, file.filename, file.contentType, file.content]);
        }
        return { id };
      });
    },
    async listExams(userId) {
      const { rows } = await pool.query(
        `SELECT e.id, e.definition, e.created_at, a.id AS attempt_id, a.status AS attempt_status
         FROM exams e LEFT JOIN exam_attempts a ON a.exam_id = e.id AND a.user_id = $1
         ORDER BY CASE e.definition->>'difficulty' WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         ${sqlite ? "CAST(e.definition->>'difficultyRating' AS INTEGER)" : "(e.definition->>'difficultyRating')::integer"} ASC, e.created_at DESC`, [userId],
      );
      return rows.map(({ id, definition, created_at, attempt_id, attempt_status }) => ({
        id, title: definition.title, description: definition.description, difficulty: definition.difficulty,
        difficultyRating: definition.difficultyRating, timeLimitSeconds: definition.timeLimitSeconds,
        createdAt: created_at, attemptId: attempt_id, attemptStatus: attempt_status,
      }));
    },
    async start(userId, examId) {
      return transaction(pool, async connection => {
        await lockAssistant(connection, userId);
        const lease = await connection.query(`SELECT user_id FROM exam_assistant_leases WHERE user_id = $1 AND expires_at > ${nowSql}`, [userId]);
        if (lease.rows.length) throw new HttpError(409, 'Wait for the assistant response before starting an exam');
        const player = await connection.query('SELECT user_id FROM exam_players WHERE user_id = $1', [userId]);
        if (!player.rows.length) throw new HttpError(403, 'Complete the practice challenge first');
        const exam = await connection.query('SELECT id FROM exams WHERE id = $1', [examId]);
        if (!exam.rows.length) throw new HttpError(404, 'Exam not found');
        const inserted = await connection.query(
          `INSERT INTO exam_attempts (id, exam_id, user_id) VALUES ($1, $2, $3)
           ON CONFLICT (exam_id, user_id) DO NOTHING RETURNING id`, [randomUUID(), examId, userId],
        );
        if (!inserted.rows.length) throw new HttpError(409, 'This exam has already been started');
        return { id: inserted.rows[0].id };
      });
    },
    async attempt(userId, id) {
      return transaction(pool, async connection => {
        let attempt = await lockedAttempt(connection, id, userId);
        attempt = await finalizeIfExpired(connection, attempt);
        const output = result(attempt);
        if (attempt.status === 'active') {
          output.exam = publicExam(attempt.definition);
          const files = await connection.query('SELECT id, filename, content_type FROM exam_files WHERE exam_id = $1 ORDER BY filename, id', [attempt.exam_id]);
          output.files = files.rows.map(file => ({ id: file.id, filename: file.filename, contentType: file.content_type }));
          output.remainingMs = Math.max(0, attempt.started_at.getTime() + attempt.definition.timeLimitSeconds * 1000 - attempt.db_now.getTime());
        }
        return output;
      });
    },
    async submit(userId, id, answers) {
      return transaction(pool, async connection => {
        let attempt = await lockedAttempt(connection, id, userId);
        attempt = await finalizeIfExpired(connection, attempt);
        if (attempt.status !== 'active') return result(attempt);
        try {
          attempt = await finish(connection, attempt, attempt.db_now, answers, false);
        } catch (error) {
          if (error instanceof RangeError) throw new HttpError(400, error.message);
          throw error;
        }
        return result(attempt);
      });
    },
    async leaderboard() {
      const { rows } = await pool.query('SELECT user_id, rating FROM exam_players ORDER BY rating DESC, user_id ASC LIMIT 100');
      return rows.map(({ user_id, rating }) => ({ userId: user_id, rating }));
    },
    async myResults(userId) {
      const { rows } = await pool.query(
        `SELECT a.*, e.definition FROM exam_attempts a JOIN exams e ON e.id = a.exam_id
         WHERE a.user_id = $1 ORDER BY a.started_at DESC LIMIT 100`, [userId],
      );
      return rows.map(result);
    },
    async file(userId, examId, fileId) {
      const { rows } = await pool.query(
        `SELECT f.filename, f.content_type, f.content FROM exam_files f
         JOIN exam_attempts a ON a.exam_id = f.exam_id
         WHERE f.exam_id = $1 AND f.id = $2 AND a.user_id = $3`, [examId, fileId, userId],
      );
      if (!rows.length) throw new HttpError(404, 'File not found');
      return rows[0];
    },
    async acquireAssistant(userId) {
      return transaction(pool, async connection => {
        const leaseId = randomUUID();
        await lockAssistant(connection, userId);
        const lease = await connection.query(`SELECT user_id FROM exam_assistant_leases WHERE user_id = $1 AND expires_at > ${nowSql}`, [userId]);
        if (lease.rows.length) throw new HttpError(429, 'An assistant request is already in progress');
        const active = await connection.query(sqlite
          ? `SELECT a.id FROM exam_attempts a JOIN exams e ON e.id = a.exam_id WHERE a.user_id = $1 AND a.status = 'active' AND a.started_at + CAST(e.definition->>'timeLimitSeconds' AS INTEGER) * 1000 > ${nowSql} LIMIT 1`
          : `SELECT a.id FROM exam_attempts a JOIN exams e ON e.id = a.exam_id WHERE a.user_id = $1 AND a.status = 'active' AND a.started_at + (e.definition->>'timeLimitSeconds')::integer * interval '1 second' > ${nowSql} LIMIT 1`, [userId]);
        if (active.rows.length) throw new HttpError(403, 'Assistant is unavailable during an active exam');
        await connection.query(sqlite
          ? `UPDATE exam_assistant_leases SET expires_at = ${nowSql} + 60000, lease_id = $2 WHERE user_id = $1`
          : `UPDATE exam_assistant_leases SET expires_at = ${nowSql} + interval '60 seconds', lease_id = $2 WHERE user_id = $1`, [userId, leaseId]);
        return leaseId;
      });
    },
    async releaseAssistant(userId, leaseId) {
      await pool.query(`UPDATE exam_assistant_leases SET expires_at = ${nowSql} WHERE user_id = $1 AND lease_id = $2`, [userId, leaseId]);
    },
    async expireBatch() {
      return transaction(pool, async connection => {
        const { rows } = await connection.query(sqlite
          ? `SELECT a.*, e.definition, CAST(unixepoch('subsec') * 1000 AS INTEGER) AS db_now FROM exam_attempts a
           JOIN exams e ON e.id = a.exam_id WHERE a.status = 'active'
           AND a.started_at + CAST(e.definition->>'timeLimitSeconds' AS INTEGER) * 1000 <= unixepoch('subsec') * 1000
           ORDER BY a.started_at LIMIT 1`
          : `SELECT a.*, e.definition, clock_timestamp() AS db_now FROM exam_attempts a
           JOIN exams e ON e.id = a.exam_id WHERE a.status = 'active'
           AND a.started_at + (e.definition->>'timeLimitSeconds')::integer * interval '1 second' <= clock_timestamp()
           ORDER BY a.started_at LIMIT 1 FOR UPDATE OF a SKIP LOCKED`,
        );
        for (const attempt of rows) await finalizeIfExpired(connection, attempt);
        return rows.length;
      });
    },
  };
}
