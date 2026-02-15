// Bond formation: multi-molecule Morse dynamics, LCAO orbital generators, context meshes.
// Supports diatomic (H₂, N₂, O₂, CO) and triatomic (CO₂, O₃) bond formation.

import * as THREE from 'three';
import { add } from './orbitals.js';
import { evaluateOrbital } from './math.js';
import { scene } from './scene.js';

// ---- Per-molecule Morse configs (diatomic) ----

const BOND_CONFIGS = {
  'H\u2082': { R_EQ: 1.401, R_MAX: 8.0,  De: 4.747, a: 1.028, elements: ['H', 'H'], bondOrder: 1 },
  'N\u2082': { R_EQ: 2.074, R_MAX: 12.0, De: 9.759, a: 2.689, elements: ['N', 'N'], bondOrder: 3 },
  'O\u2082': { R_EQ: 2.282, R_MAX: 12.0, De: 5.116, a: 2.667, elements: ['O', 'O'], bondOrder: 2 },
  'CO':      { R_EQ: 2.132, R_MAX: 12.0, De: 11.09, a: 2.294, elements: ['C', 'O'], bondOrder: 3 },
};

// Mutable active config — dynamics.js and main.js import this reference
export const BOND_FORMING_CONFIG = { ...BOND_CONFIGS['H\u2082'], element: 'H' };

export function setActiveBondConfig(molecule) {
  const cfg = BOND_CONFIGS[molecule];
  if (cfg) {
    Object.assign(BOND_FORMING_CONFIG, cfg);
    BOND_FORMING_CONFIG.element = cfg.elements[0];
  }
}

// ---- Triatomic configs (for 3-body dynamics) ----

const O3_THETA = 116.8 * Math.PI / 180;

export const TRIATOMIC_CONFIGS = {
  'CO\u2082': {
    atoms: ['O', 'C', 'O'],
    bonds: [[0, 1, 2], [1, 2, 2]],
    morse: [
      { R_EQ: 2.197, De: 8.0, a: 2.3 },
      { R_EQ: 2.197, De: 8.0, a: 2.3 },
    ],
    angle: null, // linear — no angle potential needed
    geometry: 'linear',
    // O + CO → CO₂: C and O₂ pre-bonded, O₁ approaches from distance
    initial: {
      positions: [[0, 1, 12], [0, 0, 0], [0, 0, -3]],
      velocities: [[0, -0.1, -1], [0, 0.3, 0.05], [0, -0.3, -0.15]],
    },
  },
  'O\u2083': {
    atoms: ['O', 'O', 'O'],
    bonds: [[0, 1, 1.5], [1, 2, 1.5]],
    morse: [
      { R_EQ: 2.41, De: 3.0, a: 2.0 },
      { R_EQ: 2.41, De: 3.0, a: 2.0 },
    ],
    angle: {
      i: 0, center: 1, k: 2,
      thetaEq: O3_THETA,
      kAngle: 3.0,
      rCut: 5.0,
    },
    geometry: 'bent',
    // O₂(spinning) + O → O₃: atoms 0,1 form spinning O₂, atom 2 approaches
    initial: {
      positions: [[0, 0, -1.2], [0, 0, 1.2], [4, 2, 12]],
      velocities: [[0, 0.4, 0], [0, -0.4, 0], [-0.3, -0.1, -0.8]],
    },
  },
};

// ---- Element styling ----

const ELEM_STYLE = {
  H: { color: 0xffffff, radius: 0.3 },
  C: { color: 0x909090, radius: 0.4 },
  N: { color: 0x3050f8, radius: 0.4 },
  O: { color: 0xff2010, radius: 0.4 },
};

export function setContextAtomStyle(elements) {
  ensureContextGroup();
  const elems = typeof elements === 'string' ? [elements, elements] : elements;
  for (let i = 0; i < elems.length && i < 3; i++) {
    const style = ELEM_STYLE[elems[i]] || ELEM_STYLE.H;
    atomMaterials[i].color.setHex(style.color);
    spheres[i].scale.setScalar(style.radius);
  }
}

// ---- Overlap integral S(R) for 1s orbitals (exact analytical) ----

function overlap1s(R) {
  return (1 + R + R * R / 3) * Math.exp(-R);
}

// ---- Variable Slater exponent (orbital contraction, H₂ only) ----

function slaterZeta(R) {
  const dR = R - BOND_FORMING_CONFIG.R_EQ;
  return 1 + 0.197 * Math.exp(-0.5 * dR * dR);
}

// ---- Morse potential energy (uses active config) ----

export function morseEnergy(R) {
  const { De, a, R_EQ } = BOND_FORMING_CONFIG;
  const x = 1 - Math.exp(-a * (R - R_EQ));
  return De * x * x - De;
}

// ============================================================
// Diatomic orbital generators
// ============================================================

// ---- H₂ ----

