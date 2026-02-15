import { addMol, hexPos } from './core.js';

{
  const R6 = 2.64, R5 = 2.20;
  const r6 = []; for (let i = 0; i < 6; i++) r6.push(hexPos(R6, i));
  const c3=r6[3],c4=r6[4];
  const mx2=(c3[0]+c4[0])/2, mz2=(c3[2]+c4[2])/2;
  const ol2=Math.sqrt(mx2*mx2+mz2*mz2)||1, nx2=mx2/ol2, nz2=mz2/ol2;
  const ext2=R5*0.95;
  const px2=-(c4[2]-c3[2]),pz2=c4[0]-c3[0];
  const pl2=Math.sqrt(px2*px2+pz2*pz2)||1;
  const ppx2=px2/pl2, ppz2=pz2/pl2;
  // Indole: 6-ring fused with 5-ring (pyrrole) at C3-C4
  const n7=[c4[0]+nx2*ext2*0.85+ppx2*ext2*0.35,0,c4[2]+nz2*ext2*0.85+ppz2*ext2*0.35];
  const c8=[mx2+nx2*ext2*1.5,0,mz2+nz2*ext2*1.5];
  const c9=[c3[0]+nx2*ext2*0.85-ppx2*ext2*0.35,0,c3[2]+nz2*ext2*0.85-ppz2*ext2*0.35];
  const atoms = [
    ['C',...r6[0]],['C',...r6[1]],['C',...r6[2]],['C',...r6[3]],
    ['C',...r6[4]],['C',...r6[5]],
    ['N',...n7],['C',...c8],['C',...c9], // indole 5-ring: 4-6-7-8-3
  ];
  // OH on C4 (index 5 in our numbering -> actually on ring pos 5)
  const d5=[r6[5][0]/R6,r6[5][2]/R6];
  atoms.push(['O',r6[5][0]+d5[0]*2.70,0,r6[5][2]+d5[1]*2.70]); // 9: OH
  atoms.push(['H',r6[5][0]+d5[0]*4.53,0,r6[5][2]+d5[1]*4.53]); // 10: OH-H
  // H on ring atoms 0,1,2
  for (const i of [0,1,2]) atoms.push(['H',...hexPos(R6+2.06,i)]); // 11-13
  atoms.push(['H',n7[0]+ppx2*1.91,0,n7[2]+ppz2*1.91]); // 14: H on NH
  // Ethylamine chain off C7 (index 7) — no H on C7 since chain is attached
  atoms.push(['C',c8[0]+nx2*2.88,0,c8[2]+nz2*2.88]); // 15: CH2
  atoms.push(['C',c8[0]+nx2*5.76,0,c8[2]+nz2*5.76]); // 16: CH2
  atoms.push(['N',c8[0]+nx2*8.52,0,c8[2]+nz2*8.52]); // 17: NH2
  atoms.push(['H',atoms[15][1],1.80,atoms[15][3]]); // 18
  atoms.push(['H',atoms[15][1],-1.80,atoms[15][3]]); // 19
  atoms.push(['H',atoms[16][1],1.80,atoms[16][3]]); // 20
  atoms.push(['H',atoms[16][1],-1.80,atoms[16][3]]); // 21
  atoms.push(['H',atoms[17][1]+0.93,1.60,atoms[17][3]]); // 22
  atoms.push(['H',atoms[17][1]+0.93,-1.60,atoms[17][3]]); // 23
  atoms.push(['H',c9[0]-ppx2*2.06,0,c9[2]-ppz2*2.06]); // 24: H on C8 (indole)
  const bonds = [];
  for (let i = 0; i < 6; i++) bonds.push([i,(i+1)%6,1.5]);
  bonds.push([4,6,1.5],[6,7,1.5],[7,8,1.5],[8,3,1.5]);
  bonds.push([5,9],[9,10]);
  bonds.push([0,11],[1,12],[2,13],[6,14],[8,24]);
  bonds.push([7,15],[15,16],[16,17],[15,18],[15,19],[16,20],[16,21],[17,22],[17,23]);
  addMol({
    name: 'Serotonin',
    label: 'C\u2081\u2080H\u2081\u2082N\u2082O (Serotonin)',
    category: 'Neurotransmitter',
  pubchemCid: 5202,
    atoms: [
    ['C', 2.59, -0.25, -1.46],
    ['C', 0.98, 1.61, -0.52],
    ['C', -1.64, 1.41, -0.83],
    ['C', -2.64, -0.7, -2.09],
    ['C', -0.98, -2.54, -3.01],
    ['C', 1.64, -2.37, -2.72],
    ['N', -2.43, -4.38, -4.15],
    ['C', -5.13, -1.5, -2.73],
    ['C', -7.5, -0.16, -2.14],
    ['O', 1.97, 3.65, 0.7],
    ['H', 2.9, -3.82, -3.45],
    ['H', 4.63, -0.07, -1.21],
    ['H', 0.59, 4.75, 1.22],
    ['H', -2.89, 2.87, -0.1],
    ['H', -1.73, -5.95, -4.99],
    ['C', -8.3, 1.7, -4.23],
    ['C', -4.94, -3.77, -3.99],
    ['N', -10.62, 3.04, -3.59],
    ['H', -6.79, 3.08, -4.56],
    ['H', -9.02, -1.54, -1.84],
    ['H', -8.59, 0.68, -6.01],
    ['H', -6.36, -5, -4.79],
    ['H', -11.01, 4.33, -4.96],
    ['H', -10.35, 4.05, -1.96],
    ['H', -7.31, 0.86, -0.35],
  ], bonds, he: 28,
    mos: [
      ['\u03C0 indole', [[0,2,1,1,'sin',0.30],[1,2,1,1,'sin',0.30],[2,2,1,1,'sin',0.30],[3,2,1,1,'sin',0.33],[4,2,1,1,'sin',0.33],[5,2,1,1,'sin',0.30],[6,2,1,1,'sin',0.30],[7,2,1,1,'sin',0.30],[8,2,1,1,'sin',0.30]]],
      ['N lone pair (NH\u2082)', [[17,2,1,1,'sin',1.0]]],
      ['O lone pair', [[9,2,1,1,'sin',0.85]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.25],[1,2,0,0,'real',0.25],[2,2,0,0,'real',0.25],[3,2,0,0,'real',0.25],[4,2,0,0,'real',0.25],[5,2,0,0,'real',0.25],[15,2,0,0,'real',0.25],[16,2,0,0,'real',0.25]]],
    ]
  });
}
