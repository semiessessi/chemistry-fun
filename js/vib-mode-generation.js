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
// Calibrated against NIST CCCBDB experimental frequencies where available
export const BOND_FORCE_CONSTANTS = {
  // Diatomic molecules (NIST-calibrated)
  'H-H': 575,   // H₂: 4161 cm⁻¹
  'N-N=3': 2294, // N₂: 2330 cm⁻¹ (triple bond)
  'O-O=2': 1177, // O₂: 1556 cm⁻¹ (double bond)

  // Hydrogen halides (NIST-calibrated)
  'F-H': 966,   // HF: 3962 cm⁻¹
  'Cl-H': 481,  // HCl: 2886 cm⁻¹ (was 516, corrected from NIST)
  'Br-H': 412,  // HBr: ~2649 cm⁻¹ (estimated)
  'I-H': 314,   // HI: ~2309 cm⁻¹ (estimated)

  // Other bonds
  'C-H': 516, 'C-C': 502, 'C-C=2': 962, 'C-C=3': 1612,
  'C-F': 500, 'C-N': 571, 'C-N=2': 600, 'C-N=3': 1762,
  'C-O': 571, 'C-O=2': 1857, 'C-S': 250, 'C-Cl': 350,
  'H-N': 648, 'H-O': 780, 'H-S': 350,
  'N-N': 300, 'N-N=2': 700,
  'N-O': 300, 'N-O=2': 600,
  'O-O': 350,
  'O-S': 400, 'O-S=2': 700,
  'Al-O': 350, 'Ca-O': 250, 'Cu-O': 250,
  'Fe-O': 300, 'Na-O': 200, 'O-Ti': 400,

  // Biological/vitamin bonds
  'C-C(aromatic)': 720,   // Aromatic C-C (between single and double)
  'C-N(amide)': 650,      // Peptide bonds (amide linkage)
  'O-P': 580,             // Phosphate esters (nucleotides, ATP)
  'O-P=2': 1200,          // P=O double bond in phosphates
  'C-C(long)': 450,       // Long-chain alkane (slightly weaker)

  // Early periodic table elements
  'B-O': 600,             // Boron-oxygen
  'B-F': 800,             // Boron-fluorine (very strong)
  'B-H': 380,             // Boron-hydrogen
  'B-Cl': 450,            // Boron-chlorine
  'Si-O': 500,            // Silicon-oxygen
  'Si-H': 380,            // Silicon-hydrogen
  'Si-Cl': 400,           // Silicon-chlorine
  'Al-Cl': 400,           // Aluminum-chlorine
  'Al-H': 300,            // Aluminum-hydride
  'Li-H': 300,            // Lithium hydride
  'Na-Cl': 200,           // Ionic, weaker
  'K-Cl': 180,            // Even more ionic
  'Be-O': 550,            // Beryllium oxide
  'Mg-O': 400,            // Magnesium oxide
  'Cu-Cl': 320,           // Copper chloride
  'Mn-O': 400,            // Manganese oxide
};

