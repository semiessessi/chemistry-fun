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
  const [mx, my, mz] = hexPos(R + 2.88, 0);
  atoms.push(['C', mx, my, mz]);
  atoms.push(['H', mx + 1.94, my, mz - 0.69]);
  atoms.push(['H', mx - 0.97, my + 1.68, mz - 0.69]);
  atoms.push(['H', mx - 0.97, my - 1.68, mz - 0.69]);
  for (let i = 1; i < 6; i++) {
    const [hx, hy, hz] = hexPos(HR, i);
    atoms.push(['H', hx, hy, hz]);
  }
  for (let i = 0; i < 6; i++) bonds.push([i, (i + 1) % 6, 1.5]);
  bonds.push([0, 6]); bonds.push([6, 7]); bonds.push([6, 8]); bonds.push([6, 9]);
  for (let i = 1; i < 6; i++) bonds.push([i, i + 9]);
  addMol({
    name: 'Toluene',
    label: 'C\u2087H\u2088 (Toluene)',
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
      ['\u03C3(C-CH\u2083)', [[0, 2, 1, 0, 'real', 0.65], [6, 2, 1, 0, 'real', -0.65]]],
      ['\u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.33], [1, 2, 0, 0, 'real', 0.33],
        [2, 2, 0, 0, 'real', 0.33], [3, 2, 0, 0, 'real', 0.33],
        [4, 2, 0, 0, 'real', 0.33], [5, 2, 0, 0, 'real', 0.33],
        [6, 2, 0, 0, 'real', 0.30],
        [7, 1, 0, 0, 'real', 0.16], [8, 1, 0, 0, 'real', 0.16], [9, 1, 0, 0, 'real', 0.16],
        [10, 1, 0, 0, 'real', 0.18], [11, 1, 0, 0, 'real', 0.18],
        [12, 1, 0, 0, 'real', 0.18], [13, 1, 0, 0, 'real', 0.18],
        [14, 1, 0, 0, 'real', 0.18],
      ]],
      ['hyperconjugation', [[6, 2, 1, 1, 'sin', 0.5], [0, 2, 1, 1, 'sin', 0.3], [1, 2, 1, 1, 'sin', 0.15], [5, 2, 1, 1, 'sin', 0.15]]],
    ]
  });
}
