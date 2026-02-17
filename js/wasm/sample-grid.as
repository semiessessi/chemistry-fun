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
