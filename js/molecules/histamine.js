import { addMol, pentPos } from './core.js';

// ---- Histamine ----
{
  const R5 = 2.20;
  const atoms = [];
  // Imidazole ring (5-membered, aromatic)
  for (let i = 0; i < 5; i++) {
    const [x,y,z] = pentPos(R5, i);
    atoms.push([(i===0||i===2)?'N':'C', x, y, z]);
  }
  // H on NH (atom 0), H on C atoms 1,3,4
  atoms.push(['H',...pentPos(R5+1.91,0)]); // 5
  atoms.push(['H',...pentPos(R5+2.06,1)]); // 6
  atoms.push(['H',...pentPos(R5+2.06,3)]); // 7
  // Ethylamine chain off C4 (index 4)
  const d4=[pentPos(R5,4)[0]/R5, pentPos(R5,4)[2]/R5];
  atoms.push(['C',pentPos(R5,4)[0]+d4[0]*2.88,0,pentPos(R5,4)[2]+d4[1]*2.88]); // 8
  atoms.push(['C',pentPos(R5,4)[0]+d4[0]*5.76,0,pentPos(R5,4)[2]+d4[1]*5.76]); // 9
  atoms.push(['N',pentPos(R5,4)[0]+d4[0]*8.52,0,pentPos(R5,4)[2]+d4[1]*8.52]); // 10
  atoms.push(['H',atoms[8][1],1.80,atoms[8][3]]); // 11
  atoms.push(['H',atoms[8][1],-1.80,atoms[8][3]]); // 12
  atoms.push(['H',atoms[9][1],1.80,atoms[9][3]]); // 13
  atoms.push(['H',atoms[9][1],-1.80,atoms[9][3]]); // 14
  atoms.push(['H',atoms[10][1]+0.93,1.60,atoms[10][3]]); // 15
  atoms.push(['H',atoms[10][1]+0.93,-1.60,atoms[10][3]]); // 16
  const bonds = [];
  for (let i = 0; i < 5; i++) bonds.push([i,(i+1)%5,1.5]);
  bonds.push([0,5],[1,6],[3,7],[4,8],[8,9],[9,10],[8,11],[8,12],[9,13],[9,14],[10,15],[10,16]);
  addMol({
    name: 'Histamine', category: 'Neurotransmitter',
  pubchemCid: 774,
    label: 'C\u2085H\u2089N\u2083 (Histamine)',
    atoms: [
    ['N', 1.6, -1.62, -0.92],
    ['C', -0.94, -1.39, -1.97],
    ['N', -6.38, 2.6, -1.7],
    ['C', -2.66, 0.13, -0.22],
    ['C', -5.3, 0.34, -1.26],
    ['H', -0.82, -0.48, -3.83],
    ['H', 2.33, 0.14, -0.62],
    ['H', -2.77, -0.78, 1.64],
    ['C', -7, -1.45, -1.93],
    ['C', -8.74, 2.11, -2.64],
    ['N', -9.17, -0.33, -2.8],
    ['H', -5.62, 4.33, -1.41],
    ['H', -6.81, -3.48, -1.84],
    ['H', -10.03, 3.6, -3.16],
    ['H', -1.7, -3.29, -2.27],
    ['H', -1.87, 2.02, 0.08],
    ['H', 1.5, -2.45, 0.82],
  ], bonds, he: 22,
    mos: [
      ['\u03C0 imidazole', [[0,2,1,1,'sin',0.45],[1,2,1,1,'sin',0.42],[2,2,1,1,'sin',0.45],[3,2,1,1,'sin',0.42],[4,2,1,1,'sin',0.42]]],
      ['N lone pair (ring)', [[2,2,1,0,'real',0.85]]],
      ['N lone pair (NH\u2082)', [[10,2,1,1,'sin',1.0]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.3],[1,2,0,0,'real',0.3],[2,2,0,0,'real',0.3],[3,2,0,0,'real',0.3],[4,2,0,0,'real',0.3],[8,2,0,0,'real',0.3],[9,2,0,0,'real',0.3]]],
    ]
  });
}
