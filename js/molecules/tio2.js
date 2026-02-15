import { addMol } from './core.js';

addMol({
  name: 'TiO\u2082',
  label: 'TiO\u2082 (Titanium Dioxide)',
  category: 'Metal Oxide',
  atoms: [['Ti', 0, 0, 0], ['O', 2.51, 0, 1.76], ['O', -2.51, 0, 1.76]],
  bonds: [[0, 1, 2], [0, 2, 2]],
  he: 18,
  mos: [
    ['\u03C3 sym', [[0, 3, 2, 0, 'real', 0.7], [1, 2, 0, 0, 'real', 0.5], [2, 2, 0, 0, 'real', 0.5]]],
    ['\u03C3 anti', [[0, 3, 2, 1, 'cos', 0.7], [1, 2, 0, 0, 'real', 0.5], [2, 2, 0, 0, 'real', -0.5]]],
    ['\u03C0 deloc', [[0, 3, 2, 1, 'sin', 0.6], [1, 2, 1, 1, 'sin', 0.55], [2, 2, 1, 1, 'sin', 0.55]]],
    ['lone pair', [[1, 2, 1, 0, 'real', 0.7], [2, 2, 1, 0, 'real', 0.7]]],
  ]
});
