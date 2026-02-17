// AssemblyScript implementation of hydrogen orbital grid sampling.
// Compiled with: npx asc js/wasm/sample-grid.as -o js/wasm/sample-grid.wasm --enable simd -O3 --runtime stub
//
// Term memory layout (18 × f32 = 72 bytes per term):
//   [0]  cx    [1]  cy    [2]  cz
//   [3]  n     [4]  l     [5]  m
//   [6]  angType (0=m==0, 1=cos, 2=sin)
//   [7]  coeff  [8]  zeta
//   [9..17] rot[0..8]  (row-major 3×3 rotation matrix; identity if no rotation)

const TERMS_STRIDE: i32 = 18;

// Export the first byte past the WASM data segments so JS callers know
// where to safely start placing their input/output data without clobbering
// the math library's pre-loaded lookup tables.
export function heapBase(): i32 { return i32(__heap_base); }

// ---- Math helpers ----

function fact(n: i32): f64 {
  var r: f64 = 1.0;
  for (var i: i32 = 2; i <= n; i++) r *= f64(i);
  return r;
}

// Associated Laguerre polynomial L_p^k(x) via 3-term recurrence
function assocLaguerre(p: i32, k: i32, x: f64): f64 {
  if (p == 0) return 1.0;
  if (p == 1) return 1.0 + f64(k) - x;
  var lPrev: f64 = 1.0;
  var lCurr: f64 = 1.0 + f64(k) - x;
  for (var i: i32 = 1; i < p; i++) {
    const lNext: f64 = ((2.0 * f64(i) + 1.0 + f64(k) - x) * lCurr - (f64(i) + f64(k)) * lPrev) / f64(i + 1);
    lPrev = lCurr;
    lCurr = lNext;
  }
  return lCurr;
}

// Associated Legendre polynomial P_l^|m|(x), m >= 0 (Condon-Shortley phase)
function assocLegendre(l: i32, m: i32, x: f64): f64 {
  var pmm: f64 = 1.0;
  if (m > 0) {
    const somx2: f64 = Math.sqrt(1.0 - x * x);
    var fct: f64 = 1.0;
    for (var i: i32 = 1; i <= m; i++) {
      pmm *= -fct * somx2;
      fct += 2.0;
    }
  }
  if (l == m) return pmm;
  var pmm1: f64 = x * f64(2 * m + 1) * pmm;
  if (l == m + 1) return pmm1;
  var pll: f64 = 0.0;
  for (var ll: i32 = m + 2; ll <= l; ll++) {
    pll = (f64(2 * ll - 1) * x * pmm1 - f64(ll + m - 1) * pmm) / f64(ll - m);
    pmm  = pmm1;
    pmm1 = pll;
  }
  return pll;
}

// Radial wavefunction R_{n,l}(r), r in Bohr
function radialWavefunction(n: i32, l: i32, r: f64): f64 {
  const rho: f64   = 2.0 * r / f64(n);
  const normSq: f64 = Math.pow(2.0 / f64(n), 3.0) * fact(n - l - 1) / (2.0 * f64(n) * fact(n + l));
  const norm: f64   = Math.sqrt(normSq);
  const expPart: f64 = Math.exp(-rho * 0.5);
  const rhoPow: f64  = Math.pow(rho, f64(l));
  const lag: f64     = assocLaguerre(n - l - 1, 2 * l + 1, rho);
  return norm * expPart * rhoPow * lag;
}

// Real spherical harmonic Y_{l,m}(theta, phi)
// angType: 0 → m==0 (or s-orbital), 1 → cos, 2 → sin
function realSphericalHarmonic(l: i32, m: i32, angType: i32, theta: f64, phi: f64): f64 {
  const absm: i32   = m < 0 ? -m : m;
  const norm: f64   = Math.sqrt(
    f64(2 * l + 1) / (4.0 * Math.PI) * fact(l - absm) / fact(l + absm)
  );
  const plm: f64    = assocLegendre(l, absm, Math.cos(theta));
  if (m == 0) return norm * plm;
  const sq2: f64    = Math.sqrt(2.0);
  if (angType == 1) return sq2 * norm * plm * Math.cos(f64(absm) * phi);
  /* angType == 2 */ return sq2 * norm * plm * Math.sin(f64(absm) * phi);
}

