import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistant } from '../assistant.js';

test('assistant uses configured provider and requires consent for Gemini', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(url.includes('generativelanguage') ?
      { candidates: [{ content: { parts: [{ text: 'Example answer' }] } }] } :
      { message: { content: 'Local answer' } }), { status: 200 });
  };
  const local = createAssistant({ provider: 'ollama', model: 'test-model', fetchImpl });
  assert.deepEqual(await local.respond('@a:test', { message: 'Hello' }), { answer: 'Local answer' });
  assert.equal(calls[0].url, 'http://127.0.0.1:11434/api/chat');
  assert.throws(() => createAssistant({ provider: 'ollama', model: 'test', ollamaUrl: 'http://example.org' }), /loopback/);
  const gemini = createAssistant({ provider: 'gemini', model: 'test-model', apiKey: 'example-test-key', fetchImpl });
  await assert.rejects(gemini.respond('@a:test', { message: 'Hello' }), /consent/i);
  assert.deepEqual(await gemini.respond('@a:test', { message: 'Hello', consent: true }), { answer: 'Example answer' });
  assert.equal(calls[1].options.headers['x-goog-api-key'], 'example-test-key');
  assert.equal(calls[1].url.includes('example-test-key'), false);
});