// Spectroscopic data from NIST CCCBDB (frequencies in cm⁻¹)
// Used for validation and educational display
export const SPECTROSCOPIC_DATA = {
  'H₂': {
    fundamental: 4161,     // ν₀ experimental
    harmonic: 4401.21,     // ωₑ spectroscopic constant
    anharmonicity: 121.33, // ωₑxₑ
    zeroPoint: 2180,       // in cm⁻¹
    rotational: 60.853,    // Bₑ
    source: 'NIST CCCBDB',
    url: 'https://cccbdb.nist.gov/exp2x.asp?casno=1333740'
  },
  'N₂': {
    fundamental: 2330,     // ν₀ experimental
    harmonic: 2358.57,     // ωₑ
    anharmonicity: 14.32,  // ωₑxₑ
    zeroPoint: 1175,
    rotational: 1.9987,
    source: 'NIST CCCBDB',
    url: 'https://cccbdb.nist.gov/exp2x.asp?casno=7727379'
  },
  'O₂': {
    fundamental: 1556,     // ν₀ experimental
    harmonic: 1580.19,     // ωₑ
    anharmonicity: 11.98,  // ωₑxₑ
    zeroPoint: 788,
    rotational: 1.4457,
    source: 'NIST CCCBDB',
    url: 'https://cccbdb.nist.gov/exp2x.asp?casno=7782447'
  },
  'HCl': {
    fundamental: 2886,     // ν₀ experimental
    harmonic: 2990.95,     // ωₑ spectroscopic constant
    anharmonicity: 52.8,   // ωₑxₑ
    zeroPoint: 1443,
    rotational: 10.593,    // Bₑ
    source: 'NIST CCCBDB',
    url: 'https://cccbdb.nist.gov/exp2x.asp?casno=7647010',
    isotope: '¹H³⁵Cl'
  },
  'HF': {
    fundamental: 3962,     // ν₀ experimental
    harmonic: 4138.32,     // ωₑ
    anharmonicity: 89.88,  // ωₑxₑ
    zeroPoint: 1981,
    rotational: 20.9557,
    source: 'NIST CCCBDB',
    url: 'https://cccbdb.nist.gov/exp2x.asp?casno=7664393'
  },
  'CH₄': {
    modes: {
      'symmetric stretch': { fundamental: 2917, harmonic: 2917 },  // ν₁ (A₁)
      'bend': { fundamental: 1534, harmonic: 1534 },               // ν₂ (E)
      'asymmetric stretch': { fundamental: 3019, harmonic: 3019 }, // ν₃ (F₂)
      'bend2': { fundamental: 1306, harmonic: 1306 }               // ν₄ (F₂)
    },
    source: 'NIST CCCBDB',
    url: 'https://cccbdb.nist.gov/exp2x.asp?casno=74828'
  },
  // ---- Polyatomic molecules (Tier 1: NIST CCCBDB) ----
  'H₂O': {
    modes: {
      'symmetric stretch': {
        fundamental: 3657,
        harmonic: 3832,
        symmetry: 'A₁',
        description: 'Both O-H bonds stretch in phase'
      },
      'bend': {
        fundamental: 1595,
        harmonic: 1649,
        symmetry: 'A₁',
        description: 'H-O-H angle bending'
      },
      'asymmetric stretch': {
        fundamental: 3756,
        harmonic: 3943,
        symmetry: 'B₂',
        description: 'O-H bonds stretch out of phase'
      }
    },
    zeroPointEnergy: 13.26,  // kcal/mol
    source: 'NIST CCCBDB',
    url: 'https://cccbdb.nist.gov/exp2x.asp?casno=7732185'
  },
  'NH₃': {
    modes: {
      'symmetric stretch': { fundamental: 3337, harmonic: 3444, symmetry: 'A₁', description: 'All three N-H bonds stretch in phase' },
      'symmetric bend': { fundamental: 950, harmonic: 1022, symmetry: 'A₁', description: 'Umbrella inversion mode' },
      'asymmetric stretch': { fundamental: 3444, harmonic: 3613, symmetry: 'E', description: 'N-H bonds stretch out of phase' },
      'asymmetric bend': { fundamental: 1627, harmonic: 1691, symmetry: 'E', description: 'Degenerate bending mode' }
    },
    zeroPointEnergy: 21.3,  // kcal/mol
    source: 'NIST CCCBDB',
    url: 'https://cccbdb.nist.gov/exp2x.asp?casno=7664417'
  },
  'CO₂': {
    modes: {
      'symmetric stretch': { fundamental: 1333, harmonic: 1388, symmetry: 'Σg⁺', description: 'Both C=O bonds stretch in phase (IR inactive)' },
      'bend': { fundamental: 667, harmonic: 667, symmetry: 'Πu', degeneracy: 2, description: 'Bending in perpendicular planes' },
      'asymmetric stretch': { fundamental: 2349, harmonic: 2396, symmetry: 'Σu⁺', description: 'C=O bonds stretch out of phase' }
    },
    zeroPointEnergy: 7.3,  // kcal/mol
    source: 'HITRAN 2020',
    url: 'https://hitran.org/docs/molec-meta/'
  },
  'SO₂': {
    modes: {
      'symmetric stretch': { fundamental: 1151, harmonic: 1151, symmetry: 'A₁' },
      'bend': { fundamental: 518, harmonic: 518, symmetry: 'A₁' },
      'asymmetric stretch': { fundamental: 1362, harmonic: 1362, symmetry: 'B₂' }
    },
    source: 'NIST CCCBDB',
    url: 'https://cccbdb.nist.gov/exp2x.asp?casno=7446095'
  },
  'C₂H₂': {
    modes: {
      'C-H symmetric stretch': { fundamental: 3374, harmonic: 3374, symmetry: 'Σg⁺' },
      'C≡C stretch': { fundamental: 1974, harmonic: 1974, symmetry: 'Σg⁺' },
      'bend': { fundamental: 612, harmonic: 612, symmetry: 'Πg', degeneracy: 2 },
      'C-H asymmetric stretch': { fundamental: 3289, harmonic: 3289, symmetry: 'Σu⁺' },
      'C-H bend': { fundamental: 730, harmonic: 730, symmetry: 'Πu', degeneracy: 2 }
    },
    source: 'NIST CCCBDB',
    url: 'https://cccbdb.nist.gov/exp2x.asp?casno=74862'
  },
  'C₂H₄': {
    modes: {
      'C-H symmetric stretch': { fundamental: 3026, harmonic: 3026, symmetry: 'Ag' },
      'C=C stretch': { fundamental: 1623, harmonic: 1623, symmetry: 'Ag' },
      'CH₂ scissors': { fundamental: 1444, harmonic: 1444, symmetry: 'Ag' },
      'C-H asymmetric stretch': { fundamental: 3103, harmonic: 3103, symmetry: 'B₂u' },
      'CH₂ wag': { fundamental: 949, harmonic: 949, symmetry: 'B₂u' }
    },
    source: 'NIST CCCBDB',
    url: 'https://cccbdb.nist.gov/exp2x.asp?casno=74851'
  },
  'C₂H₆': {
    modes: {
      'C-H symmetric stretch': { fundamental: 2954, harmonic: 2954, symmetry: 'A₁g' },
      'CH₃ deformation': { fundamental: 1388, harmonic: 1388, symmetry: 'A₁g' },
      'C-C stretch': { fundamental: 995, harmonic: 995, symmetry: 'A₁g' },
      'C-H asymmetric stretch': { fundamental: 2896, harmonic: 2896, symmetry: 'A₂u' }
    },
    source: 'NIST CCCBDB',
    url: 'https://cccbdb.nist.gov/exp2x.asp?casno=74840'
  },
  // ---- Atmospheric molecules (Tier 2: HITRAN) ----
  'O₃': {
    modes: {
      'symmetric stretch': { fundamental: 1103, harmonic: 1103, symmetry: 'A₁' },
      'bend': { fundamental: 701, harmonic: 701, symmetry: 'A₁' },
      'asymmetric stretch': { fundamental: 1042, harmonic: 1042, symmetry: 'B₂' }
    },
    source: 'HITRAN',
    url: 'https://hitran.org/docs/molec-meta/'
  },
  'N₂O': {
    modes: {
      'symmetric stretch': { fundamental: 1285, harmonic: 1285, symmetry: 'Σ⁺' },
      'bend': { fundamental: 589, harmonic: 589, symmetry: 'Π', degeneracy: 2 },
      'asymmetric stretch': { fundamental: 2224, harmonic: 2224, symmetry: 'Σ⁺' }
    },
    source: 'HITRAN',
    url: 'https://hitran.org/docs/molec-meta/'
  },
  // ---- Organic molecules (Tier 3: SDBS/NIST) ----
  'C₆H₆': {
    modes: {
      'ring breathing': { fundamental: 992, harmonic: 992, symmetry: 'A₁g', description: 'All C atoms move radially' },
      'C-H stretch (sym)': { fundamental: 3047, harmonic: 3062, symmetry: 'A₁g' },
      'C=C stretch': { fundamental: 1596, harmonic: 1606, symmetry: 'E₂g' },
      'C-H bend': { fundamental: 1010, harmonic: 1010, symmetry: 'A₂u' }
      // Note: benzene has 30 normal modes total, showing key ones
    },
    source: 'SDBS Web',
    url: 'https://sdbs.db.aist.go.jp/sdbs/cgi-bin/direct_frame_top.cgi'
  },
  'C₂H₅OH': {
    modes: {
      'O-H stretch': { fundamental: 3350, harmonic: 3350, description: 'Hydroxyl O-H stretch' },
      'C-H stretch': { fundamental: 2980, harmonic: 2980 },
      'C-O stretch': { fundamental: 1050, harmonic: 1050 },
      'C-C stretch': { fundamental: 880, harmonic: 880 }
    },
    source: 'SDBS/NIST',
    url: 'https://cccbdb.nist.gov/exp2x.asp?casno=64175'
  },
  'CH₃OH': {
    modes: {
      'O-H stretch': { fundamental: 3681, harmonic: 3681 },
      'C-H asymmetric stretch': { fundamental: 2999, harmonic: 2999 },
      'C-O stretch': { fundamental: 1033, harmonic: 1033 },
      'CH₃ rock': { fundamental: 1060, harmonic: 1060 }
    },
    source: 'NIST CCCBDB',
    url: 'https://cccbdb.nist.gov/exp2x.asp?casno=67561'
  },
  'CH₃COOH': {
    modes: {
      'O-H stretch': { fundamental: 3583, harmonic: 3583, description: 'Carboxylic acid O-H' },
      'C=O stretch': { fundamental: 1788, harmonic: 1788, description: 'Carbonyl stretch' },
      'C-O stretch': { fundamental: 1182, harmonic: 1182 },
      'C-C stretch': { fundamental: 847, harmonic: 847 }
    },
    source: 'SDBS',
    url: 'https://sdbs.db.aist.go.jp/'
  }
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
