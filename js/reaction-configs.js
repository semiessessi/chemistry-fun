// Reaction configurations: factory functions for diatomic, triatomic, SN2, and Diels-Alder reactions.

import { DIATOMIC_MORSE } from './utils/morse-configs.js';

const DEG = Math.PI / 180;

// ---- Diatomic bond formation configs ----

const DIATOMIC_LABELS = {
  'H\u2082': 'H\u2082 Formation',
  'N\u2082': 'N\u2082 Formation',
  'O\u2082': 'O\u2082 Formation',
  'CO': 'CO Formation',
};

export function makeDiatomicReaction(key) {
  const cfg = DIATOMIC_MORSE[key];
  return {
    name: `Rxn:${key}`,
    label: DIATOMIC_LABELS[key],
    halfExtent: 10,
    defaultImpact: key === 'CO' ? 0.8 : key === 'N\u2082' ? 1.2 : 1.0,
    defaultSpeed: key === 'CO' ? 1.2 : 1.0,
    fragments: [
      { atoms: [[cfg.elements[0], 0, 0, 0]] },
      { atoms: [[cfg.elements[1], 0, 0, 0]] },
    ],
    separation: 10,
    bonds: [
      { i: [0, 1], R_EQ: cfg.R_EQ, De: cfg.De, a: cfg.a, nominalOrder: cfg.bondOrder },
    ],
    angles: null,
    reactivePairs: null,
    numAtoms: 2,
    elements: cfg.elements,
    descriptions: ['Atoms approaching', 'Bond forming', `${key} molecule formed`],
  };
}

// ---- Triatomic bond formation configs ----

const O3_THETA = 116.8 * DEG;

export function makeTriatomicReaction(key) {
  if (key === 'CO\u2082') {
    return {
      name: 'Rxn:CO\u2082',
      label: 'CO\u2082 Formation',
      halfExtent: 14,
      defaultImpact: 0.5,
      defaultSpeed: 0.8,
      fragments: [
        { atoms: [['C', 0, 0, 0], ['O', 0, 0, -2.197]] },  // pre-bonded CO
        { atoms: [['O', 0, 0, 0]] },                          // approaching O
      ],
      separation: 12,
      bonds: [
        { i: [0, 1], R_EQ: 2.197, De: 8.0, a: 2.3, nominalOrder: 2 },   // existing C-O
        { i: [0, 2], R_EQ: 2.197, De: 8.0, a: 2.3, forming: true, nominalOrder: 2 }, // forming C-O
      ],
      angles: null,  // linear — no angle potential needed
      reactivePairs: null,
      numAtoms: 3,
      elements: ['C', 'O', 'O'],
      descriptions: ['O approaching CO', 'Bond forming', 'CO\u2082 molecule formed'],
    };
  }
  if (key === 'O\u2083') {
    return {
      name: 'Rxn:O\u2083',
      label: 'O\u2083 Formation',
      halfExtent: 14,
      defaultImpact: 1.0,
      defaultSpeed: 0.8,
      fragments: [
        { atoms: [['O', 0, 0, -1.2], ['O', 0, 0, 1.2]] },  // pre-bonded O₂
        { atoms: [['O', 0, 0, 0]] },                          // approaching O
      ],
      separation: 12,
      bonds: [
        { i: [0, 1], R_EQ: 2.41, De: 3.0, a: 2.0, nominalOrder: 1.5 },  // existing O-O
        { i: [1, 2], R_EQ: 2.41, De: 3.0, a: 2.0, forming: true, nominalOrder: 1.5 }, // forming O-O
      ],
      angles: [
        { i: 0, j: 1, k: 2, thetaEq: O3_THETA, kAngle: 3.0, rCut: 5.0 },
      ],
      reactivePairs: null,
      numAtoms: 3,
      elements: ['O', 'O', 'O'],
      descriptions: ['O approaching O\u2082', 'Bond forming', 'O\u2083 molecule formed'],
    };
  }
  return null;
}

// ---- SN2 Reaction ----

