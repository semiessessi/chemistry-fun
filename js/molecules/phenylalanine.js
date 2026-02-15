import { addMol, hexPos } from './core.js';

{
  const R = 2.64, HR = 4.58;
  const sideOff = -4.50; // benzene ring center x-offset
  const atoms = [
    ['N',-1.50,0,-2.20],['C',0,0,0],['C',1.50,0,2.20],
    ['O',3.20,0,3.20],['O',2.20,0,0.00],['H',3.60,0,-0.80],
    ['H',-2.30,1.50,-2.20],['H',-2.30,-1.50,-2.20],['H',0,1.80,-0.70],
    ['C',-2.20,0,1.40], // 9: CH2
    ['H',-2.20,1.80,2.10],['H',-2.20,-1.80,2.10],
  ];
  const ringBase = atoms.length; // 12
  // Benzene ring centered at (sideOff, 0, 3.0)
  for (let i = 0; i < 6; i++) {
    const [x,y,z] = hexPos(R, i);
    atoms.push(['C', x+sideOff, y, z+3.0]);
  }
  for (let i = 0; i < 6; i++) {
    const [x,y,z] = hexPos(HR, i);
    atoms.push(['H', x+sideOff, y, z+3.0]);
  }
  const bonds = [[0,1],[1,2],[2,3,2],[2,4],[4,5],[0,6],[0,7],[1,8],[1,9],[9,10],[9,11],[9,ringBase]];
  for (let i = 0; i < 6; i++) bonds.push([ringBase+i, ringBase+(i+1)%6, 1.5]);
  for (let i = 0; i < 6; i++) bonds.push([ringBase+i, ringBase+6+i]);
  addMol({
    name: 'Phenylalanine',
    label: 'C\u2089H\u2081\u2081NO\u2082 (Phenylalanine)',
    category: 'Amino Acid',
  pubchemCid: 6140,
    atoms, bonds, he: 24,
    mos: [
      ['\u03C0 ring', [[12,2,1,1,'sin',0.41],[13,2,1,1,'sin',0.41],[14,2,1,1,'sin',0.41],[15,2,1,1,'sin',0.41],[16,2,1,1,'sin',0.41],[17,2,1,1,'sin',0.41]]],
      ['\u03C3(N-C\u03B1)', [[0,2,1,0,'real',0.65],[1,2,1,0,'real',-0.65]]],
      ['N lone pair', [[0,2,1,1,'sin',1.0]]],
      ['\u03C0(C=O)', [[2,2,1,1,'sin',0.65],[3,2,1,1,'sin',0.65]]],
    ]
  });
}
