import wasmUrl from './bridge.wasm?url';

let modulePromise;

async function loadBridge() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const response = await fetch(wasmUrl);
      if (!response.ok) throw new Error(`WebAssembly download failed: HTTP ${response.status}`);
      const { instance } = await WebAssembly.instantiate(await response.arrayBuffer());
      if (typeof instance.exports.heap_accounting_add_minor !== 'function') {
        throw new Error('WebAssembly export heap_accounting_add_minor is missing');
      }
      return instance.exports;
    })().catch(error => {
      modulePromise = undefined;
      throw error;
    });
  }
  return modulePromise;
}

export async function addMinorUnits(left, right) {
  for (const value of [left, right]) {
    if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
      throw new RangeError('Arguments must be signed 32-bit integers');
    }
  }
  const bridge = await loadBridge();
  return bridge.heap_accounting_add_minor(left, right);
}