const SN2_CONFIG = {
  name: 'SN2',
  label: 'S\u2099\u2082: OH\u207B + CH\u2083Cl',
  halfExtent: 14,
  defaultImpact: 0.5,
  defaultSpeed: 0.8,
  fragments: [
    { atoms: [
      ['C',  0,    0,     0],
      ['Cl', 0,    0,     3.4],
      ['H',  1.94, 0,    -0.69],
      ['H', -0.97, 1.68, -0.69],
      ['H', -0.97,-1.68, -0.69],
    ]},
    { atoms: [
      ['O', 0, 0, 0],
      ['H', 0, 1.5, -1.8],
    ]},
  ],
  separation: 14,
  bonds: [
    // C-H stable bonds
    { i: [0, 2], R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    { i: [0, 3], R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    { i: [0, 4], R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    // O-H bond
    { i: [5, 6], R_EQ: 1.83, De: 4.8, a: 2.2, nominalOrder: 1 },
    // C-Cl (breaking)
    { i: [0, 1], R_EQ: 3.4, De: 4.0, a: 1.5, breaking: true, nominalOrder: 1 },
    // C-O (forming)
    { i: [0, 5], R_EQ: 2.7, De: 5.0, a: 1.8, forming: true, nominalOrder: 1 },
  ],
  reactivePairs: [{ forming: [0, 5], breaking: [0, 1] }],
  angles: [
    // H-C-H angles for tetrahedral geometry
    { i: 2, j: 0, k: 3, thetaEq: 109.5 * DEG, kAngle: 2.0, rCut: 5.0 },
    { i: 2, j: 0, k: 4, thetaEq: 109.5 * DEG, kAngle: 2.0, rCut: 5.0 },
    { i: 3, j: 0, k: 4, thetaEq: 109.5 * DEG, kAngle: 2.0, rCut: 5.0 },
  ],
  numAtoms: 7,
  elements: ['C', 'Cl', 'H', 'H', 'H', 'O', 'H'],
  descriptions: [
    'OH\u207B approaching CH\u2083Cl',
    'Transition state (pentacoordinate)',
    'Products: CH\u2083OH + Cl\u207B',
  ],
};

// ---- Diels-Alder Reaction ----

const DA_CONFIG = {
  name: 'Diels-Alder',
  label: 'Diels\u2013Alder: butadiene + ethylene',
  halfExtent: 14,
  defaultImpact: 0.3,
  defaultSpeed: 0.6,
  fragments: [
    { atoms: [
      // Butadiene (s-cis)
      ['C', -1.3, 0,  2.5],   // C0
      ['C',  0,   0,  1.3],   // C1
      ['C',  0,   0, -1.3],   // C2
      ['C', -1.3, 0, -2.5],   // C3
      // H on butadiene
      ['H', -2.3,  1.0,  3.2],  // H4 on C0
      ['H', -2.3, -1.0,  3.2],  // H5 on C0
      ['H',  1.0,  1.0,  2.0],  // H6 on C1
      ['H',  1.0, -1.0, -2.0],  // H7 on C2
      ['H', -2.3,  1.0, -3.2],  // H8 on C3
      ['H', -2.3, -1.0, -3.2],  // H9 on C3
    ]},
    { atoms: [
      // Ethylene
      ['C', 0, 0, -1.3],  // C10
      ['C', 0, 0,  1.3],  // C11
      // H on ethylene
      ['H', 1.0,  1.0, -2.0],  // H12 on C10
      ['H', 1.0, -1.0, -2.0],  // H13 on C10
      ['H', 1.0,  1.0,  2.0],  // H14 on C11
      ['H', 1.0, -1.0,  2.0],  // H15 on C11
    ]},
  ],
  separation: 12,
  bonds: [
    // Butadiene conjugated bonds
    { i: [0, 1], R_EQ: 2.55, De: 6.0, a: 1.8, nominalOrder: 2 },   // C0-C1 double
    { i: [1, 2], R_EQ: 2.76, De: 4.0, a: 1.5, nominalOrder: 1 },   // C1-C2 single
    { i: [2, 3], R_EQ: 2.55, De: 6.0, a: 1.8, nominalOrder: 2 },   // C2-C3 double
    // Ethylene double bond
    { i: [10, 11], R_EQ: 2.52, De: 6.5, a: 1.9, nominalOrder: 2 }, // C10-C11 double
    // New σ bonds (forming)
    { i: [0, 11], R_EQ: 2.9, De: 4.0, a: 1.5, forming: true, nominalOrder: 1 },  // C0-C11
    { i: [3, 10], R_EQ: 2.9, De: 4.0, a: 1.5, forming: true, nominalOrder: 1 },  // C3-C10
    // C-H bonds (butadiene)
    { i: [0, 4],  R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    { i: [0, 5],  R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    { i: [1, 6],  R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    { i: [2, 7],  R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    { i: [3, 8],  R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    { i: [3, 9],  R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    // C-H bonds (ethylene)
    { i: [10, 12], R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    { i: [10, 13], R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    { i: [11, 14], R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    { i: [11, 15], R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
  ],
  reactivePairs: null,  // concerted — both bonds form simultaneously, no breaking
  angles: [
    // Butadiene C-C-C angles
    { i: 0, j: 1, k: 2, thetaEq: 124 * DEG, kAngle: 1.5, rCut: 6.0 },
    { i: 1, j: 2, k: 3, thetaEq: 124 * DEG, kAngle: 1.5, rCut: 6.0 },
  ],
  numAtoms: 16,
  elements: ['C','C','C','C','H','H','H','H','H','H','C','C','H','H','H','H'],
  descriptions: [
    'Butadiene + ethylene approaching',
    'Transition state: concerted [4+2]',
    'Cyclohexene product formed',
  ],
};

// ---- Build REACTIONS array ----

export const REACTIONS = [
  SN2_CONFIG,
  DA_CONFIG,
  makeDiatomicReaction('H\u2082'),
  makeDiatomicReaction('N\u2082'),
  makeDiatomicReaction('O\u2082'),
  makeDiatomicReaction('CO'),
  makeTriatomicReaction('CO\u2082'),
  makeTriatomicReaction('O\u2083'),
];
