// Thin loader for sample-grid.wasm. Fetches, instantiates, and caches the module.
// Returns { sampleGridChunk, sampleDensityChunk, memory } or null on failure.

let instance = null;
let pending  = null;

export async function loadWasmSampler() {
  if (instance) return instance;
  if (pending)  return pending;

  pending = (async () => {
    try {
      const url  = new URL('./sample-grid.wasm', import.meta.url);
      const resp = await fetch(url);
      if (!resp.ok) return null;

      const bytes   = await resp.arrayBuffer();
      const { instance: mod } = await WebAssembly.instantiate(bytes, {});
      const exp = mod.exports;

      if (!exp.sampleGridChunk || !exp.sampleDensityChunk || !exp.memory || !exp.heapBase) return null;

      instance = {
        sampleGridChunk:    exp.sampleGridChunk,
        sampleDensityChunk: exp.sampleDensityChunk,
        memory:             exp.memory,
        heapBase:           exp.heapBase,
      };
      return instance;
    } catch (err) {
      console.warn('WASM sampler unavailable:', err.message || err);
      return null;
    }
  })();

  return pending;
}