// Evaluate a single term at displacement (dx, dy, dz) from its center.
// ptr: byte offset of the term in WASM memory.
function evalTermAt(ptr: i32, x: f64, y: f64, z: f64): f64 {
  var dx: f64 = x - f64(load<f32>(ptr +  0));
  var dy: f64 = y - f64(load<f32>(ptr +  4));
  var dz: f64 = z - f64(load<f32>(ptr +  8));

  const n:       i32 = i32(load<f32>(ptr + 12));
  const l:       i32 = i32(load<f32>(ptr + 16));
  const m:       i32 = i32(load<f32>(ptr + 20));
  const angType: i32 = i32(load<f32>(ptr + 24));
  const coeff:   f64 = f64(load<f32>(ptr + 28));
  const zeta:    f64 = f64(load<f32>(ptr + 32));

  // Apply rotation when l > 0 (identity matrix is a no-op)
  if (l > 0) {
    const r00: f64 = f64(load<f32>(ptr + 36));
    const r01: f64 = f64(load<f32>(ptr + 40));
    const r02: f64 = f64(load<f32>(ptr + 44));
    const r10: f64 = f64(load<f32>(ptr + 48));
    const r11: f64 = f64(load<f32>(ptr + 52));
    const r12: f64 = f64(load<f32>(ptr + 56));
    const r20: f64 = f64(load<f32>(ptr + 60));
    const r21: f64 = f64(load<f32>(ptr + 64));
    const r22: f64 = f64(load<f32>(ptr + 68));
    const rx: f64 = r00*dx + r01*dy + r02*dz;
    const ry: f64 = r10*dx + r11*dy + r12*dz;
    const rz: f64 = r20*dx + r21*dy + r22*dz;
    dx = rx; dy = ry; dz = rz;
  }

  const r2: f64    = dx*dx + dy*dy + dz*dz;
  const r: f64     = Math.sqrt(r2);
  const rEff: f64  = r < 1e-10 ? 1e-10 : r;
  const ct: f64    = dz / rEff;
  const theta: f64 = Math.acos(ct < -1.0 ? -1.0 : ct > 1.0 ? 1.0 : ct);
  const phi: f64   = Math.atan2(dy, dx);

  const R: f64     = radialWavefunction(n, l, rEff * zeta);
  const Y: f64     = realSphericalHarmonic(l, m, angType, theta, phi);
  return coeff * R * Y * Math.pow(zeta, 1.5);
}

// ---- Public exports ----

/**
 * Sample a Z-slice range of the orbital grid.
 *
 * @param termsPtr  Byte offset of term data in WASM memory
 * @param numTerms  Number of terms
 * @param N         Grid dimension (N×N×N)
 * @param halfExtent Grid half-extent in Bohr
 * @param zStart    First Z-slice index (inclusive)
 * @param zEnd      Last  Z-slice index (exclusive)
 * @param outPtr    Byte offset for Float32 output array (must be large enough)
 */
export function sampleGridChunk(
  termsPtr: i32, numTerms: i32,
  N: i32, halfExtent: f32,
  zStart: i32, zEnd: i32,
  outPtr: i32
): void {
  const he: f64   = f64(halfExtent);
  const step: f64 = 2.0 * he / f64(N - 1);
  let idx: i32    = 0;

  for (let iz: i32 = zStart; iz < zEnd; iz++) {
    const z: f64 = -he + f64(iz) * step;
    for (let iy: i32 = 0; iy < N; iy++) {
      const y: f64 = -he + f64(iy) * step;
      for (let ix: i32 = 0; ix < N; ix++) {
        const x: f64 = -he + f64(ix) * step;
        var value: f64 = 0.0;
        for (let t: i32 = 0; t < numTerms; t++) {
          value += evalTermAt(termsPtr + t * TERMS_STRIDE * 4, x, y, z);
        }
        store<f32>(outPtr + idx * 4, f32(value));
        idx++;
      }
    }
  }
}

/**
 * Sample a Z-slice range of the total electron density (sqrt of sum of occ×ψ²).
 *
 * @param termsPtr     Byte offset of all MO terms packed flat
 * @param numMOs       Number of molecular orbitals
 * @param moHdrPtr     Byte offset of MO header array: [termCount f32, occ f32] × numMOs
 * @param N            Grid dimension
 * @param halfExtent   Grid half-extent in Bohr
 * @param zStart       First Z-slice index (inclusive)
 * @param zEnd         Last  Z-slice index (exclusive)
 * @param outPtr       Byte offset for Float32 output
 */
export function sampleDensityChunk(
  termsPtr: i32, numMOs: i32, moHdrPtr: i32,
  N: i32, halfExtent: f32,
  zStart: i32, zEnd: i32,
  outPtr: i32
): void {
  const he: f64   = f64(halfExtent);
  const step: f64 = 2.0 * he / f64(N - 1);
  let idx: i32    = 0;

  for (let iz: i32 = zStart; iz < zEnd; iz++) {
    const z: f64 = -he + f64(iz) * step;
    for (let iy: i32 = 0; iy < N; iy++) {
      const y: f64 = -he + f64(iy) * step;
      for (let ix: i32 = 0; ix < N; ix++) {
        const x: f64 = -he + f64(ix) * step;
        var rho: f64    = 0.0;
        var termOff: i32 = 0;

        for (let mo: i32 = 0; mo < numMOs; mo++) {
          const termCount: i32 = i32(load<f32>(moHdrPtr + mo * 8));
          const occ: f64       = f64(load<f32>(moHdrPtr + mo * 8 + 4));
          var psi: f64 = 0.0;
          for (let t: i32 = 0; t < termCount; t++) {
            psi += evalTermAt(termsPtr + (termOff + t) * TERMS_STRIDE * 4, x, y, z);
          }
          rho += occ * psi * psi;
          termOff += termCount;
        }

        store<f32>(outPtr + idx * 4, f32(Math.sqrt(rho)));
        idx++;
      }
    }
  }
}

