import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'src', 'wasm', 'bridge.c');
const output = join(root, 'src', 'wasm', 'bridge.wasm');
const compiler = process.env.WASM_CC || 'clang';
const result = spawnSync(compiler, [
  '--target=wasm32', '-O2', '-nostdlib',
  '-Wl,--no-entry', '-Wl,--export=heap_accounting_add_minor',
  '-o', output, source,
], { stdio: 'inherit' });

if (result.error) {
  console.error(`Unable to run ${compiler}. Install Clang and lld or set WASM_CC to the Clang executable.`, result.error.message);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`WebAssembly compilation failed (exit code ${result.status ?? 'unknown'}).`);
  process.exit(result.status || 1);
}
