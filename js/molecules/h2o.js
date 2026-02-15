import { addMol } from './core.js';

addMol({
  name: 'H\u2082O',
  label: 'H\u2082O (Water)',
  category: 'Triatomic',
  pubchemCid: 962,
  atoms: [
    ['O', 0, 0, -0.01],
    ['H', 1.44, 0, 1.12],
    ['H', -1.44, 0, 1.12],
  ],
  bonds: [[0, 1], [0, 2]],
  he: 12,
  mos: [
    ['2a\u2081 \u03C3', [[0, 2, 0, 0, 'real', 0.8], [1, 1, 0, 0, 'real', 0.4], [2, 1, 0, 0, 'real', 0.4]]],
    ['1b\u2082 \u03C3', [[0, 2, 1, 1, 'cos', 0.7], [1, 1, 0, 0, 'real', 0.5], [2, 1, 0, 0, 'real', -0.5]]],
    ['3a\u2081 lone pair', [[0, 2, 1, 0, 'real', 0.85], [1, 1, 0, 0, 'real', -0.2], [2, 1, 0, 0, 'real', -0.2]]],
    ['1b\u2081 lone pair', [[0, 2, 1, 1, 'sin', 1.0]]],
  ]
});
