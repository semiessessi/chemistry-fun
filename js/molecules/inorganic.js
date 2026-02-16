import { addMol } from './core.js';

// ---- SF₆ (Octahedral) ----
addMol({
  name: 'SF₆',
  label: 'SF₆ (Sulfur Hexafluoride)',
  category: 'Inorganic',
  pubchemCid: 17358,
  atoms: [
    ['S', 0, 0, 0],
    ['F', 2.98, 0, 0],
    ['F', -2.98, 0, 0],
    ['F', 0, 2.98, 0],
    ['F', 0, -2.98, 0],
    ['F', 0, 0, 2.98],
    ['F', 0, 0, -2.98],
  ],
  bonds: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6]],
  he: 24,
  mos: [
    ['σ bond (a1g)', [
      [0, 3, 0, 0, 'real', 0.45],
      [1, 2, 1, 0, 'real', -0.3],
      [2, 2, 1, 0, 'real', -0.3],
      [3, 2, 1, 0, 'real', -0.3],
      [4, 2, 1, 0, 'real', -0.3],
      [5, 2, 1, 0, 'real', -0.3],
      [6, 2, 1, 0, 'real', -0.3],
    ]],
    ['σ frame', [
      [0, 3, 0, 0, 'real', 0.35],
      [1, 2, 0, 0, 'real', 0.2], [2, 2, 0, 0, 'real', 0.2],
      [3, 2, 0, 0, 'real', 0.2], [4, 2, 0, 0, 'real', 0.2],
      [5, 2, 0, 0, 'real', 0.2], [6, 2, 0, 0, 'real', 0.2],
    ]],
  ]
});

// ---- PCl₅ (Trigonal Bipyramidal) ----
{
  const eqR = 3.89;  // P-Cl equatorial (~2.06 Å)
  const axR = 4.08;  // P-Cl axial (~2.16 Å)
  const eq = (i) => {
    const angle = (i * 2 * Math.PI) / 3;
    return [eqR * Math.cos(angle), 0, eqR * Math.sin(angle)];
  };

  addMol({
    name: 'PCl₅',
    label: 'PCl₅ (Phosphorus Pentachloride)',
    category: 'Inorganic',
    pubchemCid: 24819,
    atoms: [
      ['P', 0, 0, 0],
      ['Cl', ...eq(0)],    // equatorial
      ['Cl', ...eq(1)],
      ['Cl', ...eq(2)],
      ['Cl', 0, axR, 0],   // axial
      ['Cl', 0, -axR, 0],
    ],
    bonds: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]],
    he: 20,
    mos: [
      ['σ bond (eq)', [
        [0, 3, 0, 0, 'real', 0.45],
        [1, 3, 1, 0, 'real', -0.35],
        [2, 3, 1, 0, 'real', -0.35],
        [3, 3, 1, 0, 'real', -0.35],
      ]],
      ['σ bond (ax)', [
        [0, 3, 1, 0, 'real', 0.5, [1, 0, 0, 0, 0, 1, 0, -1, 0]],
        [4, 3, 1, 0, 'real', -0.5],
        [5, 3, 1, 0, 'real', 0.5],
      ]],
      ['σ frame', [
        [0, 3, 0, 0, 'real', 0.35],
        [1, 3, 0, 0, 'real', 0.25], [2, 3, 0, 0, 'real', 0.25],
        [3, 3, 0, 0, 'real', 0.25], [4, 3, 0, 0, 'real', 0.25],
        [5, 3, 0, 0, 'real', 0.25],
      ]],
    ]
  });
}

// ---- BF₃ (Trigonal Planar) ----
{
  const bfR = 2.48; // B-F ~1.31 Å
  const fPos = (i) => {
    const angle = (i * 2 * Math.PI) / 3;
    return [bfR * Math.cos(angle), 0, bfR * Math.sin(angle)];
  };

  addMol({
    name: 'BF₃',
    label: 'BF₃ (Boron Trifluoride)',
    category: 'Inorganic',
    pubchemCid: 6356,
    atoms: [
      ['B', 0, 0, 0],
      ['F', ...fPos(0)],
      ['F', ...fPos(1)],
      ['F', ...fPos(2)],
    ],
    bonds: [[0, 1], [0, 2], [0, 3]],
    he: 12,
    mos: [
      ['π (empty p)', [
        [0, 2, 1, 1, 'sin', 0.8],
      ]],
      ['σ bond (a1)', [
        [0, 2, 0, 0, 'real', 0.5],
        [1, 2, 1, 0, 'real', -0.4],
        [2, 2, 1, 0, 'real', -0.4],
        [3, 2, 1, 0, 'real', -0.4],
      ]],
      ['F lone pair', [
        [1, 2, 1, 1, 'sin', 0.7],
        [2, 2, 1, 1, 'sin', 0.7],
        [3, 2, 1, 1, 'sin', 0.7],
      ]],
      ['σ frame', [
        [0, 2, 0, 0, 'real', 0.35],
        [1, 2, 0, 0, 'real', 0.3],
        [2, 2, 0, 0, 'real', 0.3],
        [3, 2, 0, 0, 'real', 0.3],
      ]],
    ]
  });
}
