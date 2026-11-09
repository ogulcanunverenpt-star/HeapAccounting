import { mkdir, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import pg from 'pg';
import { createExamService } from './examService.js';
import { createExamHttpServer } from './apiServer.js';
import { loadServiceEnvironment, serviceDirectory } from './environment.js';
import { createAssistant } from './assistant.js';
import { createBinanceMarket } from './binanceMarket.js';
import { createCryptoService } from './cryptoService.js';

loadServiceEnvironment();

const { DATABASE_URL, MATRIX_URL, EXAM_ADMIN_IDS, PORT = '3491', HOST = '127.0.0.1', DB_DRIVER = 'postgres' } = process.env;
const pgConfigured = process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE && process.env.PGPASSWORD;
if (!['postgres', 'sqlite'].includes(DB_DRIVER)) throw new Error('DB_DRIVER must be postgres or sqlite');
if (!MATRIX_URL || !EXAM_ADMIN_IDS) throw new Error('MATRIX_URL and EXAM_ADMIN_IDS are required; copy src/exam-service/.env.example to .env and configure them');
if (DB_DRIVER === 'postgres' && !DATABASE_URL && !pgConfigured) throw new Error('PostgreSQL requires DATABASE_URL or PGHOST, PGUSER, PGDATABASE and PGPASSWORD; see .env.example');
const matrix = new URL(MATRIX_URL);
if (matrix.username || matrix.password || matrix.search || matrix.hash ||
    (matrix.protocol !== 'https:' && !(matrix.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(matrix.hostname)))) {
  throw new Error('MATRIX_URL must be an HTTPS homeserver URL (HTTP allowed only on localhost)');
}
const matrixBase = matrix.toString().replace(/\/+$/, '');
const admins = new Set(EXAM_ADMIN_IDS.split(',').map(value => value.trim()).filter(Boolean));
if (!admins.size) throw new Error('At least one Matrix admin ID is required');
if ([...admins].some(id => id.length > 255 || !/^@[^:\s]+:[^\s]+$/.test(id))) throw new Error('EXAM_ADMIN_IDS must contain valid Matrix user IDs');
const port = Number(PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
let pool;
if (DB_DRIVER === 'sqlite') {
  const configuredPath = process.env.SQLITE_PATH || 'data/exams.sqlite';
  const filename = configuredPath === ':memory:' ? configuredPath
    : isAbsolute(configuredPath) ? configuredPath : resolve(serviceDirectory, configuredPath);
  if (filename !== ':memory:') await mkdir(dirname(filename), { recursive: true, mode: 0o700 });
  const { createSqlitePool } = await import('./sqlitePool.js');
  pool = await createSqlitePool(filename);
} else {
  pool = new pg.Pool(DATABASE_URL ? { connectionString: DATABASE_URL } : {});
  await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
}
const service = createExamService(pool);
await service.ensureExampleExam(JSON.parse(await readFile(new URL('./examples/exam.json', import.meta.url), 'utf8')));
const assistant = createAssistant({ provider: process.env.AI_PROVIDER, model: process.env.AI_MODEL, apiKey: process.env.GEMINI_API_KEY, ollamaUrl: process.env.OLLAMA_URL });
const cryptoMarket = createBinanceMarket();
const cryptoService = createCryptoService(pool, service, cryptoMarket);
const server = createExamHttpServer({ service, matrixBase, admins, assistant, cryptoMarket, cryptoService });
cryptoMarket.start();
server.listen(port, HOST, () => console.log(`Exam API listening on ${HOST}:${port} (${DB_DRIVER})`));
let expiring = false;
const expiry = setInterval(async () => {
  if (expiring) return;
  expiring = true;
  try {
    for (let count = 0; count < 100; count++) if (!await service.expireBatch()) break;
  } catch (error) {
    console.error('Failed to expire exam attempts:', error);
  } finally {
    expiring = false;
  }
}, 10000);
expiry.unref();
let monitoring;
const monitor = setInterval(async () => {
  if (monitoring) return;
  monitoring = cryptoService.monitor().catch(error => {
    console.error('Crypto position monitoring failed:', error);
  });
  try { await monitoring; }
  finally { monitoring = undefined; }
}, 2000);
monitor.unref();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearInterval(expiry);
    clearInterval(monitor);
    cryptoMarket.stop();
    server.close(async () => { if (monitoring) await monitoring; await pool.end(); process.exit(0); });
  });
}
