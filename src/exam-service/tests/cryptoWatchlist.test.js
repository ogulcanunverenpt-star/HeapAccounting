import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createSqlitePool } from '../sqlitePool.js';
import { createExamService } from '../examService.js';

for (const dialect of ['sqlite', 'postgres']) test(`${dialect}: watchlist is private and persists without duplicates`, async () => {
  const db = dialect === 'postgres' ? await PGlite.create() : null;
  if (db) await db.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  const pool = db ? {
    query: (sql, args) => db.query(sql, args),
    connect: async () => ({ query: (sql, args) => db.query(sql, args), release() {} }),
  } : await createSqlitePool(':memory:');
  try {
    const service = createExamService(pool);
    await pool.query('INSERT INTO exam_players (user_id, rating) VALUES ($1, $2)', ['@player:test', 500]);
    await pool.query('INSERT INTO exam_players (user_id, rating) VALUES ($1, $2)', ['@other:test', 500]);
    await service.profile('@player:test', false);
    await service.profile('@other:test', false);
    await service.updateCryptoWatchlist('@player:test', 'BTCUSDT', true);
    await service.updateCryptoWatchlist('@player:test', 'BTCUSDT', true);
    assert.deepEqual(await service.cryptoWatchlist('@player:test'), ['BTCUSDT']);
    assert.deepEqual(await service.cryptoWatchlist('@other:test'), []);
    await service.updateCryptoWatchlist('@player:test', 'BTCUSDT', false);
    assert.deepEqual(await service.cryptoWatchlist('@player:test'), []);
    await assert.rejects(service.updateCryptoWatchlist('@player:test', 'BAD/', true), /Invalid/);
  } finally {
    if (db) await db.close(); else await pool.end();
  }
});
