import { addMol } from './core.js';

addMol({
  name: 'CO',
  label: 'CO (Carbon Monoxide)',
  category: 'Diatomic',
  pubchemCid: 281,
  atoms: [
    ['C', 0, 0, -1.07],
    ['O', 0, 0, 1.07],
  ],
  bonds: [[0, 1, 3]],
  he: 16,
  mos: [
    ['\u03C3(2s)', [[0, 2, 0, 0, 'real', 0.55], [1, 2, 0, 0, 'real', 0.85]]],
    ['\u03C3*(2s)', [[0, 2, 0, 0, 'real', 0.85], [1, 2, 0, 0, 'real', -0.55]]],
    ['\u03C0(2p)', [[0, 2, 1, 1, 'cos', 0.6], [1, 2, 1, 1, 'cos', 0.8]]],
    ['\u03C3(2p)', [[0, 2, 1, 0, 'real', 0.6], [1, 2, 1, 0, 'real', -0.8]]],
    ['5\u03C3 HOMO', [[0, 2, 0, 0, 'real', 0.7], [0, 2, 1, 0, 'real', 0.5], [1, 2, 0, 0, 'real', -0.3]]],
  ]
});
