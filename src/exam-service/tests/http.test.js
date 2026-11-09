import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createExamService } from '../examService.js';
import { createExamHttpServer } from '../apiServer.js';
import { createSqlitePool } from '../sqlitePool.js';
import { createCryptoService } from '../cryptoService.js';

const localized = text => ({ tr: text, en: text });
const definition = {
  title: localized('Example'), description: localized('Example exam'),
  difficulty: 'easy', difficultyRating: 100, timeLimitSeconds: 60,
  questions: [{ id: 'one', type: 'choice', points: 100, prompt: localized('Question'),
    options: [{ id: 'a', text: localized('A') }, { id: 'b', text: localized('B') }], answer: 'a' }],
};
const rows = [
  { accountCode: '100', side: 'debit', amount: '1200' },
  { accountCode: '600', side: 'credit', amount: '1000' },
  { accountCode: '391', side: 'credit', amount: '200' },
];

for (const dialect of ['postgres', 'sqlite']) test(`${dialect}: HTTP API authenticates with Matrix and enforces exam privacy and scoring`, async () => {
  const db = dialect === 'postgres' ? await PGlite.create() : null;
  if (db) await db.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  const pool = db ? {
    query: (sql, params) => db.query(sql, params),
    connect: async () => ({ query: (sql, params) => db.query(sql, params), release() {} }),
  } : await createSqlitePool(':memory:');
  const homeserver = http.createServer((request, response) => {
    const ids = { 'Bearer admin-token': '@admin:example.org', 'Bearer player-token': '@player:example.org', 'Bearer other-token': '@other:example.org' };
    const id = ids[request.headers.authorization];
    response.writeHead(id ? 200 : 401, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(id ? { user_id: id } : { errcode: 'M_UNKNOWN_TOKEN' }));
  });
  homeserver.listen(0, '127.0.0.1');
  await once(homeserver, 'listening');
  const matrixBase = `http://127.0.0.1:${homeserver.address().port}`;
  let releaseAssistant;
  let signalAssistant;
  const assistantStarted = new Promise(resolve => { signalAssistant = resolve; });
  const assistant = { provider: 'ollama', respond: async (_, input) => {
    if (input.message === 'slow') {
      signalAssistant();
      await new Promise(resolve => { releaseAssistant = resolve; });
    }
    return { answer: 'Mock explanation' };
  } };
  const cryptoMarket = {
    search: async query => ['BTCUSDT'].filter(symbol => symbol.includes(query)).map(symbol => ({ symbol })),
    quote: async symbol => ({ symbol, price: 123, priceText: '123.00000000', quoteAt: Date.now() }),
    tryRate: async () => ({ priceText: '50.00000000', quoteAt: Date.now() }),
  };
  const service = createExamService(pool);
  const cryptoService = createCryptoService(pool, service, cryptoMarket);
  const app = createExamHttpServer({ service, matrixBase, admins: new Set(['@admin:example.org']), assistant, cryptoMarket, cryptoService });
  const withoutMarket = createExamHttpServer({ service: createExamService(pool), matrixBase, admins: new Set(['@admin:example.org']) });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  withoutMarket.listen(0, '127.0.0.1');
  await once(withoutMarket, 'listening');
  const base = `http://127.0.0.1:${app.address().port}`;
  async function request(path, token, body) {
    return fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  try {
    assert.equal((await request('/api/me')).status, 401);
    assert.equal((await request('/api/me', 'invalid')).status, 401);
    assert.equal((await request('/api/admin/exams', 'player-token', { definition })).status, 403);
    const csv = 'islem_no;aciklama;tutar_tl\r\n1;Ornek;1000\r\n';
    const files = [{ filename: 'question-data.csv', contentType: 'text/csv', base64: Buffer.from(csv).toString('base64') }];
    const createdResponse = await request('/api/admin/exams', 'admin-token', { definition, files });
    assert.equal(createdResponse.status, 201);
    const { id } = await createdResponse.json();
    assert.equal((await request(`/api/exams/${id}/start`, 'player-token', {})).status, 403);
    assert.equal((await request('/api/practice', 'player-token', { rows })).status, 200);
    assert.equal((await request('/api/assistant', 'player-token', { message: 'Help' })).status, 200);
    const pending = request('/api/assistant', 'player-token', { message: 'slow' });
    await assistantStarted;
    assert.equal((await request(`/api/exams/${id}/start`, 'player-token', {})).status, 409);
    releaseAssistant();
    assert.equal((await pending).status, 200);
    const startResponse = await request(`/api/exams/${id}/start`, 'player-token', {});
    assert.equal(startResponse.status, 201);
    const attempt = await startResponse.json();
    assert.equal((await request('/api/assistant', 'player-token', { message: 'Help' })).status, 403);
    assert.equal((await request(`/api/exams/${id}/start`, 'player-token', {})).status, 409);
    assert.equal((await request(`/api/attempts/${attempt.id}`, 'other-token')).status, 404);
    const active = await (await request(`/api/attempts/${attempt.id}`, 'player-token')).json();
    assert.equal(JSON.stringify(active).includes('"answer"'), false);
    assert.equal(active.files.length, 1);
    const filePath = `/api/exams/${id}/files/${active.files[0].id}`;
    assert.equal((await request(filePath, 'other-token')).status, 404);
    const downloaded = await request(filePath, 'player-token');
    assert.equal(downloaded.status, 200);
    assert.equal(await downloaded.text(), csv);
    const completed = await (await request(`/api/attempts/${attempt.id}/submit`, 'player-token', { answers: { one: 'a' } })).json();
    assert.equal(completed.score, 100);
    assert.equal(completed.ratingAfter, 116);
    assert.equal((await request('/api/assistant', 'player-token', { message: 'Help' })).status, 200);
    assert.equal((await (await request('/api/leaderboard', 'player-token')).json())[0].rating, 116);
    assert.equal((await request('/api/admin/practices', 'player-token', { definition })).status, 403);
    const practice = await (await request('/api/admin/practices', 'admin-token', { definition })).json();
    assert.equal((await (await request('/api/practice', 'other-token', { rows })).json()).qualified, false);
    const exercises = await (await request('/api/practices', 'other-token')).json();
    assert.equal(JSON.stringify(exercises).includes('"answer"'), false);
    assert.equal((await (await request(`/api/practices/${practice.id}/complete`, 'other-token', { answers: { one: 'a' } })).json()).qualified, true);
    assert.equal((await request(`/api/admin/practices/${practice.id}`, 'other-token', { active: false })).status, 403);
    assert.equal((await request('/api/prime/portfolio', 'other-token')).status, 404);
    assert.equal((await request('/api/crypto/search?q=BTC', 'other-token')).status, 403);
    await pool.query('UPDATE exam_players SET rating = 500 WHERE user_id = $1', ['@player:example.org']);
    assert.equal((await (await request('/api/me', 'player-token')).json()).primeUnlocked, true);
    assert.equal((await (await request('/api/crypto/search?q=BTC', 'player-token')).json())[0].symbol, 'BTCUSDT');
    assert.equal((await request('/api/crypto/watchlist', 'player-token', { symbol: 'NOPEUSDT', add: true })).status, 400);
    assert.equal((await request('/api/crypto/watchlist', 'player-token', { symbol: 'BTCUSDT', add: true })).status, 200);
    assert.deepEqual(await (await request('/api/crypto/watchlist', 'player-token')).json(), ['BTCUSDT']);
    assert.equal((await request('/api/crypto/watchlist', 'player-token', { symbol: 'BTCUSDT', add: false })).status, 200);
    assert.deepEqual(await (await request('/api/crypto/watchlist', 'player-token')).json(), []);
    const quote = await (await request('/api/crypto/quote?symbol=BTCUSDT', 'player-token')).json();
    assert.equal(quote.price, 123);
    const order = { requestId: '00000000-0000-4000-8000-000000000001', symbol: 'BTCUSDT', side: 'long', leverage: 2, marginCents: 10000 };
    const noMarketBase = `http://127.0.0.1:${withoutMarket.address().port}`;
    assert.equal((await fetch(`${noMarketBase}/api/crypto/open`, {
      method: 'POST', headers: { Authorization: 'Bearer player-token', 'Content-Type': 'application/json' }, body: JSON.stringify(order),
    })).status, 503);
    const opened = await (await request('/api/crypto/open', 'player-token', order)).json();
    assert.ok(opened.positionId);
    assert.equal((await (await request('/api/crypto/portfolio', 'player-token')).json()).positions.length, 1);
    const valuation = await (await request('/api/crypto/valuations', 'player-token')).json();
    assert.equal(valuation.positions[0].valuation.unrealizedCents, 0);
    assert.equal((await request('/api/crypto/valuations', 'other-token')).status, 403);
    assert.equal((await request('/api/crypto/close', 'other-token', { requestId: '00000000-0000-4000-8000-000000000002', positionId: opened.positionId })).status, 403);
    assert.equal((await request('/api/crypto/close', 'player-token', { requestId: '00000000-0000-4000-8000-000000000002', positionId: opened.positionId })).status, 200);
    assert.equal((await (await request('/api/crypto/history', 'player-token')).json()).length, 2);
  } finally {
    if (releaseAssistant) releaseAssistant();
    await new Promise(resolve => withoutMarket.close(resolve));
    await new Promise(resolve => app.close(resolve));
    await new Promise(resolve => homeserver.close(resolve));
    if (db) await db.close(); else await pool.end();
  }
});
