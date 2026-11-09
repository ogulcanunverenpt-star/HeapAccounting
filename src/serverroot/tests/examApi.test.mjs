import test from 'node:test';
import assert from 'node:assert/strict';
import { examApi, ExamApiError } from '../src/client/examApi.js';
import { setState } from '../src/store/state.js';

const first = { userId: '@first:example.org', accessToken: 'first-token', baseUrl: 'https://matrix.example.org' };
const second = { userId: '@second:example.org', accessToken: 'second-token', baseUrl: 'https://matrix.example.org' };
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

test('exam API checks homeserver and rejects account switches without exposing a token', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; setState({ accounts: [], activeAccountIndex: 0 }); });
  setState({ accounts: [first, second], activeAccountIndex: 0 });

  let calls = 0;
  globalThis.fetch = async () => { calls++; return json({ matrixBaseUrl: 'https://other.example.org' }); };
  await assert.rejects(examApi.me(), /homeserver/);
  assert.equal(calls, 1);

  globalThis.fetch = async () => {
    calls++;
    setState({ activeAccountIndex: 1 });
    return json({ matrixBaseUrl: first.baseUrl });
  };
  calls = 0;
  await assert.rejects(examApi.me(), /account changed/);
  assert.equal(calls, 1);

  setState({ activeAccountIndex: 0 });
  globalThis.fetch = async (path, options) => {
    calls++;
    if (path === '/api/config') return json({ matrixBaseUrl: first.baseUrl });
    assert.equal(options.headers.Authorization, 'Bearer first-token');
    setState({ activeAccountIndex: 1 });
    return json({ rating: 100 });
  };
  calls = 0;
  await assert.rejects(examApi.me(), /account changed/);
  assert.equal(calls, 2);
});

test('exam API preserves HTTP status for error handling', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; setState({ accounts: [], activeAccountIndex: 0 }); });
  setState({ accounts: [first], activeAccountIndex: 0 });
  globalThis.fetch = async path => path === '/api/config'
    ? json({ matrixBaseUrl: first.baseUrl })
    : new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  await assert.rejects(examApi.cryptoValuations(), error =>
    error instanceof ExamApiError && error.status === 404 && error.message === 'Not found');
});
