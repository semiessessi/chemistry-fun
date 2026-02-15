import { addMol, pentPos } from './core.js';

// ---- Vitamin C (Ascorbic Acid) ----
{
  // 5-membered lactone ring + enediol
  const R5 = 2.20;
  const atoms = [];
  for (let i = 0; i < 5; i++) {
    const [x,y,z] = pentPos(R5, i);
    atoms.push([i===3?'O':'C', x, y, z]); // ring: C0 C1 C2 O3 C4
  }
  // C=O on C4 (lactone)
  atoms.push(['O',pentPos(R5,4)[0]-1.80,0,pentPos(R5,4)[2]-1.20]); // 5: C4=O
  // OH on C0 and C1 (enediol)
  atoms.push(['O',pentPos(R5+2.70,0)[0],0,pentPos(R5+2.70,0)[2]]); // 6
  atoms.push(['H',pentPos(R5+4.53,0)[0],0,pentPos(R5+4.53,0)[2]]); // 7
  atoms.push(['O',pentPos(R5+2.70,1)[0],0,pentPos(R5+2.70,1)[2]]); // 8
  atoms.push(['H',pentPos(R5+4.53,1)[0],0,pentPos(R5+4.53,1)[2]]); // 9
  // Side chain: CHOH-CH₂OH on C2
  atoms.push(['C',pentPos(R5+2.88,2)[0],0,pentPos(R5+2.88,2)[2]]); // 10: CHOH
  atoms.push(['O',atoms[10][1]+2.70,0,atoms[10][3]]); // 11: OH
  atoms.push(['H',atoms[10][1]+4.53,0,atoms[10][3]]); // 12
  atoms.push(['C',atoms[10][1],0,atoms[10][3]-2.88]); // 13: CH₂OH
  atoms.push(['O',atoms[13][1]+2.70,0,atoms[13][3]]); // 14
  atoms.push(['H',atoms[13][1]+4.53,0,atoms[13][3]]); // 15
  atoms.push(['H',atoms[10][1],1.80,atoms[10][3]+0.70]); // 16
  atoms.push(['H',atoms[13][1]-1.80,0,atoms[13][3]-0.70]); // 17
  atoms.push(['H',atoms[13][1],1.80,atoms[13][3]+0.70]); // 18
  atoms.push(['H',pentPos(R5,2)[0],1.80,pentPos(R5,2)[2]+0.70]); // 19: H on C2
  addMol({
    name: 'Vitamin C', category: 'Vitamin',
    label: 'C\u2086H\u2088O\u2086 (Ascorbic Acid)',
    atoms,
    bonds: [
      [0,1,2],[1,2],[2,3],[3,4],[4,0],[4,5,2],
      [0,6],[6,7],[1,8],[8,9],[2,10],[10,11],[11,12],
      [10,13],[13,14],[14,15],[10,16],[13,17],[13,18],[2,19],
    ],
    he: 24,
    mos: [
      ['\u03C0(C=C)', [[0,2,1,1,'sin',0.65],[1,2,1,1,'sin',0.65]]],
      ['\u03C0(C=O)', [[4,2,1,1,'sin',0.65],[5,2,1,1,'sin',0.65]]],
      ['O lone pairs', [[3,2,1,1,'sin',0.5],[6,2,1,1,'sin',0.4],[8,2,1,1,'sin',0.4],[11,2,1,1,'sin',0.35],[14,2,1,1,'sin',0.35]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.3],[1,2,0,0,'real',0.3],[2,2,0,0,'real',0.3],[4,2,0,0,'real',0.3],[10,2,0,0,'real',0.3],[13,2,0,0,'real',0.3]]],
    ]
  });
}
