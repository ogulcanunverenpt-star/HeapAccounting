const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');

async function unusedPort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

function rawRequest(port, raw) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, '127.0.0.1');
    const chunks = [];
    socket.setTimeout(10000, () => socket.destroy(new Error('request timeout')));
    socket.on('connect', () => socket.write(raw));
    socket.on('data', data => chunks.push(data));
    socket.on('error', reject);
    socket.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

test('C server proxies API requests with bounded streaming and preserves static behavior', async () => {
  const upstream = http.createServer(async (req, res) => {
    if (req.url === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ matrixBaseUrl: 'https://mock.test' }));
      return;
    }
    if (req.url === '/api/echo' && req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(Buffer.concat([Buffer.from(req.headers.authorization + '\n'), ...chunks]));
      return;
    }
    if (req.url === '/api/reject') {
      res.writeHead(401);
      res.end('unauthorized');
      return;
    }
    res.writeHead(404);
    res.end('missing');
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const apiPort = upstream.address().port;
  const webPort = await unusedPort();
  const root = path.resolve(__dirname, '..');
  const binary = process.env.TEST_SERVER || path.join(root, process.platform === 'win32' ? 'server.exe' : 'server');
  const server = spawn(binary, [], {
    cwd: root,
    env: { ...process.env, WEB_PORT: String(webPort), EXAM_API_PORT: String(apiPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await Promise.race([
      once(server.stdout, 'data'),
      once(server, 'exit').then(([code]) => { throw new Error(`server exited: ${code}`); }),
    ]);
    const base = `http://127.0.0.1:${webPort}`;
    const config = await fetch(`${base}/api/config`);
    assert.equal(config.status, 200);
    assert.deepEqual(await config.json(), { matrixBaseUrl: 'https://mock.test' });

    const body = 'a'.repeat(15 * 1024 * 1024);
    const response = await fetch(`${base}/api/echo`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      body,
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), `Bearer test-token\n${body}`);
    const parallel = await Promise.all(Array.from({ length: 30 }, () => fetch(`${base}/api/config`)));
    assert.ok(parallel.every(item => item.status === 200));
    await Promise.all(parallel.map(item => item.text()));
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/missing`)).status, 404);
    assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
    const external = Object.values(os.networkInterfaces()).flat().find(address => address && address.family === 'IPv4' && !address.internal);
    if (external) {
      const remote = await fetch(`http://${external.address}:${webPort}/api/config`);
      assert.equal(remote.status, 403);
    }

    const duplicate = await rawRequest(webPort, 'POST /api/echo HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1\r\nContent-Length: 1\r\n\r\nx');
    assert.match(duplicate, /^HTTP\/1\.1 400/);
    const chunked = await rawRequest(webPort, 'POST /api/echo HTTP/1.1\r\nHost: localhost\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n');
    assert.match(chunked, /^HTTP\/1\.1 400/);
    const tooBig = await rawRequest(webPort, `POST /api/echo HTTP/1.1\r\nHost: localhost\r\nContent-Length: ${15 * 1024 * 1024 + 1}\r\n\r\n`);
    assert.match(tooBig, /^HTTP\/1\.1 413/);
    const early = await rawRequest(webPort, 'POST /api/reject HTTP/1.1\r\nHost: localhost\r\nContent-Length: 100000\r\n\r\n');
    assert.match(early, /^HTTP\/1\.1 401/);
    await new Promise(resolve => upstream.close(resolve));
    const unavailable = await fetch(`${base}/api/config`);
    assert.equal(unavailable.status, 502);
  } finally {
    server.kill();
    if (server.exitCode === null && server.signalCode === null) await once(server, 'exit');
    if (upstream.listening) await new Promise(resolve => upstream.close(resolve));
  }
});
