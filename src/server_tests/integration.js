const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const count = Number(process.env.CONNECTIONS || 2000);
const port = Number(process.env.WEB_PORT || 3490);
const server = spawn(process.env.TEST_SERVER || path.join(root, process.platform === "win32" ? "server.exe" : "server"), [], {
  cwd: root,
  stdio: ["ignore", "pipe", "inherit"],
});
server.on("exit", (code, signal) => {
  if (code !== 0 && signal !== "SIGTERM") console.error(`server exited: ${code}, signal: ${signal}`);
});

function request(raw) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, "127.0.0.1");
    const chunks = [];
    socket.setTimeout(30000, () => socket.destroy(new Error("request timed out")));
    socket.on("connect", () => socket.write(raw));
    socket.on("data", chunk => chunks.push(chunk));
    socket.on("error", reject);
    socket.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function parse(buffer) {
  const end = buffer.indexOf("\r\n\r\n");
  assert.notEqual(end, -1, "missing response headers");
  const headers = buffer.subarray(0, end).toString("ascii");
  const body = buffer.subarray(end + 4);
  const length = Number(headers.match(/Content-Length: (\d+)/i)?.[1]);
  assert.equal(length, body.length);
  return { headers, body };
}

async function run() {
  const ready = new Promise((resolve, reject) => {
    server.stdout.once("data", resolve);
    server.once("error", reject);
    server.once("exit", code => reject(new Error(`server exited: ${code}`)));
  });
  await ready;
  let result = parse(await request("GET / HTTP/1.1\r\nHost: localhost\r\n\r\n"));
  assert.match(result.headers, /^HTTP\/1\.1 200/);
  const dist = path.join(root, "serverroot", "dist");
  assert.deepEqual(result.body, fs.readFileSync(path.join(dist, "index.html")));
  result = parse(await request("GET /logo.png?x=1 HTTP/1.1\r\nHost: localhost\r\n\r\n"));
  assert.match(result.headers, /Content-Type: image\/png/);
  assert.deepEqual(result.body, fs.readFileSync(path.join(dist, "logo.png")));
  const wasm = fs.readdirSync(path.join(dist, "assets")).find(name => name.endsWith(".wasm"));
  assert(wasm, "frontend build must include the Matrix WebAssembly asset");
  result = parse(await request(`GET /assets/${wasm} HTTP/1.1\r\nHost: localhost\r\n\r\n`));
  assert.match(result.headers, /Content-Type: application\/wasm/);
  assert.deepEqual(result.body, fs.readFileSync(path.join(dist, "assets", wasm)));
  result = parse(await request("GET /missing HTTP/1.1\r\nHost: localhost\r\n\r\n"));
  assert.match(result.headers, /^HTTP\/1\.1 404/);
  assert.deepEqual(result.body, fs.readFileSync(path.join(root, "serverfiles", "404.html")));
  result = parse(await request("GET /%2e%2e/serverfiles/404.html HTTP/1.1\r\nHost: localhost\r\n\r\n"));
  assert.match(result.headers, /^HTTP\/1\.1 404/);
  result = parse(await request("POST / HTTP/1.1\r\nHost: localhost\r\n\r\n"));
  assert.match(result.headers, /^HTTP\/1\.1 405/);
  assert.match(result.headers, /Allow: GET/);
  result = parse(await request("GET /%00 HTTP/1.1\r\nHost: localhost\r\n\r\n"));
  assert.match(result.headers, /^HTTP\/1\.1 400/);
  const oversizedPrefix = "GET / HTTP/1.1\r\nX: ";
  result = parse(await request(oversizedPrefix + "x".repeat(8192 - oversizedPrefix.length)));
  assert.match(result.headers, /^HTTP\/1\.1 431/);
  const missingResponses = await Promise.all(Array.from({ length: 100 }, () =>
    request("GET /missing HTTP/1.1\r\nHost: localhost\r\n\r\n")));
  const missingBody = fs.readFileSync(path.join(root, "serverfiles", "404.html"));
  for (const raw of missingResponses) {
    result = parse(raw);
    assert.match(result.headers, /^HTTP\/1\.1 404/);
    assert.deepEqual(result.body, missingBody);
  }

  assert(Number.isInteger(count) && count > 0);
  const sockets = [];
  const responses = [];
  function connect(attempt = 0) {
    return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, "127.0.0.1");
    const chunks = [];
    socket.setTimeout(60000, () => socket.destroy(new Error("load test timed out")));
    let connected = false;
    socket.on("error", error => {
      if (!connected && error.code === "ECONNREFUSED" && attempt < 30) {
        setTimeout(() => connect(attempt + 1).then(resolve, reject), 100);
      } else {
        reject(error);
      }
    });
    socket.on("data", chunk => chunks.push(chunk));
    const responsePromise = new Promise((done, fail) => {
      socket.on("error", fail);
      socket.on("end", () => {
        try {
          const response = parse(Buffer.concat(chunks));
          assert.match(response.headers, /^HTTP\/1\.1 200/);
          const roll = Number(response.body.toString().trim());
          assert(Number.isInteger(roll) && roll >= 1 && roll <= 20);
          done();
        } catch (error) {
          fail(error);
        }
      });
    });
    responsePromise.catch(() => {});
    socket.on("connect", () => {
      connected = true;
      sockets.push(socket);
      responses.push(responsePromise);
      socket.write("GET /d20 HTTP/1.1\r\nHost: localhost\r\n");
      resolve();
    });
    });
  }
  for (let i = 0; i < count; i += 50) {
    try {
      await Promise.all(Array.from({ length: Math.min(50, count - i) }, connect));
    } catch (error) {
      throw new Error(`connection batch starting at ${i} failed: ${error.message}`);
    }
  }
  for (const socket of sockets) socket.write("\r\n");
  await Promise.all(responses);
  console.log(`HTTP integration tests passed; ${count} simultaneous connections completed.`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (process.exitCode) await new Promise(resolve => setTimeout(resolve, 1000));
  server.kill();
});
