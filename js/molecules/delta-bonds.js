import { addMol } from './core.js';

// ---- Mo₂ (Quadruple bond: σ + 2π + δ) ----
addMol({
  name: 'Mo₂',
  label: 'Mo₂ (Dimolybdenum)',
  category: 'Inorganic',
  atoms: [
    ['Mo', 0, 0, -1.8],
    ['Mo', 0, 0, 1.8],
  ],
  bonds: [[0, 1, 4]],
  he: 14,
  mos: [
    ['σ bond (dz²)', [
      [0, 4, 2, 0, 'real', 0.7],
      [1, 4, 2, 0, 'real', 0.7],
    ]],
    ['π bond (dxz)', [
      [0, 4, 2, 1, 'cos', 0.7],
      [1, 4, 2, 1, 'cos', -0.7],
    ]],
    ['π bond (dyz)', [
      [0, 4, 2, 1, 'sin', 0.7],
      [1, 4, 2, 1, 'sin', -0.7],
    ]],
    ['δ bond (dxy)', [
      [0, 4, 2, 2, 'sin', 0.7],
      [1, 4, 2, 2, 'sin', 0.7],
    ]],
    ['δ* anti (dxy)', [
      [0, 4, 2, 2, 'sin', 0.7],
      [1, 4, 2, 2, 'sin', -0.7],
    ]],
  ]
});

// ---- Re₂Cl₈²⁻ (Quadruple bond with eclipsed Cl ligands) ----
{
  const d = 1.9;   // Re–Re half-distance (Bohr)
  const clR = 4.3; // Re–Cl distance (Bohr)
  const a = clR * Math.cos(Math.PI / 4); // ≈3.04

  addMol({
    name: 'Re₂Cl₈²⁻',
    label: 'Re₂Cl₈²⁻ (Octachlorodirhenate)',
    category: 'Inorganic',
    atoms: [
      ['Re', 0, 0, -d],
      ['Re', 0, 0, d],
      // Cl around Re0 (eclipsed square at z = -d)
      ['Cl', a, a, -d],
      ['Cl', -a, a, -d],
      ['Cl', -a, -a, -d],
      ['Cl', a, -a, -d],
      // Cl around Re1 (eclipsed square at z = +d)
      ['Cl', a, a, d],
      ['Cl', -a, a, d],
      ['Cl', -a, -a, d],
      ['Cl', a, -a, d],
    ],
    bonds: [
      [0, 1, 4],
      [0, 2], [0, 3], [0, 4], [0, 5],
      [1, 6], [1, 7], [1, 8], [1, 9],
    ],
    he: 16,
    mos: [
      ['σ bond (dz²)', [
        [0, 5, 2, 0, 'real', 0.7],
        [1, 5, 2, 0, 'real', 0.7],
      ]],
      ['π bond (dxz)', [
        [0, 5, 2, 1, 'cos', 0.7],
        [1, 5, 2, 1, 'cos', -0.7],
      ]],
      ['π bond (dyz)', [
        [0, 5, 2, 1, 'sin', 0.7],
        [1, 5, 2, 1, 'sin', -0.7],
      ]],
      ['δ bond (dxy)', [
        [0, 5, 2, 2, 'sin', 0.7],
        [1, 5, 2, 2, 'sin', 0.7],
      ]],
      ['σ frame', [
        [0, 5, 0, 0, 'real', 0.35],
        [1, 5, 0, 0, 'real', 0.35],
        [2, 3, 0, 0, 'real', 0.2],
        [3, 3, 0, 0, 'real', 0.2],
        [4, 3, 0, 0, 'real', 0.2],
        [5, 3, 0, 0, 'real', 0.2],
        [6, 3, 0, 0, 'real', 0.2],
        [7, 3, 0, 0, 'real', 0.2],
        [8, 3, 0, 0, 'real', 0.2],
        [9, 3, 0, 0, 'real', 0.2],
      ]],
    ]
  });
}
