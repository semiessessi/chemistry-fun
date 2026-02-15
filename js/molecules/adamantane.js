import { addMol } from './core.js';

// ---- Adamantane (C₁₀H₁₆) ----
{
  // Diamond subcell: 4 bridgehead C at ±(1,1,1) even-parity,
  // 6 bridge C at midpoints of each bridgehead pair.
  // Scale so C-C = 2.88 Bohr (bridgehead-to-bridge distance).
  // Bridgeheads at (±1,±1,±1) with even parity, scaled by d/√2 where d=2.88
  const d = 2.88, sc = d / Math.sqrt(2); // ≈ 2.036
  const bh = [[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]]; // 4 bridgeheads
  // 6 bridges: midpoints of each pair of bridgeheads
  const brPairs = [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
  const atoms = [];
  const bonds = [];
  for (const b of bh) atoms.push(['C', b[0]*sc, b[1]*sc, b[2]*sc]); // 0-3
  for (const [i,j] of brPairs) {
    const mx = (bh[i][0]+bh[j][0])*sc/2;
    const my = (bh[i][1]+bh[j][1])*sc/2;
    const mz = (bh[i][2]+bh[j][2])*sc/2;
    atoms.push(['C', mx, my, mz]); // 4-9
  }
  // C-C bonds: each bridge connects to its 2 parent bridgeheads
  for (let k = 0; k < brPairs.length; k++) {
    bonds.push([brPairs[k][0], 4+k]);
    bonds.push([brPairs[k][1], 4+k]);
  }
  // 1 H per bridgehead (outward from cage center)
  for (let i = 0; i < 4; i++) {
    const [bx,by,bz] = bh[i];
    const r3 = Math.sqrt(3);
    atoms.push(['H', bx*sc + bx/r3*2.06, by*sc + by/r3*2.06, bz*sc + bz/r3*2.06]);
    bonds.push([i, 10+i]);
  }
  // 2 H per bridge (perpendicular to bond axis, pointing outward)
  for (let k = 0; k < brPairs.length; k++) {
    const ba = atoms[4+k];
    const a1 = atoms[brPairs[k][0]];
    // Bond axis direction
    const ax = a1[1]-ba[1], ay = a1[2]-ba[2], az = a1[3]-ba[3];
    const al = Math.sqrt(ax*ax+ay*ay+az*az)||1;
    const ux=ax/al, uy=ay/al, uz=az/al;
    // Reference vector not parallel to axis
    let rx=0, ry=1, rz=0;
    if (Math.abs(uy) > 0.9) { rx=1; ry=0; }
    // First perpendicular: cross(axis, ref)
    let p1x=uy*rz-uz*ry, p1y=uz*rx-ux*rz, p1z=ux*ry-uy*rx;
    const p1l = Math.sqrt(p1x*p1x+p1y*p1y+p1z*p1z)||1;
    p1x/=p1l; p1y/=p1l; p1z/=p1l;
    // Second perpendicular: cross(axis, p1)
    let p2x=uy*p1z-uz*p1y, p2y=uz*p1x-ux*p1z, p2z=ux*p1y-uy*p1x;
    const p2l = Math.sqrt(p2x*p2x+p2y*p2y+p2z*p2z)||1;
    p2x/=p2l; p2y/=p2l; p2z/=p2l;
    const h = 2.06;
    atoms.push(['H', ba[1]+h*p1x, ba[2]+h*p1y, ba[3]+h*p1z]);
    atoms.push(['H', ba[1]-h*p1x, ba[2]-h*p1y, ba[3]-h*p1z]);
    bonds.push([4+k, 14+k*2]);
    bonds.push([4+k, 15+k*2]);
  }
  addMol({
    name: 'Adamantane', category: 'Cage',
  pubchemCid: 9254,
    label: 'C\u2081\u2080H\u2081\u2086 (Adamantane)',
    atoms, bonds, he: 22,
    mos: [
      ['\u03C3(C-C) sym', [[0,2,0,0,'real',0.3],[1,2,0,0,'real',0.3],[2,2,0,0,'real',0.3],[3,2,0,0,'real',0.3],[4,2,0,0,'real',0.3],[5,2,0,0,'real',0.3],[6,2,0,0,'real',0.3],[7,2,0,0,'real',0.3],[8,2,0,0,'real',0.3],[9,2,0,0,'real',0.3]]],
      ['\u03C3(C-C) anti', [[0,2,1,0,'real',0.45],[1,2,1,0,'real',-0.45],[2,2,1,0,'real',0.45],[3,2,1,0,'real',-0.45]]],
      ['\u03C3(C-H) sym', [[10,1,0,0,'real',0.25],[11,1,0,0,'real',0.25],[12,1,0,0,'real',0.25],[13,1,0,0,'real',0.25]]],
      ['cage breathing', [[0,2,0,0,'real',0.4],[1,2,0,0,'real',0.4],[2,2,0,0,'real',0.4],[3,2,0,0,'real',0.4],[4,2,0,0,'real',-0.25],[5,2,0,0,'real',-0.25],[6,2,0,0,'real',-0.25],[7,2,0,0,'real',-0.25],[8,2,0,0,'real',-0.25],[9,2,0,0,'real',-0.25]]],
    ]
  });
}
