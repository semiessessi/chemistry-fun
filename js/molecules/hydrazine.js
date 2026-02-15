import { addMol } from './core.js';

addMol({
  name: 'N₂H₄',
  label: 'N₂H₄ (Hydrazine)',
  category: 'Small Organic',
  pubchemCid: 9321,
  atoms: [
    ['N', 0, 0, 1.34],
    ['N', 0, 0, -1.34],
    ['H', -1.02, 1.51, 1.97],
    ['H', -0.92, -1.57, 1.98],
    ['H', -1.81, -0.15, -1.98],
    ['H', 0.92, -1.57, -1.97],
  ],
  bonds: [
    [0, 1], [0, 2], [0, 3], [1, 4],
    [1, 5],
  ],
  he: 12,
  mos: [
    ['N lone pair', [[0, 2, 1, 1, 'sin', 0.7], [1, 2, 1, 1, 'sin', 0.7]]],
    ['σ frame', [[0, 2, 0, 0, 'real', 0.35], [1, 2, 0, 0, 'real', 0.35]]],
  ]
});
