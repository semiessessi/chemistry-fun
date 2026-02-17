// Quick parity test: compare WASM output vs JS evaluateOrbital for H 2pz orbital
import { readFileSync } from 'fs';
import { evaluateOrbital } from './js/math.js';

const wasmBuf = readFileSync('./js/wasm/sample-grid.wasm');
const { instance } = await WebAssembly.instantiate(wasmBuf);
const exp = instance.exports;
const mem = exp.memory;

const base = exp.heapBase();  // first safe byte past lookup tables
console.log(`heapBase = ${base}`);

// H 2pz term: n=2, l=1, m=0, angType='' (m==0), coeff=1, zeta=1, center=[0,0,0]
const terms = [{ center: [0, 0, 0], n: 2, l: 1, m: 0, angType: '', coeff: 1, zeta: 1 }];
const orbital = { terms };

const N = 16, halfExtent = 10;
const outLen = N * N * N;
const STRIDE = 18;
const termsBytes = terms.length * STRIDE * 4;
const outOffset = base + termsBytes + 64;
const outBytes  = outLen * 4;

// Grow WASM memory as needed
while (mem.buffer.byteLength < outOffset + outBytes) mem.grow(1);

// Pack terms at base
const view = new Float32Array(mem.buffer, base, terms.length * STRIDE);
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

exp.sampleGridChunk(base, terms.length, N, halfExtent, 0, N, outOffset);
const wasmOut = new Float32Array(mem.buffer, outOffset, outLen);

// Compare against JS
const step = (2 * halfExtent) / (N - 1);
let maxDiff = 0, rmsErr = 0, count = 0, nanCount = 0;

for (let iz = 0; iz < N; iz++) {
  const z = -halfExtent + iz * step;
  for (let iy = 0; iy < N; iy++) {
    const y = -halfExtent + iy * step;
    for (let ix = 0; ix < N; ix++) {
      const x = -halfExtent + ix * step;
      const js   = evaluateOrbital(orbital, x, y, z);
      const wasm = wasmOut[iz * N * N + iy * N + ix];
      if (!isFinite(js) || !isFinite(wasm)) {
        nanCount++;
        if (nanCount <= 3) console.warn(`  NaN/Inf at (${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}): js=${js}, wasm=${wasm}`);
        continue;
      }
      const diff = Math.abs(js - wasm);
      if (diff > maxDiff) maxDiff = diff;
      rmsErr += diff * diff;
      count++;
    }
  }
}
rmsErr = Math.sqrt(rmsErr / count);

console.log(`Parity test H 2pz, ${N}³ grid:`);
if (nanCount) console.log(`  NaN/Inf voxels: ${nanCount}`);
console.log(`  max |Δψ| = ${maxDiff.toExponential(3)}  (must be < 1e-4)`);
console.log(`  RMS  Δψ  = ${rmsErr.toExponential(3)}`);
console.log(`  PASS: ${maxDiff < 1e-4 && nanCount === 0 ? 'YES ✓' : 'NO ✗'}`);

// Also test H 3d_z2 (n=3, l=2, m=0)
const terms2 = [{ center: [0,0,0], n:3, l:2, m:0, angType:'', coeff:1, zeta:1 }];
const o2 = { terms: terms2 };
const view2 = new Float32Array(mem.buffer, base, STRIDE);
view2[0] = 0; view2[1] = 0; view2[2] = 0;
view2[3] = 3; view2[4] = 2; view2[5] = 0; view2[6] = 0;
view2[7] = 1; view2[8] = 1;
for (let r = 0; r < 9; r++) view2[9+r] = IDENT[r];
exp.sampleGridChunk(base, 1, N, halfExtent, 0, N, outOffset);
const wOut2 = new Float32Array(mem.buffer, outOffset, outLen);
let max2 = 0, nan2 = 0;
for (let i = 0; i < outLen; i++) {
  const iz = Math.floor(i / (N*N)), iy = Math.floor((i % (N*N)) / N), ix = i % N;
  const x = -halfExtent + ix*step, y = -halfExtent + iy*step, z = -halfExtent + iz*step;
  const js2 = evaluateOrbital(o2, x, y, z);
  if (!isFinite(js2) || !isFinite(wOut2[i])) { nan2++; continue; }
  max2 = Math.max(max2, Math.abs(js2 - wOut2[i]));
}
console.log(`\nParity test H 3d_z2, ${N}³: max|Δψ|=${max2.toExponential(3)}, NaN=${nan2}, PASS:${max2 < 1e-4 && nan2 === 0 ? 'YES ✓':'NO ✗'}`);
