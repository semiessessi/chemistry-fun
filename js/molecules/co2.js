import { addMol } from './core.js';

addMol({
  name: 'CO\u2082',
  label: 'CO\u2082 (Carbon Dioxide)',
  category: 'Triatomic',
  pubchemCid: 280,
  atoms: [
    ['C', 0, 0, 0],
    ['O', 0, 0, -2.19],
    ['O', 0, 0, 2.19],
  ],
  bonds: [[0, 1, 2], [0, 2, 2]],
  he: 18,
  mos: [
    ['\u03C3g bond', [[0, 2, 1, 0, 'real', 1], [1, 2, 1, 0, 'real', 0.7], [2, 2, 1, 0, 'real', -0.7]]],
    ['\u03C0u(px)', [[0, 2, 1, 1, 'cos', 1], [1, 2, 1, 1, 'cos', 0.6], [2, 2, 1, 1, 'cos', 0.6]]],
    ['\u03C0u(py)', [[0, 2, 1, 1, 'sin', 1], [1, 2, 1, 1, 'sin', 0.6], [2, 2, 1, 1, 'sin', 0.6]]],
    ['lone pair', [[1, 2, 0, 0, 'real', 0.7], [2, 2, 0, 0, 'real', 0.7]]],
  ]
});
