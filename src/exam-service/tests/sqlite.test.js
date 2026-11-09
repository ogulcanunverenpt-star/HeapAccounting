import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqlitePool } from '../sqlitePool.js';
import { createExamService } from '../examService.js';
import { createCryptoService } from '../cryptoService.js';

test('SQLite persists results and serializes concurrent attempts and submissions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'heap-exam-'));
  const path = join(directory, 'exams.sqlite');
  let pool;
  try {
    pool = await createSqlitePool(path);
    const service = createExamService(pool);
    const user = '@player:example.org';
    const trEn = value => ({ tr: value, en: value });
    const definition = {
      title: trEn('Exam'), description: trEn('Description'), difficulty: 'easy',
      difficultyRating: 100, timeLimitSeconds: 60,
      questions: [{ id: 'one', type: 'choice', points: 100, prompt: trEn('Question'),
        options: [{ id: 'a', text: trEn('A') }, { id: 'b', text: trEn('B') }], answer: 'a' }],
    };
    const rows = [
      { accountCode: '100', side: 'debit', amount: '1200' },
      { accountCode: '600', side: 'credit', amount: '1000' },
      { accountCode: '391', side: 'credit', amount: '200' },
    ];
    await service.qualify(user, rows);
    const { id } = await service.createExam('@admin:example.org', definition, []);
    const starts = await Promise.allSettled(Array.from({ length: 10 }, () => service.start(user, id)));
    assert.equal(starts.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(starts.filter(item => item.status === 'rejected' && item.reason.status === 409).length, 9);
    const attemptId = starts.find(item => item.status === 'fulfilled').value.id;
    const results = await Promise.all(Array.from({ length: 10 }, () => service.submit(user, attemptId, { one: 'a' })));
    assert.ok(results.every(item => item.score === 100 && item.ratingBefore === 100 && item.ratingAfter === 116));
    await pool.query('UPDATE exam_players SET rating = 500 WHERE user_id = $1', [user]);
    assert.equal((await service.profile(user, false)).primeUnlocked, true);
    const market = {
      quote: async symbol => ({ symbol, priceText: '100.00000000', quoteAt: Date.now() }),
      tryRate: async () => ({ priceText: '50.00000000', quoteAt: Date.now() }),
    };
    const crypto = createCryptoService(pool, service, market);
    await crypto.open(user, { requestId: '00000000-0000-4000-8000-000000000001', symbol: 'BTCUSDT', side: 'long', leverage: 2, marginCents: 10000 });
    await pool.end();
    pool = null;
    pool = await createSqlitePool(path);
    const reopened = createExamService(pool);
    assert.equal((await reopened.profile(user, false)).rating, 500);
    assert.equal((await reopened.myResults(user))[0].id, attemptId);
    assert.equal((await reopened.profile(user, false)).primeUnlocked, true);
    const wallet = await createCryptoService(pool, reopened, market).portfolio(user);
    assert.equal(wallet.cashCents, 9990000);
    assert.equal(wallet.positions[0].symbol, 'BTCUSDT');
  } finally {
    if (pool) await pool.end();
    for (const suffix of ['', '-wal', '-shm']) await rm(path + suffix, { force: true });
    await rmdir(directory);
  }
});
