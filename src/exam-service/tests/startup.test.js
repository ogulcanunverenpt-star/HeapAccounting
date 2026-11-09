import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('service startup seeds the example exam and configures the API', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'heap-startup-'));
  const database = join(directory, 'exam.sqlite');
  const identity = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ user_id: '@test:example.org' }));
  });
  identity.listen(0, '127.0.0.1');
  await once(identity, 'listening');
  const reservation = http.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../server.js', import.meta.url))], {
    env: { ...process.env, DB_DRIVER: 'sqlite', SQLITE_PATH: database, MATRIX_URL: `http://127.0.0.1:${identity.address().port}`,
      EXAM_ADMIN_IDS: '@admin:example.org', AI_PROVIDER: 'disabled', HOST: '127.0.0.1', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  try {
    const deadline = Date.now() + 15000;
    let response;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Service exited: ${output}`);
      try { response = await fetch(`http://127.0.0.1:${port}/api/config`); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(response, `Service did not start: ${output}`);
    assert.equal((await response.json()).aiProvider, 'disabled');
    const exams = await fetch(`http://127.0.0.1:${port}/api/exams`, { headers: { Authorization: 'Bearer test-token' } });
    assert.equal(exams.status, 200);
    const entries = await exams.json();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, 'e8b3ad82-e116-4ed8-b2bb-754f5b954b6e');
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    await new Promise(resolve => identity.close(resolve));
    for (const suffix of ['', '-wal', '-shm']) await rm(database + suffix, { force: true });
    await rmdir(directory);
  }
});
