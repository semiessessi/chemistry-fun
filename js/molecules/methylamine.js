import { addMol } from './core.js';

addMol({
  name: 'CH₃NH₂',
  label: 'CH₃NH₂ (Methylamine)',
  category: 'Small Organic',
  pubchemCid: 6329,
  atoms: [
    ['N', 0, 0, -1.35],
    ['C', 0, 0, 1.35],
    ['H', 0.17, 1.92, 2.09],
    ['H', 1.58, -1.12, 2.08],
    ['H', -1.75, -0.82, 2.08],
    ['H', 1.62, 0.81, -2.01],
    ['H', -1.45, 1.09, -2.01],
  ],
  bonds: [
    [0, 1], [0, 5], [0, 6], [1, 2],
    [1, 3], [1, 4],
  ],
  he: 12,
  mos: [
    ['N lone pair', [[0, 2, 1, 1, 'sin', 0.7]]],
    ['σ frame', [[0, 2, 0, 0, 'real', 0.35], [1, 2, 0, 0, 'real', 0.35]]],
  ]
});