// ---- Marching cubes lookup tables (baked into WASM data segments) ----
// @ts-ignore
const EDGE_TABLE_PTR: usize = memory.data<i32>([0,265,515,778,1030,1295,1541,1804,2060,2309,2575,2822,3082,3331,3593,3840,400,153,915,666,1430,1183,1941,1692,2460,2197,2975,2710,3482,3219,3993,3728,560,825,51,314,1590,1855,1077,1340,2620,2869,2111,2358,3642,3891,3129,3376,928,681,419,170,1958,1711,1445,1196,2988,2725,2479,2214,4010,3747,3497,3232,1120,1385,1635,1898,102,367,613,876,3180,3429,3695,3942,2154,2403,2665,2912,1520,1273,2035,1786,502,255,1013,764,3580,3317,4095,3830,2554,2291,3065,2800,1616,1881,1107,1370,598,863,85,348,3676,3925,3167,3414,2650,2899,2137,2384,1984,1737,1475,1226,966,719,453,204,4044,3781,3535,3270,3018,2755,2505,2240,2240,2505,2755,3018,3270,3535,3781,4044,204,453,719,966,1226,1475,1737,1984,2384,2137,2899,2650,3414,3167,3925,3676,348,85,863,598,1370,1107,1881,1616,2800,3065,2291,2554,3830,4095,3317,3580,764,1013,255,502,1786,2035,1273,1520,2912,2665,2403,2154,3942,3695,3429,3180,876,613,367,102,1898,1635,1385,1120,3232,3497,3747,4010,2214,2479,2725,2988,1196,1445,1711,1958,170,419,681,928,3376,3129,3891,3642,2358,2111,2869,2620,1340,1077,1855,1590,314,51,825,560,3728,3993,3219,3482,2710,2975,2197,2460,1692,1941,1183,1430,666,915,153,400,3840,3593,3331,3082,2822,2575,2309,2060,1804,1541,1295,1030,778,515,265,0]);
// @ts-ignore
const TRI_TABLE_PTR: usize = memory.data<i8>([-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,8,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,1,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,8,3,9,8,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,2,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,8,3,1,2,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,9,2,10,0,2,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,2,8,3,2,10,8,10,9,8,-1,-1,-1,-1,-1,-1,-1,3,11,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,11,2,8,11,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,9,0,2,3,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,11,2,1,9,11,9,8,11,-1,-1,-1,-1,-1,-1,-1,3,10,1,11,10,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,10,1,0,8,10,8,11,10,-1,-1,-1,-1,-1,-1,-1,3,9,0,3,11,9,11,10,9,-1,-1,-1,-1,-1,-1,-1,9,8,10,10,8,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,7,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,3,0,7,3,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,1,9,8,4,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,1,9,4,7,1,7,3,1,-1,-1,-1,-1,-1,-1,-1,1,2,10,8,4,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,3,4,7,3,0,4,1,2,10,-1,-1,-1,-1,-1,-1,-1,9,2,10,9,0,2,8,4,7,-1,-1,-1,-1,-1,-1,-1,2,10,9,2,9,7,2,7,3,7,9,4,-1,-1,-1,-1,8,4,7,3,11,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,11,4,7,11,2,4,2,0,4,-1,-1,-1,-1,-1,-1,-1,9,0,1,8,4,7,2,3,11,-1,-1,-1,-1,-1,-1,-1,4,7,11,9,4,11,9,11,2,9,2,1,-1,-1,-1,-1,3,10,1,3,11,10,7,8,4,-1,-1,-1,-1,-1,-1,-1,1,11,10,1,4,11,1,0,4,7,11,4,-1,-1,-1,-1,4,7,8,9,0,11,9,11,10,11,0,3,-1,-1,-1,-1,4,7,11,4,11,9,9,11,10,-1,-1,-1,-1,-1,-1,-1,9,5,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,9,5,4,0,8,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,5,4,1,5,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,8,5,4,8,3,5,3,1,5,-1,-1,-1,-1,-1,-1,-1,1,2,10,9,5,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,3,0,8,1,2,10,4,9,5,-1,-1,-1,-1,-1,-1,-1,5,2,10,5,4,2,4,0,2,-1,-1,-1,-1,-1,-1,-1,2,10,5,3,2,5,3,5,4,3,4,8,-1,-1,-1,-1,9,5,4,2,3,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,11,2,0,8,11,4,9,5,-1,-1,-1,-1,-1,-1,-1,0,5,4,0,1,5,2,3,11,-1,-1,-1,-1,-1,-1,-1,2,1,5,2,5,8,2,8,11,4,8,5,-1,-1,-1,-1,10,3,11,10,1,3,9,5,4,-1,-1,-1,-1,-1,-1,-1,4,9,5,0,8,1,8,10,1,8,11,10,-1,-1,-1,-1,5,4,0,5,0,11,5,11,10,11,0,3,-1,-1,-1,-1,5,4,8,5,8,10,10,8,11,-1,-1,-1,-1,-1,-1,-1,9,7,8,5,7,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,9,3,0,9,5,3,5,7,3,-1,-1,-1,-1,-1,-1,-1,0,7,8,0,1,7,1,5,7,-1,-1,-1,-1,-1,-1,-1,1,5,3,3,5,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,9,7,8,9,5,7,10,1,2,-1,-1,-1,-1,-1,-1,-1,10,1,2,9,5,0,5,3,0,5,7,3,-1,-1,-1,-1,8,0,2,8,2,5,8,5,7,10,5,2,-1,-1,-1,-1,2,10,5,2,5,3,3,5,7,-1,-1,-1,-1,-1,-1,-1,7,9,5,7,8,9,3,11,2,-1,-1,-1,-1,-1,-1,-1,9,5,7,9,7,2,9,2,0,2,7,11,-1,-1,-1,-1,2,3,11,0,1,8,1,7,8,1,5,7,-1,-1,-1,-1,11,2,1,11,1,7,7,1,5,-1,-1,-1,-1,-1,-1,-1,9,5,8,8,5,7,10,1,3,10,3,11,-1,-1,-1,-1,5,7,0,5,0,9,7,11,0,1,0,10,11,10,0,-1,11,10,0,11,0,3,10,5,0,8,0,7,5,7,0,-1,11,10,5,7,11,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,10,6,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,8,3,5,10,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,9,0,1,5,10,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,8,3,1,9,8,5,10,6,-1,-1,-1,-1,-1,-1,-1,1,6,5,2,6,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,6,5,1,2,6,3,0,8,-1,-1,-1,-1,-1,-1,-1,9,6,5,9,0,6,0,2,6,-1,-1,-1,-1,-1,-1,-1,5,9,8,5,8,2,5,2,6,3,2,8,-1,-1,-1,-1,2,3,11,10,6,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,11,0,8,11,2,0,10,6,5,-1,-1,-1,-1,-1,-1,-1,0,1,9,2,3,11,5,10,6,-1,-1,-1,-1,-1,-1,-1,5,10,6,1,9,2,9,11,2,9,8,11,-1,-1,-1,-1,6,3,11,6,5,3,5,1,3,-1,-1,-1,-1,-1,-1,-1,0,8,11,0,11,5,0,5,1,5,11,6,-1,-1,-1,-1,3,11,6,0,3,6,0,6,5,0,5,9,-1,-1,-1,-1,6,5,9,6,9,11,11,9,8,-1,-1,-1,-1,-1,-1,-1,5,10,6,4,7,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,3,0,4,7,3,6,5,10,-1,-1,-1,-1,-1,-1,-1,1,9,0,5,10,6,8,4,7,-1,-1,-1,-1,-1,-1,-1,10,6,5,1,9,7,1,7,3,7,9,4,-1,-1,-1,-1,6,1,2,6,5,1,4,7,8,-1,-1,-1,-1,-1,-1,-1,1,2,5,5,2,6,3,0,4,3,4,7,-1,-1,-1,-1,8,4,7,9,0,5,0,6,5,0,2,6,-1,-1,-1,-1,7,3,9,7,9,4,3,2,9,5,9,6,2,6,9,-1,3,11,2,7,8,4,10,6,5,-1,-1,-1,-1,-1,-1,-1,5,10,6,4,7,2,4,2,0,2,7,11,-1,-1,-1,-1,0,1,9,4,7,8,2,3,11,5,10,6,-1,-1,-1,-1,9,2,1,9,11,2,9,4,11,7,11,4,5,10,6,-1,8,4,7,3,11,5,3,5,1,5,11,6,-1,-1,-1,-1,5,1,11,5,11,6,1,0,11,7,11,4,0,4,11,-1,0,5,9,0,6,5,0,3,6,11,6,3,8,4,7,-1,6,5,9,6,9,11,4,7,9,7,11,9,-1,-1,-1,-1,10,4,9,6,4,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,10,6,4,9,10,0,8,3,-1,-1,-1,-1,-1,-1,-1,10,0,1,10,6,0,6,4,0,-1,-1,-1,-1,-1,-1,-1,8,3,1,8,1,6,8,6,4,6,1,10,-1,-1,-1,-1,1,4,9,1,2,4,2,6,4,-1,-1,-1,-1,-1,-1,-1,3,0,8,1,2,9,2,4,9,2,6,4,-1,-1,-1,-1,0,2,4,4,2,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,8,3,2,8,2,4,4,2,6,-1,-1,-1,-1,-1,-1,-1,10,4,9,10,6,4,11,2,3,-1,-1,-1,-1,-1,-1,-1,0,8,2,2,8,11,4,9,10,4,10,6,-1,-1,-1,-1,3,11,2,0,1,6,0,6,4,6,1,10,-1,-1,-1,-1,6,4,1,6,1,10,4,8,1,2,1,11,8,11,1,-1,9,6,4,9,3,6,9,1,3,11,6,3,-1,-1,-1,-1,8,11,1,8,1,0,11,6,1,9,1,4,6,4,1,-1,3,11,6,3,6,0,0,6,4,-1,-1,-1,-1,-1,-1,-1,6,4,8,11,6,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,7,10,6,7,8,10,8,9,10,-1,-1,-1,-1,-1,-1,-1,0,7,3,0,10,7,0,9,10,6,7,10,-1,-1,-1,-1,10,6,7,1,10,7,1,7,8,1,8,0,-1,-1,-1,-1,10,6,7,10,7,1,1,7,3,-1,-1,-1,-1,-1,-1,-1,1,2,6,1,6,8,1,8,9,8,6,7,-1,-1,-1,-1,2,6,9,2,9,1,6,7,9,0,9,3,7,3,9,-1,7,8,0,7,0,6,6,0,2,-1,-1,-1,-1,-1,-1,-1,7,3,2,6,7,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,2,3,11,10,6,8,10,8,9,8,6,7,-1,-1,-1,-1,2,0,7,2,7,11,0,9,7,6,7,10,9,10,7,-1,1,8,0,1,7,8,1,10,7,6,7,10,2,3,11,-1,11,2,1,11,1,7,10,6,1,6,7,1,-1,-1,-1,-1,8,9,6,8,6,7,9,1,6,11,6,3,1,3,6,-1,0,9,1,11,6,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,7,8,0,7,0,6,3,11,0,11,6,0,-1,-1,-1,-1,7,11,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,7,6,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,3,0,8,11,7,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,1,9,11,7,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,8,1,9,8,3,1,11,7,6,-1,-1,-1,-1,-1,-1,-1,10,1,2,6,11,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,2,10,3,0,8,6,11,7,-1,-1,-1,-1,-1,-1,-1,2,9,0,2,10,9,6,11,7,-1,-1,-1,-1,-1,-1,-1,6,11,7,2,10,3,10,8,3,10,9,8,-1,-1,-1,-1,7,2,3,6,2,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,7,0,8,7,6,0,6,2,0,-1,-1,-1,-1,-1,-1,-1,2,7,6,2,3,7,0,1,9,-1,-1,-1,-1,-1,-1,-1,1,6,2,1,8,6,1,9,8,8,7,6,-1,-1,-1,-1,10,7,6,10,1,7,1,3,7,-1,-1,-1,-1,-1,-1,-1,10,7,6,1,7,10,1,8,7,1,0,8,-1,-1,-1,-1,0,3,7,0,7,10,0,10,9,6,10,7,-1,-1,-1,-1,7,6,10,7,10,8,8,10,9,-1,-1,-1,-1,-1,-1,-1,6,8,4,11,8,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,3,6,11,3,0,6,0,4,6,-1,-1,-1,-1,-1,-1,-1,8,6,11,8,4,6,9,0,1,-1,-1,-1,-1,-1,-1,-1,9,4,6,9,6,3,9,3,1,11,3,6,-1,-1,-1,-1,6,8,4,6,11,8,2,10,1,-1,-1,-1,-1,-1,-1,-1,1,2,10,3,0,11,0,6,11,0,4,6,-1,-1,-1,-1,4,11,8,4,6,11,0,2,9,2,10,9,-1,-1,-1,-1,10,9,3,10,3,2,9,4,3,11,3,6,4,6,3,-1,8,2,3,8,4,2,4,6,2,-1,-1,-1,-1,-1,-1,-1,0,4,2,4,6,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,9,0,2,3,4,2,4,6,4,3,8,-1,-1,-1,-1,1,9,4,1,4,2,2,4,6,-1,-1,-1,-1,-1,-1,-1,8,1,3,8,6,1,8,4,6,6,10,1,-1,-1,-1,-1,10,1,0,10,0,6,6,0,4,-1,-1,-1,-1,-1,-1,-1,4,6,3,4,3,8,6,10,3,0,3,9,10,9,3,-1,10,9,4,6,10,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,9,5,7,6,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,8,3,4,9,5,11,7,6,-1,-1,-1,-1,-1,-1,-1,5,0,1,5,4,0,7,6,11,-1,-1,-1,-1,-1,-1,-1,11,7,6,8,3,4,3,5,4,3,1,5,-1,-1,-1,-1,9,5,4,10,1,2,7,6,11,-1,-1,-1,-1,-1,-1,-1,6,11,7,1,2,10,0,8,3,4,9,5,-1,-1,-1,-1,7,6,11,5,4,10,4,2,10,4,0,2,-1,-1,-1,-1,3,4,8,3,5,4,3,2,5,10,5,2,11,7,6,-1,7,2,3,7,6,2,5,4,9,-1,-1,-1,-1,-1,-1,-1,9,5,4,0,8,6,0,6,2,6,8,7,-1,-1,-1,-1,3,6,2,3,7,6,1,5,0,5,4,0,-1,-1,-1,-1,6,2,8,6,8,7,2,1,8,4,8,5,1,5,8,-1,9,5,4,10,1,6,1,7,6,1,3,7,-1,-1,-1,-1,1,6,10,1,7,6,1,0,7,8,7,0,9,5,4,-1,4,0,10,4,10,5,0,3,10,6,10,7,3,7,10,-1,7,6,10,7,10,8,5,4,10,4,8,10,-1,-1,-1,-1,6,9,5,6,11,9,11,8,9,-1,-1,-1,-1,-1,-1,-1,3,6,11,0,6,3,0,5,6,0,9,5,-1,-1,-1,-1,0,11,8,0,5,11,0,1,5,5,6,11,-1,-1,-1,-1,6,11,3,6,3,5,5,3,1,-1,-1,-1,-1,-1,-1,-1,1,2,10,9,5,11,9,11,8,11,5,6,-1,-1,-1,-1,0,11,3,0,6,11,0,9,6,5,6,9,1,2,10,-1,11,8,5,11,5,6,8,0,5,10,5,2,0,2,5,-1,6,11,3,6,3,5,2,10,3,10,5,3,-1,-1,-1,-1,5,8,9,5,2,8,5,6,2,3,8,2,-1,-1,-1,-1,9,5,6,9,6,0,0,6,2,-1,-1,-1,-1,-1,-1,-1,1,5,8,1,8,0,5,6,8,3,8,2,6,2,8,-1,1,5,6,2,1,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,3,6,1,6,10,3,8,6,5,6,9,8,9,6,-1,10,1,0,10,0,6,9,5,0,5,6,0,-1,-1,-1,-1,0,3,8,5,6,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,10,5,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,11,5,10,7,5,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,11,5,10,11,7,5,8,3,0,-1,-1,-1,-1,-1,-1,-1,5,11,7,5,10,11,1,9,0,-1,-1,-1,-1,-1,-1,-1,10,7,5,10,11,7,9,8,1,8,3,1,-1,-1,-1,-1,11,1,2,11,7,1,7,5,1,-1,-1,-1,-1,-1,-1,-1,0,8,3,1,2,7,1,7,5,7,2,11,-1,-1,-1,-1,9,7,5,9,2,7,9,0,2,2,11,7,-1,-1,-1,-1,7,5,2,7,2,11,5,9,2,3,2,8,9,8,2,-1,2,5,10,2,3,5,3,7,5,-1,-1,-1,-1,-1,-1,-1,8,2,0,8,5,2,8,7,5,10,2,5,-1,-1,-1,-1,9,0,1,5,10,3,5,3,7,3,10,2,-1,-1,-1,-1,9,8,2,9,2,1,8,7,2,10,2,5,7,5,2,-1,1,3,5,3,7,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,8,7,0,7,1,1,7,5,-1,-1,-1,-1,-1,-1,-1,9,0,3,9,3,5,5,3,7,-1,-1,-1,-1,-1,-1,-1,9,8,7,5,9,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,5,8,4,5,10,8,10,11,8,-1,-1,-1,-1,-1,-1,-1,5,0,4,5,11,0,5,10,11,11,3,0,-1,-1,-1,-1,0,1,9,8,4,10,8,10,11,10,4,5,-1,-1,-1,-1,10,11,4,10,4,5,11,3,4,9,4,1,3,1,4,-1,2,5,1,2,8,5,2,11,8,4,5,8,-1,-1,-1,-1,0,4,11,0,11,3,4,5,11,2,11,1,5,1,11,-1,0,2,5,0,5,9,2,11,5,4,5,8,11,8,5,-1,9,4,5,2,11,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,2,5,10,3,5,2,3,4,5,3,8,4,-1,-1,-1,-1,5,10,2,5,2,4,4,2,0,-1,-1,-1,-1,-1,-1,-1,3,10,2,3,5,10,3,8,5,4,5,8,0,1,9,-1,5,10,2,5,2,4,1,9,2,9,4,2,-1,-1,-1,-1,8,4,5,8,5,3,3,5,1,-1,-1,-1,-1,-1,-1,-1,0,4,5,1,0,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,8,4,5,8,5,3,9,0,5,0,3,5,-1,-1,-1,-1,9,4,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,11,7,4,9,11,9,10,11,-1,-1,-1,-1,-1,-1,-1,0,8,3,4,9,7,9,11,7,9,10,11,-1,-1,-1,-1,1,10,11,1,11,4,1,4,0,7,4,11,-1,-1,-1,-1,3,1,4,3,4,8,1,10,4,7,4,11,10,11,4,-1,4,11,7,9,11,4,9,2,11,9,1,2,-1,-1,-1,-1,9,7,4,9,11,7,9,1,11,2,11,1,0,8,3,-1,11,7,4,11,4,2,2,4,0,-1,-1,-1,-1,-1,-1,-1,11,7,4,11,4,2,8,3,4,3,2,4,-1,-1,-1,-1,2,9,10,2,7,9,2,3,7,7,4,9,-1,-1,-1,-1,9,10,7,9,7,4,10,2,7,8,7,0,2,0,7,-1,3,7,10,3,10,2,7,4,10,1,10,0,4,0,10,-1,1,10,2,8,7,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,9,1,4,1,7,7,1,3,-1,-1,-1,-1,-1,-1,-1,4,9,1,4,1,7,0,8,1,8,7,1,-1,-1,-1,-1,4,0,3,7,4,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,4,8,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,9,10,8,10,11,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,3,0,9,3,9,11,11,9,10,-1,-1,-1,-1,-1,-1,-1,0,1,10,0,10,8,8,10,11,-1,-1,-1,-1,-1,-1,-1,3,1,10,11,3,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,2,11,1,11,9,9,11,8,-1,-1,-1,-1,-1,-1,-1,3,0,9,3,9,11,1,2,9,2,11,9,-1,-1,-1,-1,0,2,11,8,0,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,3,2,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,2,3,8,2,8,10,10,8,9,-1,-1,-1,-1,-1,-1,-1,9,10,2,0,9,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,2,3,8,2,8,10,0,1,8,1,10,8,-1,-1,-1,-1,1,10,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,3,8,9,1,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,9,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,3,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1]);
// Edge pair endpoints: which two cube corners each of the 12 edges connects
// @ts-ignore
const EDGE_PAIR_A: usize = memory.data<u8>([0,1,2,3,4,5,6,7,0,1,2,3]);
// @ts-ignore
const EDGE_PAIR_B: usize = memory.data<u8>([1,2,3,0,5,6,7,4,4,5,6,7]);
// Edge info: [dir(0=X,1=Y,2=Z), dx, dy, dz] x12 for cache key
// @ts-ignore
const EDGE_INFO_PTR: usize = memory.data<u8>([
  0,0,0,0, 1,1,0,0, 0,0,1,0, 1,0,0,0,
  0,0,0,1, 1,1,0,1, 0,0,1,1, 1,0,0,1,
  2,0,0,0, 2,1,0,0, 2,1,1,0, 2,0,1,0
]);

