import { addMol } from './core.js';

const NH3_R = 1.91;
const NH3_ANGLE = (107.8 * Math.PI) / 180;
const NH3_HZ = -NH3_R * Math.cos(Math.PI - NH3_ANGLE);
const NH3_HR = NH3_R * Math.sin(Math.PI - NH3_ANGLE);
addMol({
  name: 'NH\u2083',
  label: 'NH\u2083 (Ammonia)',
  category: 'Small Organic',
  atoms: [
    ['N', 0, 0, 0],
    ['H', NH3_HR, 0, NH3_HZ],
    ['H', -NH3_HR / 2, NH3_HR * Math.sqrt(3) / 2, NH3_HZ],
    ['H', -NH3_HR / 2, -NH3_HR * Math.sqrt(3) / 2, NH3_HZ],
  ],
  bonds: [[0, 1], [0, 2], [0, 3]],
  he: 12,
  mos: [
    ['2a\u2081 \u03C3 sym', [[0, 2, 0, 0, 'real', 0.7], [1, 1, 0, 0, 'real', 0.4], [2, 1, 0, 0, 'real', 0.4], [3, 1, 0, 0, 'real', 0.4]]],
    ['1e bond(x)', [[0, 2, 1, 1, 'cos', 0.7], [1, 1, 0, 0, 'real', 0.6], [2, 1, 0, 0, 'real', -0.3], [3, 1, 0, 0, 'real', -0.3]]],
    ['1e bond(y)', [[0, 2, 1, 1, 'sin', 0.7], [2, 1, 0, 0, 'real', 0.5], [3, 1, 0, 0, 'real', -0.5]]],
    ['lone pair', [[0, 2, 1, 0, 'real', 1.0]]],
  ]
});
