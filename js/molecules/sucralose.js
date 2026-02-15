import { addMol, chairHexPos, pentPos } from './core.js';

// ============================================================
// Sucralose — C₁₂H₁₉Cl₃O₈ — 42 atoms (simplified)
// ============================================================
{
  // Sucrose with 3 OH→Cl substitutions
  // Glucose ring (pyranose) + fructose ring (furanose), linked
  const R = 2.88;
  // Glucose ring: 5C + 1O in chair
  const gR = [];
  for (let i = 0; i < 6; i++) {
    const h = chairHexPos(R, i, 0.47);
    gR.push(h);
  }
  // Fructose ring: 4C + 1O (furanose, 5-membered)
  // Position fructose so glycosidic O is 2.70 from glucose C4 and 2.70 from fructose C6
  // gR[4] is glucose C4 position. Place glycosidic O 2.70 along +z from gR[4]
  const glyOz = gR[4][2] + 2.70;
  // Fructose C6 at 2.70 further along z from glycosidic O
  const fBaseZ = glyOz + 2.70;
  const fR = [];
  for (let i = 0; i < 5; i++) {
    const p = pentPos(2.40, i);
    fR.push([p[0], p[1], p[2] + fBaseZ]);
  }

  const atoms = [
    // Glucose ring: C0-C4 + O5
    ['C', ...gR[0]], ['C', ...gR[1]], ['C', ...gR[2]], ['C', ...gR[3]],
    ['C', ...gR[4]], ['O', ...gR[5]],
    // Fructose ring: C6-C9 + O10
    ['C', ...fR[0]], ['C', ...fR[1]], ['C', ...fR[2]], ['C', ...fR[3]],
    ['O', ...fR[4]],
    // Glycosidic O
    ['O', 0, 0, glyOz],
    // Cl substituents (3)
    ['Cl', gR[0][0]+3.32, gR[0][1], gR[0][2]],
    ['Cl', fR[1][0]-3.32, fR[1][1], fR[1][2]],
    ['Cl', fR[3][0]+3.32, fR[3][1], fR[3][2]],
    // OH groups (5 remaining)
    ['O', gR[1][0]-2.70, gR[1][1], gR[1][2]], ['H', gR[1][0]-4.53, gR[1][1], gR[1][2]],
    ['O', gR[2][0]+2.70, gR[2][1], gR[2][2]], ['H', gR[2][0]+4.53, gR[2][1], gR[2][2]],
    ['O', gR[3][0]-2.70, gR[3][1], gR[3][2]], ['H', gR[3][0]-4.53, gR[3][1], gR[3][2]],
    ['H', gR[0][0], gR[0][1]-2.06, gR[0][2]],     // 21: H on C0
    ['H', gR[1][0], gR[1][1]+2.06, gR[1][2]],     // 22: H on C1
    ['O', fR[2][0]-2.70, fR[2][1], fR[2][2]], ['H', fR[2][0]-4.53, fR[2][1], fR[2][2]],
    // CH₂OH on fructose
    ['C', fR[0][0], fR[0][1], fR[0][2]+2.88],
    ['O', fR[0][0]+2.70, fR[0][1], fR[0][2]+2.88+1.83],
    ['H', fR[0][0]+4.53, fR[0][1], fR[0][2]+2.88+1.83],
    // Ring H atoms
    ['H', gR[2][0], gR[2][1]-2.06, gR[2][2]],     // 28: H on C2
    ['H', gR[3][0], gR[3][1]+2.06, gR[3][2]],     // 29: H on C3
    ['H', gR[4][0], gR[4][1]-2.06, gR[4][2]],     // 30: H on C4
    ['H', fR[1][0], 2.06, fR[1][2]],               // 31: H on C7
    ['H', fR[2][0], 2.06, fR[2][2]],               // 32: H on C8
    ['H', fR[3][0], -2.06, fR[3][2]],              // 33: H on C9
    ['H', fR[0][0]+1.80, 0, fR[0][2]+2.88],        // 34: H on C25
    ['H', fR[0][0]-1.80, 0, fR[0][2]+2.88],        // 35: H on C25
  ];
  const bonds = [
    [0,1],[1,2],[2,3],[3,4],[4,5],[5,0], // glucose ring
    [6,7],[7,8],[8,9],[9,10],[10,6], // fructose ring
    [4,11],[11,6], // glycosidic linkage
    [0,12],[7,13],[9,14], // Cl
    [1,15],[15,16],[2,17],[17,18],[3,19],[19,20], // glucose OH
    [0,21],[1,22],[8,23],[23,24], // ring H (21,22) + fructose OH
    [6,25],[25,26],[26,27], // CH₂OH
    [2,28],[3,29],[4,30],[7,31],[8,32],[9,33],[25,34],[25,35], // ring + CH₂ H
  ];
  addMol({
    name: 'Sucralose', category: 'Sugar',
    label: 'C\u2081\u2082H\u2081\u2089Cl\u2083O\u2088 (Sucralose)',
    atoms, bonds, he: 30,
    mos: [
      ['\u03C3(C-Cl)', [[0,2,1,0,'real',0.5],[12,3,1,0,'real',-0.5]]],
      ['O lone pair', [[5,2,1,1,'cos',0.7],[10,2,1,1,'cos',0.7],[11,2,1,1,'cos',0.7]]],
      ['\u03C3(C-O) ring', [[0,2,0,0,'real',0.3],[1,2,0,0,'real',0.3],[2,2,0,0,'real',0.3],[3,2,0,0,'real',0.3],[4,2,0,0,'real',0.3]]],
    ]
  });
}
