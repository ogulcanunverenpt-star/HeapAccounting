import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

test('.env loads from the requested path and existing environment variables take precedence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'heap-env-'));
  const filename = join(directory, '.env');
  try {
    await writeFile(filename, 'DB_DRIVER=sqlite\nSQLITE_PATH=data/test.sqlite\nMATRIX_URL=https://example.org\n');
    const moduleUrl = pathToFileURL(join(import.meta.dirname, '..', 'environment.js')).href;
    const script = `import { loadServiceEnvironment } from ${JSON.stringify(moduleUrl)};
      loadServiceEnvironment(${JSON.stringify(filename)});
      console.log(JSON.stringify({driver: process.env.DB_DRIVER, path: process.env.SQLITE_PATH, matrix: process.env.MATRIX_URL}));`;
    const env = { ...process.env, MATRIX_URL: 'https://override.example.org' };
    delete env.DB_DRIVER;
    delete env.SQLITE_PATH;
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], { env });
    assert.deepEqual(JSON.parse(stdout.trim()), { driver: 'sqlite', path: 'data/test.sqlite', matrix: 'https://override.example.org' });
  } finally {
    await rm(filename, { force: true });
    await rmdir(directory);
  }
});
