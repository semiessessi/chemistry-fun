// Gradient computation: electric field gradients, magnetic fields, and interpolation utilities.

// ---- Gradient computation (central differences) ----

export function computeGradient(data, gridSize, halfExtent) {
  const h = (2 * halfExtent) / (gridSize - 1);
  const N = gridSize, N2 = N * N;
  const grad = new Float32Array(N * N * N * 3);

  for (let iz = 1; iz < N - 1; iz++) {
    for (let iy = 1; iy < N - 1; iy++) {
      for (let ix = 1; ix < N - 1; ix++) {
        const idx = iz * N2 + iy * N + ix;
        const oi = idx * 3;
        grad[oi]     = (data[idx + 1]  - data[idx - 1])  / (2 * h);
        grad[oi + 1] = (data[idx + N]  - data[idx - N])  / (2 * h);
        grad[oi + 2] = (data[idx + N2] - data[idx - N2]) / (2 * h);
      }
    }
  }
  return grad;
}

// ---- Magnetic field: B from nuclear magnetic dipoles (z-aligned) ----

// Relative nuclear magnetic moments (proportional to gyromagnetic ratio, H=1)
const NUCLEAR_MOMENT = {
  1: 1.000,    // H  (¹H, spin-½, γ = 267.5 Mrad/s/T)
  2: 0.000,    // He (⁴He, spin-0)
  6: 0.251,    // C  (¹³C)
  7: -0.101,   // N  (¹⁴N)
  8: -0.136,   // O  (¹⁷O)
  9: 0.941,    // F  (¹⁹F)
  11: 0.264,   // Na (²³Na)
  13: 0.261,   // Al (²⁷Al)
  15: 0.405,   // P  (³¹P)
  16: 0.077,   // S  (³³S)
  17: 0.098,   // Cl (³⁵Cl)
  20: -0.067,  // Ca (⁴³Ca)
  22: -0.056,  // Ti (⁴⁷Ti)
  26: 0.032,   // Fe (⁵⁷Fe)
  29: 0.266,   // Cu (⁶³Cu)
};

export function computeMagneticField(atomInfo, gridSize, halfExtent) {
  const N = gridSize, N2 = N * N;
  const step = (2 * halfExtent) / (N - 1);
  const field = new Float32Array(N * N * N * 3);
  const softening2 = 0.25;

  for (let iz = 0; iz < N; iz++) {
    const z = -halfExtent + iz * step;
    for (let iy = 0; iy < N; iy++) {
      const y = -halfExtent + iy * step;
      for (let ix = 0; ix < N; ix++) {
        const x = -halfExtent + ix * step;
        const oi = (iz * N2 + iy * N + ix) * 3;
        let bx = 0, by = 0, bz = 0;
        for (const atom of atomInfo) {
          const mu = NUCLEAR_MOMENT[atom.Z] || 0;
          if (mu === 0) continue;
          const dx = x - atom.x, dy = y - atom.y, dz = z - atom.z;
          const r2 = dx * dx + dy * dy + dz * dz + softening2;
          const r = Math.sqrt(r2);
          const r5 = r2 * r2 * r;
          bx += mu * 3 * dx * dz / r5;
          by += mu * 3 * dy * dz / r5;
          bz += mu * (3 * dz * dz - r2) / r5;
        }
        field[oi] = bx;
        field[oi + 1] = by;
        field[oi + 2] = bz;
      }
    }
  }
  return field;
}

// ---- Filter bounds via histogram (O(n)) ----