export function generateH2Orbital(type, R) {
  const zeta = slaterZeta(R);
  const S = overlap1s(zeta * R);
  const halfR = R / 2;

  let coeff, name;
  if (type === 'bonding') {
    coeff = 1 / Math.sqrt(2 * (1 + S));
    name = 'H\u2082 \u03C3 bonding';
  } else {
    coeff = 1 / Math.sqrt(2 * (1 - S));
    name = 'H\u2082 \u03C3* antibonding';
  }

  const sign = type === 'bonding' ? 1 : -1;
  const halfExtent = Math.max(R / 2 + 6, 10);

  return {
    name,
    terms: [
      { n: 1, l: 0, m: 0, angType: 'real', center: [0, 0, -halfR], coeff: coeff, zeta },
      { n: 1, l: 0, m: 0, angType: 'real', center: [0, 0, halfR], coeff: sign * coeff, zeta },
    ],
    halfExtent,
  };
}

// ---- N₂ ----

function generateN2Orbital(type, R, orientations) {
  const halfR = R / 2;
  const c = 1 / Math.sqrt(2);
  const halfExtent = Math.max(R / 2 + 8, 12);

  const configs = {
    'sigma_2s': {
      name: 'N\u2082 \u03C3(2s)',
      terms: [
        { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, -halfR], coeff: c },
        { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, halfR], coeff: c },
      ],
    },
    'sigma_star_2s': {
      name: 'N\u2082 \u03C3*(2s)',
      terms: [
        { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, -halfR], coeff: c },
        { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, halfR], coeff: -c },
      ],
    },
    'pi_2p': {
      name: 'N\u2082 \u03C0(2p)',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, -halfR], coeff: c },
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, halfR], coeff: c },
      ],
    },
    'sigma_2p': {
      name: 'N\u2082 \u03C3(2p)',
      terms: [
        { n: 2, l: 1, m: 0, angType: 'real', center: [0, 0, -halfR], coeff: c },
        { n: 2, l: 1, m: 0, angType: 'real', center: [0, 0, halfR], coeff: -c },
      ],
    },
    'pi_star_2p': {
      name: 'N\u2082 \u03C0*(2p)',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, -halfR], coeff: c },
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, halfR], coeff: -c },
      ],
    },
  };

  const cfg = configs[type];
  if (orientations) {
    for (const term of cfg.terms) {
      const atomIdx = term.center[2] < 0 ? 0 : 1;
      term.rot = orientations[atomIdx];
    }
  }
  return { name: cfg.name, terms: cfg.terms, halfExtent };
}

// ---- O₂ ----

function generateO2Orbital(type, R, orientations) {
  const halfR = R / 2;
  const c = 1 / Math.sqrt(2);
  const halfExtent = Math.max(R / 2 + 8, 12);

  const configs = {
    'sigma_2s': {
      name: 'O\u2082 \u03C3(2s)',
      terms: [
        { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, -halfR], coeff: c },
        { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, halfR], coeff: c },
      ],
    },
    'sigma_2p': {
      name: 'O\u2082 \u03C3(2p)',
      terms: [
        { n: 2, l: 1, m: 0, angType: 'real', center: [0, 0, -halfR], coeff: c },
        { n: 2, l: 1, m: 0, angType: 'real', center: [0, 0, halfR], coeff: -c },
      ],
    },
    'pi_2p': {
      name: 'O\u2082 \u03C0(2p)',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, -halfR], coeff: c },
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, halfR], coeff: c },
      ],
    },
    'pi_star_2px': {
      name: 'O\u2082 \u03C0*(2px)',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, -halfR], coeff: c },
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, halfR], coeff: -c },
      ],
    },
    'pi_star_2py': {
      name: 'O\u2082 \u03C0*(2py)',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'sin', center: [0, 0, -halfR], coeff: c },
        { n: 2, l: 1, m: 1, angType: 'sin', center: [0, 0, halfR], coeff: -c },
      ],
    },
  };

  const cfg = configs[type];
  if (orientations) {
    for (const term of cfg.terms) {
      const atomIdx = term.center[2] < 0 ? 0 : 1;
      term.rot = orientations[atomIdx];
    }
  }
  return { name: cfg.name, terms: cfg.terms, halfExtent };
}

// ---- CO (heteronuclear diatomic) ----
// C at -halfR (z<0), O at +halfR (z>0). Asymmetric coefficients.

function generateCOOrbital(type, R, orientations) {
  const halfR = R / 2;
  const halfExtent = Math.max(R / 2 + 8, 12);

  const configs = {
    'sigma_2s': {
      name: 'CO \u03C3(2s)',
      terms: [
        { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, -halfR], coeff: 0.55 },
        { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, halfR], coeff: 0.85 },
      ],
    },
    'sigma_star_2s': {
      name: 'CO \u03C3*(2s)',
      terms: [
        { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, -halfR], coeff: 0.85 },
        { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, halfR], coeff: -0.55 },
      ],
    },
    'pi_2p': {
      name: 'CO \u03C0(2p)',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, -halfR], coeff: 0.6 },
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, halfR], coeff: 0.8 },
      ],
    },
    'sigma_2p': {
      name: 'CO \u03C3(2p)',
      terms: [
        { n: 2, l: 1, m: 0, angType: 'real', center: [0, 0, -halfR], coeff: 0.6 },
        { n: 2, l: 1, m: 0, angType: 'real', center: [0, 0, halfR], coeff: -0.8 },
      ],
    },
    'pi_star_2p': {
      name: 'CO \u03C0*(2p)',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, -halfR], coeff: 0.8 },
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, halfR], coeff: -0.6 },
      ],
    },
  };

  const cfg = configs[type];
  if (orientations) {
    for (const term of cfg.terms) {
      const atomIdx = term.center[2] < 0 ? 0 : 1;
      term.rot = orientations[atomIdx];
    }
  }
  return { name: cfg.name, terms: cfg.terms, halfExtent };
}

