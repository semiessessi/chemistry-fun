import { addMol } from './core.js';

addMol({
  name: 'HCl',
  label: 'HCl (Hydrogen Chloride)',
  category: 'Diatomic',
  pubchemCid: 313,
  atoms: [
    ['H', 0, 0, -1.21],
    ['Cl', 0, 0, 1.21],
  ],
  bonds: [[0, 1]],
  he: 14,
  mos: [
    ['σ bond', [[0, 1, 0, 0, 'real', 0.7], [1, 3, 1, 0, 'real', -0.8]]],
    ['σ* anti', [[0, 1, 0, 0, 'real', 0.8], [1, 3, 1, 0, 'real', 0.7]]],
    ['lone pair (px)', [[1, 3, 1, 1, 'cos', 1.0]]],
    ['lone pair (py)', [[1, 3, 1, 1, 'sin', 1.0]]],
  ]
});
