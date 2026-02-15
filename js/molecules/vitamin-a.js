import { addMol } from './core.js';

// ============================================================
// Vitamin A (Retinol) — C₂₀H₃₀O — 51 atoms (simplified)
// ============================================================
{
  // Beta-ionone ring + polyene chain + OH
  const R = 2.88; // cyclohexene ring (not aromatic)
  const ring = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    ring.push([R * Math.cos(angle), 0, R * Math.sin(angle)]);
  }
  const atoms = [
    // Ring: C0-C5 (cyclohexene with gem-dimethyl at C0)
    ['C', ...ring[0]], ['C', ...ring[1]], ['C', ...ring[2]], ['C', ...ring[3]],
    ['C', ...ring[4]], ['C', ...ring[5]],
    // Gem-dimethyl on C0
    ['C', ring[0][0]+2.88, 1.44, ring[0][2]],
    ['C', ring[0][0]+2.88, -1.44, ring[0][2]],
    // Methyl on C1
    ['C', ring[1][0], 2.88, ring[1][2]],
    // Polyene chain from C5: alternating C=C-C=C... (11 carbons)
    ['C', ring[5][0]-2.53, 0, ring[5][2]+1.27],     // C9
    ['C', ring[5][0]-5.06, 0, ring[5][2]+1.27],     // C10
    ['C', ring[5][0]-7.59, 0, ring[5][2]+2.54],     // C11
    ['C', ring[5][0]-10.12, 0, ring[5][2]+2.54],    // C12
    ['C', ring[5][0]-12.65, 0, ring[5][2]+3.81],    // C13
    ['C', ring[5][0]-15.18, 0, ring[5][2]+3.81],    // C14 (end)
    // OH at terminal
    ['O', ring[5][0]-17.88, 0, ring[5][2]+3.81],
    ['H', ring[5][0]-19.71, 0, ring[5][2]+3.81],
    // Methyl branches on chain
    ['C', ring[5][0]-7.59, 2.88, ring[5][2]+2.54],  // 17: CH₃ on C11
    ['C', ring[5][0]-12.65, 2.88, ring[5][2]+3.81], // 18: CH₃ on C13
    // --- H on ring ---
    ['H', ring[2][0]/R*(R+2.06), 0, ring[2][2]/R*(R+2.06)], // 19: H on C2 (sp2)
    ['H', ring[3][0], 2.06, ring[3][2]],   // 20: H on C3 (sp3)
    ['H', ring[3][0], -2.06, ring[3][2]],  // 21: H on C3
    ['H', ring[4][0], 2.06, ring[4][2]],   // 22: H on C4 (sp3)
    ['H', ring[4][0], -2.06, ring[4][2]],  // 23: H on C4
    // --- H on gem-dimethyl C6 ---
    ['H', ring[0][0]+2.88+1.94, 1.44+0.68, ring[0][2]], // 24
    ['H', ring[0][0]+2.88-0.97, 1.44+1.68, ring[0][2]], // 25
    ['H', ring[0][0]+2.88-0.97, 1.44-1.00, ring[0][2]+1.78], // 26
    // --- H on gem-dimethyl C7 ---
    ['H', ring[0][0]+2.88+1.94, -1.44-0.68, ring[0][2]], // 27
    ['H', ring[0][0]+2.88-0.97, -1.44-1.68, ring[0][2]], // 28
    ['H', ring[0][0]+2.88-0.97, -1.44+1.00, ring[0][2]+1.78], // 29
    // --- H on methyl C8 ---
    ['H', ring[1][0]+1.94, 2.88+0.68, ring[1][2]], // 30
    ['H', ring[1][0]-0.97, 2.88+1.68, ring[1][2]], // 31
    ['H', ring[1][0]-0.97, 2.88-1.00, ring[1][2]+1.78], // 32
    // --- H on polyene chain ---
    ['H', ring[5][0]-2.53, 2.06, ring[5][2]+1.27],  // 33: H on C9
    ['H', ring[5][0]-5.06, -2.06, ring[5][2]+1.27], // 34: H on C10
    // C11: has methyl, no H
    ['H', ring[5][0]-10.12, -2.06, ring[5][2]+2.54], // 35: H on C12
    // C13: has methyl, no H
    ['H', ring[5][0]-15.18, 2.06, ring[5][2]+3.81],  // 36: H on C14
    ['H', ring[5][0]-15.18, -2.06, ring[5][2]+3.81], // 37: H on C14
    // --- H on methyl C17 (on C11) ---
    ['H', ring[5][0]-7.59+1.94, 2.88+0.68, ring[5][2]+2.54], // 38
    ['H', ring[5][0]-7.59-0.97, 2.88+1.68, ring[5][2]+2.54], // 39
    ['H', ring[5][0]-7.59-0.97, 2.88-1.00, ring[5][2]+2.54+1.78], // 40
    // --- H on methyl C18 (on C13) ---
    ['H', ring[5][0]-12.65+1.94, 2.88+0.68, ring[5][2]+3.81], // 41
    ['H', ring[5][0]-12.65-0.97, 2.88+1.68, ring[5][2]+3.81], // 42
    ['H', ring[5][0]-12.65-0.97, 2.88-1.00, ring[5][2]+3.81+1.78], // 43
  ];
  const bonds = [
    [0,1],[1,2,2],[2,3],[3,4],[4,5],[5,0], // ring
    [0,6],[0,7], // gem-dimethyl
    [1,8], // methyl on C1
    [5,9,2],[9,10],[10,11,2],[11,12],[12,13,2],[13,14], // polyene
    [14,15],[15,16], // OH
    [11,17],[13,18], // methyl branches
    // ring H
    [2,19],[3,20],[3,21],[4,22],[4,23],
    // gem-dimethyl H
    [6,24],[6,25],[6,26],[7,27],[7,28],[7,29],
    // methyl C8 H
    [8,30],[8,31],[8,32],
    // polyene H
    [9,33],[10,34],[12,35],[14,36],[14,37],
    // methyl branch H
    [17,38],[17,39],[17,40],[18,41],[18,42],[18,43],
  ];
  addMol({
    name: 'Vitamin A', category: 'Vitamin',
    label: 'C\u2082\u2080H\u2083\u2080O (Retinol)',
    atoms, bonds, he: 34,
    mos: [
      ['\u03C0 polyene', [[9,2,1,1,'sin',0.3],[10,2,1,1,'sin',-0.3],[11,2,1,1,'sin',0.3],[12,2,1,1,'sin',-0.3],[13,2,1,1,'sin',0.3],[14,2,1,1,'sin',-0.3]]],
      ['\u03C0(C=C) ring', [[1,2,1,1,'sin',0.5],[2,2,1,1,'sin',-0.5]]],
      ['O lone pair', [[15,2,1,1,'cos',0.9]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.2],[1,2,0,0,'real',0.2],[2,2,0,0,'real',0.2],[3,2,0,0,'real',0.2],[4,2,0,0,'real',0.2],[5,2,0,0,'real',0.2]]],
    ]
  });
}
