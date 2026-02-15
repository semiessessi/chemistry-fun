import { addMol } from './core.js';

addMol({
  name: 'H\u2082S',
  label: 'H\u2082S (Hydrogen Sulfide)',
  category: 'Triatomic',
  pubchemCid: 402,
  nistSource: true,
  atoms: [
    ['S', 0, 0, 0],
    ['H', 1.82, 0, 1.75],
    ['H', -1.82, 0, 1.75],
  ],
  bonds: [[0, 1], [0, 2]],
  he: 16,
  mos: [
    ['\u03C3 bond', [[0, 3, 1, 1, 'cos', 0.7], [1, 1, 0, 0, 'real', 0.5], [2, 1, 0, 0, 'real', 0.5]]],
    ["\u03C3' bond", [[0, 3, 1, 1, 'cos', 0.7], [1, 1, 0, 0, 'real', 0.5], [2, 1, 0, 0, 'real', -0.5]]],
    ['lone pair (pz)', [[0, 3, 1, 0, 'real', 1.0]]],
    ['lone pair (py)', [[0, 3, 1, 1, 'sin', 1.0]]],
  ]
});
