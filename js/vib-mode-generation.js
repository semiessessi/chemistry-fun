// Vibrational mode generation: procedural generation of stretch and bend modes from bond topology.

import { getMoleculeData } from './molecules/index.js';

// ---- Atomic masses (amu) ----

export const ATOMIC_MASS = {
  H: 1.008, He: 4.003, C: 12.011, N: 14.007, O: 15.999, F: 18.998,
  Na: 22.990, Al: 26.982, P: 30.974, S: 32.065, Cl: 35.453,
  Ca: 40.078, Ti: 47.867, Fe: 55.845, Cu: 63.546,
  Br: 79.904, I: 126.904, Si: 28.086, Ge: 72.630, Se: 78.971,
  Kr: 83.798, Xe: 131.293, Pb: 207.2, U: 238.029, Sn: 118.710,
  Bi: 208.980, Mo: 95.95, Re: 186.207,
};

// ---- Harmonic oscillator amplitude computation ----
// Zero-point amplitude A₀ = 1/√(2μω) = 1/(2μk)^{1/4} in atomic units
// where μ = reduced mass (electron masses), k = force constant (Eₕ/a₀²)

const AMU_TO_ME = 1822.888;          // 1 amu in electron masses
const NM_TO_EHBOHR2 = 1 / 1556.893; // 1 N/m in Eₕ/a₀²

// Bond stretching force constants (N/m) — keys match sorted element pairs
export const BOND_FORCE_CONSTANTS = {
  'H-H': 575,
  'C-H': 516, 'C-C': 502, 'C-C=2': 962, 'C-C=3': 1612,
  'C-F': 500, 'C-N': 571, 'C-N=2': 600, 'C-N=3': 1762,
  'C-O': 571, 'C-O=2': 1857, 'C-S': 250, 'C-Cl': 350,
  'Cl-H': 516, 'F-H': 966, 'H-N': 648, 'H-O': 780, 'H-S': 350,
  'N-N': 300, 'N-N=2': 700, 'N-N=3': 2294,
  'N-O': 300, 'N-O=2': 600,
  'O-O': 350, 'O-O=2': 1100,
  'O-S': 400, 'O-S=2': 700,
  'Al-O': 350, 'Ca-O': 250, 'Cu-O': 250,
  'Fe-O': 300, 'Na-O': 200, 'O-Ti': 400,
};

const BEND_FORCE_CONSTANT = 70; // N/m, typical angle bending

export function zeroPointAmplitude(reducedMassAmu, forceConstantNm) {
  const mu = reducedMassAmu * AMU_TO_ME;
  const k = forceConstantNm * NM_TO_EHBOHR2;
  // A₀ = 1 / (√2 × (μk)^{1/4})  in Bohr
  return 1 / (Math.SQRT2 * Math.pow(mu * k, 0.25));
}

// ---- Procedural vibrational mode generation ----

