import { addMol, hexPos } from './core.js';

// ============================================================
// THC (Δ⁹-Tetrahydrocannabinol) — C₂₁H₃₀O₂ — simplified
// ============================================================
{
  // 3 fused 6-rings (A aromatic, B cyclohexene, C pyran) + pentyl + methyls
  const a = 2.64, s30 = a*0.5, c30 = a*Math.sqrt(3)/2;
  // Ring A aromatic: 0-5 (center at origin)
  // Ring B fused at 4-5 edge of A (right side)
  // Ring C pyran fused at 0-5 edge of A (left side)
  // Shared atoms: A shares edge 4-5 with B, and 0-5 with C
  // For 3-ring linear fusion like anthracene:
  //   Left ring A: center at (-2*c30, 0)
  //   Middle ring shares atoms, center at origin
  //   Right ring B: center at (2*c30, 0)
  // But THC has rings A,B,C sharing atom 5 (index 5 at bottom of A)
  // Simpler: build all atoms explicitly
  // Ring A (aromatic) uses corrected naphthalene layout: shared edge = a, not 2a
  // Ring B (cyclohexene) fuses at C5-C1 edge of ring A
  // Ring C (pyran) fuses at C4-C5 edge of ring A
  const atoms = [
    // Ring A (aromatic): planar in xz
    ['C', 0, 0, s30],          // 0: top
    ['C', 0, 0, -s30],         // 1: bottom
    ['C', -c30, 0, a],         // 2
    ['C', -c30, 0, -a],        // 3
    ['C', -2*c30, 0, s30],     // 4: shared with C
    ['C', -2*c30, 0, -s30],    // 5: shared with B and C
    // Ring B fused at 5-1 edge: 4 new atoms (6-9), extends to +x from 5 and 1
    ['C', -c30, 0, -a-a],      // 6
    ['C', 0, 0, -a-s30],       // 7
    ['C', c30, 0, -a],         // 8
    ['C', c30, 0, -s30-a+a],   // 9: = (c30, 0, s30) but that overlaps C0...
    // Actually, ring B fuses at edge C1-C5 which is at x=0,z=-s30 to x=-2c30,z=-s30
    // The C1-C5 edge direction is (-2c30, 0, 0). Ring B extends in -z from this edge.
    // Ring B atoms (extending below):
    //   6: (-c30, 0, -a)  -- but this is where C3 is! Conflict.
    // Actually in real THC, ring B shares edge C4a-C8a with ring A.
    // Let me use a proper 3-ring linear fusion along x:
    // Ring A centered at origin, ring B centered at (-2*c30, 0), ring C centered at (+2*c30, 0)
    // Ring A: 0-5, Ring B shares 4,5 with A, Ring C shares 0,1 with A (or vice versa)
  ];
  // Restart with cleaner geometry: 3 fused rings along x-axis
  atoms.length = 0;
  // Ring A (aromatic, center): atoms 0-5
  for (let i = 0; i < 6; i++) atoms.push(['C', ...hexPos(a, i)]); // 0-5
  // Ring B (cyclohexene) fused at C3-C4 edge (left side), extends left
  // Shared atoms: C3 and C4. New atoms: 6,7,8,9
  const c3 = hexPos(a, 3), c4 = hexPos(a, 4);
  const bm = [(c3[0]+c4[0])/2, 0, (c3[2]+c4[2])/2]; // midpoint
  const bl = Math.sqrt(bm[0]*bm[0]+bm[2]*bm[2])||1;
  const bn = [bm[0]/bl, 0, bm[2]/bl]; // outward direction
  const bed = [c4[0]-c3[0], 0, c4[2]-c3[2]]; // edge direction
  const bel = Math.sqrt(bed[0]*bed[0]+bed[2]*bed[2])||1;
  const bep = [bed[0]/bel, 0, bed[2]/bel]; // edge unit
  // Place 4 new ring B atoms extending outward from C3-C4
  atoms.push(['C', c4[0]+bn[0]*a*0.87+bep[0]*s30, 0, c4[2]+bn[2]*a*0.87+bep[2]*s30]); // 6
  atoms.push(['C', c4[0]+bn[0]*a*0.87+bn[0]*a*0.87+bep[0]*0, 0, c4[2]+bn[2]*a*0.87+bn[2]*a*0.87]); // too complex
  // Actually let me just build ring B as a translated hexagon sharing the C3-C4 edge
  // Ring B center = ring A center + 2*c30 in the outward direction from C3-C4 midpoint
  atoms.length = 6; // keep ring A
  const rbCx = bn[0]*2*c30, rbCz = bn[2]*2*c30; // ring B center offset
  // Ring B atoms in local frame, rotated to align shared edge
  // The shared edge C3-C4 in ring A should match with two adjacent atoms of ring B
  // Angle of C3: hexPos(a,3) = (a*cos(180°), 0, a*sin(180°)) = (-a, 0, 0)
  // Angle of C4: hexPos(a,4) = (a*cos(240°), 0, a*sin(240°)) = (-a/2, 0, -a*√3/2)
  // Midpoint direction from center: (-3a/4, 0, -a√3/4), normalize
  // For ring B: place its hex so that its atoms at positions 0 and 1 coincide with C4 and C3
  // Ring B hex: local angle offset so pos 0 aligns with C4 direction from ring B center
  // Ring B center is at 2*c30 in the outward direction from ring A center through the C3-C4 midpoint
  // The outward direction from midpoint of C3,C4 is: bn = normalize(mid(C3,C4))
  const rbC = [rbCx, 0, rbCz]; // ring B center
  // ring B pos 0 should be at C4, so C4 = rbC + a*[cos(θ0), 0, sin(θ0)]
  // Solve for θ0: cos(θ0) = (C4.x - rbC.x)/a, sin(θ0) = (C4.z - rbC.z)/a
  const rbTheta0 = Math.atan2(c4[2]-rbC[2], c4[0]-rbC[0]);
  // Ring B atoms: skip 0 (=C4, idx 4) and 5 (=C3, idx 3), add 1-4 as new
  for (let i = 1; i < 5; i++) {
    const ang = rbTheta0 + i * Math.PI / 3;
    atoms.push(['C', rbC[0]+a*Math.cos(ang), 0, rbC[2]+a*Math.sin(ang)]); // 6,7,8,9
  }
  // Ring C (pyran, O-containing) fused at C0-C5 edge (right side), extends right
  const c0 = hexPos(a, 0), c5 = hexPos(a, 5);
  const cm = [(c0[0]+c5[0])/2, 0, (c0[2]+c5[2])/2];
  const cl = Math.sqrt(cm[0]*cm[0]+cm[2]*cm[2])||1;
  const cn = [cm[0]/cl, 0, cm[2]/cl]; // outward direction
  const rcC = [cn[0]*2*c30, 0, cn[2]*2*c30]; // ring C center
  const rcTheta0 = Math.atan2(c5[2]-rcC[2], c5[0]-rcC[0]);
  // Ring C: pos 0 = C5 (idx 5), pos 5 = C0 (idx 0), new atoms at pos 1-4
  // But ring C is a pyran (one O): replace one atom with O
  atoms.push(['O', rcC[0]+a*Math.cos(rcTheta0+Math.PI/3), 0, rcC[2]+a*Math.sin(rcTheta0+Math.PI/3)]); // 10: O
  for (let i = 2; i < 5; i++) {
    const ang = rcTheta0 + i * Math.PI / 3;
    atoms.push(['C', rcC[0]+a*Math.cos(ang), 0, rcC[2]+a*Math.sin(ang)]); // 11,12,13
  }
  // OH on C2 (ring A, para to pentyl attachment)
  const c2 = hexPos(a, 2);
  const c2n = [c2[0]/a, 0, c2[2]/a]; // outward unit
  atoms.push(['O', c2[0]+c2n[0]*2.70, 0, c2[2]+c2n[2]*2.70]); // 14: OH
  atoms.push(['H', c2[0]+c2n[0]*4.53, 0, c2[2]+c2n[2]*4.53]); // 15
  // Pentyl chain from C0 (outward from ring A)
  const c0n = [c0[0]/a, 0, c0[2]/a]; // outward unit from C0
  for (let i = 1; i <= 5; i++) {
    atoms.push(['C', c0[0]+c0n[0]*2.88*i, 0, c0[2]+c0n[2]*2.88*i]); // 16-20
  }
  // Gem-dimethyl on C8 (ring B)
  atoms.push(['C', atoms[8][1], 2.88, atoms[8][3]]); // 21
  atoms.push(['C', atoms[8][1], -2.88, atoms[8][3]]); // 22
  // H on ring A: C1, C3
  const c1 = hexPos(a, 1);
  const c1n = [c1[0]/a, 0, c1[2]/a];
  const c3n = [c3[0]/a, 0, c3[2]/a];
  atoms.push(['H', c1[0]+c1n[0]*2.06, 0, c1[2]+c1n[2]*2.06]); // 23
  atoms.push(['H', c3[0]+c3n[0]*2.06, 0, c3[2]+c3n[2]*2.06]); // 24 (if C3 has H - check bonds)
  // H on ring B carbons (6,7,8,9): each sp3 C gets 1-2H
  // C6,C9: 2 ring bonds each + H → need 1-2H (sp3 with 2H or sp2 with 1H)
  // For cyclohexene: C6=C7 double bond, C8,C9 single. So C6,C7 are sp2 (1H), C8,C9 are sp3 (2H)
  atoms.push(['H', atoms[6][1], 2.06, atoms[6][3]]); // 25: H on C6
  atoms.push(['H', atoms[7][1], 2.06, atoms[7][3]]); // 26: H on C7
  atoms.push(['H', atoms[9][1], 2.06, atoms[9][3]]); // 27: H on C9
  atoms.push(['H', atoms[9][1], -2.06, atoms[9][3]]); // 28: H on C9
  // H on ring C non-O carbons (11,12,13): sp3, 1H each (other bond to ring)
  atoms.push(['H', atoms[11][1], 2.06, atoms[11][3]]); // 29
  atoms.push(['H', atoms[12][1], 2.06, atoms[12][3]]); // 30
  atoms.push(['H', atoms[13][1], 2.06, atoms[13][3]]); // 31
  // H on pentyl chain: 2H per CH₂ (16-19), 3H on terminal CH₃ (20)
  for (let i = 16; i <= 19; i++) {
    atoms.push(['H', atoms[i][1], 2.06, atoms[i][3]]);
    atoms.push(['H', atoms[i][1], -2.06, atoms[i][3]]);
  } // 32-39
  atoms.push(['H', atoms[20][1]+c0n[0]*2.06, 0, atoms[20][3]+c0n[2]*2.06]); // 40
  atoms.push(['H', atoms[20][1], 2.06, atoms[20][3]]); // 41
  atoms.push(['H', atoms[20][1], -2.06, atoms[20][3]]); // 42
  // H on gem-dimethyl: 3H each
  atoms.push(['H', atoms[21][1]+1.94, atoms[21][2]+0.68, atoms[21][3]]); // 43
  atoms.push(['H', atoms[21][1]-0.97, atoms[21][2]+1.68, atoms[21][3]]); // 44
  atoms.push(['H', atoms[21][1]-0.97, atoms[21][2]-1.00, atoms[21][3]+1.78]); // 45
  atoms.push(['H', atoms[22][1]+1.94, atoms[22][2]-0.68, atoms[22][3]]); // 46
  atoms.push(['H', atoms[22][1]-0.97, atoms[22][2]-1.68, atoms[22][3]]); // 47
  atoms.push(['H', atoms[22][1]-0.97, atoms[22][2]+1.00, atoms[22][3]+1.78]); // 48
  const bonds = [
    [0,1,1.5],[1,2,1.5],[2,3,1.5],[3,4,1.5],[4,5,1.5],[5,0,1.5], // ring A
    [4,6],[6,7,2],[7,8],[8,9],[9,3], // ring B (C6=C7 double)
    [5,10],[10,11],[11,12],[12,13],[13,0], // ring C pyran
    [2,14],[14,15], // OH
    [0,16],[16,17],[17,18],[18,19],[19,20], // pentyl
    [8,21],[8,22], // gem-dimethyl
    [1,23],[3,24], // ring A H
    [6,25],[7,26],[9,27],[9,28], // ring B H
    [11,29],[12,30],[13,31], // ring C H
    [16,32],[16,33],[17,34],[17,35],[18,36],[18,37],[19,38],[19,39], // pentyl CH₂ H
    [20,40],[20,41],[20,42], // pentyl CH₃
    [21,43],[21,44],[21,45],[22,46],[22,47],[22,48], // gem-dimethyl H
  ];
  addMol({
    name: 'THC', category: 'Drug',
  pubchemCid: 16078,
    label: 'C\u2082\u2081H\u2083\u2080O\u2082 (THC)',
    atoms, bonds, he: 30,
    mos: [
      ['\u03C0 ring A', [[0,2,1,1,'sin',0.33],[1,2,1,1,'sin',0.33],[2,2,1,1,'sin',0.33],[3,2,1,1,'sin',0.33],[4,2,1,1,'sin',0.33],[5,2,1,1,'sin',0.33]]],
      ['O lone pair (phenol)', [[14,2,1,1,'cos',0.8]]],
      ['O lone pair (pyran)', [[10,2,1,1,'cos',0.8]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.2],[1,2,0,0,'real',0.2],[2,2,0,0,'real',0.2],[3,2,0,0,'real',0.2],[4,2,0,0,'real',0.2],[5,2,0,0,'real',0.2],[6,2,0,0,'real',0.2],[7,2,0,0,'real',0.2],[8,2,0,0,'real',0.2],[9,2,0,0,'real',0.2]]],
    ]
  });
}