// ============================================================
// Triatomic orbital generators (canonical frame)
// ============================================================

// CO₂: linear, canonical frame = C at origin, O atoms on z-axis
// positions = [[x0,y0,z0], [x1,y1,z1], [x2,y2,z2]] (actual 3D positions)
// We compute distances and generate in canonical (z-axis) frame.

function generateCO2Orbital(type, positions, orientations) {
  const d1 = dist(positions[0], positions[1]);
  const d2 = dist(positions[1], positions[2]);
  const halfExtent = Math.max(d1, d2) + 8;
  // Canonical: O at (0,0,-d1), C at origin, O at (0,0,d2)
  const cO1 = [0, 0, -d1], cC = [0, 0, 0], cO2 = [0, 0, d2];
  // Map canonical centers to atom indices: O1=0, C=1, O2=2
  const centerToAtom = [cO1, cC, cO2];

  const configs = {
    'sigma_2s': {
      name: 'CO\u2082 \u03C3(2s)',
      terms: [
        { n: 2, l: 0, m: 0, angType: 'real', center: cO1, coeff: 0.5 },
        { n: 2, l: 0, m: 0, angType: 'real', center: cC,  coeff: 0.7 },
        { n: 2, l: 0, m: 0, angType: 'real', center: cO2, coeff: 0.5 },
      ],
    },
    'sigma_2p': {
      name: 'CO\u2082 \u03C3(2p)',
      terms: [
        { n: 2, l: 1, m: 0, angType: 'real', center: cO1, coeff: 0.7 },
        { n: 2, l: 1, m: 0, angType: 'real', center: cC,  coeff: 1.0 },
        { n: 2, l: 1, m: 0, angType: 'real', center: cO2, coeff: -0.7 },
      ],
    },
    'pi_2p': {
      name: 'CO\u2082 \u03C0(2p)',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'cos', center: cO1, coeff: 0.6 },
        { n: 2, l: 1, m: 1, angType: 'cos', center: cC,  coeff: 1.0 },
        { n: 2, l: 1, m: 1, angType: 'cos', center: cO2, coeff: 0.6 },
      ],
    },
    'pi_star_2p': {
      name: 'CO\u2082 \u03C0*(2p)',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'cos', center: cO1, coeff: 0.7 },
        { n: 2, l: 1, m: 1, angType: 'cos', center: cC,  coeff: 0.0 },
        { n: 2, l: 1, m: 1, angType: 'cos', center: cO2, coeff: -0.7 },
      ],
    },
  };

  const cfg = configs[type];
  if (orientations) {
    for (const term of cfg.terms) {
      const atomIdx = centerToAtom.indexOf(term.center);
      if (atomIdx >= 0) term.rot = orientations[atomIdx];
    }
  }
  return { name: cfg.name, terms: cfg.terms, halfExtent };
}

// O₃: bent, canonical frame = central O at origin, molecule in xz-plane, bisector along +z
// Compute bond distances and angle from actual positions, place in canonical frame.

