import { addMol, hexPos } from './core.js';

{
  const R = 2.64;
  const HR = 4.58;
  const atoms = [];
  const bonds = [];
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = hexPos(R, i);
    atoms.push([i % 2 === 0 ? 'N' : 'C', x, y, z]);
  }
  for (let i = 0; i < 3; i++) {
    const ci = i * 2 + 1;
    const [hx, hy, hz] = hexPos(HR, ci);
    atoms.push(['H', hx, hy, hz]);
  }
  for (let i = 0; i < 6; i++) bonds.push([i, (i + 1) % 6, 1.5]);
  bonds.push([1, 6]); bonds.push([3, 7]); bonds.push([5, 8]);
  addMol({
    name: 'C\u2083H\u2083N\u2083',
    label: 'C\u2083H\u2083N\u2083 (Triazine)',
    category: 'Aromatic',
  pubchemCid: 9262,
    atoms: [
    ['N', 2.62, 0, 0],
    ['C', 1.22, 0, 2.12],
    ['N', -1.31, 0, 2.27],
    ['C', -2.45, 0, 0],
    ['N', -1.31, 0, -2.27],
    ['C', 1.22, 0, -2.12],
    ['H', 2.25, 0, 3.89],
    ['H', -4.50, 0, 0],
    ['H', 2.25, 0, -3.89],
  ],
    bonds,
    he: 20,
    mos: [
      ['\u03C0\u2081 all bond', [
        [0, 2, 1, 1, 'sin', 0.45], [1, 2, 1, 1, 'sin', 0.38],
        [2, 2, 1, 1, 'sin', 0.45], [3, 2, 1, 1, 'sin', 0.38],
        [4, 2, 1, 1, 'sin', 0.45], [5, 2, 1, 1, 'sin', 0.38],
      ]],
      ['\u03C0\u2082 (1 node)', [
        [0, 2, 1, 1, 'sin', 0.50], [1, 2, 1, 1, 'sin', 0.25],
        [2, 2, 1, 1, 'sin', -0.25], [3, 2, 1, 1, 'sin', -0.50],
        [4, 2, 1, 1, 'sin', -0.25], [5, 2, 1, 1, 'sin', 0.25],
      ]],
      ['\u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.35], [1, 2, 0, 0, 'real', 0.35],
        [2, 2, 0, 0, 'real', 0.35], [3, 2, 0, 0, 'real', 0.35],
        [4, 2, 0, 0, 'real', 0.35], [5, 2, 0, 0, 'real', 0.35],
        [6, 1, 0, 0, 'real', 0.22], [7, 1, 0, 0, 'real', 0.22],
        [8, 1, 0, 0, 'real', 0.22],
      ]],
      ['N lone pairs', [[0, 2, 1, 0, 'real', 0.58], [2, 2, 1, 0, 'real', 0.58], [4, 2, 1, 0, 'real', 0.58]]],
    ]
  });
}
