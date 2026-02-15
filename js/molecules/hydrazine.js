import { addMol } from './core.js';

{
  const NN = 1.37;
  const NH = 1.91;
  const ang = (112 * Math.PI) / 180;
  const hR = NH * Math.sin(ang / 2);
  const hZ = NH * Math.cos(ang / 2);
  addMol({
    name: 'N\u2082H\u2084',
    label: 'N\u2082H\u2084 (Hydrazine)',
    category: 'Small Organic',
  pubchemCid: 9321,
    atoms: [
    ['N', 0.44, -1.25, -0.59],
    ['N', -1.28, 0.67, 0.16],
    ['H', 2.18, -0.47, -0.88],
    ['H', -1.4, 1.98, -1.24],
    ['H', -0.58, 1.58, 1.7],
    ['H', 0.65, -2.51, 0.85],
  ],
    bonds: [[0, 1], [0, 2], [0, 3], [1, 4], [1, 5]],
    he: 14,
    mos: [
      ['\u03C3(N-N)', [[0, 2, 1, 0, 'real', 0.7], [1, 2, 1, 0, 'real', -0.7]]],
      ['\u03C3(N-H) sym', [[0, 2, 0, 0, 'real', 0.5], [1, 2, 0, 0, 'real', 0.5], [2, 1, 0, 0, 'real', 0.3], [3, 1, 0, 0, 'real', 0.3], [4, 1, 0, 0, 'real', 0.3], [5, 1, 0, 0, 'real', 0.3]]],
      ['lone pair (N1)', [[0, 2, 1, 1, 'sin', 1.0]]],
      ['lone pair (N2)', [[1, 2, 1, 1, 'cos', 1.0]]],
    ]
  });
}