function generateO3Orbital(type, positions, orientations) {
  const d1 = dist(positions[0], positions[1]);
  const d2 = dist(positions[1], positions[2]);
  const halfExtent = Math.max(d1, d2) + 8;

  // Compute bond angle at center atom (index 1)
  const v1 = [positions[0][0] - positions[1][0], positions[0][1] - positions[1][1], positions[0][2] - positions[1][2]];
  const v2 = [positions[2][0] - positions[1][0], positions[2][1] - positions[1][1], positions[2][2] - positions[1][2]];
  const dot = v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2];
  let cosAngle = dot / (d1 * d2);
  cosAngle = Math.max(-1, Math.min(1, cosAngle));
  const angle = Math.acos(cosAngle);
  const halfAngle = angle / 2;

  // Canonical positions: center at origin, bonds in xz-plane, bisector along +z
  const cO1 = [d1 * Math.sin(halfAngle), 0, d1 * Math.cos(halfAngle)];
  const cCenter = [0, 0, 0];
  const cO2 = [-d2 * Math.sin(halfAngle), 0, d2 * Math.cos(halfAngle)];
  // Map canonical centers to atom indices: O1=0, Center=1, O2=2
  const centerToAtom = [cO1, cCenter, cO2];

  const configs = {
    'sigma_sym': {
      name: 'O\u2083 \u03C3 sym',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'cos', center: cCenter, coeff: 0.8 },
        { n: 2, l: 0, m: 0, angType: 'real', center: cO1, coeff: 0.45 },
        { n: 2, l: 0, m: 0, angType: 'real', center: cO2, coeff: 0.45 },
      ],
    },
    'pi_deloc': {
      name: 'O\u2083 \u03C0 deloc',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'sin', center: cCenter, coeff: 0.7 },
        { n: 2, l: 1, m: 1, angType: 'sin', center: cO1, coeff: 0.5 },
        { n: 2, l: 1, m: 1, angType: 'sin', center: cO2, coeff: 0.5 },
      ],
    },
    'pi_star': {
      name: 'O\u2083 \u03C0* anti',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'sin', center: cCenter, coeff: 0.0 },
        { n: 2, l: 1, m: 1, angType: 'sin', center: cO1, coeff: 0.7 },
        { n: 2, l: 1, m: 1, angType: 'sin', center: cO2, coeff: -0.7 },
      ],
    },
    'lone_pair': {
      name: 'O\u2083 lone pair',
      terms: [
        { n: 2, l: 1, m: 0, angType: 'real', center: cCenter, coeff: 1.0 },
      ],
    },
    'sigma_2s': {
      name: 'O\u2083 \u03C3(2s)',
      terms: [
        { n: 2, l: 0, m: 0, angType: 'real', center: cO1, coeff: 0.5 },
        { n: 2, l: 0, m: 0, angType: 'real', center: cCenter, coeff: 0.7 },
        { n: 2, l: 0, m: 0, angType: 'real', center: cO2, coeff: 0.5 },
      ],
    },
    'sigma_star_2s': {
      name: 'O\u2083 \u03C3*(2s)',
      terms: [
        { n: 2, l: 0, m: 0, angType: 'real', center: cO1, coeff: 0.7 },
        { n: 2, l: 0, m: 0, angType: 'real', center: cCenter, coeff: 0.0 },
        { n: 2, l: 0, m: 0, angType: 'real', center: cO2, coeff: -0.7 },
      ],
    },
    'nb_2s': {
      name: 'O\u2083 nb(2s)',
      terms: [
        { n: 2, l: 0, m: 0, angType: 'real', center: cO1, coeff: 0.3 },
        { n: 2, l: 0, m: 0, angType: 'real', center: cCenter, coeff: -0.9 },
        { n: 2, l: 0, m: 0, angType: 'real', center: cO2, coeff: 0.3 },
      ],
    },
    'sigma_star': {
      name: 'O\u2083 \u03C3* anti',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'cos', center: cO1, coeff: 0.7 },
        { n: 2, l: 1, m: 1, angType: 'cos', center: cCenter, coeff: 0.0 },
        { n: 2, l: 1, m: 1, angType: 'cos', center: cO2, coeff: -0.7 },
      ],
    },
    'lp_outer': {
      name: 'O\u2083 lp outer',
      terms: [
        { n: 2, l: 1, m: 0, angType: 'real', center: cO1, coeff: 0.5 },
        { n: 2, l: 1, m: 1, angType: 'cos', center: cO1, coeff: 0.5 * Math.sin(halfAngle) },
        { n: 2, l: 1, m: 0, angType: 'real', center: cO2, coeff: 0.5 },
        { n: 2, l: 1, m: 1, angType: 'cos', center: cO2, coeff: -0.5 * Math.sin(halfAngle) },
      ],
    },
  };

  const cfg = configs[type];
  if (orientations) {
    for (const term of cfg.terms) {
      const atomIdx = centerToAtom.indexOf(term.center);
      if (atomIdx >= 0) term.rot = orientations[atomIdx];
    }
  }
  return { name: cfg.name, terms: cfg.terms, halfExtent };
}

// ---- Helper: distance between two [x,y,z] arrays ----

