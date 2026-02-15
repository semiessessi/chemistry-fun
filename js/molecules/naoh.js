import { addMol } from './core.js';

addMol({
  name: 'NaOH',
  label: 'NaOH (Sodium Hydroxide)',
  category: 'Inorganic',
  pubchemCid: 14798,
  atoms: [['Na', 0, 0, -3.69], ['O', 0, 0, 0], ['H', 0, 0, 1.83]],
  bonds: [[0, 1], [1, 2]],
  he: 18,
  mos: [
    ['\u03C3(Na-O)', [[0, 3, 0, 0, 'real', 0.6], [1, 2, 1, 0, 'real', 0.7]]],
    ['\u03C3(O-H)', [[1, 2, 1, 0, 'real', -0.7], [2, 1, 0, 0, 'real', 0.65]]],
    ['lone pair (px)', [[1, 2, 1, 1, 'cos', 1.0]]],
    ['lone pair (py)', [[1, 2, 1, 1, 'sin', 1.0]]],
  ]
});
