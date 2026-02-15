import { addMol, hexPos } from './core.js';

{
  const R = 2.64, HR = 4.58;
  const atoms = [];
  // Catechol ring (benzene with 2 OH) in xz plane
  for (let i = 0; i < 6; i++) { const [x,y,z] = hexPos(R,i); atoms.push(['C',x,y,z]); }
  // OH on C3 and C4 (indices 3,4)
  const d3 = [hexPos(R,3)[0]/R, hexPos(R,3)[2]/R];
  const d4 = [hexPos(R,4)[0]/R, hexPos(R,4)[2]/R];
  atoms.push(['O', hexPos(R,3)[0]+d3[0]*2.70, 0, hexPos(R,3)[2]+d3[1]*2.70]); // 6
  atoms.push(['H', hexPos(R,3)[0]+d3[0]*4.53, 0, hexPos(R,3)[2]+d3[1]*4.53]); // 7
  atoms.push(['O', hexPos(R,4)[0]+d4[0]*2.70, 0, hexPos(R,4)[2]+d4[1]*2.70]); // 8
  atoms.push(['H', hexPos(R,4)[0]+d4[0]*4.53, 0, hexPos(R,4)[2]+d4[1]*4.53]); // 9
  // H on C1,C2,C5 (not C0 — it has the ethylamine chain)
  for (const i of [1,2,5]) { const [x,y,z] = hexPos(HR,i); atoms.push(['H',x,y,z]); } // 10-12
  // Ethylamine chain off C0: CH2-CH2-NH2
  const d0 = [hexPos(R,0)[0]/R, hexPos(R,0)[2]/R];
  atoms.push(['C', hexPos(R,0)[0]+d0[0]*2.88, 0, hexPos(R,0)[2]+d0[1]*2.88]); // 13
  atoms.push(['C', hexPos(R,0)[0]+d0[0]*5.76, 0, hexPos(R,0)[2]+d0[1]*5.76]); // 14
  atoms.push(['N', hexPos(R,0)[0]+d0[0]*8.52, 0, hexPos(R,0)[2]+d0[1]*8.52]); // 15
  atoms.push(['H', atoms[13][1],1.80, atoms[13][3]]); // 16
  atoms.push(['H', atoms[13][1],-1.80, atoms[13][3]]); // 17
  atoms.push(['H', atoms[14][1],1.80, atoms[14][3]]); // 18
  atoms.push(['H', atoms[14][1],-1.80, atoms[14][3]]); // 19
  atoms.push(['H', atoms[15][1]+0.93,1.60, atoms[15][3]]); // 20
  atoms.push(['H', atoms[15][1]+0.93,-1.60, atoms[15][3]]); // 21
  const bonds = [];
  for (let i = 0; i < 6; i++) bonds.push([i,(i+1)%6,1.5]);
  bonds.push([3,6],[6,7],[4,8],[8,9]);
  bonds.push([1,10],[2,11],[5,12]);
  bonds.push([0,13],[13,14],[14,15],[13,16],[13,17],[14,18],[14,19],[15,20],[15,21]);
  addMol({
    name: 'Dopamine',
    label: 'C\u2088H\u2081\u2081NO\u2082 (Dopamine)',
    category: 'Neurotransmitter',
    atoms, bonds, he: 26,
    mos: [
      ['\u03C0 ring', [[0,2,1,1,'sin',0.41],[1,2,1,1,'sin',0.41],[2,2,1,1,'sin',0.41],[3,2,1,1,'sin',0.41],[4,2,1,1,'sin',0.41],[5,2,1,1,'sin',0.41]]],
      ['O lone pair', [[6,2,1,1,'sin',0.7],[8,2,1,1,'sin',0.7]]],
      ['N lone pair', [[15,2,1,1,'sin',1.0]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.28],[1,2,0,0,'real',0.28],[2,2,0,0,'real',0.28],[3,2,0,0,'real',0.28],[4,2,0,0,'real',0.28],[5,2,0,0,'real',0.28],[13,2,0,0,'real',0.28],[14,2,0,0,'real',0.28]]],
    ]
  });
}