function dist(a, b) {
  const dx = b[0]-a[0], dy = b[1]-a[1], dz = b[2]-a[2];
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

// ============================================================
// Electron density generators
// ============================================================
// Returns orbital with customSample that computes sqrt(Σ nᵢ|ψᵢ|²).
// Rendered through existing pipeline: only positive lobe shows (correct for density).

function makeDensitySampler(moList) {
  return (x, y, z) => {
    let rho = 0;
    for (const { mo, occ } of moList) {
      const psi = evaluateOrbital(mo, x, y, z);
      rho += occ * psi * psi;
    }
    return Math.sqrt(rho);
  };
}

// Generate px variant of a py orbital (or vice versa) by swapping angType
function swapPxPy(orbital) {
  return {
    ...orbital,
    terms: orbital.terms.map(t => ({
      ...t,
      angType: t.angType === 'cos' ? 'sin' : t.angType === 'sin' ? 'cos' : t.angType,
    })),
  };
}

function generateH2Density(R) {
  const bonding = generateH2Orbital('bonding', R);
  const moList = [{ terms: bonding.terms, occ: 2 }];
  return {
    name: 'H\u2082 density',
    halfExtent: bonding.halfExtent,
    moList,
    customSample: makeDensitySampler([{ mo: bonding, occ: 2 }]),
  };
}

function generateN2Density(R, orientations) {
  const s2s = generateN2Orbital('sigma_2s', R, orientations);
  const ss2s = generateN2Orbital('sigma_star_2s', R, orientations);
  const pi_px = generateN2Orbital('pi_2p', R, orientations);
  const pi_py = swapPxPy(pi_px);
  const s2p = generateN2Orbital('sigma_2p', R, orientations);
  const halfExtent = Math.max(R / 2 + 8, 12);
  const moList = [
    { terms: s2s.terms, occ: 2 }, { terms: ss2s.terms, occ: 2 },
    { terms: pi_px.terms, occ: 2 }, { terms: pi_py.terms, occ: 2 },
    { terms: s2p.terms, occ: 2 },
  ];
  return {
    name: 'N\u2082 density',
    halfExtent,
    moList,
    customSample: makeDensitySampler(moList.map(m => ({ mo: { terms: m.terms }, occ: m.occ }))),
  };
}

function generateO2Density(R, orientations) {
  const s2s = generateO2Orbital('sigma_2s', R, orientations);
  const s2p = generateO2Orbital('sigma_2p', R, orientations);
  const pi_px = generateO2Orbital('pi_2p', R, orientations);
  const pi_py = swapPxPy(pi_px);
  const piS_px = generateO2Orbital('pi_star_2px', R, orientations);
  const piS_py = generateO2Orbital('pi_star_2py', R, orientations);
  const halfExtent = Math.max(R / 2 + 8, 12);
  const moList = [
    { terms: s2s.terms, occ: 2 }, { terms: s2p.terms, occ: 2 },
    { terms: pi_px.terms, occ: 2 }, { terms: pi_py.terms, occ: 2 },
    { terms: piS_px.terms, occ: 1 }, { terms: piS_py.terms, occ: 1 },
  ];
  return {
    name: 'O\u2082 density',
    halfExtent,
    moList,
    customSample: makeDensitySampler(moList.map(m => ({ mo: { terms: m.terms }, occ: m.occ }))),
  };
}

function generateCODensity(R, orientations) {
  const s2s = generateCOOrbital('sigma_2s', R, orientations);
  const ss2s = generateCOOrbital('sigma_star_2s', R, orientations);
  const pi_px = generateCOOrbital('pi_2p', R, orientations);
  const pi_py = swapPxPy(pi_px);
  const s2p = generateCOOrbital('sigma_2p', R, orientations);
  const halfExtent = Math.max(R / 2 + 8, 12);
  const moList = [
    { terms: s2s.terms, occ: 2 }, { terms: ss2s.terms, occ: 2 },
    { terms: pi_px.terms, occ: 2 }, { terms: pi_py.terms, occ: 2 },
    { terms: s2p.terms, occ: 2 },
  ];
  return {
    name: 'CO density',
    halfExtent,
    moList,
    customSample: makeDensitySampler(moList.map(m => ({ mo: { terms: m.terms }, occ: m.occ }))),
  };
}

function generateCO2Density(positions, orientations) {
  const s2s = generateCO2Orbital('sigma_2s', positions, orientations);
  const s2p = generateCO2Orbital('sigma_2p', positions, orientations);
  const pi_px = generateCO2Orbital('pi_2p', positions, orientations);
  const pi_py = swapPxPy(pi_px);
  const piS_px = generateCO2Orbital('pi_star_2p', positions, orientations);
  const piS_py = swapPxPy(piS_px);
  const halfExtent = Math.max(dist(positions[0], positions[1]), dist(positions[1], positions[2])) + 8;
  const moList = [
    { terms: s2s.terms, occ: 2 }, { terms: s2p.terms, occ: 2 },
    { terms: pi_px.terms, occ: 2 }, { terms: pi_py.terms, occ: 2 },
    { terms: piS_px.terms, occ: 2 }, { terms: piS_py.terms, occ: 2 },
  ];
  return {
    name: 'CO\u2082 density',
    halfExtent,
    moList,
    customSample: makeDensitySampler(moList.map(m => ({ mo: { terms: m.terms }, occ: m.occ }))),
  };
}

function generateO3Density(positions, orientations) {
  const ss = generateO3Orbital('sigma_sym', positions, orientations);
  const pi = generateO3Orbital('pi_deloc', positions, orientations);
  const piS = generateO3Orbital('pi_star', positions, orientations);
  const lp = generateO3Orbital('lone_pair', positions, orientations);
  const s2s = generateO3Orbital('sigma_2s', positions, orientations);
  const ss2s = generateO3Orbital('sigma_star_2s', positions, orientations);
  const nb2s = generateO3Orbital('nb_2s', positions, orientations);
  const sStar = generateO3Orbital('sigma_star', positions, orientations);
  const lpOuter = generateO3Orbital('lp_outer', positions, orientations);
  const halfExtent = Math.max(dist(positions[0], positions[1]), dist(positions[1], positions[2])) + 8;
  const moList = [
    { terms: s2s.terms, occ: 2 }, { terms: ss2s.terms, occ: 2 }, { terms: nb2s.terms, occ: 2 },
    { terms: ss.terms, occ: 2 }, { terms: pi.terms, occ: 2 },
    { terms: piS.terms, occ: 2 }, { terms: lp.terms, occ: 2 },
    { terms: sStar.terms, occ: 2 }, { terms: lpOuter.terms, occ: 2 },
  ];
  return {
    name: 'O\u2083 density',
    halfExtent,
    moList,
    customSample: makeDensitySampler(moList.map(m => ({ mo: { terms: m.terms }, occ: m.occ }))),
  };
}

// ============================================================
// Register orbital entries
// ============================================================

// ---- H₂ ----
add({
  name: 'H\u2082 \u03C3 bonding (dynamic)',
  terms: generateH2Orbital('bonding', BOND_CONFIGS['H\u2082'].R_EQ).terms,
  halfExtent: 10,
  d1: 'Bond Formation', d2: 'H\u2082', d3: '\u03C3 bonding', d4: null,
  bondForming: { type: 'bonding', generate: (R) => generateH2Orbital('bonding', R), molecule: 'H\u2082' },
});
add({
  name: 'H\u2082 \u03C3* antibonding (dynamic)',
  terms: generateH2Orbital('antibonding', BOND_CONFIGS['H\u2082'].R_EQ).terms,
  halfExtent: 10,
  d1: 'Bond Formation', d2: 'H\u2082', d3: '\u03C3* antibonding', d4: null,
  bondForming: { type: 'antibonding', generate: (R) => generateH2Orbital('antibonding', R), molecule: 'H\u2082' },
});
add({
  name: 'H\u2082 electron density (dynamic)',
  ...generateH2Density(BOND_CONFIGS['H\u2082'].R_EQ),
  d1: 'Bond Formation', d2: 'H\u2082', d3: 'electron density', d4: null,
  bondForming: { type: 'density', generate: (R) => generateH2Density(R), molecule: 'H\u2082' },
});

// ---- N₂ ----
const N2_REQ = BOND_CONFIGS['N\u2082'].R_EQ;
const N2_TYPES = [
  ['sigma_2s', '\u03C3(2s)'], ['sigma_star_2s', '\u03C3*(2s)'],
  ['pi_2p', '\u03C0(2p)'], ['sigma_2p', '\u03C3(2p)'], ['pi_star_2p', '\u03C0*(2p)'],
];
for (const [type, label] of N2_TYPES) {
  add({
    name: `N\u2082 ${label} (dynamic)`,
    terms: generateN2Orbital(type, N2_REQ).terms,
    halfExtent: 12,
    d1: 'Bond Formation', d2: 'N\u2082', d3: label, d4: null,
    bondForming: { type, generate: (R, ori) => generateN2Orbital(type, R, ori), molecule: 'N\u2082' },
  });
}
add({
  name: 'N\u2082 electron density (dynamic)',
  ...generateN2Density(N2_REQ),
  d1: 'Bond Formation', d2: 'N\u2082', d3: 'electron density', d4: null,
  bondForming: { type: 'density', generate: (R, ori) => generateN2Density(R, ori), molecule: 'N\u2082' },
});

// ---- O₂ ----
const O2_REQ = BOND_CONFIGS['O\u2082'].R_EQ;
const O2_TYPES = [
  ['sigma_2s', '\u03C3(2s)'], ['sigma_2p', '\u03C3(2p)'],
  ['pi_2p', '\u03C0(2p)'], ['pi_star_2px', '\u03C0*(2px)'], ['pi_star_2py', '\u03C0*(2py)'],
];
for (const [type, label] of O2_TYPES) {
  add({
    name: `O\u2082 ${label} (dynamic)`,
    terms: generateO2Orbital(type, O2_REQ).terms,
    halfExtent: 12,
    d1: 'Bond Formation', d2: 'O\u2082', d3: label, d4: null,
    bondForming: { type, generate: (R, ori) => generateO2Orbital(type, R, ori), molecule: 'O\u2082' },
  });
}
add({
  name: 'O\u2082 electron density (dynamic)',
  ...generateO2Density(O2_REQ),
  d1: 'Bond Formation', d2: 'O\u2082', d3: 'electron density', d4: null,
  bondForming: { type: 'density', generate: (R, ori) => generateO2Density(R, ori), molecule: 'O\u2082' },
});

// ---- CO ----
const CO_REQ = BOND_CONFIGS['CO'].R_EQ;
const CO_TYPES = [
  ['sigma_2s', '\u03C3(2s)'], ['sigma_star_2s', '\u03C3*(2s)'],
  ['pi_2p', '\u03C0(2p)'], ['sigma_2p', '\u03C3(2p)'], ['pi_star_2p', '\u03C0*(2p)'],
];
for (const [type, label] of CO_TYPES) {
  add({
    name: `CO ${label} (dynamic)`,
    terms: generateCOOrbital(type, CO_REQ).terms,
    halfExtent: 12,
    d1: 'Bond Formation', d2: 'CO', d3: label, d4: null,
    bondForming: { type, generate: (R, ori) => generateCOOrbital(type, R, ori), molecule: 'CO' },
  });
}
add({
  name: 'CO electron density (dynamic)',
  ...generateCODensity(CO_REQ),
  d1: 'Bond Formation', d2: 'CO', d3: 'electron density', d4: null,
  bondForming: { type: 'density', generate: (R, ori) => generateCODensity(R, ori), molecule: 'CO' },
});

// ---- CO₂ (triatomic) ----
const CO2_CFG = TRIATOMIC_CONFIGS['CO\u2082'];
const CO2_EQ = [[0, 0, -CO2_CFG.morse[0].R_EQ], [0, 0, 0], [0, 0, CO2_CFG.morse[1].R_EQ]];

const CO2_TYPES = [
  ['sigma_2s', '\u03C3(2s)'], ['sigma_2p', '\u03C3(2p)'],
  ['pi_2p', '\u03C0(2p)'], ['pi_star_2p', '\u03C0*(2p)'],
];
for (const [type, label] of CO2_TYPES) {
  const eq = generateCO2Orbital(type, CO2_EQ);
  add({
    name: `CO\u2082 ${label} (dynamic)`,
    terms: eq.terms,
    halfExtent: eq.halfExtent,
    d1: 'Bond Formation', d2: 'CO\u2082', d3: label, d4: null,
    bondForming: {
      type, molecule: 'CO\u2082',
      triatomic: CO2_CFG,
      generate3: (pos, ori) => generateCO2Orbital(type, pos, ori),
    },
  });
}
add({
  name: 'CO\u2082 electron density (dynamic)',
  ...generateCO2Density(CO2_EQ),
  d1: 'Bond Formation', d2: 'CO\u2082', d3: 'electron density', d4: null,
  bondForming: {
    type: 'density', molecule: 'CO\u2082',
    triatomic: CO2_CFG,
    generate3: (pos, ori) => generateCO2Density(pos, ori),
  },
});

// ---- O₃ (triatomic) ----
const O3_CFG = TRIATOMIC_CONFIGS['O\u2083'];
const O3_HALF = O3_THETA / 2;
const O3_D = O3_CFG.morse[0].R_EQ;
const O3_EQ = [
  [O3_D * Math.sin(O3_HALF), 0, O3_D * Math.cos(O3_HALF)],
  [0, 0, 0],
  [-O3_D * Math.sin(O3_HALF), 0, O3_D * Math.cos(O3_HALF)],
];

const O3_TYPES = [
  ['sigma_2s', '\u03C3(2s)'], ['sigma_star_2s', '\u03C3*(2s)'], ['nb_2s', 'nb(2s)'],
  ['sigma_sym', '\u03C3 sym'], ['pi_deloc', '\u03C0 deloc'],
  ['pi_star', '\u03C0* anti'], ['lone_pair', 'lone pair'],
  ['sigma_star', '\u03C3* anti'], ['lp_outer', 'lp outer'],
];
for (const [type, label] of O3_TYPES) {
  const eq = generateO3Orbital(type, O3_EQ);
  add({
    name: `O\u2083 ${label} (dynamic)`,
    terms: eq.terms,
    halfExtent: eq.halfExtent,
    d1: 'Bond Formation', d2: 'O\u2083', d3: label, d4: null,
    bondForming: {
      type, molecule: 'O\u2083',
      triatomic: O3_CFG,
      generate3: (pos, ori) => generateO3Orbital(type, pos, ori),
    },
  });
}
add({
  name: 'O\u2083 electron density (dynamic)',
  ...generateO3Density(O3_EQ),
  d1: 'Bond Formation', d2: 'O\u2083', d3: 'electron density', d4: null,
  bondForming: {
    type: 'density', molecule: 'O\u2083',
    triatomic: O3_CFG,
    generate3: (pos, ori) => generateO3Density(pos, ori),
  },
});

// ============================================================
// Context mesh management (supports 2 or 3 atoms)
// ============================================================

const sphereGeo = new THREE.SphereGeometry(1, 16, 12);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
const atomMaterials = [
  new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 60 }),
  new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 60 }),
  new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 60 }),
];
const bondMaterial = new THREE.MeshPhongMaterial({
  color: 0x666666, shininess: 30, transparent: true, opacity: 1.0, side: THREE.DoubleSide,
});

