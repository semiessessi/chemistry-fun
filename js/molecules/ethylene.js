import { addMol } from './core.js';

const C2H4_CC = 1.26;
const C2H4_CH = 2.04;
const C2H4_ANG = (121.3 * Math.PI) / 180;
const C2H4_HX_OFF = C2H4_CH * Math.sin(C2H4_ANG - Math.PI / 2);
const C2H4_HZ_OFF = C2H4_CH * Math.cos(C2H4_ANG - Math.PI / 2);
addMol({
  name: 'C\u2082H\u2084',
  label: 'C\u2082H\u2084 (Ethylene)',
  category: 'Small Organic',
  pubchemCid: 6325,
  atoms: [
    ['C', 0, 0, -C2H4_CC],
    ['C', 0, 0, C2H4_CC],
    ['H', C2H4_HX_OFF, 0, -C2H4_CC - C2H4_HZ_OFF],
    ['H', -C2H4_HX_OFF, 0, -C2H4_CC - C2H4_HZ_OFF],
    ['H', C2H4_HX_OFF, 0, C2H4_CC + C2H4_HZ_OFF],
    ['H', -C2H4_HX_OFF, 0, C2H4_CC + C2H4_HZ_OFF],
  ],
  bonds: [[0, 1, 2], [0, 2], [0, 3], [1, 4], [1, 5]],
  he: 16,
  mos: [
    ['\u03C3 C-C', [[0, 2, 1, 0, 'real', 0.7], [1, 2, 1, 0, 'real', -0.7]]],
    ['\u03C0 C=C', [[0, 2, 1, 1, 'sin', 0.7], [1, 2, 1, 1, 'sin', 0.7]]],
    ['\u03C0* C=C', [[0, 2, 1, 1, 'sin', 0.7], [1, 2, 1, 1, 'sin', -0.7]]],
    ['\u03C3 C-H', [[0, 2, 0, 0, 'real', 0.45], [1, 2, 0, 0, 'real', 0.45], [2, 1, 0, 0, 'real', 0.25], [3, 1, 0, 0, 'real', 0.25], [4, 1, 0, 0, 'real', 0.25], [5, 1, 0, 0, 'real', 0.25]]],
  ]
});
