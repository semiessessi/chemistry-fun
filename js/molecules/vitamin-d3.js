import { addMol, hexPos } from './core.js';

// ============================================================
// Vitamin D₃ (Cholecalciferol) — C₂₇H₄₄O — simplified
// ============================================================
{
  // Secosteroid: ring C (cyclohexane) fused to ring D (cyclopentane),
  // triene from ring C, ring A fragment with OH, side chain from ring D.
  // All coordinates explicit in xz plane.
  const b = 2.88; // C-C single bond
  const r6 = []; for (let i = 0; i < 6; i++) r6.push(hexPos(b, i));
  // Ring C using hexPos: C0-C5
  // Ring D: cyclopentane fused at C1-C2 edge of ring C
  // Midpoint of C1-C2 shared edge
  const mx12 = (r6[1][0]+r6[2][0])/2, mz12 = (r6[1][2]+r6[2][2])/2;
  // Outward direction from ring C center toward midpoint
  const ol = Math.sqrt(mx12*mx12+mz12*mz12)||1;
  const onx = mx12/ol, onz = mz12/ol;
  // 3 extra atoms for ring D, placed outward from shared edge
  const d5r = 2.40; // pentane ring radius
  // Edge direction of C1-C2
  const edx = r6[2][0]-r6[1][0], edz = r6[2][2]-r6[1][2];
  const el = Math.sqrt(edx*edx+edz*edz)||1;
  const epx = -edz/el, epz = edx/el; // perpendicular outward
  // Check which direction is outward (same as onx,onz)
  const dot = epx*onx + epz*onz;
  const opx = dot > 0 ? epx : -epx, opz = dot > 0 ? epz : -epz;
  // Ring D apex and two side atoms
  const d6x = r6[1][0] + opx*b*0.7, d6z = r6[1][2] + opz*b*0.7;
  const d8x = r6[2][0] + opx*b*0.7, d8z = r6[2][2] + opz*b*0.7;
  const d7x = mx12 + opx*b*1.3, d7z = mz12 + opz*b*1.3;

  // Pre-compute positions for atoms referenced later in the array
  const c9x = r6[5][0]/b*(b+2.53)*0.87, c9z = r6[5][2]/b*(b+2.53)*0.87 - 1.27;
  const c10x = r6[5][0]/b*(b+5.06)*0.80, c10z = r6[5][2]/b*(b+5.06)*0.80 - 2.54;
  const c11x = r6[5][0]/b*(b+7.59)*0.75, c11z = r6[5][2]/b*(b+7.59)*0.75 - 3.81;
  const c14x = d7x + opx*2.88, c14z = d7z + opz*2.88;
  const c15x = d7x + opx*5.76, c15z = d7z + opz*5.76;
  const c16x = d7x + opx*8.64, c16z = d7z + opz*8.64;
  const atoms = [
    // Ring C: C0-C5
    ['C', ...r6[0]], ['C', ...r6[1]], ['C', ...r6[2]], ['C', ...r6[3]],
    ['C', ...r6[4]], ['C', ...r6[5]],
    // Ring D: C6, C7 (apex), C8 — fused at C1,C2
    ['C', d6x, 0, d6z],  // 6
    ['C', d7x, 0, d7z],  // 7
    ['C', d8x, 0, d8z],  // 8
    // Triene from C5 (broken B-ring): C=C-C=C extending outward
    ['C', c9x, 0, c9z], // 9
    ['C', c10x, 0, c10z], // 10
    // Ring A fragment: 2 carbons + OH at end of triene
    ['C', c11x, 0, c11z], // 11
    ['O', c11x - 2.70, 0, c11z], // 12: OH
    ['H', c11x - 4.53, 0, c11z], // 13
    // Side chain from ring D atom 7: 3 carbons extending outward
    ['C', c14x, 0, c14z], // 14
    ['C', c15x, 0, c15z], // 15
    ['C', c16x, 0, c16z], // 16
    // Methyl groups
    ['C', r6[0][0], 2.88, r6[0][2]], // 17: CH₃ on C0
    ['C', d6x, 2.88, d6z],           // 18: CH₃ on C6
    // --- H on ring C ---
    ['H', r6[0][0], -2.06, r6[0][2]],  // 19: H on C0
    ['H', r6[1][0], -2.06, r6[1][2]],  // 20: H on C1 (junction)
    ['H', r6[2][0], -2.06, r6[2][2]],  // 21: H on C2 (junction)
    ['H', r6[3][0], 2.06, r6[3][2]],   // 22: H on C3
    ['H', r6[3][0], -2.06, r6[3][2]],  // 23: H on C3
    ['H', r6[4][0], 2.06, r6[4][2]],   // 24: H on C4
    ['H', r6[4][0], -2.06, r6[4][2]],  // 25: H on C4
    // C5: sp2 (double bond to C9), no H
    // --- H on ring D ---
    ['H', d6x, -2.06, d6z],   // 26: H on C6
    ['H', d7x, -2.06, d7z],   // 27: H on C7
    ['H', d8x, 2.06, d8z],    // 28: H on C8
    ['H', d8x, -2.06, d8z],   // 29: H on C8
    // --- H on triene ---
    ['H', c9x, 2.06, c9z],    // 30: H on C9
    ['H', c10x, -2.06, c10z], // 31: H on C10
    ['H', c11x, 2.06, c11z],  // 32: H on C11
    // --- H on side chain ---
    ['H', c14x, 2.06, c14z],  // 33: H on C14
    ['H', c14x, -2.06, c14z], // 34
    ['H', c15x, 2.06, c15z],  // 35: H on C15
    ['H', c15x, -2.06, c15z], // 36
    ['H', c16x+opx*2.06, 0, c16z+opz*2.06], // 37: H on C16 (CH₃)
    ['H', c16x, 2.06, c16z],  // 38
    ['H', c16x, -2.06, c16z], // 39
    // --- H on methyl C17 ---
    ['H', r6[0][0]+1.94, 2.88+0.68, r6[0][2]], // 40
    ['H', r6[0][0]-0.97, 2.88+1.68, r6[0][2]], // 41
    ['H', r6[0][0]-0.97, 2.88-1.00, r6[0][2]+1.78], // 42
    // --- H on methyl C18 ---
    ['H', d6x+1.94, 2.88+0.68, d6z], // 43
    ['H', d6x-0.97, 2.88+1.68, d6z], // 44
    ['H', d6x-0.97, 2.88-1.00, d6z+1.78], // 45
  ];
  const bonds = [
    [0,1],[1,2],[2,3],[3,4],[4,5],[5,0], // ring C
    [1,6],[6,7],[7,8],[8,2], // ring D
    [5,9,2],[9,10],[10,11,2],[11,12],[12,13], // triene + OH
    [7,14],[14,15],[15,16], // side chain
    [0,17],[6,18], // methyls
    // ring C H
    [0,19],[1,20],[2,21],[3,22],[3,23],[4,24],[4,25],
    // ring D H
    [6,26],[7,27],[8,28],[8,29],
    // triene H
    [9,30],[10,31],[11,32],
    // side chain H
    [14,33],[14,34],[15,35],[15,36],[16,37],[16,38],[16,39],
    // methyl H
    [17,40],[17,41],[17,42],[18,43],[18,44],[18,45],
  ];
  addMol({
    name: 'Vitamin D\u2083', category: 'Vitamin',
  pubchemCid: 5280795,
    label: 'C\u2082\u2087H\u2084\u2084O (Cholecalciferol)',
    atoms, bonds, he: 28,
    mos: [
      ['\u03C0 triene', [[5,2,1,1,'sin',0.4],[9,2,1,1,'sin',-0.4],[10,2,1,1,'sin',0.4],[11,2,1,1,'sin',-0.4]]],
      ['O lone pair', [[12,2,1,1,'cos',0.9]]],
      ['\u03C3 ring C', [[0,2,0,0,'real',0.25],[1,2,0,0,'real',0.25],[2,2,0,0,'real',0.25],[3,2,0,0,'real',0.25],[4,2,0,0,'real',0.25],[5,2,0,0,'real',0.25]]],
      ['\u03C3 ring D', [[1,2,0,0,'real',0.2],[2,2,0,0,'real',0.2],[6,2,0,0,'real',0.3],[7,2,0,0,'real',0.3],[8,2,0,0,'real',0.3]]],
    ]
  });
}
