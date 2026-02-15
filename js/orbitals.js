// Unified orbital definitions: atomic, molecular (LCAO), hybrid, and transitions.
// Each orbital: { name, terms: [...], halfExtent, d1, d2, d3, d4 }
// Each term: { n, l, m, angType, center: [x,y,z], coeff }
// "All lobes" entries: { name, lobes: [orbital, ...], halfExtent, d1, d2, d3, d4 }

import { TRANSITIONS } from './transitions.js';

export const ALL_ORBITALS = [];
export const ORBITAL_MAP = {};
export const ORBITAL_TREE = {};

export function add(o) {
  ALL_ORBITALS.push(o);
  ORBITAL_MAP[o.name] = o;
  const { d1, d2, d3 } = o;
  if (!ORBITAL_TREE[d1]) ORBITAL_TREE[d1] = {};
  if (!ORBITAL_TREE[d1][d2]) ORBITAL_TREE[d1][d2] = {};
  if (!ORBITAL_TREE[d1][d2][d3]) ORBITAL_TREE[d1][d2][d3] = [];
  ORBITAL_TREE[d1][d2][d3].push(o);
}

// --- Atomic Orbitals (30) ---

function atomic(name, n, l, m, angType) {
  add({
    name,
    terms: [{ n, l, m, angType: angType || 'real', center: [0, 0, 0], coeff: 1 }],
    halfExtent: null,
    d1: 'Atomic', d2: `n=${n}`, d3: ['s', 'p', 'd', 'f'][l],
    d4: l === 0 ? null : name
  });
}

// n=1
atomic('1s', 1, 0, 0);
// n=2
atomic('2s', 2, 0, 0);
atomic('2pz', 2, 1, 0);
atomic('2px', 2, 1, 1, 'cos');
atomic('2py', 2, 1, 1, 'sin');
// n=3
atomic('3s', 3, 0, 0);
atomic('3pz', 3, 1, 0);
atomic('3px', 3, 1, 1, 'cos');
atomic('3py', 3, 1, 1, 'sin');
atomic('3dz\u00B2', 3, 2, 0);
atomic('3dxz', 3, 2, 1, 'cos');
atomic('3dyz', 3, 2, 1, 'sin');
atomic('3dx\u00B2-y\u00B2', 3, 2, 2, 'cos');
atomic('3dxy', 3, 2, 2, 'sin');
// n=4
atomic('4s', 4, 0, 0);
atomic('4pz', 4, 1, 0);
atomic('4px', 4, 1, 1, 'cos');
atomic('4py', 4, 1, 1, 'sin');
atomic('4dz\u00B2', 4, 2, 0);
atomic('4dxz', 4, 2, 1, 'cos');
atomic('4dyz', 4, 2, 1, 'sin');
atomic('4dx\u00B2-y\u00B2', 4, 2, 2, 'cos');
atomic('4dxy', 4, 2, 2, 'sin');
atomic('4fz\u00B3', 4, 3, 0);
atomic('4fxz\u00B2', 4, 3, 1, 'cos');
atomic('4fyz\u00B2', 4, 3, 1, 'sin');
atomic('4fz(x\u00B2-y\u00B2)', 4, 3, 2, 'cos');
atomic('4fxyz', 4, 3, 2, 'sin');
atomic('4fx(x\u00B2-3y\u00B2)', 4, 3, 3, 'cos');
atomic('4fy(3x\u00B2-y\u00B2)', 4, 3, 3, 'sin');

// --- Molecular Orbitals (LCAO, 10) ---
// Two atoms along z-axis.

function molecular(name, terms, halfExtent, d2, d3, d4) {
  add({ name, terms, halfExtent, d1: 'Molecular', d2, d3, d4 });
}

const D_1S = 0.7;   // half-distance for 1s basis
const D_2 = 1.25;   // half-distance for 2s/2p basis

// 1s-based (halfExtent 10)
molecular('\u03C3(1s)', [
  { n: 1, l: 0, m: 0, angType: 'real', center: [0, 0, -D_1S], coeff: 1 },
  { n: 1, l: 0, m: 0, angType: 'real', center: [0, 0, D_1S], coeff: 1 }
], 10, '1s', '\u03C3', null);

molecular('\u03C3*(1s)', [
  { n: 1, l: 0, m: 0, angType: 'real', center: [0, 0, -D_1S], coeff: 1 },
  { n: 1, l: 0, m: 0, angType: 'real', center: [0, 0, D_1S], coeff: -1 }
], 10, '1s', '\u03C3*', null);

// 2s-based (halfExtent 16)
molecular('\u03C3(2s)', [
  { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, -D_2], coeff: 1 },
  { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, D_2], coeff: 1 }
], 16, '2s', '\u03C3', null);

molecular('\u03C3*(2s)', [
  { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, -D_2], coeff: 1 },
  { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, D_2], coeff: -1 }
], 16, '2s', '\u03C3*', null);

