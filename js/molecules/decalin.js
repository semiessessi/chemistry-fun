import { addMol } from './core.js';

{
  // Build like naphthalene but with chair conformations
  // 10 unique C atoms in xz plane with y offsets for chair
  const a = 2.88, s30 = a*0.5, c30 = a*Math.sqrt(3)/2;
  const dz = 0.47; // chair puckering
  // Shared edge: atoms 0 and 1 (half-spaced, corrected naphthalene layout)
  const atoms = [
    ['C', 0, dz, s30],         // 0: top shared
    ['C', 0, -dz, -s30],       // 1: bottom shared
    ['C', -c30, -dz, a],       // 2
    ['C', -c30, dz, -a],       // 3
    ['C', -2*c30, dz, s30],    // 4
    ['C', -2*c30, -dz, -s30],  // 5
    ['C', c30, -dz, a],        // 6
    ['C', c30, dz, -a],        // 7
    ['C', 2*c30, dz, s30],     // 8
    ['C', 2*c30, -dz, -s30],   // 9
  ];
  const bonds = [];
  // Left ring: 0-2-4-5-3-1
  bonds.push([0,2],[2,4],[4,5],[5,3],[3,1],[1,0]);
  // Right ring: 0-6-8-9-7-1
  bonds.push([0,6],[6,8],[8,9],[9,7],[7,1]);
  // H atoms: 1H per bridge C (0,1 -- trans junction), 2H per outer C (2-9)
  let hIdx = 10;
  for (let i = 0; i < 10; i++) {
    const cx = atoms[i][1], cy = atoms[i][2], cz = atoms[i][3];
    const isBridge = (i <= 1);
    if (isBridge) {
      // 1 axial H (trans: opposite side)
      atoms.push(['H', cx, cy + (i===0 ? -2.06 : 2.06), cz]);
      bonds.push([i, hIdx++]);
    } else {
      // Axial H
      atoms.push(['H', cx, cy + ((i%2===0)?2.06:-2.06), cz]);
      bonds.push([i, hIdx++]);
      // Equatorial H (outward in xz plane)
      const r = Math.sqrt(cx*cx+cz*cz)||1;
      atoms.push(['H', cx + cx/r*1.8, cy, cz + cz/r*1.8]);
      bonds.push([i, hIdx++]);
    }
  }
  addMol({
    name: 'Decalin',
    category: 'Cyclic',
  pubchemCid: 10132,
    atoms,
    bonds,
    he: 28,
    mos: [
      ['\u03C3(C-C) sym', [
        [0, 2, 0, 0, 'real', 0.30], [1, 2, 0, 0, 'real', 0.30],
        [2, 2, 0, 0, 'real', 0.32], [3, 2, 0, 0, 'real', 0.32],
        [4, 2, 0, 0, 'real', 0.30], [5, 2, 0, 0, 'real', 0.30],
        [6, 2, 0, 0, 'real', 0.30], [7, 2, 0, 0, 'real', 0.30],
        [8, 2, 0, 0, 'real', 0.30], [9, 2, 0, 0, 'real', 0.30],
      ]],
      ['\u03C3(C-C) anti', [
        [0, 2, 1, 0, 'real', 0.40], [1, 2, 1, 0, 'real', -0.40],
        [2, 2, 1, 0, 'real', 0.40], [3, 2, 1, 0, 'real', -0.40],
        [4, 2, 1, 0, 'real', 0.40], [5, 2, 1, 0, 'real', -0.40],
      ]],
      ['\u03C3(C-H) sym', [
        [10, 1, 0, 0, 'real', 0.20], [11, 1, 0, 0, 'real', 0.20],
        [12, 1, 0, 0, 'real', 0.20], [13, 1, 0, 0, 'real', 0.20],
        [14, 1, 0, 0, 'real', 0.20], [15, 1, 0, 0, 'real', 0.20],
        [16, 1, 0, 0, 'real', 0.20], [17, 1, 0, 0, 'real', 0.20],
      ]],
      ['ring junction', [
        [2, 2, 1, 0, 'real', 0.65], [3, 2, 1, 0, 'real', -0.65],
      ]],
    ]
  });
}
