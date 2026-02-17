import { readFileSync } from 'fs';
import { evaluateOrbital } from './js/math.js';

const wasmBuf = readFileSync('./js/wasm/sample-grid.wasm');
const { instance } = await WebAssembly.instantiate(wasmBuf);
const exp = instance.exports;
const mem = exp.memory;

const terms = [{ center: [0, 0, 0], n: 2, l: 1, m: 0, angType: '', coeff: 1, zeta: 1 }];
const N = 4, halfExtent = 5;
const outLen = N * N * N;

const STRIDE = 18;
const termsBytes = terms.length * STRIDE * 4;
const outOffset = termsBytes + 64;
const outBytes = outLen * 4;
while (mem.buffer.byteLength < outOffset + outBytes) mem.grow(1);

const view = new Float32Array(mem.buffer, 0, terms.length * STRIDE);
const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];
for (let t = 0; t < terms.length; t++) {
  const term = terms[t];
  const b = t * STRIDE;
  view[b]   = term.center[0]; view[b+1] = term.center[1]; view[b+2] = term.center[2];
  view[b+3] = term.n;         view[b+4] = term.l;         view[b+5] = term.m;
  view[b+6] = term.angType === 'cos' ? 1 : term.angType === 'sin' ? 2 : 0;
  view[b+7] = term.coeff;     view[b+8] = term.zeta || 1;
  const rot = term.rot || IDENT;
  for (let r = 0; r < 9; r++) view[b+9+r] = rot[r];
}

console.log('Packed term[0]:', Array.from(view.slice(0, STRIDE)));

exp.sampleGridChunk(0, terms.length, N, halfExtent, 0, N, outOffset);
const wasmOut = new Float32Array(mem.buffer, outOffset, outLen);

const orbital = { terms };
const step = (2 * halfExtent) / (N - 1);
let row = 0;
for (let iz = 0; iz < N; iz++) {
  const z = -halfExtent + iz * step;
  for (let iy = 0; iy < N; iy++) {
    const y = -halfExtent + iy * step;
    for (let ix = 0; ix < N; ix++) {
      const x = -halfExtent + ix * step;
      const js = evaluateOrbital(orbital, x, y, z);
      const wm = wasmOut[iz * N * N + iy * N + ix];
      if (row < 8) console.log(`(${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}): JS=${js.toFixed(6)}, WASM=${wm.toFixed(6)}, diff=${Math.abs(js-wm).toExponential(2)}`);
      row++;
    }
  }
}