// 2p-based (halfExtent 18)
// sigma(2p) bonding: coeff -1 on second atom flips pz to face inward
molecular('\u03C3(2p)', [
  { n: 2, l: 1, m: 0, angType: 'real', center: [0, 0, -D_2], coeff: 1 },
  { n: 2, l: 1, m: 0, angType: 'real', center: [0, 0, D_2], coeff: -1 }
], 18, '2p', '\u03C3', null);

molecular('\u03C3*(2p)', [
  { n: 2, l: 1, m: 0, angType: 'real', center: [0, 0, -D_2], coeff: 1 },
  { n: 2, l: 1, m: 0, angType: 'real', center: [0, 0, D_2], coeff: 1 }
], 18, '2p', '\u03C3*', null);

// pi bonding: same phase (+1/+1), antibonding: opposite (+1/-1)
molecular('\u03C0(2px)', [
  { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, -D_2], coeff: 1 },
  { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, D_2], coeff: 1 }
], 18, '2p', '\u03C0', '\u03C0(2px)');

molecular('\u03C0*(2px)', [
  { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, -D_2], coeff: 1 },
  { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, D_2], coeff: -1 }
], 18, '2p', '\u03C0*', '\u03C0*(2px)');

molecular('\u03C0(2py)', [
  { n: 2, l: 1, m: 1, angType: 'sin', center: [0, 0, -D_2], coeff: 1 },
  { n: 2, l: 1, m: 1, angType: 'sin', center: [0, 0, D_2], coeff: 1 }
], 18, '2p', '\u03C0', '\u03C0(2py)');

molecular('\u03C0*(2py)', [
  { n: 2, l: 1, m: 1, angType: 'sin', center: [0, 0, -D_2], coeff: 1 },
  { n: 2, l: 1, m: 1, angType: 'sin', center: [0, 0, D_2], coeff: -1 }
], 18, '2p', '\u03C0*', '\u03C0*(2py)');

// --- Hybrid Orbitals (12) ---

const C_SP = 1 / Math.sqrt(2);           // 0.7071
const C_SP2_S = 1 / Math.sqrt(3);        // 0.5774
const C_SP2_P1 = Math.sqrt(2 / 3);       // 0.8165
const C_SP2_P2 = 1 / Math.sqrt(6);       // 0.4082
const C_SP2_P3 = 1 / Math.sqrt(2);       // 0.7071
const C_SP3 = 0.5;

const O = [0, 0, 0];

// sp (2 lobes): 1/sqrt(2) * (2s +/- 2pz)
add({
  name: 'sp lobe 1',
  terms: [
    { n: 2, l: 0, m: 0, angType: 'real', center: O, coeff: C_SP },
    { n: 2, l: 1, m: 0, angType: 'real', center: O, coeff: C_SP }
  ],
  halfExtent: null, d1: 'Hybrid', d2: 'sp', d3: 'lobe 1', d4: null
});
add({
  name: 'sp lobe 2',
  terms: [
    { n: 2, l: 0, m: 0, angType: 'real', center: O, coeff: C_SP },
    { n: 2, l: 1, m: 0, angType: 'real', center: O, coeff: -C_SP }
  ],
  halfExtent: null, d1: 'Hybrid', d2: 'sp', d3: 'lobe 2', d4: null
});
add({
  name: 'sp all',
  lobes: [ORBITAL_MAP['sp lobe 1'], ORBITAL_MAP['sp lobe 2']],
  halfExtent: null, d1: 'Hybrid', d2: 'sp', d3: 'all lobes', d4: null
});

// sp2 (3 lobes, trigonal planar in xy plane)
add({
  name: 'sp\u00B2 lobe 1',
  terms: [
    { n: 2, l: 0, m: 0, angType: 'real', center: O, coeff: C_SP2_S },
    { n: 2, l: 1, m: 1, angType: 'cos', center: O, coeff: C_SP2_P1 }
  ],
  halfExtent: null, d1: 'Hybrid', d2: 'sp\u00B2', d3: 'lobe 1', d4: null
});
add({
  name: 'sp\u00B2 lobe 2',
  terms: [
    { n: 2, l: 0, m: 0, angType: 'real', center: O, coeff: C_SP2_S },
    { n: 2, l: 1, m: 1, angType: 'cos', center: O, coeff: -C_SP2_P2 },
    { n: 2, l: 1, m: 1, angType: 'sin', center: O, coeff: C_SP2_P3 }
  ],
  halfExtent: null, d1: 'Hybrid', d2: 'sp\u00B2', d3: 'lobe 2', d4: null
});
add({
  name: 'sp\u00B2 lobe 3',
  terms: [
    { n: 2, l: 0, m: 0, angType: 'real', center: O, coeff: C_SP2_S },
    { n: 2, l: 1, m: 1, angType: 'cos', center: O, coeff: -C_SP2_P2 },
    { n: 2, l: 1, m: 1, angType: 'sin', center: O, coeff: -C_SP2_P3 }
  ],
  halfExtent: null, d1: 'Hybrid', d2: 'sp\u00B2', d3: 'lobe 3', d4: null
});
add({
  name: 'sp\u00B2 all',
  lobes: [
    ORBITAL_MAP['sp\u00B2 lobe 1'],
    ORBITAL_MAP['sp\u00B2 lobe 2'],
    ORBITAL_MAP['sp\u00B2 lobe 3']
  ],
  halfExtent: null, d1: 'Hybrid', d2: 'sp\u00B2', d3: 'all lobes', d4: null
});

