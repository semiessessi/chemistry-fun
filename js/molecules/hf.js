import { addMol } from './core.js';

addMol({
  name: 'HF',
  label: 'HF (Hydrogen Fluoride)',
  category: 'Diatomic',
  pubchemCid: 14917,
  atoms: [['H', 0, 0, -0.87], ['F', 0, 0, 0.87]],
  bonds: [[0, 1]],
  he: 14,
  mos: [
    ['\u03C3 bond', [[0, 1, 0, 0, 'real', 0.8], [1, 2, 1, 0, 'real', -0.7]]],
    ['\u03C3* anti', [[0, 1, 0, 0, 'real', 0.7], [1, 2, 1, 0, 'real', 0.8]]],
    ['lone pair (px)', [[1, 2, 1, 1, 'cos', 1.0]]],
    ['lone pair (py)', [[1, 2, 1, 1, 'sin', 1.0]]],
  ]
});
