import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createSqlitePool } from '../sqlitePool.js';
import { createExamService } from '../examService.js';
import { createCryptoService } from '../cryptoService.js';

for (const dialect of ['sqlite', 'postgres']) test(`${dialect}: leveraged simulation, funding, scoring and liquidation`, async () => {
  const db = dialect === 'postgres' ? await PGlite.create() : null;
  if (db) await db.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  const pool = db ? {
    query: (sql, args) => db.query(sql, args),
    connect: async () => ({ query: (sql, args) => db.query(sql, args), release() {} }),
  } : await createSqlitePool(':memory:');
  try {
    const user = '@player:test', other = '@other:test';
    await pool.query('INSERT INTO exam_players (user_id, rating) VALUES ($1, $2)', [user, 500]);
    await pool.query('INSERT INTO exam_players (user_id, rating) VALUES ($1, $2)', [other, 500]);
    let time = 1700000000000, price = '100.00000000', fx = '50.00000000', staleFx = false, staleQuote = false, staleSymbol = '';
    const market = {
      quote: async symbol => ({ symbol, priceText: price, quoteAt: staleQuote || symbol === staleSymbol ? time - 20000 : time }),
      tryRate: async () => ({ priceText: fx, quoteAt: staleFx ? time - 20000 : time }),
    };
    const crypto = createCryptoService(pool, createExamService(pool), market, { now: () => time });
    const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const open = { requestId: id(1), symbol: 'BTCUSDT', side: 'long', leverage: 2, marginCents: 10000 };
    assert.equal((await crypto.portfolio(user)).cashCents, 10000000);
    const position = await crypto.open(user, open);
    assert.equal((await crypto.open(user, open)).replayed, true);
    await assert.rejects(crypto.open(user, { ...open, marginCents: 20000 }), /different operation/);
    assert.equal((await crypto.portfolio(user)).cashCents, 9990000);
    assert.equal((await crypto.portfolio(other)).positions.length, 0);
    await assert.rejects(crypto.close(other, { requestId: id(2), positionId: position.positionId }), /not found/);
    price = '110.00000000';
    const valued = (await crypto.valuations(user)).positions[0];
    assert.equal(valued.valuation.markPrice, '110.00000000');
    assert.equal(valued.valuation.unrealizedCents, 2000);
    assert.equal(valued.valuation.fundingCents, 0);
    staleQuote = true;
    const unavailable = (await crypto.valuations(user)).positions[0];
    assert.equal(unavailable.valuation, null);
    assert.match(unavailable.quoteError, /stale/);
    staleQuote = false;
    staleFx = true;
    await assert.rejects(crypto.close(user, { requestId: id(2), positionId: position.positionId }), /stale/);
    assert.equal((await crypto.portfolio(user)).positions.length, 1);
    staleFx = false;
    const closed = await crypto.close(user, { requestId: id(2), positionId: position.positionId });
    assert.equal(closed.realizedCents, 2000);
    assert.equal(closed.ratingAfter, 510);
    assert.equal((await crypto.close(user, { requestId: id(2), positionId: position.positionId })).replayed, true);
    assert.equal((await crypto.portfolio(user)).cashCents, 10002000);
    await assert.rejects(crypto.close(user, { requestId: id(3), positionId: position.positionId }), /already closed/);
    price = '100.00000000';
    const short = await crypto.open(user, { ...open, requestId: id(4), side: 'short' });
    time += 8 * 60 * 60 * 1000;
    price = '90.00000000';
    assert.equal((await crypto.valuations(user)).positions[0].valuation.unrealizedCents, 1998);
    const shortResult = await crypto.close(user, { requestId: id(5), positionId: short.positionId });
    assert.equal(shortResult.realizedCents, 1998);
    const liquidated = await crypto.open(user, { ...open, requestId: id(6), leverage: 10 });
    price = '81.45000000';
    const threshold = (await crypto.valuations(user)).positions[0].valuation;
    assert.equal(threshold.unrealizedCents, -9500);
    assert.equal(threshold.liquidationTriggered, true);
    await crypto.monitor();
    assert.equal((await crypto.portfolio(user)).positions.length, 0);
    const history = await crypto.history(user);
    assert.equal(history.find(item => item.id === liquidated.positionId).status, 'liquidated');
    assert.equal(history.find(item => item.id === short.positionId && item.action === 'close').fundingCents, 2);
    assert.equal(history.length, 6);
    assert.equal((await crypto.publicHistory()).length, 6);
    assert.equal((await crypto.publicHistory())[0].userId, user);
    assert.equal((await crypto.closedPositions(user)).length, 3);
    assert.equal((await crypto.closedPositions(other)).length, 0);
    if (dialect === 'sqlite') {
      price = '100.00000000';
      const raced = { ...open, requestId: id(7) };
      const results = await Promise.all(Array.from({ length: 10 }, () => crypto.open(user, raced)));
      assert.equal(results.filter(item => !item.replayed).length, 1);
      assert.equal(new Set(results.map(item => item.positionId)).size, 1);
      const close = { requestId: id(8), positionId: results[0].positionId };
      const closes = await Promise.all(Array.from({ length: 10 }, () => crypto.close(user, close)));
      assert.equal(closes.filter(item => !item.replayed).length, 1);
    }
    price = '100.00000000';
    await crypto.open(user, { ...open, requestId: id(9), symbol: 'BTCUSDT' });
    await crypto.open(user, { ...open, requestId: id(10), symbol: 'ETHUSDT' });
    staleSymbol = 'ETHUSDT';
    const mixed = (await crypto.valuations(user)).positions;
    assert.equal(mixed.find(item => item.symbol === 'BTCUSDT').valuation.unrealizedCents, 0);
    assert.equal(mixed.find(item => item.symbol === 'ETHUSDT').valuation, null);
    assert.equal((await crypto.valuations(other)).positions.length, 0);
  } finally {
    if (db) await db.close(); else await pool.end();
  }
});