let contextGroup = null;
let spheres = [null, null, null];
let bondGroups = [[], []]; // arrays of cylinder meshes per bond
let currentBondOrders = [1, 1];
let activeAtomCount = 2;

function getBondPerp(dir) {
  const ref = Math.abs(dir.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  return new THREE.Vector3().crossVectors(ref, dir).normalize();
}

function ensureContextGroup() {
  if (contextGroup) return;
  contextGroup = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    spheres[i] = new THREE.Mesh(sphereGeo, atomMaterials[i]);
    spheres[i].scale.setScalar(0.3);
    contextGroup.add(spheres[i]);
  }
}

function clearBondGroup(bondIdx) {
  for (const cyl of bondGroups[bondIdx]) {
    if (cyl.parent) cyl.parent.remove(cyl);
  }
  bondGroups[bondIdx] = [];
}

function createBondCylinders(bondIdx, order) {
  ensureContextGroup();
  clearBondGroup(bondIdx);
  const count = order === 3 ? 3 : order === 2 ? 2 : order === 1.5 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const cyl = new THREE.Mesh(cylGeo, bondMaterial);
    contextGroup.add(cyl);
    bondGroups[bondIdx].push(cyl);
  }
  currentBondOrders[bondIdx] = order;
}

function setBondGroupVisible(bondIdx, visible) {
  for (const cyl of bondGroups[bondIdx]) cyl.visible = visible;
}

