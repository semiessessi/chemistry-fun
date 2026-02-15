import { addMol } from './core.js';

addMol({
  name: 'SO\u2082',
  label: 'SO\u2082 (Sulfur Dioxide)',
  category: 'Triatomic',
  pubchemCid: 1119,
  atoms: [
    ['S', 0, 0, 0],
    ['O', 2.34, 0, 1.37],
    ['O', -2.34, 0, 1.37],
  ],
  bonds: [[0, 1, 2], [0, 2, 2]],
  he: 18,
  mos: [
    ['\u03C3 sym', [[0, 3, 1, 1, 'cos', 0.7], [1, 2, 0, 0, 'real', 0.5], [2, 2, 0, 0, 'real', 0.5]]],
    ['\u03C3 anti', [[0, 3, 1, 1, 'cos', 0.7], [1, 2, 0, 0, 'real', 0.5], [2, 2, 0, 0, 'real', -0.5]]],
    ['\u03C0 deloc', [[0, 3, 1, 1, 'sin', 0.6], [1, 2, 1, 1, 'sin', 0.55], [2, 2, 1, 1, 'sin', 0.55]]],
    ['lone pair', [[0, 3, 1, 0, 'real', 1.0]]],
  ]
});
