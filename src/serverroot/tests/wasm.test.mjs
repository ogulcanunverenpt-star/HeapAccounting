import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('compiled C export adds signed 32-bit values without overflow', async () => {
  const bytes = await readFile(new URL('../src/wasm/bridge.wasm', import.meta.url));
  const { instance } = await WebAssembly.instantiate(bytes);
  const add = instance.exports.heap_accounting_add_minor;
  assert.equal(add(120, 30), 150n);
  assert.equal(add(-2147483648, -2147483648), -4294967296n);
  assert.equal(add(2147483647, 2147483647), 4294967294n);
  assert.equal(add(-100, 25), -75n);
});
