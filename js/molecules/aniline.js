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
  const [nx, ny, nz] = hexPos(R + 2.76, 0);
  atoms.push(['N', nx, ny, nz]);
  atoms.push(['H', nx + 0.93, 1.60, nz]);
  atoms.push(['H', nx + 0.93, -1.60, nz]);
  for (let i = 1; i < 6; i++) {
    const [hx, hy, hz] = hexPos(HR, i);
    atoms.push(['H', hx, hy, hz]);
  }
  for (let i = 0; i < 6; i++) bonds.push([i, (i + 1) % 6, 1.5]);
  bonds.push([0, 6]); bonds.push([6, 7]); bonds.push([6, 8]);
  for (let i = 1; i < 6; i++) bonds.push([i, i + 8]);
  addMol({
    name: 'Aniline',
    label: 'C\u2086H\u2085NH\u2082 (Aniline)',
    category: 'Aromatic',
  pubchemCid: 6115,
    atoms: [
    ['C', 3.83, -1.31, 0.57],
    ['C', 1.57, -1.14, 1.92],
    ['C', -0.5, 0.11, 0.87],
    ['C', -0.3, 1.19, -1.53],
    ['C', 1.96, 1.02, -2.87],
    ['C', 4.03, -0.23, -1.82],
    ['N', -2.78, 0.28, 2.23],
    ['H', 5.79, -0.36, -2.87],
    ['H', 5.44, -2.28, 1.39],
    ['H', 1.45, -1.99, 3.78],
    ['H', -2.92, -0.51, 3.96],
    ['H', -4.28, 1.19, 1.47],
    ['H', -1.9, 2.17, -2.37],
    ['H', 2.11, 1.87, -4.74],
  ],
    bonds,
    he: 22,
    mos: [
      ['\u03C0 system', [
        [0, 2, 1, 1, 'sin', 0.40], [1, 2, 1, 1, 'sin', 0.40],
        [2, 2, 1, 1, 'sin', 0.40], [3, 2, 1, 1, 'sin', 0.40],
        [4, 2, 1, 1, 'sin', 0.40], [5, 2, 1, 1, 'sin', 0.40],
      ]],
      ['N lone pair', [[6, 2, 1, 1, 'sin', 0.9]]],
      ['\u03C3(N-H)', [[6, 2, 0, 0, 'real', 0.5], [7, 1, 0, 0, 'real', 0.4], [8, 1, 0, 0, 'real', 0.4]]],
      ['\u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.33], [1, 2, 0, 0, 'real', 0.33],
        [2, 2, 0, 0, 'real', 0.33], [3, 2, 0, 0, 'real', 0.33],
        [4, 2, 0, 0, 'real', 0.33], [5, 2, 0, 0, 'real', 0.33],
        [9, 1, 0, 0, 'real', 0.18], [10, 1, 0, 0, 'real', 0.18],
        [11, 1, 0, 0, 'real', 0.18], [12, 1, 0, 0, 'real', 0.18],
        [13, 1, 0, 0, 'real', 0.18],
      ]],
    ]
  });
}
