import { addMol, hexPos } from './core.js';

{
  const R = 2.64;
  const HR = 2.06; // C-H distance
  // Left ring centered at (-R*cos(30°), 0, 0), right ring at (+R*cos(30°), 0, 0)
  const dx = R * Math.cos(Math.PI / 6); // ~2.29, offset between ring centers
  const atoms = [];
  const bonds = [];
  // Left ring: positions 0-5
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = hexPos(R, i);
    atoms.push(['C', x - dx, y, z]);
  }
  // Right ring: positions 6-11 (shares edge with left ring at atoms 2,3)
  // But we need shared atoms. Atoms 2 and 3 of left ring = atoms at positions 2,3.
  // Right ring shares these two, plus 4 new atoms.
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = hexPos(R, i);
    atoms.push(['C', x + dx, y, z]);
  }
  // Now atoms 2 (left) and 6 (right at pos 0) nearly overlap; same for 3 and 11.
  // Actually let's build it more carefully: naphthalene has 10 unique C atoms.
  // Let me rebuild properly.
  atoms.length = 0;
  // Naphthalene: 10 carbons in two fused hexagons
  // Atom layout (xz plane, z up):
  //   Shared edge is vertical. Left ring: 0,1,2,3,4,5. Right ring: 2,3,6,7,8,9
  const a = 2.64; // C-C aromatic distance
  const s30 = Math.sin(Math.PI / 6) * a; // a/2
  const c30 = Math.cos(Math.PI / 6) * a; // a*sqrt(3)/2
  atoms.push(['C', 0, 0, s30]);         // 0: top of shared edge
  atoms.push(['C', 0, 0, -s30]);        // 1: bottom of shared edge
  atoms.push(['C', -c30, 0, a]);        // 2
  atoms.push(['C', -c30, 0, -a]);       // 3
  atoms.push(['C', -2 * c30, 0, s30]);  // 4
  atoms.push(['C', -2 * c30, 0, -s30]); // 5
  atoms.push(['C', c30, 0, a]);         // 6
  atoms.push(['C', c30, 0, -a]);        // 7
  atoms.push(['C', 2 * c30, 0, s30]);   // 8
  atoms.push(['C', 2 * c30, 0, -s30]);  // 9
  // H atoms on outer carbons (2,3,4,5,6,7,8,9)
  const addH = (ci, dirx, dirz) => {
    const at = atoms[ci];
    atoms.push(['H', at[1] + dirx * HR, 0, at[3] + dirz * HR]);
  };
  addH(2, -0.5, 0.87);  // 10
  addH(3, -0.5, -0.87); // 11
  addH(4, -1.0, 0);     // 12
  addH(5, -1.0, 0);     // 13
  addH(6, 0.5, 0.87);   // 14
  addH(7, 0.5, -0.87);  // 15
  addH(8, 1.0, 0);      // 16
  addH(9, 1.0, 0);      // 17
  // Left ring bonds: 0-2, 2-4, 4-5, 5-3, 3-1, 1-0
  bonds.push([0, 2, 1.5], [2, 4, 1.5], [4, 5, 1.5], [5, 3, 1.5], [3, 1, 1.5], [1, 0, 1.5]);
  // Right ring bonds: 0-6, 6-8, 8-9, 9-7, 7-1, (1-0 shared)
  bonds.push([0, 6, 1.5], [6, 8, 1.5], [8, 9, 1.5], [9, 7, 1.5], [7, 1, 1.5]);
  // C-H bonds
  for (let i = 10; i <= 17; i++) bonds.push([i - 8, i]);
  // Fix: C-H bonds map: 10→2, 11→3, 12→4, 13→5, 14→6, 15→7, 16→8, 17→9
  bonds.length -= 8; // remove wrong ones
  bonds.push([2, 10], [3, 11], [4, 12], [5, 13], [6, 14], [7, 15], [8, 16], [9, 17]);
  addMol({
    name: 'Naphthalene',
    category: 'Aromatic',
  pubchemCid: 931,
    atoms: [
    ['C', 0, 0, 1.34],
    ['C', 0, 0, -1.34],
    ['C', -2.31, 0, 2.63],
    ['C', -2.31, 0, -2.63],
    ['C', -4.6, 0, 1.31],
    ['C', -4.6, 0, -1.31],
    ['C', 2.31, 0, 2.63],
    ['C', 2.31, 0, -2.63],
    ['C', 4.6, 0, 1.31],
    ['C', 4.6, 0, -1.31],
    ['H', -2.36, 0, 4.69],
    ['H', -2.36, 0, -4.69],
    ['H', -6.37, 0, 2.34],
    ['H', -6.37, 0, -2.34],
    ['H', 2.36, 0, 4.69],
    ['H', 2.36, 0, -4.69],
    ['H', 6.37, 0, 2.34],
    ['H', 6.37, 0, -2.34],
  ],
    bonds,
    he: 24,
    mos: [
      ['\u03C0\u2081 all bond', [
        [0, 2, 1, 1, 'sin', 0.35], [1, 2, 1, 1, 'sin', 0.35],
        [2, 2, 1, 1, 'sin', 0.32], [3, 2, 1, 1, 'sin', 0.32],
        [4, 2, 1, 1, 'sin', 0.30], [5, 2, 1, 1, 'sin', 0.30],
        [6, 2, 1, 1, 'sin', 0.32], [7, 2, 1, 1, 'sin', 0.32],
        [8, 2, 1, 1, 'sin', 0.30], [9, 2, 1, 1, 'sin', 0.30],
      ]],
      ['\u03C0\u2082 (1 node)', [
        [0, 2, 1, 1, 'sin', 0.40], [1, 2, 1, 1, 'sin', -0.40],
        [2, 2, 1, 1, 'sin', 0.30], [3, 2, 1, 1, 'sin', -0.30],
        [4, 2, 1, 1, 'sin', 0.0], [5, 2, 1, 1, 'sin', 0.0],
        [6, 2, 1, 1, 'sin', 0.30], [7, 2, 1, 1, 'sin', -0.30],
        [8, 2, 1, 1, 'sin', 0.0], [9, 2, 1, 1, 'sin', 0.0],
      ]],
      ['\u03C0\u2083 (2 nodes)', [
        [0, 2, 1, 1, 'sin', 0.0], [1, 2, 1, 1, 'sin', 0.0],
        [2, 2, 1, 1, 'sin', 0.35], [3, 2, 1, 1, 'sin', 0.35],
        [4, 2, 1, 1, 'sin', -0.35], [5, 2, 1, 1, 'sin', -0.35],
        [6, 2, 1, 1, 'sin', -0.35], [7, 2, 1, 1, 'sin', -0.35],
        [8, 2, 1, 1, 'sin', 0.35], [9, 2, 1, 1, 'sin', 0.35],
      ]],
      ['\u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.28], [1, 2, 0, 0, 'real', 0.28],
        [2, 2, 0, 0, 'real', 0.28], [3, 2, 0, 0, 'real', 0.28],
        [4, 2, 0, 0, 'real', 0.28], [5, 2, 0, 0, 'real', 0.28],
        [6, 2, 0, 0, 'real', 0.28], [7, 2, 0, 0, 'real', 0.28],
        [8, 2, 0, 0, 'real', 0.28], [9, 2, 0, 0, 'real', 0.28],
        [10, 1, 0, 0, 'real', 0.15], [11, 1, 0, 0, 'real', 0.15],
        [12, 1, 0, 0, 'real', 0.15], [13, 1, 0, 0, 'real', 0.15],
        [14, 1, 0, 0, 'real', 0.15], [15, 1, 0, 0, 'real', 0.15],
        [16, 1, 0, 0, 'real', 0.15], [17, 1, 0, 0, 'real', 0.15],
      ]],
    ]
  });
}
