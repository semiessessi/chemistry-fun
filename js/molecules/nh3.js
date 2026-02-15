import { addMol } from './core.js';

addMol({
  name: 'NH\u2083',
  label: 'NH\u2083 (Ammonia)',
  category: 'Small Organic',
  pubchemCid: 222,
  nistSource: true,
  atoms: [
    ['N', 0, 0, 0],
    ['H', 1.77, 0, -0.72],
    ['H', -0.89, 1.53, -0.72],
    ['H', -0.89, -1.53, -0.72],
  ],
  bonds: [[0, 1], [0, 2], [0, 3]],
  he: 12,
  mos: [
    ['2a\u2081 \u03C3 sym', [[0, 2, 0, 0, 'real', 0.7], [1, 1, 0, 0, 'real', 0.4], [2, 1, 0, 0, 'real', 0.4], [3, 1, 0, 0, 'real', 0.4]]],
    ['1e bond(x)', [[0, 2, 1, 1, 'cos', 0.7], [1, 1, 0, 0, 'real', 0.6], [2, 1, 0, 0, 'real', -0.3], [3, 1, 0, 0, 'real', -0.3]]],
    ['1e bond(y)', [[0, 2, 1, 1, 'sin', 0.7], [2, 1, 0, 0, 'real', 0.5], [3, 1, 0, 0, 'real', -0.5]]],
    ['lone pair', [[0, 2, 1, 0, 'real', 1.0]]],
  ]
});
