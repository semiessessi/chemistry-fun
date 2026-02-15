import { addMol, hexPos } from './core.js';

const BENZ_R = 2.64;
const BENZ_HR = 4.58;

const benzAtoms = [];
const benzBonds = [];
for (let i = 0; i < 6; i++) {
  const [cx, cy, cz] = hexPos(BENZ_R, i);
  benzAtoms.push(['C', cx, cy, cz]);
}
for (let i = 0; i < 6; i++) {
  const [hx, hy, hz] = hexPos(BENZ_HR, i);
  benzAtoms.push(['H', hx, hy, hz]);
}
for (let i = 0; i < 6; i++) benzBonds.push([i, (i + 1) % 6, 1.5]);
for (let i = 0; i < 6; i++) benzBonds.push([i, i + 6]);

addMol({
  name: 'C\u2086H\u2086',
  label: 'C\u2086H\u2086 (Benzene)',
  category: 'Aromatic',
  pubchemCid: 241,
  atoms: [
    ['C', 2.64, 0, 0],
    ['C', 1.32, 0, 2.29],
    ['C', -1.32, 0, 2.29],
    ['C', -2.64, 0, 0],
    ['C', -1.32, 0, -2.29],
    ['C', 1.32, 0, -2.29],
    ['H', 4.69, 0, 0],
    ['H', 2.34, 0, 4.06],
    ['H', -2.34, 0, 4.06],
    ['H', -4.69, 0, 0],
    ['H', -2.34, 0, -4.06],
    ['H', 2.34, 0, -4.06],
  ],
  bonds: benzBonds,
  he: 20,
  mos: [
    ['\u03C0\u2081 all bond', [
      [0, 2, 1, 1, 'sin', 0.41], [1, 2, 1, 1, 'sin', 0.41],
      [2, 2, 1, 1, 'sin', 0.41], [3, 2, 1, 1, 'sin', 0.41],
      [4, 2, 1, 1, 'sin', 0.41], [5, 2, 1, 1, 'sin', 0.41],
    ]],
    ['\u03C0\u2082 (1 node x)', [
      [0, 2, 1, 1, 'sin', 0.5], [1, 2, 1, 1, 'sin', 0.29],
      [2, 2, 1, 1, 'sin', -0.29], [3, 2, 1, 1, 'sin', -0.5],
      [4, 2, 1, 1, 'sin', -0.29], [5, 2, 1, 1, 'sin', 0.29],
    ]],
    ['\u03C0\u2083 (1 node z)', [
      [0, 2, 1, 1, 'sin', 0.0], [1, 2, 1, 1, 'sin', 0.5],
      [2, 2, 1, 1, 'sin', 0.5], [3, 2, 1, 1, 'sin', 0.0],
      [4, 2, 1, 1, 'sin', -0.5], [5, 2, 1, 1, 'sin', -0.5],
    ]],
    ['\u03C3 frame', [
      [0, 2, 0, 0, 'real', 0.35], [1, 2, 0, 0, 'real', 0.35],
      [2, 2, 0, 0, 'real', 0.35], [3, 2, 0, 0, 'real', 0.35],
      [4, 2, 0, 0, 'real', 0.35], [5, 2, 0, 0, 'real', 0.35],
      [6, 1, 0, 0, 'real', 0.2], [7, 1, 0, 0, 'real', 0.2],
      [8, 1, 0, 0, 'real', 0.2], [9, 1, 0, 0, 'real', 0.2],
      [10, 1, 0, 0, 'real', 0.2], [11, 1, 0, 0, 'real', 0.2],
    ]],
  ]
});
