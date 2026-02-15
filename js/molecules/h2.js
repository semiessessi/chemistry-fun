import { addMol } from './core.js';

addMol({
  name: 'H\u2082',
  label: 'H\u2082 (Hydrogen)',
  category: 'Diatomic',
  pubchemCid: 783,
  atoms: [['H', 0, 0, -0.7], ['H', 0, 0, 0.7]],
  bonds: [[0, 1]],
  he: 10,
  mos: [
    ['\u03C3 bond', [[0, 1, 0, 0, 'real', 1], [1, 1, 0, 0, 'real', 1]]],
    ['\u03C3* anti', [[0, 1, 0, 0, 'real', 1], [1, 1, 0, 0, 'real', -1]]],
  ]
});
