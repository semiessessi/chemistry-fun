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
    atoms,
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
