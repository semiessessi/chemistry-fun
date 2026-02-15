import { addMol } from './core.js';

addMol({
  name: 'CuO',
  label: 'CuO (Copper Oxide)',
  category: 'Metal Oxide',
  atoms: [['Cu', 0, 0, -1.63], ['O', 0, 0, 1.63]],
  bonds: [[0, 1, 2]],
  he: 20,
  mos: [
    ['\u03C3(4s-2p)', [[0, 4, 0, 0, 'real', 0.65], [1, 2, 1, 0, 'real', -0.6]]],
    ['\u03C0(dxz-px)', [[0, 3, 2, 1, 'cos', 0.75], [1, 2, 1, 1, 'cos', 0.55]]],
    ['\u03C0(dyz-py)', [[0, 3, 2, 1, 'sin', 0.75], [1, 2, 1, 1, 'sin', 0.55]]],
    ['\u03B4(dxy)', [[0, 3, 2, 2, 'sin', 1.0]]],
    ['\u03C3(dz\u00B2)', [[0, 3, 2, 0, 'real', 0.85], [1, 2, 1, 0, 'real', -0.35]]],
  ]
});
