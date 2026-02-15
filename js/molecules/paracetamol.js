import { addMol, hexPos } from './core.js';

// ---- Paracetamol (Acetaminophen) ----
{
  const R = 2.64, HR = 4.58;
  const atoms = [];
  for (let i = 0; i < 6; i++) { const [x,y,z] = hexPos(R,i); atoms.push(['C',x,y,z]); }
  // OH on C3 (para position)
  const d3=[hexPos(R,3)[0]/R,hexPos(R,3)[2]/R];
  atoms.push(['O',hexPos(R,3)[0]+d3[0]*2.70,0,hexPos(R,3)[2]+d3[1]*2.70]); // 6
  atoms.push(['H',hexPos(R,3)[0]+d3[0]*4.53,0,hexPos(R,3)[2]+d3[1]*4.53]); // 7
  // NH-COCH₃ on C0 (amino-acetyl)
  const d0=[hexPos(R,0)[0]/R,hexPos(R,0)[2]/R];
  atoms.push(['N',hexPos(R,0)[0]+d0[0]*2.76,0,hexPos(R,0)[2]+d0[1]*2.76]); // 8
  atoms.push(['H',atoms[8][1]+0.93,1.60,atoms[8][3]]); // 9: NH
  atoms.push(['C',atoms[8][1]+d0[0]*2.49,0,atoms[8][3]+d0[1]*2.49]); // 10: C=O
  atoms.push(['O',atoms[10][1],1.80,atoms[10][3]+1.20]); // 11: =O
  atoms.push(['C',atoms[10][1]+d0[0]*2.88,0,atoms[10][3]+d0[1]*2.88]); // 12: CH₃
  atoms.push(['H',atoms[12][1]+1.94,0,atoms[12][3]-0.69]); // 13
  atoms.push(['H',atoms[12][1]-0.97,1.68,atoms[12][3]-0.69]); // 14
  atoms.push(['H',atoms[12][1]-0.97,-1.68,atoms[12][3]-0.69]); // 15
  // H on C1,C2,C4,C5
  for (const i of [1,2,4,5]) atoms.push(['H',...hexPos(HR,i)]); // 16-19
  const bonds = [];
  for (let i = 0; i < 6; i++) bonds.push([i,(i+1)%6,1.5]);
  bonds.push([3,6],[6,7],[0,8],[8,9],[8,10],[10,11,2],[10,12],[12,13],[12,14],[12,15]);
  bonds.push([1,16],[2,17],[4,18],[5,19]);
  addMol({
    name: 'Paracetamol', category: 'Drug',
  pubchemCid: 1983,
    label: 'C\u2088H\u2089NO\u2082 (Paracetamol)',
    atoms, bonds, he: 24,
    mos: [
      ['\u03C0 ring', [[0,2,1,1,'sin',0.41],[1,2,1,1,'sin',0.41],[2,2,1,1,'sin',0.41],[3,2,1,1,'sin',0.41],[4,2,1,1,'sin',0.41],[5,2,1,1,'sin',0.41]]],
      ['\u03C0(C=O)', [[10,2,1,1,'sin',0.65],[11,2,1,1,'sin',0.65]]],
      ['N lone pair', [[8,2,1,1,'sin',0.85]]],
      ['O lone pair', [[6,2,1,1,'sin',0.85]]],
    ]
  });
}
