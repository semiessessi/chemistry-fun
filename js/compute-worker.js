// Web Worker for offloading grid sampling, threshold computation, and marching cubes.
// Runs as a module worker (type: 'module').

import { evaluateOrbital } from './math.js';
import { computeMultiThresholds, computeThreshold } from './grid.js';
import { marchingCubes } from './marching-cubes.js';
import { computeGradient } from './gradient-computation.js';
import { loadWasmSampler } from './wasm/loader.js';

// Eagerly load WASM; handlers await this promise before falling back to JS
const wasmReady = loadWasmSampler().then(w => {
  console.log(w ? '[worker] WASM loaded, heapBase=' + w.heapBase() : '[worker] WASM unavailable, using JS fallback');
  return w;
});

// Pack JS term objects into a flat Float32Array for WASM (18 f32 per term)
// Layout: [cx, cy, cz, n, l, m, angType, coeff, zeta, rot0..rot8]
function packTerms(terms, mem, byteOffset) {
  const STRIDE = 18;
  const view = new Float32Array(mem.buffer, byteOffset, terms.length * STRIDE);
  const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let t = 0; t < terms.length; t++) {
    const term = terms[t];
    const b = t * STRIDE;
    view[b]     = term.center[0]; view[b + 1] = term.center[1]; view[b + 2] = term.center[2];
    view[b + 3] = term.n;         view[b + 4] = term.l;         view[b + 5] = term.m;
    view[b + 6] = term.angType === 'cos' ? 1 : term.angType === 'sin' ? 2 : 0;
    view[b + 7] = term.coeff;     view[b + 8] = term.zeta || 1;
    const rot = term.rot || IDENT;
    for (let r = 0; r < 9; r++) view[b + 9 + r] = rot[r];
  }
  return view.byteLength;
}

// Ensure WASM memory is at least `needed` bytes, growing by pages as required
function ensureMemory(wasm, needed) {
  while (wasm.memory.buffer.byteLength < needed) wasm.memory.grow(1);
}