function orientBondGroup(bondIdx, posA, posB) {
  const cyls = bondGroups[bondIdx];
  if (!cyls.length) return;
  const mid = new THREE.Vector3().addVectors(posA, posB).multiplyScalar(0.5);
  const diff = new THREE.Vector3().subVectors(posB, posA);
  const len = diff.length();
  if (len < 0.01) return;
  const dir = diff.clone().divideScalar(len);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const perp = getBondPerp(dir);
  const order = currentBondOrders[bondIdx];

  if (order === 1 || cyls.length === 1) {
    cyls[0].position.copy(mid);
    cyls[0].scale.set(0.12, len, 0.12);
    cyls[0].quaternion.copy(quat);
  } else if (order === 2) {
    const off = perp.clone().multiplyScalar(0.12);
    cyls[0].position.copy(mid.clone().add(off));
    cyls[0].scale.set(0.08, len, 0.08);
    cyls[0].quaternion.copy(quat);
    cyls[1].position.copy(mid.clone().sub(off));
    cyls[1].scale.set(0.08, len, 0.08);
    cyls[1].quaternion.copy(quat);
  } else if (order === 3) {
    const perp2 = new THREE.Vector3().crossVectors(dir, perp).normalize();
    for (let k = 0; k < 3; k++) {
      const angle = (k * 2 * Math.PI) / 3;
      const off = perp.clone().multiplyScalar(Math.cos(angle) * 0.14)
        .add(perp2.clone().multiplyScalar(Math.sin(angle) * 0.14));
      cyls[k].position.copy(mid.clone().add(off));
      cyls[k].scale.set(0.07, len, 0.07);
      cyls[k].quaternion.copy(quat);
    }
  } else if (order === 1.5) {
    cyls[0].position.copy(mid);
    cyls[0].scale.set(0.08, len, 0.08);
    cyls[0].quaternion.copy(quat);
    const off = perp.clone().multiplyScalar(0.14);
    cyls[1].position.copy(mid.clone().add(off));
    cyls[1].scale.set(0.06, len * 0.45, 0.06);
    cyls[1].quaternion.copy(quat);
  }
}

