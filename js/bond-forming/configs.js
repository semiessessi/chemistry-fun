// Bond-forming configurations: Morse parameters, triatomic configs, element styling.

import { DIATOMIC_MORSE } from '../utils/morse-configs.js';

// ---- Per-molecule Morse configs (diatomic) — extend shared params with R_MAX ----

export const BOND_CONFIGS = Object.fromEntries(
  Object.entries(DIATOMIC_MORSE).map(([key, base]) => [
    key, { ...base, R_MAX: key === 'H\u2082' ? 8.0 : 12.0 }
  ])
);

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
    angle: null,
    geometry: 'linear',
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
    initial: {
      positions: [[0, 0, -1.2], [0, 0, 1.2], [4, 2, 12]],
      velocities: [[0, 0.4, 0], [0, -0.4, 0], [-0.3, -0.1, -0.8]],
    },
  },
};

// ---- Element styling ----

export const ELEM_STYLE = {
  H: { color: 0xffffff, radius: 0.3 },
  C: { color: 0x909090, radius: 0.4 },
  N: { color: 0x3050f8, radius: 0.4 },
  O: { color: 0xff2010, radius: 0.4 },
};

// ---- Morse potential energy (uses active config) ----

export function morseEnergy(R) {
  const { De, a, R_EQ } = BOND_FORMING_CONFIG;
  const x = 1 - Math.exp(-a * (R - R_EQ));
  return De * x * x - De;
}
