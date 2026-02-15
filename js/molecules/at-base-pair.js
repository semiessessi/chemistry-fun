import { addMol, hexPos } from './core.js';

// ---- 47. Adenine-Thymine base pair (A-T) ----
// Adenine + Thymine connected by 2 H-bonds, planar in xz plane
{
  const R6 = 2.64;
  const R5 = 2.20;
  // Adenine: purine (6-ring fused with 5-ring) offset to the left
  const aOff = -8.0;
  const aAtoms = [];
  // 6-ring
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = hexPos(R6, i);
    aAtoms.push([i === 0 || i === 2 ? 'N' : 'C', x + aOff, 0, z]);
  }
  // 5-ring fused at atoms 3,4 (extending right toward thymine)
  const c4 = aAtoms[3], c5 = aAtoms[4];
  const mid5x = (c4[1] + c5[1]) / 2, mid5z = (c4[3] + c5[3]) / 2;
  const outx = mid5x - aOff, outz = mid5z;
  const outL = Math.sqrt(outx * outx + outz * outz) || 1;
  const onx = outx / outL, onz = outz / outL;
  const ext5 = R5 * 0.95;
  const perpx5 = -(c5[3] - c4[3]), perpz5 = c5[1] - c4[1];
  const pL5 = Math.sqrt(perpx5 * perpx5 + perpz5 * perpz5) || 1;
  const px5 = perpx5 / pL5, pz5 = perpz5 / pL5;
  aAtoms.push(['N', c5[1] + onx * ext5 * 0.85 + px5 * ext5 * 0.35, 0, c5[3] + onz * ext5 * 0.85 + pz5 * ext5 * 0.35]); // 6: N7
  aAtoms.push(['C', mid5x + onx * ext5 * 1.5, 0, mid5z + onz * ext5 * 1.5]); // 7: C8
  aAtoms.push(['N', c4[1] + onx * ext5 * 0.85 - px5 * ext5 * 0.35, 0, c4[3] + onz * ext5 * 0.85 - pz5 * ext5 * 0.35]); // 8: N9
  // NH₂ on C6 (atom 5)
  aAtoms.push(['N', aAtoms[5][1] + (aAtoms[5][1] - aOff) / R6 * 2.49, 0, aAtoms[5][3] + (aAtoms[5][3]) / R6 * 2.49]); // 9: NH₂ N
  aAtoms.push(['H', aAtoms[9][1] - 0.5, 0, aAtoms[9][3] + 1.60]); // 10
  aAtoms.push(['H', aAtoms[9][1] - 0.5, 0, aAtoms[9][3] - 1.60]); // 11
  // H on C2, C8, N9
  aAtoms.push(['H', aAtoms[1][1] - 2.06, 0, aAtoms[1][3]]); // 12: H-C2
  aAtoms.push(['H', aAtoms[7][1] + onx * 2.06, 0, aAtoms[7][3] + onz * 2.06]); // 13: H-C8
  aAtoms.push(['H', aAtoms[8][1] + onx * 1.0 - px5 * 1.5, 0, aAtoms[8][3] + onz * 1.0 - pz5 * 1.5]); // 14: H-N9

  // Thymine: 6-membered ring offset to the right
  const tOff = 8.0;
  const tAtoms = [];
  // N1-C2-N3-C4-C5-C6
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = hexPos(R6, i);
    const elem = (i === 0 || i === 2) ? 'N' : 'C';
    tAtoms.push([elem, x + tOff, 0, z]);
  }
  // C=O on C2 and C4
  const tOR = R6 + 2.27;
  tAtoms.push(['O', ...hexPos(tOR, 1).map((v, j) => j === 0 ? v + tOff : v)]); // 6: O on C2
  tAtoms.push(['O', ...hexPos(tOR, 3).map((v, j) => j === 0 ? v + tOff : v)]); // 7: O on C4
  // CH₃ on C5
  const [c5tx, , c5tz] = hexPos(R6 + 2.88, 4);
  tAtoms.push(['C', c5tx + tOff, 0, c5tz]); // 8: methyl C
  tAtoms.push(['H', c5tx + tOff + 1.0, 1.68, c5tz - 0.5]); // 9
  tAtoms.push(['H', c5tx + tOff + 1.0, -1.68, c5tz - 0.5]); // 10
  tAtoms.push(['H', c5tx + tOff - 0.5, 0, c5tz - 1.90]); // 11
  // H on N1, N3, C6
  tAtoms.push(['H', ...hexPos(R6 + 1.91, 0).map((v, j) => j === 0 ? v + tOff : v)]); // 12: H-N1
  tAtoms.push(['H', ...hexPos(R6 + 1.91, 2).map((v, j) => j === 0 ? v + tOff : v)]); // 13: H-N3
  tAtoms.push(['H', ...hexPos(R6 + 2.06, 5).map((v, j) => j === 0 ? v + tOff : v)]); // 14: H-C6

  // Combine atoms: adenine (0-14), thymine (15-29)
  const allAtoms = [...aAtoms, ...tAtoms];
  const tBase = aAtoms.length; // 15

  // Bonds
  const allBonds = [];
  // Adenine 6-ring
  for (let i = 0; i < 6; i++) allBonds.push([i, (i + 1) % 6, 1.5]);
  // Adenine 5-ring
  allBonds.push([4, 6, 1.5], [6, 7, 1.5], [7, 8, 1.5], [8, 3, 1.5]);
  // Adenine substituent bonds
  allBonds.push([5, 9]); allBonds.push([9, 10]); allBonds.push([9, 11]);
  allBonds.push([1, 12]); allBonds.push([7, 13]); allBonds.push([8, 14]);
  // Thymine 6-ring
  for (let i = 0; i < 6; i++) allBonds.push([tBase + i, tBase + (i + 1) % 6, 1.5]);
  // Thymine substituents
  allBonds.push([tBase + 1, tBase + 6, 2]); // C2=O
  allBonds.push([tBase + 3, tBase + 7, 2]); // C4=O
  allBonds.push([tBase + 4, tBase + 8]);    // C5-CH₃
  allBonds.push([tBase + 8, tBase + 9]); allBonds.push([tBase + 8, tBase + 10]); allBonds.push([tBase + 8, tBase + 11]);
  allBonds.push([tBase + 0, tBase + 12]); allBonds.push([tBase + 2, tBase + 13]); allBonds.push([tBase + 5, tBase + 14]);
  // H-bonds (between adenine and thymine)
  allBonds.push([9, tBase + 7, 0.5]);   // A-NH₂ ... O=C4(T)
  allBonds.push([0, tBase + 12, 0.5]);  // A-N1 ... H-N1(T)

  addMol({
    name: 'A-T base pair',
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
        [tBase, 2, 1, 1, 'sin', 0.25], [tBase + 1, 2, 1, 1, 'sin', 0.25],
        [tBase + 2, 2, 1, 1, 'sin', 0.25], [tBase + 3, 2, 1, 1, 'sin', 0.25],
        [tBase + 4, 2, 1, 1, 'sin', 0.28], [tBase + 5, 2, 1, 1, 'sin', 0.28],
      ]],
      ['H-bond \u03C3', [
        [9, 2, 1, 0, 'real', 0.5], [tBase + 7, 2, 1, 0, 'real', -0.4],
        [0, 2, 1, 0, 'real', 0.4], [tBase, 2, 1, 0, 'real', -0.3],
      ]],
      ['lone pairs', [
        [0, 2, 1, 0, 'real', 0.45], [2, 2, 1, 0, 'real', 0.45],
        [tBase + 6, 2, 1, 0, 'real', 0.40], [tBase + 7, 2, 1, 0, 'real', 0.40],
      ]],
      ['\u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.22], [1, 2, 0, 0, 'real', 0.22],
        [2, 2, 0, 0, 'real', 0.22], [3, 2, 0, 0, 'real', 0.22],
        [4, 2, 0, 0, 'real', 0.22], [5, 2, 0, 0, 'real', 0.22],
        [tBase, 2, 0, 0, 'real', 0.22], [tBase + 1, 2, 0, 0, 'real', 0.22],
        [tBase + 2, 2, 0, 0, 'real', 0.22], [tBase + 3, 2, 0, 0, 'real', 0.22],
        [tBase + 4, 2, 0, 0, 'real', 0.22], [tBase + 5, 2, 0, 0, 'real', 0.22],
      ]],
    ]
  });
}
