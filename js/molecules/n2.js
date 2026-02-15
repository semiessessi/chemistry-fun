import { addMol } from './core.js';

addMol({
  name: 'N\u2082',
  label: 'N\u2082 (Nitrogen)',
  category: 'Diatomic',
  pubchemCid: 947,
  atoms: [
    ['N', 0, 0, -1.04],
    ['N', 0, 0, 1.04],
  ],
  bonds: [[0, 1, 3]],
  he: 16,
  mos: [
    ['\u03C3(2s)', [[0, 2, 0, 0, 'real', 1], [1, 2, 0, 0, 'real', 1]]],
    ['\u03C3*(2s)', [[0, 2, 0, 0, 'real', 1], [1, 2, 0, 0, 'real', -1]]],
    ['\u03C0(2p)', [[0, 2, 1, 1, 'cos', 1], [1, 2, 1, 1, 'cos', 1]]],
    ['\u03C3(2p)', [[0, 2, 1, 0, 'real', 1], [1, 2, 1, 0, 'real', -1]]],
    ['\u03C0*(2p)', [[0, 2, 1, 1, 'cos', 1], [1, 2, 1, 1, 'cos', -1]]],
  ]
});