// Corner offsets for the 8 cube corners (matches JS ordering)
@inline function cxo(c: i32): i32 { return (c == 1 || c == 2 || c == 5 || c == 6) ? 1 : 0; }
@inline function cyo(c: i32): i32 { return (c == 2 || c == 3 || c == 6 || c == 7) ? 1 : 0; }
@inline function czo(c: i32): i32 { return c >= 4 ? 1 : 0; }

@inline function getCornerVal(c: i32, v0: f32, v1: f32, v2: f32, v3: f32,
                                        v4: f32, v5: f32, v6: f32, v7: f32): f32 {
  if (c == 0) return v0; if (c == 1) return v1; if (c == 2) return v2; if (c == 3) return v3;
  if (c == 4) return v4; if (c == 5) return v5; if (c == 6) return v6; return v7;
}

function interpEdgeVertex(
  ix: i32, iy: i32, iz: i32, edge: i32,
  v0: f32, v1: f32, v2: f32, v3: f32,
  v4: f32, v5: f32, v6: f32, v7: f32,
  threshold: f32, N: i32, N2: i32, N3: i32,
  edgeCachePtr: i32, outVertsPtr: i32, vertCount: i32
): i32 {
  const infoBase: i32 = i32(EDGE_INFO_PTR) + edge * 4;
  const dir: i32 = i32(load<u8>(infoBase));
  const ddx: i32 = i32(load<u8>(infoBase + 1));
  const ddy: i32 = i32(load<u8>(infoBase + 2));
  const ddz: i32 = i32(load<u8>(infoBase + 3));
  const key: i32 = dir * N3 + (iz + ddz) * N2 + (iy + ddy) * N + (ix + ddx);
  const cached: i32 = load<i32>(edgeCachePtr + key * 4);
  if (cached != -1) return cached;

  const a: i32 = i32(load<u8>(i32(EDGE_PAIR_A) + edge));
  const b: i32 = i32(load<u8>(i32(EDGE_PAIR_B) + edge));
  const va: f32 = getCornerVal(a, v0, v1, v2, v3, v4, v5, v6, v7);
  const vb: f32 = getCornerVal(b, v0, v1, v2, v3, v4, v5, v6, v7);

  var mu: f32;
  if      (Math.abs(f64(threshold - va)) < 1e-10) { mu = 0.0; }
  else if (Math.abs(f64(threshold - vb)) < 1e-10) { mu = 1.0; }
  else if (Math.abs(f64(va - vb))        < 1e-10) { mu = 0.0; }
  else { mu = (threshold - va) / (vb - va); }

  const ax: f32 = f32(ix + cxo(a)); const ay: f32 = f32(iy + cyo(a)); const az: f32 = f32(iz + czo(a));
  const bx: f32 = f32(ix + cxo(b)); const by: f32 = f32(iy + cyo(b)); const bz: f32 = f32(iz + czo(b));

  const idx: i32 = vertCount;
  const off: i32 = idx * 12;
  store<f32>(outVertsPtr + off,     ax + mu * (bx - ax));
  store<f32>(outVertsPtr + off + 4, ay + mu * (by - ay));
  store<f32>(outVertsPtr + off + 8, az + mu * (bz - az));
  store<i32>(edgeCachePtr + key * 4, idx);
  return idx;
}

