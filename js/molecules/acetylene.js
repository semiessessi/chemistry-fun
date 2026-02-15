import { addMol } from './core.js';

addMol({
  name: 'C\u2082H\u2082',
  label: 'C\u2082H\u2082 (Acetylene)',
  category: 'Small Organic',
  pubchemCid: 6326,
  atoms: [
    ['C', 0, 0, -1.13],
    ['C', 0, 0, 1.13],
    ['H', 0, 0, -3.15],
    ['H', 0, 0, 3.15],
  ],
  bonds: [[0, 1, 3], [0, 2], [1, 3]],
  he: 18,
  mos: [
    ['\u03C3g C-C', [[0, 2, 1, 0, 'real', 0.7], [1, 2, 1, 0, 'real', -0.7]]],
    ['\u03C0u(px)', [[0, 2, 1, 1, 'cos', 0.7], [1, 2, 1, 1, 'cos', 0.7]]],
    ['\u03C0u(py)', [[0, 2, 1, 1, 'sin', 0.7], [1, 2, 1, 1, 'sin', 0.7]]],
    ['\u03C3 C-H', [[0, 2, 0, 0, 'real', 0.5], [1, 2, 0, 0, 'real', 0.5], [2, 1, 0, 0, 'real', 0.4], [3, 1, 0, 0, 'real', 0.4]]],
  ]
});
