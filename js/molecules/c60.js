import { addMol } from './core.js';

{
  const phi = (1 + Math.sqrt(5)) / 2;
  const rawVerts = [];
  // Generate truncated icosahedron vertices via even permutations
  const triples = [[0, 1, 3*phi], [2, 1+2*phi, phi], [1, 2+phi, 2*phi]];
  for (const [a,b,c] of triples) {
    // 3 cyclic permutations × all sign combos
    const perms = [[a,b,c],[c,a,b],[b,c,a]];
    for (const [p,q,r] of perms) {
      for (let si = 0; si < 8; si++) {
        const sx = (si&1)?-1:1, sy = (si&2)?-1:1, sz = (si&4)?-1:1;
        const v = [p*sx, q*sy, r*sz];
        // Check for duplicates (a=0 means some signs are redundant)
        const dup = rawVerts.some(u => Math.abs(u[0]-v[0])<0.01 && Math.abs(u[1]-v[1])<0.01 && Math.abs(u[2]-v[2])<0.01);
        if (!dup) rawVerts.push(v);
      }
    }
  }
  // Scale to C₆₀ radius (~6.7 Bohr)
  const dist0 = Math.sqrt(rawVerts[0][0]**2+rawVerts[0][1]**2+rawVerts[0][2]**2);
  const scale = 6.7 / dist0;
  const atoms = rawVerts.slice(0,60).map(v => ['C', v[0]*scale, v[1]*scale, v[2]*scale]);
  // Find bonds: adjacent vertices (distance ≈ edge length)
  const edgeLen = 2 * scale; // ideal edge = 2 in raw coordinates
  const bonds = [];
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i+1; j < atoms.length; j++) {
      const dx=atoms[i][1]-atoms[j][1], dy=atoms[i][2]-atoms[j][2], dz=atoms[i][3]-atoms[j][3];
      const d = Math.sqrt(dx*dx+dy*dy+dz*dz);
      if (d < edgeLen * 1.15) bonds.push([i,j]);
    }
  }
  addMol({
    name: 'C\u2086\u2080', category: 'Cage',
  pubchemCid: 123591,
    label: 'C\u2086\u2080 (Buckminsterfullerene)',
    atoms, bonds, he: 38,
    mos: [
      ['\u03C3 cage sym', atoms.slice(0,20).map((_,i) => [i,2,0,0,'real',0.22])],
      ['\u03C0 HOMO', atoms.slice(0,20).map((_,i) => [i,2,1,1,'sin', (i%2===0?0.22:-0.22)])],
      ['\u03C0 LUMO', atoms.slice(0,20).map((_,i) => [i,2,1,1,'cos', (i%3===0?0.25:-0.15)])],
    ]
  });
}