export function computeFilterBounds(data, halfExtent, gridSize, probability) {
  const voxelVol = Math.pow(2 * halfExtent / (gridSize - 1), 3);
  const N = data.length;

  let totalProb = 0, maxAbs = 0;
  for (let i = 0; i < N; i++) {
    const v = Math.abs(data[i]);
    if (v > maxAbs) maxAbs = v;
    totalProb += data[i] * data[i] * voxelVol;
  }
  if (maxAbs === 0 || totalProb === 0) return { lo: 0, hi: 0 };

  const BINS = 1024;
  const binWidth = maxAbs / BINS;
  const hist = new Float64Array(BINS);
  for (let i = 0; i < N; i++) {
    const v = Math.abs(data[i]);
    const bin = Math.min(BINS - 1, Math.floor(v / binWidth));
    hist[bin] += data[i] * data[i] * voxelVol;
  }

  let accum = 0, outerThreshold = 0;
  for (let b = BINS - 1; b >= 0; b--) {
    accum += hist[b];
    if (accum / totalProb >= probability) { outerThreshold = (b + 0.5) * binWidth; break; }
  }

  return { lo: outerThreshold * 0.3, hi: outerThreshold * 2.5 };
}

// ---- Magnitude-based filter band ----

export function computeMagnitudeBounds(grad, gridSize, loFrac = 0.02, hiFrac = 0.5) {
  const N = gridSize * gridSize * gridSize;
  let maxMag = 0;
  const mags = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const oi = i * 3;
    const m = Math.sqrt(grad[oi] * grad[oi] + grad[oi + 1] * grad[oi + 1] + grad[oi + 2] * grad[oi + 2]);
    mags[i] = m;
    if (m > maxMag) maxMag = m;
  }
  return { lo: maxMag * loFrac, hi: maxMag * hiFrac, mags, maxMag };
}

// ---- Trilinear interpolation of vector field ----

export function trilinearInterp(grad, gs, he, step, x, y, z) {
  const fx = (x + he) / step, fy = (y + he) / step, fz = (z + he) / step;
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  if (ix < 0 || ix >= gs - 1 || iy < 0 || iy >= gs - 1 || iz < 0 || iz >= gs - 1) return null;

  const tx = fx - ix, ty = fy - iy, tz = fz - iz;
  const N = gs, N2 = N * N;
  const i000 = (iz * N2 + iy * N + ix) * 3;
  const i100 = i000 + 3;
  const i010 = (iz * N2 + (iy + 1) * N + ix) * 3;
  const i110 = i010 + 3;
  const i001 = ((iz + 1) * N2 + iy * N + ix) * 3;
  const i101 = i001 + 3;
  const i011 = ((iz + 1) * N2 + (iy + 1) * N + ix) * 3;
  const i111 = i011 + 3;

  const result = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const c00 = grad[i000 + c] * (1 - tx) + grad[i100 + c] * tx;
    const c10 = grad[i010 + c] * (1 - tx) + grad[i110 + c] * tx;
    const c01 = grad[i001 + c] * (1 - tx) + grad[i101 + c] * tx;
    const c11 = grad[i011 + c] * (1 - tx) + grad[i111 + c] * tx;
    const c0 = c00 * (1 - ty) + c10 * ty;
    const c1 = c01 * (1 - ty) + c11 * ty;
    result[c] = c0 * (1 - tz) + c1 * tz;
  }
  return result;
}

// ---- Trilinear interpolation of scalar field ----

export function trilinearInterpScalar(grid, gs, he, step, x, y, z) {
  const fx = (x + he) / step, fy = (y + he) / step, fz = (z + he) / step;
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  if (ix < 0 || ix >= gs - 1 || iy < 0 || iy >= gs - 1 || iz < 0 || iz >= gs - 1) return 0;

  const tx = fx - ix, ty = fy - iy, tz = fz - iz;
  const N = gs, N2 = N * N;
  const i000 = iz * N2 + iy * N + ix;
  const c00 = grid[i000] * (1 - tx) + grid[i000 + 1] * tx;
  const c10 = grid[i000 + N] * (1 - tx) + grid[i000 + N + 1] * tx;
  const c01 = grid[i000 + N2] * (1 - tx) + grid[i000 + N2 + 1] * tx;
  const c11 = grid[i000 + N2 + N] * (1 - tx) + grid[i000 + N2 + N + 1] * tx;
  const c0 = c00 * (1 - ty) + c10 * ty;
  const c1 = c01 * (1 - ty) + c11 * ty;
  return c0 * (1 - tz) + c1 * tz;
}
