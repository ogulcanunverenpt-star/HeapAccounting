import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createExamService } from '../examService.js';
import { createSqlitePool } from '../sqlitePool.js';

const localized = text => ({ tr: text, en: text });
const definition = {
  title: localized('Example'), description: localized('Example exam'),
  difficulty: 'easy', difficultyRating: 100, timeLimitSeconds: 60,
  questions: [{ id: 'one', type: 'choice', points: 100, prompt: localized('Question'),
    options: [{ id: 'a', text: localized('A') }, { id: 'b', text: localized('B') }], answer: 'a' }],
};
const practice = [
  { accountCode: '100', side: 'debit', amount: '1200' },
  { accountCode: '600', side: 'credit', amount: '1000' },
  { accountCode: '391', side: 'credit', amount: '200' },
];

for (const dialect of ['postgres', 'sqlite']) test(`${dialect}: practice, private exam, single attempt, rating and expiration`, async () => {
  const db = dialect === 'postgres' ? await PGlite.create() : null;
  const pool = db ? {
    query: (sql, params) => db.query(sql, params),
    connect: async () => ({ query: (sql, params) => db.query(sql, params), release() {} }),
  } : await createSqlitePool(':memory:');
  try {
    if (db) await db.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
    const service = createExamService(pool);
    const user = '@player:example.org';
    const other = '@other:example.org';
    const created = await service.createExam('@admin:example.org', definition, [
      { filename: 'question.csv', contentType: 'text/csv', base64: Buffer.from('a,b\n1,2').toString('base64') },
    ]);
    await assert.rejects(service.start(user, created.id), /practice/i);
    await assert.rejects(service.qualify(user, []), /incorrect/i);
    await service.qualify(user, practice);
    assert.equal((await service.profile(user, false)).rating, 100);
    const lease = await service.acquireAssistant(user);
    await assert.rejects(service.start(user, created.id), /assistant response/i);
    await assert.rejects(service.acquireAssistant(user), /already in progress/i);
    await service.releaseAssistant(user, 'wrong-id');
    await assert.rejects(service.start(user, created.id), /assistant response/i);
    await service.releaseAssistant(user, lease);
    const started = await service.start(user, created.id);
    await assert.rejects(service.acquireAssistant(user), /active exam/i);
    await assert.rejects(service.start(user, created.id), /already been started/);
    const running = await service.attempt(user, started.id);
    assert.equal(running.status, 'active');
    assert.equal(JSON.stringify(running.exam).includes('"answer"'), false);
    assert.equal(running.files.length, 1);
    assert.match(Buffer.from((await service.file(user, created.id, running.files[0].id)).content).toString(), /a,b/);
    await assert.rejects(service.file(other, created.id, running.files[0].id), /not found/);
    await assert.rejects(service.attempt(other, started.id), /not found/);
    const completed = await service.submit(user, started.id, { one: 'a' });
    assert.equal(completed.score, 100);
    assert.equal(completed.ratingBefore, 100);
    assert.equal(completed.ratingAfter, 116);
    await service.releaseAssistant(user, await service.acquireAssistant(user));
    assert.deepEqual(completed.solutions, [{ questionId: 'one', answer: 'a' }]);
    assert.equal((await service.submit(user, started.id, { one: 'b' })).ratingAfter, 116);
    await service.qualify(user, practice);
    assert.equal((await service.profile(user, false)).rating, 116);
    assert.equal((await service.myResults(user))[0].id, started.id);
    assert.equal((await service.leaderboard())[0].rating, 116);
    const another = await service.createExam('@admin:example.org', definition, []);
    const timed = await service.start(user, another.id);
    await pool.query(dialect === 'sqlite'
      ? "UPDATE exam_attempts SET started_at = CAST(unixepoch('subsec') * 1000 AS INTEGER) - 61000 WHERE id = $1"
      : "UPDATE exam_attempts SET started_at = clock_timestamp() - interval '61 seconds' WHERE id = $1", [timed.id]);
    assert.equal(await service.expireBatch(), 1);
    const expired = await service.attempt(user, timed.id);
    assert.equal(expired.status, 'expired');
    assert.equal(expired.score, 0);
    assert.equal(expired.durationMs, 60000);
    assert.equal((await service.submit(user, timed.id, { one: 'a' })).score, 0);

    const hard = await service.createExam('@admin:example.org', { ...definition, difficulty: 'hard', difficultyRating: 50 }, []);
    const medium = await service.createExam('@admin:example.org', { ...definition, difficulty: 'medium', difficultyRating: 30 }, []);
    const easier = await service.createExam('@admin:example.org', { ...definition, difficulty: 'easy', difficultyRating: 10 }, []);
    const listed = await service.listExams(user);
    assert.deepEqual(listed.map(exam => [exam.difficulty, exam.difficultyRating]), [
      ['easy', 10], ['easy', 100], ['easy', 100], ['medium', 30], ['hard', 50],
    ]);
    assert.equal(listed[0].id, easier.id);
    assert.equal(listed[3].id, medium.id);
    assert.equal(listed[4].id, hard.id);

    const firstPractice = await service.createPractice('@admin:example.org', definition);
    const secondPractice = await service.createPractice('@admin:example.org', definition);
    assert.equal((await service.profile(user, false)).qualified, true);
    assert.equal((await service.qualify(other, practice)).qualified, false);
    assert.equal((await service.profile(other, false)).builtinPracticeCompleted, true);
    const available = await service.practices(other, false);
    assert.equal(available.length, 2);
    assert.equal(JSON.stringify(available).includes('"answer"'), false);
    await assert.rejects(service.completePractice(other, firstPractice.id, { one: 'b' }), /incorrect/i);
    assert.equal((await service.completePractice(other, firstPractice.id, { one: 'a' })).qualified, false);
    assert.equal((await service.completePractice(other, secondPractice.id, { one: 'a' })).rating, 100);
    const third = '@third:example.org';
    await service.qualify(third, practice);
    await service.completePractice(third, firstPractice.id, { one: 'a' });
    await service.setPracticeActive(secondPractice.id, false);
    assert.equal((await service.profile(third, false)).qualified, true);
    assert.equal((await service.practices(third, false)).length, 1);
    assert.equal((await service.practices(third, true)).length, 2);

    assert.equal((await service.profile(other, false)).primeUnlocked, false);
    await pool.query('UPDATE exam_players SET rating = 500 WHERE user_id = $1', [user]);
    assert.equal((await service.profile(user, false)).primeUnlocked, true);
    await pool.query('UPDATE exam_players SET rating = 300 WHERE user_id = $1', [user]);
    assert.equal((await service.profile(user, false)).primeUnlocked, true);
    const example = JSON.parse(await readFile(new URL('../examples/exam.json', import.meta.url), 'utf8'));
    await service.ensureExampleExam(example);
    await service.ensureExampleExam(example);
    assert.equal((await service.listExams(user)).filter(item => item.id === 'e8b3ad82-e116-4ed8-b2bb-754f5b954b6e').length, 1);
  } finally {
    if (db) await db.close(); else await pool.end();
  }
});