// sp3 (4 lobes, tetrahedral): 0.5 * (2s +/- 2px +/- 2py +/- 2pz)
add({
  name: 'sp\u00B3 lobe 1',
  terms: [
    { n: 2, l: 0, m: 0, angType: 'real', center: O, coeff: C_SP3 },
    { n: 2, l: 1, m: 1, angType: 'cos', center: O, coeff: C_SP3 },
    { n: 2, l: 1, m: 1, angType: 'sin', center: O, coeff: C_SP3 },
    { n: 2, l: 1, m: 0, angType: 'real', center: O, coeff: C_SP3 }
  ],
  halfExtent: null, d1: 'Hybrid', d2: 'sp\u00B3', d3: 'lobe 1', d4: null
});
add({
  name: 'sp\u00B3 lobe 2',
  terms: [
    { n: 2, l: 0, m: 0, angType: 'real', center: O, coeff: C_SP3 },
    { n: 2, l: 1, m: 1, angType: 'cos', center: O, coeff: C_SP3 },
    { n: 2, l: 1, m: 1, angType: 'sin', center: O, coeff: -C_SP3 },
    { n: 2, l: 1, m: 0, angType: 'real', center: O, coeff: -C_SP3 }
  ],
  halfExtent: null, d1: 'Hybrid', d2: 'sp\u00B3', d3: 'lobe 2', d4: null
});
add({
  name: 'sp\u00B3 lobe 3',
  terms: [
    { n: 2, l: 0, m: 0, angType: 'real', center: O, coeff: C_SP3 },
    { n: 2, l: 1, m: 1, angType: 'cos', center: O, coeff: -C_SP3 },
    { n: 2, l: 1, m: 1, angType: 'sin', center: O, coeff: C_SP3 },
    { n: 2, l: 1, m: 0, angType: 'real', center: O, coeff: -C_SP3 }
  ],
  halfExtent: null, d1: 'Hybrid', d2: 'sp\u00B3', d3: 'lobe 3', d4: null
});
add({
  name: 'sp\u00B3 lobe 4',
  terms: [
    { n: 2, l: 0, m: 0, angType: 'real', center: O, coeff: C_SP3 },
    { n: 2, l: 1, m: 1, angType: 'cos', center: O, coeff: -C_SP3 },
    { n: 2, l: 1, m: 1, angType: 'sin', center: O, coeff: -C_SP3 },
    { n: 2, l: 1, m: 0, angType: 'real', center: O, coeff: C_SP3 }
  ],
  halfExtent: null, d1: 'Hybrid', d2: 'sp\u00B3', d3: 'lobe 4', d4: null
});
add({
  name: 'sp\u00B3 all',
  lobes: [
    ORBITAL_MAP['sp\u00B3 lobe 1'], ORBITAL_MAP['sp\u00B3 lobe 2'],
    ORBITAL_MAP['sp\u00B3 lobe 3'], ORBITAL_MAP['sp\u00B3 lobe 4']
  ],
  halfExtent: null, d1: 'Hybrid', d2: 'sp\u00B3', d3: 'all lobes', d4: null
});

// --- Electron Transitions (9) ---

function orbitMaxN(orbital) {
  let maxN = 1;
  for (const t of orbital.terms) { if (t.n > maxN) maxN = t.n; }
  return maxN;
}

function registerTransitions(seriesName, seriesLabel, transitionList) {
  for (const trans of transitionList) {
    const orbital1 = ORBITAL_MAP[trans.from];
    const orbital2 = ORBITAL_MAP[trans.to];
    if (!orbital1 || !orbital2) continue;

    // Same formula as getHalfExtent in render-pipeline: n²×3.5+4
    const n = Math.max(orbitMaxN(orbital1), orbitMaxN(orbital2));
    const maxExtent = n * n * 3.5 + 4;

    add({
      name: `transition:${trans.from}→${trans.to}`,
      isTransition: true,
      transition: {
        from: trans.from,
        to: trans.to,
        n1: trans.n1,
        n2: trans.n2,
        label: trans.label,
        orbital1,
        orbital2,
      },
      // Display initial state when not animating
      terms: orbital1.terms,
      halfExtent: maxExtent,
      d1: 'Transitions',
      d2: seriesLabel,
      d3: trans.label,
      d4: null,
    });
  }
}

registerTransitions('lyman', 'Lyman', TRANSITIONS.lyman);
registerTransitions('balmer', 'Balmer', TRANSITIONS.balmer);
registerTransitions('paschen', 'Paschen', TRANSITIONS.paschen);
