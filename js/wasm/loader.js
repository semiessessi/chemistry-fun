// Thin loader for sample-grid.wasm. Fetches, instantiates, and caches the module.
// Returns { sampleGridChunk, sampleDensityChunk, marchingCubesWasm, memory, heapBase } or null on failure.
// WASM is loaded eagerly at module import time so it's ready before first orbital selection.

let instance = null;

const pending = (async () => {
  try {
    const url  = new URL('./sample-grid.wasm', import.meta.url);
    const resp = await fetch(url);
    if (!resp.ok) return null;

    const bytes = await resp.arrayBuffer();
    const { instance: mod } = await WebAssembly.instantiate(bytes, {});
    const exp = mod.exports;

    if (!exp.sampleGridChunk || !exp.sampleDensityChunk || !exp.memory || !exp.heapBase || !exp.marchingCubesWasm) return null;

    instance = {
      sampleGridChunk:      exp.sampleGridChunk,
      sampleDensityChunk:   exp.sampleDensityChunk,
      marchingCubesWasm:    exp.marchingCubesWasm,
      computeGradientFlat:  exp.computeGradientFlat,
      memory:               exp.memory,
      heapBase:             exp.heapBase,
    };
    return instance;
  } catch (err) {
    console.warn('WASM sampler unavailable:', err.message || err);
    return null;
  }
})();

export async function loadWasmSampler() {
  if (instance) return instance;
  return pending;
}
