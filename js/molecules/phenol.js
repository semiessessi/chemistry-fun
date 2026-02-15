import { addMol, hexPos } from './core.js';

{
  const R = 2.64;
  const HR = 4.58;
  const atoms = [];
  const bonds = [];
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = hexPos(R, i);
    atoms.push(['C', x, y, z]);
  }
  const [ox, oy, oz] = hexPos(R + 2.70, 0);
  atoms.push(['O', ox, oy, oz]);
  const [ohx, ohy, ohz] = hexPos(R + 2.70 + 1.83, 0);
  atoms.push(['H', ohx, ohy, ohz]);
  for (let i = 1; i < 6; i++) {
    const [hx, hy, hz] = hexPos(HR, i);
    atoms.push(['H', hx, hy, hz]);
  }
  for (let i = 0; i < 6; i++) bonds.push([i, (i + 1) % 6, 1.5]);
  bonds.push([0, 6]); bonds.push([6, 7]);
  for (let i = 1; i < 6; i++) bonds.push([i, i + 7]);
  addMol({
    name: 'Phenol',
    label: 'C\u2086H\u2085OH (Phenol)',
    category: 'Aromatic',
  pubchemCid: 996,
    atoms: [
    ['C', 3.73, 0, -0.12],
    ['C', 2.4, 0, 2.16],
    ['C', -0.23, 0, 2.14],
    ['C', -1.54, 0, -0.14],
    ['C', -0.21, 0, -2.42],
    ['C', 2.42, 0, -2.41],
    ['O', -4.11, 0, -0.16],
    ['H', 5.78, 0, -0.11],
    ['H', 3.42, 0, 3.94],
    ['H', -1.25, 0, 3.93],
    ['H', -4.72, 0, 1.58],
    ['H', -1.22, 0, -4.21],
    ['H', 3.46, 0, -4.18],
  ],
    bonds,
    he: 22,
    mos: [
      ['\u03C0 system', [
        [0, 2, 1, 1, 'sin', 0.40], [1, 2, 1, 1, 'sin', 0.40],
        [2, 2, 1, 1, 'sin', 0.40], [3, 2, 1, 1, 'sin', 0.40],
        [4, 2, 1, 1, 'sin', 0.40], [5, 2, 1, 1, 'sin', 0.40],
      ]],
      ['O lone pair', [[6, 2, 1, 1, 'sin', 1.0]]],
      ['\u03C3(O-H)', [[6, 2, 1, 0, 'real', 0.7], [7, 1, 0, 0, 'real', 0.65]]],
      ['\u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.33], [1, 2, 0, 0, 'real', 0.33],
        [2, 2, 0, 0, 'real', 0.33], [3, 2, 0, 0, 'real', 0.33],
        [4, 2, 0, 0, 'real', 0.33], [5, 2, 0, 0, 'real', 0.33],
        [6, 2, 0, 0, 'real', 0.25],
        [8, 1, 0, 0, 'real', 0.18], [9, 1, 0, 0, 'real', 0.18],
        [10, 1, 0, 0, 'real', 0.18], [11, 1, 0, 0, 'real', 0.18],
        [12, 1, 0, 0, 'real', 0.18],
      ]],
    ]
  });
}
