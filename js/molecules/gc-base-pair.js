import { addMol, hexPos } from './core.js';

// ---- 48. Guanine-Cytosine base pair (G-C) ----
// Guanine + Cytosine connected by 3 H-bonds, planar in xz plane
{
  const R6 = 2.64;
  const R5 = 2.20;
  // Guanine: purine base (6-ring + 5-ring) on the left
  const gOff = -8.0;
  const gAtoms = [];
  // 6-ring: N1 C2 N3 C4 C5 C6
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = hexPos(R6, i);
    gAtoms.push([(i === 0 || i === 2) ? 'N' : 'C', x + gOff, 0, z]);
  }
  // 5-ring fused at C4,C5 (atoms 3,4)
  const gc4 = gAtoms[3], gc5 = gAtoms[4];
  const gmidx = (gc4[1] + gc5[1]) / 2, gmidz = (gc4[3] + gc5[3]) / 2;
  const goutx = gmidx - gOff, goutz = gmidz;
  const goutL = Math.sqrt(goutx * goutx + goutz * goutz) || 1;
  const gonx = goutx / goutL, gonz = goutz / goutL;
  const gext = R5 * 0.95;
  const gperpx = -(gc5[3] - gc4[3]), gperpz = gc5[1] - gc4[1];
  const gpL = Math.sqrt(gperpx * gperpx + gperpz * gperpz) || 1;
  const gpx = gperpx / gpL, gpz = gperpz / gpL;
  gAtoms.push(['N', gc5[1] + gonx * gext * 0.85 + gpx * gext * 0.35, 0, gc5[3] + gonz * gext * 0.85 + gpz * gext * 0.35]); // 6: N7
  gAtoms.push(['C', gmidx + gonx * gext * 1.5, 0, gmidz + gonz * gext * 1.5]); // 7: C8
  gAtoms.push(['N', gc4[1] + gonx * gext * 0.85 - gpx * gext * 0.35, 0, gc4[3] + gonz * gext * 0.85 - gpz * gext * 0.35]); // 8: N9
  // C=O on C6 (atom 5)
  const goDir = [(gAtoms[5][1] - gOff), gAtoms[5][3]];
  const goDL = Math.sqrt(goDir[0] ** 2 + goDir[1] ** 2) || 1;
  gAtoms.push(['O', gAtoms[5][1] + goDir[0] / goDL * 2.27, 0, gAtoms[5][3] + goDir[1] / goDL * 2.27]); // 9: O on C6
  // NH₂ on C2 (atom 1), outward from ring center
  const gc2out = hexPos(1.0, 1); // unit outward direction for C2
  gAtoms.push(['N', gAtoms[1][1] + gc2out[0] * 2.49, 0, gAtoms[1][3] + gc2out[2] * 2.49]); // 10: NH₂
  gAtoms.push(['H', gAtoms[10][1] + gc2out[0] * 0.5 - gc2out[2] * 1.60, 0, gAtoms[10][3] + gc2out[2] * 0.5 + gc2out[0] * 1.60]); // 11
  gAtoms.push(['H', gAtoms[10][1] + gc2out[0] * 0.5 + gc2out[2] * 1.60, 0, gAtoms[10][3] + gc2out[2] * 0.5 - gc2out[0] * 1.60]); // 12
  // H on N1, C8, N9
  gAtoms.push(['H', gAtoms[0][1] - 1.91, 0, gAtoms[0][3]]); // 13: H-N1
  gAtoms.push(['H', gAtoms[7][1] + gonx * 2.06, 0, gAtoms[7][3] + gonz * 2.06]); // 14: H-C8
  gAtoms.push(['H', gAtoms[8][1] + gonx * 1.0 - gpx * 1.5, 0, gAtoms[8][3] + gonz * 1.0 - gpz * 1.5]); // 15: H-N9

  // Cytosine: 6-membered ring on the right
  const cOff = 8.0;
  const cAtoms = [];
  // N1 C2 N3 C4 C5 C6
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = hexPos(R6, i);
    cAtoms.push([(i === 0 || i === 2) ? 'N' : 'C', x + cOff, 0, z]);
  }
  // C=O on C2 (atom 1)
  const coDir = [(cAtoms[1][1] - cOff), cAtoms[1][3]];
  const coDL = Math.sqrt(coDir[0] ** 2 + coDir[1] ** 2) || 1;
  cAtoms.push(['O', cAtoms[1][1] + coDir[0] / coDL * 2.27, 0, cAtoms[1][3] + coDir[1] / coDL * 2.27]); // 6: O on C2
  // NH₂ on C4 (atom 3)
  const cnDir = [(cAtoms[3][1] - cOff), cAtoms[3][3]];
  const cnDL = Math.sqrt(cnDir[0] ** 2 + cnDir[1] ** 2) || 1;
  cAtoms.push(['N', cAtoms[3][1] + cnDir[0] / cnDL * 2.49, 0, cAtoms[3][3] + cnDir[1] / cnDL * 2.49]); // 7: NH₂
  cAtoms.push(['H', cAtoms[7][1] + 0.5, 0, cAtoms[7][3] + 1.60]); // 8
  cAtoms.push(['H', cAtoms[7][1] + 0.5, 0, cAtoms[7][3] - 1.60]); // 9
  // H on N1, C5, C6
  cAtoms.push(['H', ...hexPos(R6 + 1.91, 0).map((v, j) => j === 0 ? v + cOff : v)]); // 10: H-N1
  cAtoms.push(['H', ...hexPos(R6 + 2.06, 4).map((v, j) => j === 0 ? v + cOff : v)]); // 11: H-C5
  cAtoms.push(['H', ...hexPos(R6 + 2.06, 5).map((v, j) => j === 0 ? v + cOff : v)]); // 12: H-C6

  const gBase = 0;
  const cBase = gAtoms.length; // 16
  const allAtoms = [...gAtoms, ...cAtoms];
  const allBonds = [];
  // Guanine 6-ring
  for (let i = 0; i < 6; i++) allBonds.push([i, (i + 1) % 6, 1.5]);
  // Guanine 5-ring
  allBonds.push([4, 6, 1.5], [6, 7, 1.5], [7, 8, 1.5], [8, 3, 1.5]);
  // Guanine substituents
  allBonds.push([5, 9, 2]); // C6=O
  allBonds.push([1, 10]); allBonds.push([10, 11]); allBonds.push([10, 12]); // C2-NH₂
  allBonds.push([0, 13]); allBonds.push([7, 14]); allBonds.push([8, 15]);
  // Cytosine 6-ring
  for (let i = 0; i < 6; i++) allBonds.push([cBase + i, cBase + (i + 1) % 6, 1.5]);
  // Cytosine substituents
  allBonds.push([cBase + 1, cBase + 6, 2]); // C2=O
  allBonds.push([cBase + 3, cBase + 7]); allBonds.push([cBase + 7, cBase + 8]); allBonds.push([cBase + 7, cBase + 9]);
  allBonds.push([cBase + 0, cBase + 10]); allBonds.push([cBase + 4, cBase + 11]); allBonds.push([cBase + 5, cBase + 12]);
  // 3 H-bonds
  allBonds.push([9, cBase + 7, 0.5]);   // G-O6 ... H₂N-C4(C)
  allBonds.push([13, cBase + 6, 0.5]);  // G-H-N1 ... O=C2(C)
  allBonds.push([10, cBase + 10, 0.5]); // G-NH₂ ... H-N1(C)

  addMol({
    name: 'G-C base pair',
    category: 'DNA/RNA Base',
    atoms: allAtoms,
    bonds: allBonds,
    he: 32,
    mos: [
      ['\u03C0 system', [
        [0, 2, 1, 1, 'sin', 0.25], [1, 2, 1, 1, 'sin', 0.25],
        [2, 2, 1, 1, 'sin', 0.25], [3, 2, 1, 1, 'sin', 0.28],
        [4, 2, 1, 1, 'sin', 0.28], [5, 2, 1, 1, 'sin', 0.25],
        [6, 2, 1, 1, 'sin', 0.25], [7, 2, 1, 1, 'sin', 0.25],
        [8, 2, 1, 1, 'sin', 0.25],
        [cBase, 2, 1, 1, 'sin', 0.28], [cBase + 1, 2, 1, 1, 'sin', 0.28],
        [cBase + 2, 2, 1, 1, 'sin', 0.28], [cBase + 3, 2, 1, 1, 'sin', 0.28],
        [cBase + 4, 2, 1, 1, 'sin', 0.30], [cBase + 5, 2, 1, 1, 'sin', 0.30],
      ]],
      ['H-bond \u03C3', [
        [9, 2, 1, 0, 'real', 0.45], [cBase + 7, 2, 1, 0, 'real', -0.35],
        [0, 2, 1, 0, 'real', 0.40], [cBase + 6, 2, 1, 0, 'real', -0.35],
        [10, 2, 1, 0, 'real', 0.35], [cBase, 2, 1, 0, 'real', -0.30],
      ]],
      ['C=O \u03C0', [
        [5, 2, 1, 1, 'sin', 0.55], [9, 2, 1, 1, 'sin', 0.55],
        [cBase + 1, 2, 1, 1, 'sin', 0.55], [cBase + 6, 2, 1, 1, 'sin', 0.55],
      ]],
      ['lone pairs', [
        [9, 2, 1, 0, 'real', 0.45], [cBase + 6, 2, 1, 0, 'real', 0.45],
        [2, 2, 1, 0, 'real', 0.35], [cBase + 2, 2, 1, 0, 'real', 0.35],
      ]],
    ]
  });
}
