import { addMol } from './core.js';

addMol({
  name: 'CH₃OH',
  label: 'CH₃OH (Methanol)',
  category: 'Small Organic',
  pubchemCid: 887,
  atoms: [
    ['O', 0, 0, 1.34],
    ['C', 0, 0, -1.34],
    ['H', -1.45, 1.29, -2.03],
    ['H', -0.37, -1.91, -2.03],
    ['H', 1.85, 0.63, -2.01],
    ['H', -1.66, -0.56, 1.88],
  ],
  bonds: [
    [0, 1], [0, 5], [1, 2], [1, 3],
    [1, 4],
  ],
  he: 12,
  mos: [
    ['O lone pair', [[0, 2, 1, 1, 'sin', 0.7]]],
    ['σ frame', [[0, 2, 0, 0, 'real', 0.35], [1, 2, 0, 0, 'real', 0.35]]],
  ]
});