export function generateVibrationalModes(moleculeName) {
  const mol = getMoleculeData(moleculeName);
  if (!mol) return [];

  const atoms = mol.atoms;
  const bonds = mol.bonds;
  const numAtoms = atoms.length;
  const modes = [];

  // Group bonds by type (element pair + order)
  const bondGroups = new Map();
  for (const bond of bonds) {
    const i = bond[0], j = bond[1], order = bond[2] || 1;
    const elA = atoms[i][0], elB = atoms[j][0];
    const key = [elA, elB].sort().join('-') + (order !== 1 ? `=${order}` : '');
    if (!bondGroups.has(key)) bondGroups.set(key, []);
    bondGroups.get(key).push([i, j]);
  }

  // Generate stretch modes: grouped by bond type
  for (const [key, groupBonds] of bondGroups) {
    // Symmetric stretch: all bonds of this type stretch in phase
    const displacements = new Float32Array(numAtoms * 3);
    for (const [i, j] of groupBonds) {
      const ax = atoms[i][1], ay = atoms[i][2], az = atoms[i][3];
      const bx = atoms[j][1], by = atoms[j][2], bz = atoms[j][3];
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-6) continue;
      const nx = dx / len, ny = dy / len, nz = dz / len;

      const massI = ATOMIC_MASS[atoms[i][0]] || 12;
      const massJ = ATOMIC_MASS[atoms[j][0]] || 12;
      const totalMass = massI + massJ;
      // Lighter atom moves more (conservation of momentum)
      const ampI = massJ / totalMass;
      const ampJ = massI / totalMass;

      displacements[i * 3] -= nx * ampI;
      displacements[i * 3 + 1] -= ny * ampI;
      displacements[i * 3 + 2] -= nz * ampI;
      displacements[j * 3] += nx * ampJ;
      displacements[j * 3 + 1] += ny * ampJ;
      displacements[j * 3 + 2] += nz * ampJ;
    }

    // Normalize displacement vector
    let maxD = 0;
    for (let k = 0; k < numAtoms; k++) {
      const d2 = displacements[k * 3] ** 2 + displacements[k * 3 + 1] ** 2 + displacements[k * 3 + 2] ** 2;
      if (d2 > maxD) maxD = d2;
    }
    maxD = Math.sqrt(maxD);
    if (maxD > 1e-8) {
      for (let k = 0; k < displacements.length; k++) displacements[k] /= maxD;
    }

    // Compute physical zero-point amplitude for this bond type
    const bondKey = key.split('=')[0]; // e.g., 'C-H' from 'C-H' or 'C-C=2'
    const [el1, el2] = bondKey.split('-');
    const m1 = ATOMIC_MASS[el1] || 12;
    const m2 = ATOMIC_MASS[el2] || 12;
    const mu = (m1 * m2) / (m1 + m2);
    const kForce = BOND_FORCE_CONSTANTS[key] || 300;

    modes.push({
      name: `${key} stretch`,
      displacements,
      physicalAmplitude: zeroPointAmplitude(mu, kForce),
    });

    // Asymmetric stretch for groups with 2+ bonds: alternate phase
    if (groupBonds.length >= 2) {
      const asymDisp = new Float32Array(numAtoms * 3);
      for (let bi = 0; bi < groupBonds.length; bi++) {
        const [i, j] = groupBonds[bi];
        const ax = atoms[i][1], ay = atoms[i][2], az = atoms[i][3];
        const bx = atoms[j][1], by = atoms[j][2], bz = atoms[j][3];
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 1e-6) continue;
        const nx = dx / len, ny = dy / len, nz = dz / len;
        const massI = ATOMIC_MASS[atoms[i][0]] || 12;
        const massJ = ATOMIC_MASS[atoms[j][0]] || 12;
        const totalMass = massI + massJ;
        const ampI = massJ / totalMass;
        const ampJ = massI / totalMass;
        const sign = (bi % 2 === 0) ? 1 : -1;

        asymDisp[i * 3] -= nx * ampI * sign;
        asymDisp[i * 3 + 1] -= ny * ampI * sign;
        asymDisp[i * 3 + 2] -= nz * ampI * sign;
        asymDisp[j * 3] += nx * ampJ * sign;
        asymDisp[j * 3 + 1] += ny * ampJ * sign;
        asymDisp[j * 3 + 2] += nz * ampJ * sign;
      }

      let maxA = 0;
      for (let k = 0; k < numAtoms; k++) {
        const d2 = asymDisp[k * 3] ** 2 + asymDisp[k * 3 + 1] ** 2 + asymDisp[k * 3 + 2] ** 2;
        if (d2 > maxA) maxA = d2;
      }
      maxA = Math.sqrt(maxA);
      if (maxA > 1e-8) {
        for (let k = 0; k < asymDisp.length; k++) asymDisp[k] /= maxA;
        modes.push({
          name: `${key} asym. stretch`,
          displacements: asymDisp,
          physicalAmplitude: zeroPointAmplitude(mu, kForce),
        });
      }
    }
  }

  // Angle bend modes for small molecules (<15 atoms)
  if (numAtoms < 15) {
    // Build adjacency
    const adj = new Map();
    for (const bond of bonds) {
      if (!adj.has(bond[0])) adj.set(bond[0], []);
      if (!adj.has(bond[1])) adj.set(bond[1], []);
      adj.get(bond[0]).push(bond[1]);
      adj.get(bond[1]).push(bond[0]);
    }

    const seenAngles = new Set();
    for (const [center, neighbors] of adj) {
      if (neighbors.length < 2) continue;
      for (let ni = 0; ni < neighbors.length; ni++) {
        for (let nj = ni + 1; nj < neighbors.length; nj++) {
          const a = neighbors[ni], b = neighbors[nj];
          const key = [a, center, b].sort().join(',');
          if (seenAngles.has(key)) continue;
          seenAngles.add(key);

          const cx = atoms[center][1], cy = atoms[center][2], cz = atoms[center][3];
          const ax = atoms[a][1] - cx, ay = atoms[a][2] - cy, az = atoms[a][3] - cz;
          const bx = atoms[b][1] - cx, by = atoms[b][2] - cy, bz = atoms[b][3] - cz;
          const la = Math.sqrt(ax * ax + ay * ay + az * az);
          const lb = Math.sqrt(bx * bx + by * by + bz * bz);
          if (la < 1e-6 || lb < 1e-6) continue;

          // Bisector direction
          const bisX = ax / la + bx / lb, bisY = ay / la + by / lb, bisZ = az / la + bz / lb;
          const bisLen = Math.sqrt(bisX * bisX + bisY * bisY + bisZ * bisZ);
          if (bisLen < 1e-6) continue;

          // Perpendicular to bisector in the a-center-b plane
          const nBisX = bisX / bisLen, nBisY = bisY / bisLen, nBisZ = bisZ / bisLen;
          // Move a and b perpendicular to their bond axes to open/close angle
          const bendDisp = new Float32Array(numAtoms * 3);
          const massA = ATOMIC_MASS[atoms[a][0]] || 12;
          const massB = ATOMIC_MASS[atoms[b][0]] || 12;
          const massC = ATOMIC_MASS[atoms[center][0]] || 12;

          // Move atoms a and b along bisector (opening mode)
          // atom a moves away from bisector, atom b also
          bendDisp[a * 3] = nBisX / massA;
          bendDisp[a * 3 + 1] = nBisY / massA;
          bendDisp[a * 3 + 2] = nBisZ / massA;
          bendDisp[b * 3] = nBisX / massB;
          bendDisp[b * 3 + 1] = nBisY / massB;
          bendDisp[b * 3 + 2] = nBisZ / massB;
          // Center moves opposite
          bendDisp[center * 3] = -nBisX * (1 / massA + 1 / massB) * massC / (massA + massB + massC);
          bendDisp[center * 3 + 1] = -nBisY * (1 / massA + 1 / massB) * massC / (massA + massB + massC);
          bendDisp[center * 3 + 2] = -nBisZ * (1 / massA + 1 / massB) * massC / (massA + massB + massC);

          let maxB = 0;
          for (let k = 0; k < numAtoms; k++) {
            const d2 = bendDisp[k * 3] ** 2 + bendDisp[k * 3 + 1] ** 2 + bendDisp[k * 3 + 2] ** 2;
            if (d2 > maxB) maxB = d2;
          }
          maxB = Math.sqrt(maxB);
          if (maxB > 1e-8) {
            for (let k = 0; k < bendDisp.length; k++) bendDisp[k] /= maxB;

            const nameA = atoms[a][0], nameC = atoms[center][0], nameB = atoms[b][0];
            // Reduced mass of terminal atoms for bend amplitude
            const muBend = (massA * massB) / (massA + massB);
            modes.push({
              name: `${nameA}-${nameC}-${nameB} bend`,
              displacements: bendDisp,
              physicalAmplitude: zeroPointAmplitude(muBend, BEND_FORCE_CONSTANT),
            });
          }
        }
      }
    }
  }

  return modes;
}