/**
 * Marching cubes — output vertices in grid-index space (same as JS implementation).
 * edgeCachePtr : Int32 scratch, size >= 3*N*N*N*4 bytes (cleared internally)
 * outVertsPtr  : Float32 output, capacity = maxVerts*3 floats
 * outIdxPtr    : Uint32 output,  capacity = maxIdx uint32s
 * outCountsPtr : i32[2] — written with [vertCount, idxCount] on return
 * Returns 0 normally; 1 if overflow occurred.
 */
export function marchingCubesWasm(
  dataPtr: i32, N: i32, threshold: f32,
  edgeCachePtr: i32,
  outVertsPtr: i32, outIdxPtr: i32,
  maxVerts: i32, maxIdx: i32,
  outCountsPtr: i32
): i32 {
  const N2: i32 = N * N;
  const N3: i32 = N2 * N;

  // Clear edge cache to -1
  for (var ci: i32 = 0; ci < N3 * 3 * 4; ci += 4) store<i32>(edgeCachePtr + ci, -1);

  var vertCount: i32 = 0;
  var idxCount:  i32 = 0;
  var overflow:  bool = false;

  for (var iz: i32 = 0; iz < N - 1; iz++) {
    for (var iy: i32 = 0; iy < N - 1; iy++) {
      for (var ix: i32 = 0; ix < N - 1; ix++) {
        const base: i32 = (iz * N2 + iy * N + ix) * 4;
        const v0: f32 = load<f32>(dataPtr + base);
        const v1: f32 = load<f32>(dataPtr + base + 4);
        const v2: f32 = load<f32>(dataPtr + base + 4 + N * 4);
        const v3: f32 = load<f32>(dataPtr + base     + N * 4);
        const v4: f32 = load<f32>(dataPtr + base         + N2 * 4);
        const v5: f32 = load<f32>(dataPtr + base + 4     + N2 * 4);
        const v6: f32 = load<f32>(dataPtr + base + 4 + N * 4 + N2 * 4);
        const v7: f32 = load<f32>(dataPtr + base     + N * 4 + N2 * 4);

        var cubeIdx: i32 = 0;
        if (v0 >= threshold) cubeIdx |= 1;
        if (v1 >= threshold) cubeIdx |= 2;
        if (v2 >= threshold) cubeIdx |= 4;
        if (v3 >= threshold) cubeIdx |= 8;
        if (v4 >= threshold) cubeIdx |= 16;
        if (v5 >= threshold) cubeIdx |= 32;
        if (v6 >= threshold) cubeIdx |= 64;
        if (v7 >= threshold) cubeIdx |= 128;

        if (load<i32>(i32(EDGE_TABLE_PTR) + cubeIdx * 4) == 0) continue;

        const triBase: i32 = i32(TRI_TABLE_PTR) + cubeIdx * 16;
        for (var ti: i32 = 0; ti < 15; ti += 3) {
          const e0: i32 = i32(load<i8>(triBase + ti));
          if (e0 == -1) break;
          const e1: i32 = i32(load<i8>(triBase + ti + 1));
          const e2: i32 = i32(load<i8>(triBase + ti + 2));

          const vi0: i32 = interpEdgeVertex(ix,iy,iz,e0,v0,v1,v2,v3,v4,v5,v6,v7,threshold,N,N2,N3,edgeCachePtr,outVertsPtr,vertCount);
          if (vi0 == vertCount) { if (vertCount >= maxVerts) { overflow = true; break; } vertCount++; }
          const vi1: i32 = interpEdgeVertex(ix,iy,iz,e1,v0,v1,v2,v3,v4,v5,v6,v7,threshold,N,N2,N3,edgeCachePtr,outVertsPtr,vertCount);
          if (vi1 == vertCount) { if (vertCount >= maxVerts) { overflow = true; break; } vertCount++; }
          const vi2: i32 = interpEdgeVertex(ix,iy,iz,e2,v0,v1,v2,v3,v4,v5,v6,v7,threshold,N,N2,N3,edgeCachePtr,outVertsPtr,vertCount);
          if (vi2 == vertCount) { if (vertCount >= maxVerts) { overflow = true; break; } vertCount++; }

          if (idxCount + 3 > maxIdx) { overflow = true; break; }
          store<u32>(outIdxPtr + idxCount * 4,       u32(vi0));
          store<u32>(outIdxPtr + (idxCount + 1) * 4, u32(vi1));
          store<u32>(outIdxPtr + (idxCount + 2) * 4, u32(vi2));
          idxCount += 3;
        }
        if (overflow) break;
      }
      if (overflow) break;
    }
    if (overflow) break;
  }

  store<i32>(outCountsPtr,     vertCount);
  store<i32>(outCountsPtr + 4, idxCount);
  return overflow ? 1 : 0;
}
