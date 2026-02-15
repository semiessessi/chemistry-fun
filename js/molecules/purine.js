import { addMol, hexPos } from './core.js';

{
  const R6 = 2.64;
  const R5 = 2.20;
  // 6-ring: positions 0-5; atoms: N1 C2 N3 C4 C5 C6
  const r6 = [];
  for (let i = 0; i < 6; i++) r6.push(hexPos(R6, i));
  // 5-ring fused at C4-C5 edge (indices 3,4 in 6-ring)
  // Need to build 5-ring sharing atoms 3 and 4, extending outward
  const c4 = r6[3], c5 = r6[4];
  const midx = (c4[0] + c5[0]) / 2, midz = (c4[2] + c5[2]) / 2;
  // Direction outward from ring center
  const cx6 = 0, cz6 = 0; // center of 6-ring
  const outx = midx - cx6, outz = midz - cz6;
  const outLen = Math.sqrt(outx * outx + outz * outz);
  const nx = outx / outLen, nz = outz / outLen;
  // 5-ring extra atoms: N7, C8, N9
  const ext = R5 * 0.95;
  const perpx = -(c5[2] - c4[2]), perpz = c5[0] - c4[0];
  const pLen = Math.sqrt(perpx * perpx + perpz * perpz);
  const px = perpx / pLen, pz = perpz / pLen;
  const n7 = [c5[0] + nx * ext * 0.85 + px * ext * 0.35, 0, c5[2] + nz * ext * 0.85 + pz * ext * 0.35];
  const c8 = [midx + nx * ext * 1.5, 0, midz + nz * ext * 1.5];
  const n9 = [c4[0] + nx * ext * 0.85 - px * ext * 0.35, 0, c4[2] + nz * ext * 0.85 - pz * ext * 0.35];
  addMol({
    name: 'Purine',
    category: 'Aromatic',
  pubchemCid: 1044,
    atoms: [
    ['N', 0.79, 0, 0.53],
    ['C', 1.92, 0, 1.26],
    ['N', 0.66, 0, 0.45],
    ['C', -1.4, 0, -0.89],
    ['C', -1.28, 0, -0.81],
    ['C', -3.34, 0, -2.14],
    ['N', -3.02, 0, -1.94],
    ['C', -4.85, 0, -3.11],
    ['N', -5.11, 0, -3.28],
    ['H', 3.63, 0, 2.36],
    ['H', 1.18, 0, 0.78],
    ['H', -6.3, 0, -4.05],
    ['H', -3.54, 0, -2.27],
  ],
    bonds: [
      // 6-ring
      [0, 1, 1.5], [1, 2, 1.5], [2, 3, 1.5], [3, 4, 1.5], [4, 5, 1.5], [5, 0, 1.5],
      // 5-ring
      [4, 6, 1.5], [6, 7, 1.5], [7, 8, 1.5], [8, 3, 1.5],
      // C-H and N-H
      [1, 9], [5, 10], [7, 11], [8, 12],
    ],
    he: 22,
    mos: [
      ['\u03C0\u2081 all bond', [
        [0, 2, 1, 1, 'sin', 0.33], [1, 2, 1, 1, 'sin', 0.33],
        [2, 2, 1, 1, 'sin', 0.33], [3, 2, 1, 1, 'sin', 0.38],
        [4, 2, 1, 1, 'sin', 0.38], [5, 2, 1, 1, 'sin', 0.33],
        [6, 2, 1, 1, 'sin', 0.33], [7, 2, 1, 1, 'sin', 0.33],
        [8, 2, 1, 1, 'sin', 0.33],
      ]],
      ['\u03C0\u2082 (1 node)', [
        [0, 2, 1, 1, 'sin', 0.40], [1, 2, 1, 1, 'sin', 0.20],
        [2, 2, 1, 1, 'sin', -0.20], [3, 2, 1, 1, 'sin', -0.35],
        [4, 2, 1, 1, 'sin', 0.35], [5, 2, 1, 1, 'sin', 0.40],
        [6, 2, 1, 1, 'sin', 0.25], [7, 2, 1, 1, 'sin', -0.25],
        [8, 2, 1, 1, 'sin', -0.35],
      ]],
      ['N lone pair', [[0, 2, 1, 0, 'real', 0.5], [2, 2, 1, 0, 'real', 0.5], [6, 2, 1, 0, 'real', 0.35]]],
      ['\u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.28], [1, 2, 0, 0, 'real', 0.28],
        [2, 2, 0, 0, 'real', 0.28], [3, 2, 0, 0, 'real', 0.28],
        [4, 2, 0, 0, 'real', 0.28], [5, 2, 0, 0, 'real', 0.28],
        [6, 2, 0, 0, 'real', 0.28], [7, 2, 0, 0, 'real', 0.28],
        [8, 2, 0, 0, 'real', 0.28],
        [9, 1, 0, 0, 'real', 0.16], [10, 1, 0, 0, 'real', 0.16],
        [11, 1, 0, 0, 'real', 0.16], [12, 1, 0, 0, 'real', 0.16],
      ]],
    ]
  });
}
