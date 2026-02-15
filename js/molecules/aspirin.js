import { addMol, hexPos } from './core.js';

// ---- Aspirin ----
{
  const R = 2.64, HR = 4.58;
  const atoms = [];
  for (let i = 0; i < 6; i++) { const [x,y,z] = hexPos(R,i); atoms.push(['C',x,y,z]); }
  // COOH on C0
  const d0=[hexPos(R,0)[0]/R,hexPos(R,0)[2]/R];
  atoms.push(['C',hexPos(R,0)[0]+d0[0]*2.88,0,hexPos(R,0)[2]+d0[1]*2.88]); // 6: COOH-C
  atoms.push(['O',atoms[6][1]+1.80,0,atoms[6][3]+1.30]); // 7: C=O
  atoms.push(['O',atoms[6][1]+1.00,0,atoms[6][3]-2.20]); // 8: C-OH
  atoms.push(['H',atoms[8][1]+1.83,0,atoms[8][3]]); // 9: OH-H
  // O-COCH₃ on C1 (ortho acetyl)
  const d1=[hexPos(R,1)[0]/R,hexPos(R,1)[2]/R];
  atoms.push(['O',hexPos(R,1)[0]+d1[0]*2.70,0,hexPos(R,1)[2]+d1[1]*2.70]); // 10: ester O
  atoms.push(['C',atoms[10][1]+d1[0]*2.55,0,atoms[10][3]+d1[1]*2.55]); // 11: C=O
  atoms.push(['O',atoms[11][1],1.80,atoms[11][3]+1.20]); // 12: =O
  atoms.push(['C',atoms[11][1]+d1[0]*2.88,0,atoms[11][3]+d1[1]*2.88]); // 13: CH₃
  atoms.push(['H',atoms[13][1]+1.94,0,atoms[13][3]-0.69]); // 14
  atoms.push(['H',atoms[13][1]-0.97,1.68,atoms[13][3]-0.69]); // 15
  atoms.push(['H',atoms[13][1]-0.97,-1.68,atoms[13][3]-0.69]); // 16
  // H on C2-C5
  for (const i of [2,3,4,5]) atoms.push(['H',...hexPos(HR,i)]); // 17-20
  const bonds = [];
  for (let i = 0; i < 6; i++) bonds.push([i,(i+1)%6,1.5]);
  bonds.push([0,6],[6,7,2],[6,8],[8,9],[1,10],[10,11],[11,12,2],[11,13],[13,14],[13,15],[13,16]);
  bonds.push([2,17],[3,18],[4,19],[5,20]);
  addMol({
    name: 'Aspirin', category: 'Drug',
  pubchemCid: 2244,
    label: 'C\u2089H\u2088O\u2084 (Aspirin)',
    atoms, bonds, he: 24,
    mos: [
      ['\u03C0 ring', [[0,2,1,1,'sin',0.41],[1,2,1,1,'sin',0.41],[2,2,1,1,'sin',0.41],[3,2,1,1,'sin',0.41],[4,2,1,1,'sin',0.41],[5,2,1,1,'sin',0.41]]],
      ['\u03C0(C=O)', [[6,2,1,1,'sin',0.5],[7,2,1,1,'sin',0.5],[11,2,1,1,'sin',0.4],[12,2,1,1,'sin',0.4]]],
      ['O lone pair', [[10,2,1,1,'sin',0.7]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.28],[1,2,0,0,'real',0.28],[2,2,0,0,'real',0.28],[3,2,0,0,'real',0.28],[4,2,0,0,'real',0.28],[5,2,0,0,'real',0.28],[6,2,0,0,'real',0.25],[11,2,0,0,'real',0.25]]],
    ]
  });
}