export function setContextMode(numAtoms, bondOrders) {
  ensureContextGroup();
  activeAtomCount = numAtoms;
  spheres[2].visible = numAtoms >= 3;
  const orders = bondOrders || [1, 1];
  createBondCylinders(0, orders[0] || 1);
  createBondCylinders(1, numAtoms >= 3 ? (orders[1] || 1) : 1);
  setBondGroupVisible(1, numAtoms >= 3);
}

export function showBondFormingContext(R) {
  ensureContextGroup();
  const halfR = R / 2;
  const posA = new THREE.Vector3(0, 0, -halfR);
  const posB = new THREE.Vector3(0, 0, halfR);
  spheres[0].position.copy(posA);
  spheres[1].position.copy(posB);
  orientBondGroup(0, posA, posB);
  if (!contextGroup.parent) scene.add(contextGroup);
}

export function showBondFormingContextAtPositions(posA, posB) {
  ensureContextGroup();
  spheres[0].position.copy(posA);
  spheres[1].position.copy(posB);
  orientBondGroup(0, posA, posB);
  if (!contextGroup.parent) scene.add(contextGroup);
}

export function showTriatomicContext(positions, bondPairs) {
  ensureContextGroup();
  for (let i = 0; i < 3; i++) {
    const p = positions[i];
    spheres[i].position.set(p.x !== undefined ? p.x : p[0], p.y !== undefined ? p.y : p[1], p.z !== undefined ? p.z : p[2]);
  }
  for (let b = 0; b < bondPairs.length && b < 2; b++) {
    const [bi, bj] = bondPairs[b];
    orientBondGroup(b, spheres[bi].position, spheres[bj].position);
  }
  if (!contextGroup.parent) scene.add(contextGroup);
}

function bondOpacity(R) {
  if (R > 8) return 0;
  if (R > 5) return 1 - (R - 5) / 3;
  return 1;
}

export function setBondCylinderOpacity(R) {
  ensureContextGroup();
  const opacity = bondOpacity(R);
  bondMaterial.opacity = opacity;
  for (const cyl of bondGroups[0]) {
    cyl.visible = opacity > 0.01;
  }
}

export function setTriatomicBondOpacity(bondDistances) {
  ensureContextGroup();
  bondMaterial.opacity = 0;
  for (let b = 0; b < bondDistances.length && b < 2; b++) {
    const opacity = bondOpacity(bondDistances[b]);
    bondMaterial.opacity = Math.max(bondMaterial.opacity, opacity);
    const visible = opacity > 0.01;
    for (const cyl of bondGroups[b]) cyl.visible = visible;
  }
}

export function clearBondFormingContext() {
  if (contextGroup && contextGroup.parent) {
    scene.remove(contextGroup);
  }
}

export function setBondFormingContextVisible(visible) {
  if (contextGroup) contextGroup.visible = visible;
}