self.onmessage = async function(e) {
  const { type, id } = e.data;

  if (type === 'sampleGridChunk') {
    const { terms, gridSize, halfExtent, zStart, zEnd } = e.data;
    const N = gridSize;
    const numSlices = zEnd - zStart;
    const outLen = numSlices * N * N;

    // --- WASM path ---
    const wasm = await wasmReady;
    if (wasm) {
      const base       = wasm.heapBase();           // first safe byte past lookup tables
      const termsBytes = terms.length * 18 * 4;
      const outBytes   = outLen * 4;
      ensureMemory(wasm, base + termsBytes + outBytes + 64);
      packTerms(terms, wasm.memory, base);
      const outOffset = base + termsBytes + 64;
      wasm.sampleGridChunk(base, terms.length, N, halfExtent, zStart, zEnd, outOffset);
      const chunk = new Float32Array(wasm.memory.buffer.slice(outOffset, outOffset + outBytes));
      self.postMessage({ type, id, chunk }, [chunk.buffer]);
      return;
    }

    // --- JS fallback ---
    const chunk = new Float32Array(outLen);
    const step = (2 * halfExtent) / (N - 1);
    const orbital = { terms };
    let idx = 0;
    for (let iz = zStart; iz < zEnd; iz++) {
      const z = -halfExtent + iz * step;
      for (let iy = 0; iy < N; iy++) {
        const y = -halfExtent + iy * step;
        for (let ix = 0; ix < N; ix++) {
          chunk[idx++] = evaluateOrbital(orbital, -halfExtent + ix * step, y, z);
        }
      }
    }
    self.postMessage({ type, id, chunk }, [chunk.buffer]);
  }

  else if (type === 'sampleDensityGridChunk') {
    const { moList, gridSize, halfExtent, zStart, zEnd } = e.data;
    const N = gridSize;
    const numSlices = zEnd - zStart;
    const outLen = numSlices * N * N;

    // --- WASM path (pack all MO terms flat, with per-MO count + occ header) ---
    const wasm = await wasmReady;
    if (wasm && moList.length > 0) {
      const base       = wasm.heapBase();           // first safe byte past lookup tables
      const totalTerms = moList.reduce((s, mo) => s + mo.terms.length, 0);
      const termsBytes = totalTerms * 18 * 4;
      const moHdrBytes = moList.length * 8;  // [termCount f32, occ f32] per MO
      const outBytes   = outLen * 4;
      ensureMemory(wasm, base + termsBytes + moHdrBytes + outBytes + 256);
      let termByteOff = base;
      for (const mo of moList) { packTerms(mo.terms, wasm.memory, termByteOff); termByteOff += mo.terms.length * 18 * 4; }
      const moHdrOff = base + termsBytes + 64;
      const moHdr = new Float32Array(wasm.memory.buffer, moHdrOff, moList.length * 2);
      moList.forEach((mo, i) => { moHdr[i * 2] = mo.terms.length; moHdr[i * 2 + 1] = mo.occ; });
      const outOffset = moHdrOff + moHdrBytes + 64;
      wasm.sampleDensityChunk(base, moList.length, moHdrOff, N, halfExtent, zStart, zEnd, outOffset);
      const chunk = new Float32Array(wasm.memory.buffer.slice(outOffset, outOffset + outBytes));
      self.postMessage({ type, id, chunk }, [chunk.buffer]);
      return;
    }

    // --- JS fallback ---
    const chunk = new Float32Array(outLen);
    const step = (2 * halfExtent) / (N - 1);
    let idx = 0;
    for (let iz = zStart; iz < zEnd; iz++) {
      const z = -halfExtent + iz * step;
      for (let iy = 0; iy < N; iy++) {
        const y = -halfExtent + iy * step;
        for (let ix = 0; ix < N; ix++) {
          const x = -halfExtent + ix * step;
          let rho = 0;
          for (const { terms, occ } of moList) {
            const psi = evaluateOrbital({ terms }, x, y, z);
            rho += occ * psi * psi;
          }
          chunk[idx++] = Math.sqrt(rho);
        }
      }
    }
    self.postMessage({ type, id, chunk }, [chunk.buffer]);
  }

  else if (type === 'computeThresholds') {
    const { data, probability, numLayers, halfExtent, gridSize } = e.data;
    let thresholds;
    if (numLayers === 1) {
      thresholds = [computeThreshold(data, probability, halfExtent, gridSize)];
    } else {
      thresholds = computeMultiThresholds(data, probability, numLayers, halfExtent, gridSize);
    }
    self.postMessage({ type, id, thresholds });
  }

  else if (type === 'marchingCubes') {
    const { data, gridSize, threshold } = e.data;
    const N = gridSize;
    const _tmc = performance.now();

    // --- WASM path ---
    const wasm = await wasmReady;
    if (wasm) {
      const base       = wasm.heapBase();
      const N3         = N * N * N;
      const dataBytes  = N3 * 4;
      const cacheBytes = N3 * 3 * 4;
      const maxVerts   = N3;
      const maxIdx     = N3 * 2;
      const vertBytes  = maxVerts * 3 * 4;
      const idxBytes   = maxIdx * 4;
      const dataPtr    = base;
      const cachePtr   = dataPtr  + dataBytes  + 32;
      const vertsPtr   = cachePtr + cacheBytes + 32;
      const idxPtr     = vertsPtr + vertBytes  + 32;
      const countsPtr  = idxPtr   + idxBytes   + 32;
      ensureMemory(wasm, countsPtr + 16);

      new Float32Array(wasm.memory.buffer, dataPtr, N3).set(data);
      wasm.marchingCubesWasm(dataPtr, N, threshold, cachePtr, vertsPtr, idxPtr, maxVerts, maxIdx, countsPtr);

      const counts    = new Int32Array(wasm.memory.buffer, countsPtr, 2);
      const vertCount = counts[0];
      const idxCount  = counts[1];
      const vertices  = new Float32Array(wasm.memory.buffer.slice(vertsPtr, vertsPtr + vertCount * 3 * 4));
      const indices   = new Uint32Array(wasm.memory.buffer.slice(idxPtr, idxPtr + idxCount * 4));
      console.log(`[worker MC] ${N}³ thr=${threshold.toExponential(2)}: ${(performance.now()-_tmc).toFixed(1)}ms verts=${vertCount} (WASM)`);
      self.postMessage({ type, id, vertices, indices }, [vertices.buffer, indices.buffer]);
      return;
    }

    // --- JS fallback ---
    const result = marchingCubes(data, N, threshold);
    console.log(`[worker MC] ${N}³ thr=${threshold.toExponential(2)}: ${(performance.now()-_tmc).toFixed(1)}ms verts=${result.vertices.length/3|0} (JS)`);
    self.postMessage(
      { type, id, vertices: result.vertices, indices: result.indices },
      [result.vertices.buffer, result.indices.buffer]
    );
  }

  else if (type === 'computeGradient') {
    const { data, gridSize, halfExtent } = e.data;
    const grad = computeGradient(data, gridSize, halfExtent);
    self.postMessage({ type, id, grad }, [grad.buffer]);
  }
};
