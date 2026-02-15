import { addMol, hexPos } from './core.js';

{
  const R = 2.64;
  const [n1x, n1y, n1z] = hexPos(R, 0); // N1
  const [c2x, c2y, c2z] = hexPos(R, 1); // C2
  const [n3x, n3y, n3z] = hexPos(R, 2); // N3
  const [c4x, c4y, c4z] = hexPos(R, 3); // C4
  const [c5x, c5y, c5z] = hexPos(R, 4); // C5
  const [c6x, c6y, c6z] = hexPos(R, 5); // C6
  const OR = R + 2.27; // C=O distance from center
  addMol({
    name: 'Uracil',
    category: 'DNA/RNA Base',
    atoms: [
      ['N', n1x, n1y, n1z],   // 0: N1
      ['C', c2x, c2y, c2z],   // 1: C2
      ['N', n3x, n3y, n3z],   // 2: N3
      ['C', c4x, c4y, c4z],   // 3: C4
      ['C', c5x, c5y, c5z],   // 4: C5
      ['C', c6x, c6y, c6z],   // 5: C6
      ['O', ...hexPos(OR, 1)], // 6: O on C2
      ['O', ...hexPos(OR, 3)], // 7: O on C4
      ['H', ...hexPos(R + 1.91, 0)], // 8: H on N1
      ['H', ...hexPos(R + 1.91, 2)], // 9: H on N3
      ['H', ...hexPos(R + 2.06, 4)], // 10: H on C5
      ['H', ...hexPos(R + 2.06, 5)], // 11: H on C6
    ],
    bonds: [
      [0, 1], [1, 2], [2, 3], [3, 4, 2], [4, 5, 2], [5, 0],
      [1, 6, 2], [3, 7, 2],
      [0, 8], [2, 9], [4, 10], [5, 11],
    ],
    he: 20,
    mos: [
      ['\u03C0 system', [
        [0, 2, 1, 1, 'sin', 0.35], [1, 2, 1, 1, 'sin', 0.35],
        [2, 2, 1, 1, 'sin', 0.35], [3, 2, 1, 1, 'sin', 0.35],
        [4, 2, 1, 1, 'sin', 0.40], [5, 2, 1, 1, 'sin', 0.40],
      ]],
      ['\u03C3(C=O)', [[1, 2, 1, 0, 'real', 0.6], [6, 2, 1, 0, 'real', -0.5], [3, 2, 1, 0, 'real', 0.4], [7, 2, 1, 0, 'real', -0.4]]],
      ['N lone pair', [[0, 2, 1, 0, 'real', 0.7], [2, 2, 1, 0, 'real', 0.7]]],
      ['\u03C0* anti', [
        [0, 2, 1, 1, 'sin', 0.35], [1, 2, 1, 1, 'sin', -0.35],
        [2, 2, 1, 1, 'sin', 0.35], [3, 2, 1, 1, 'sin', -0.35],
        [4, 2, 1, 1, 'sin', 0.40], [5, 2, 1, 1, 'sin', -0.40],
      ]],
    ]
  });
}
