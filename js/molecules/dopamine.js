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
  pubchemCid: 681,
    atoms: [
    ['C', 3, -0.63, -0.66],
    ['C', 1.58, -1.87, 1.19],
    ['C', -1, -1.38, 1.43],
    ['C', -2.17, 0.34, -0.19],
    ['C', -0.75, 1.57, -2.05],
    ['C', 1.83, 1.09, -2.28],
    ['O', -4.69, 0.79, 0.05],
    ['H', -5.35, -0.23, 1.43],
    ['O', -1.87, 3.25, -3.64],
    ['H', -3.66, 3.35, -3.21],
    ['H', 2.47, -3.21, 2.47],
    ['H', -2.08, -2.36, 2.88],
    ['H', 2.92, 2.06, -3.72],
    ['C', 5.75, -1.15, -0.9],
    ['C', 7.35, 0.64, 0.73],
    ['N', 10.05, 0.15, 0.44],
    ['H', 6.97, 2.61, 0.22],
    ['H', 6.14, -3.12, -0.38],
    ['H', 10.54, 0.33, -1.41],
    ['H', 10.42, -1.69, 0.9],
    ['H', 6.85, 0.43, 2.73],
    ['H', 6.32, -0.98, -2.89],
  ], bonds, he: 26,
    mos: [
      ['\u03C0 ring', [[0,2,1,1,'sin',0.41],[1,2,1,1,'sin',0.41],[2,2,1,1,'sin',0.41],[3,2,1,1,'sin',0.41],[4,2,1,1,'sin',0.41],[5,2,1,1,'sin',0.41]]],
      ['O lone pair', [[6,2,1,1,'sin',0.7],[8,2,1,1,'sin',0.7]]],
      ['N lone pair', [[15,2,1,1,'sin',1.0]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.28],[1,2,0,0,'real',0.28],[2,2,0,0,'real',0.28],[3,2,0,0,'real',0.28],[4,2,0,0,'real',0.28],[5,2,0,0,'real',0.28],[13,2,0,0,'real',0.28],[14,2,0,0,'real',0.28]]],
    ]
  });
}
