import { addMol, hexPos } from './core.js';

{
  const R = 2.64;
  const HR = 4.58;
  const atoms = [];
  const bonds = [];
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = hexPos(R, i);
    atoms.push([i === 0 ? 'N' : 'C', x, y, z]);
  }
  for (let i = 1; i < 6; i++) {
    const [hx, hy, hz] = hexPos(HR, i);
    atoms.push(['H', hx, hy, hz]);
  }
  for (let i = 0; i < 6; i++) bonds.push([i, (i + 1) % 6, 1.5]);
  for (let i = 1; i < 6; i++) bonds.push([i, i + 5]);
  addMol({
    name: 'C\u2085H\u2085N',
    label: 'C\u2085H\u2085N (Pyridine)',
    category: 'Aromatic',
  pubchemCid: 1049,
    atoms: [
    ['N', 2.17, 0, 1.63],
    ['C', 1.03, 0, 0.91],
    ['C', 1.03, 0, 0.91],
    ['C', -2.3, 0, -1.19],
    ['C', -1.19, 0, -0.49],
    ['C', -1.18, 0, -0.48],
    ['H', 1.97, 0, 1.51],
    ['H', 1.97, 0, 1.51],
    ['H', -4.03, 0, -2.29],
    ['H', -2.02, 0, -1.01],
    ['H', -2.02, 0, -1.01],
  ],
    bonds,
    he: 20,
    mos: [
      ['\u03C0\u2081 all bond', [
        [0, 2, 1, 1, 'sin', 0.45], [1, 2, 1, 1, 'sin', 0.40],
        [2, 2, 1, 1, 'sin', 0.40], [3, 2, 1, 1, 'sin', 0.40],
        [4, 2, 1, 1, 'sin', 0.40], [5, 2, 1, 1, 'sin', 0.40],
      ]],
      ['\u03C0\u2082 (1 node)', [
        [0, 2, 1, 1, 'sin', 0.50], [1, 2, 1, 1, 'sin', 0.29],
        [2, 2, 1, 1, 'sin', -0.29], [3, 2, 1, 1, 'sin', -0.50],
        [4, 2, 1, 1, 'sin', -0.29], [5, 2, 1, 1, 'sin', 0.29],
      ]],
      ['\u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.35], [1, 2, 0, 0, 'real', 0.35],
        [2, 2, 0, 0, 'real', 0.35], [3, 2, 0, 0, 'real', 0.35],
        [4, 2, 0, 0, 'real', 0.35], [5, 2, 0, 0, 'real', 0.35],
        [6, 1, 0, 0, 'real', 0.2], [7, 1, 0, 0, 'real', 0.2],
        [8, 1, 0, 0, 'real', 0.2], [9, 1, 0, 0, 'real', 0.2],
        [10, 1, 0, 0, 'real', 0.2],
      ]],
      ['N lone pair', [[0, 2, 1, 0, 'real', 1.0]]],
    ]
  });
}
