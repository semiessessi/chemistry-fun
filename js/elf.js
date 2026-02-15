// Electron Localization Function (ELF) computation.
// ELF = 1 / (1 + (D/D_h)²) where:
//   D   = τ − |∇ρ|²/(8ρ)   (Pauli kinetic energy density)
//   D_h = C_F · ρ^{5/3}     (homogeneous electron gas reference)
//   τ   = Σ_i occ_i · ½|∇ψ_i|²  (kinetic energy density)
//   ρ   = Σ_i occ_i · |ψ_i|²    (electron density)
//
// ELF values: 1 = perfect localization, 0.5 = homogeneous gas, 0 = delocalized.

import { evaluateOrbital } from './math.js';
import { getMoleculeData } from './molecules/core.js';
import { sampleGridAsync } from './worker-pool.js';

const C_F = (3 / 10) * Math.pow(3 * Math.PI * Math.PI, 2 / 3);

/**
 * Compute ELF on a 3D grid for a molecule.
 * Samples each MO individually, accumulates ρ and τ, then combines into ELF.
 *
 * @param {string} moleculeName - Registered molecule name
 * @param {number} gridSize - Grid points per axis
 * @param {number} halfExtent - Half side length of sampling cube (Bohr)
 * @param {function} onProgress - Callback(fraction) for progress updates
 * @returns {Promise<Float32Array|null>} ELF values (gridSize³), or null if cancelled
 */
export async function computeELF(moleculeName, gridSize, halfExtent, onProgress) {
  const mol = getMoleculeData(moleculeName);
  if (!mol || !mol.mos || mol.mos.length === 0) return null;

  const gs = gridSize;
  const N = gs * gs * gs;
  const step = (2 * halfExtent) / (gs - 1);
  const invStep2 = 1 / (2 * step);

  // Accumulator grids
  const rho = new Float32Array(N); // electron density
  const tau = new Float32Array(N); // kinetic energy density

  // Build orbital objects for each MO
  const moOrbitals = mol.mos.map(mo => {
    const termDefs = mo[1];
    const terms = termDefs.map(td => {
      const [atomIdx, n, l, m, angType, coeff, rot] = td;
      const pos = mol.atoms[atomIdx];
      const term = { n, l, m, angType, center: [pos[1], pos[2], pos[3]], coeff };
      if (rot) term.rot = rot;
      return term;
    });
    return { terms };
  });

  const numMO = moOrbitals.length;

  // For each MO: sample ψ on grid, accumulate ρ and compute |∇ψ|² via finite differences
  for (let mi = 0; mi < numMO; mi++) {
    const moOrbital = moOrbitals[mi];

    // Sample this MO on the grid (uses workers for parallel computation)
    const psi = await sampleGridAsync(moOrbital, gs, halfExtent,
      (f) => onProgress && onProgress((mi + f * 0.8) / numMO));

    if (!psi) return null; // cancelled

    // Accumulate ρ += 2|ψ|² (doubly occupied MOs)
    for (let i = 0; i < N; i++) {
      rho[i] += 2 * psi[i] * psi[i];
    }

    // Compute |∇ψ|² via central finite differences and accumulate τ += |∇ψ|²
    // (τ = ½ · occ · |∇ψ|² = ½ · 2 · |∇ψ|² = |∇ψ|² for doubly occupied)
    for (let iz = 0; iz < gs; iz++) {
      for (let iy = 0; iy < gs; iy++) {
        for (let ix = 0; ix < gs; ix++) {
          const idx = iz * gs * gs + iy * gs + ix;

          // ∂ψ/∂x
          const ixm = ix > 0 ? idx - 1 : idx;
          const ixp = ix < gs - 1 ? idx + 1 : idx;
          const denom_x = (ix > 0 && ix < gs - 1) ? invStep2 : (1 / step);
          const dpdx = (psi[ixp] - psi[ixm]) * denom_x;

          // ∂ψ/∂y
          const iym = iy > 0 ? idx - gs : idx;
          const iyp = iy < gs - 1 ? idx + gs : idx;
          const denom_y = (iy > 0 && iy < gs - 1) ? invStep2 : (1 / step);
          const dpdy = (psi[iyp] - psi[iym]) * denom_y;

          // ∂ψ/∂z
          const gs2 = gs * gs;
          const izm = iz > 0 ? idx - gs2 : idx;
          const izp = iz < gs - 1 ? idx + gs2 : idx;
          const denom_z = (iz > 0 && iz < gs - 1) ? invStep2 : (1 / step);
          const dpdz = (psi[izp] - psi[izm]) * denom_z;

          tau[idx] += dpdx * dpdx + dpdy * dpdy + dpdz * dpdz;
        }
      }
    }

    if (onProgress) onProgress((mi + 1) / numMO);

    // Yield to keep UI responsive
    await new Promise(r => setTimeout(r, 0));
  }

  // Compute |∇ρ|² via central finite differences on the accumulated ρ grid
  const gradRhoSq = new Float32Array(N);
  for (let iz = 0; iz < gs; iz++) {
    for (let iy = 0; iy < gs; iy++) {
      for (let ix = 0; ix < gs; ix++) {
        const idx = iz * gs * gs + iy * gs + ix;

        const ixm = ix > 0 ? idx - 1 : idx;
        const ixp = ix < gs - 1 ? idx + 1 : idx;
        const denom_x = (ix > 0 && ix < gs - 1) ? invStep2 : (1 / step);
        const drdx = (rho[ixp] - rho[ixm]) * denom_x;

        const iym = iy > 0 ? idx - gs : idx;
        const iyp = iy < gs - 1 ? idx + gs : idx;
        const denom_y = (iy > 0 && iy < gs - 1) ? invStep2 : (1 / step);
        const drdy = (rho[iyp] - rho[iym]) * denom_y;

        const gs2 = gs * gs;
        const izm = iz > 0 ? idx - gs2 : idx;
        const izp = iz < gs - 1 ? idx + gs2 : idx;
        const denom_z = (iz > 0 && iz < gs - 1) ? invStep2 : (1 / step);
        const drdz = (rho[izp] - rho[izm]) * denom_z;

        gradRhoSq[idx] = drdx * drdx + drdy * drdy + drdz * drdz;
      }
    }
  }

  // Compute ELF
  const elf = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (rho[i] < 1e-10) continue; // ELF undefined in vacuum

    const D = tau[i] - gradRhoSq[i] / (8 * rho[i]); // Pauli kinetic energy density
    const Dh = C_F * Math.pow(rho[i], 5 / 3);        // homogeneous gas reference

    if (Dh < 1e-30) continue;

    const ratio = D / Dh;
    elf[i] = 1 / (1 + ratio * ratio);
  }

  return elf;
}
