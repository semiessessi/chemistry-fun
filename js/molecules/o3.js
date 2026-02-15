import { addMol } from './core.js';

addMol({
  name: 'O\u2083',
  label: 'O\u2083 (Ozone)',
  category: 'Triatomic',
  pubchemCid: 24823,
  atoms: [['O', 0, 0, 0], ['O', 2.14, 0, 1.08], ['O', -2.14, 0, 1.08]],
  bonds: [[0, 1, 1.5], [0, 2, 1.5]],
  he: 16,
  mos: [
    ['\u03C3 sym', [[0, 2, 1, 1, 'cos', 0.8], [1, 2, 0, 0, 'real', 0.45], [2, 2, 0, 0, 'real', 0.45]]],
    ['\u03C0 deloc', [[0, 2, 1, 1, 'sin', 0.7], [1, 2, 1, 1, 'sin', 0.5], [2, 2, 1, 1, 'sin', 0.5]]],
    ['\u03C0* anti', [[0, 2, 1, 1, 'sin', 0.0], [1, 2, 1, 1, 'sin', 0.7], [2, 2, 1, 1, 'sin', -0.7]]],
    ['lone pair', [[0, 2, 1, 0, 'real', 1.0]]],
  ]
});
