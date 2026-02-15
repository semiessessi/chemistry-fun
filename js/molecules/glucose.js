import { addMol, chairHexPos } from './core.js';

{
  const R = 2.88;
  const dz = 0.47;
  const atoms = [];
  const bonds = [];
  // Ring: C1(0) C2(1) C3(2) C4(3) C5(4) O(5) in chair
  for (let i = 0; i < 5; i++) {
    const [x, y, z] = chairHexPos(R, i, dz);
    atoms.push(['C', x, y, z]);
  }
  {
    const [x, y, z] = chairHexPos(R, 5, dz);
    atoms.push(['O', x, y, z]); // 5: ring O
  }
  // OH groups on C1-C4 (equatorial)
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 3;
    const cx = atoms[i][1], cy = atoms[i][2], cz = atoms[i][3];
    const ox = cx + Math.cos(angle) * 2.70;
    const oz = cz + Math.sin(angle) * 2.70;
    atoms.push(['O', ox, cy, oz]); // 6,8,10,12
    atoms.push(['H', ox + Math.cos(angle) * 1.83, cy, oz + Math.sin(angle) * 1.83]); // 7,9,11,13
  }
  // CH₂OH on C5
  {
    const cx = atoms[4][1], cy = atoms[4][2], cz = atoms[4][3];
    const angle = (4 * Math.PI) / 3;
    atoms.push(['C', cx + Math.cos(angle) * 2.88, cy, cz + Math.sin(angle) * 2.88]); // 14: CH₂OH carbon
    const c2x = atoms[14][1], c2z = atoms[14][3];
    atoms.push(['O', c2x + 2.70, cy, c2z]); // 15: OH oxygen
    atoms.push(['H', c2x + 2.70 + 1.83, cy, c2z]); // 16: OH hydrogen
    atoms.push(['H', c2x, cy + 1.80, c2z - 1.20]); // 17: CH₂ H
    atoms.push(['H', c2x, cy - 1.80, c2z - 1.20]); // 18: CH₂ H
  }
  // H on ring carbons (axial)
  for (let i = 0; i < 5; i++) {
    const cx = atoms[i][1], cy = atoms[i][2];
    const axY = (i % 2 === 0) ? dz + 1.80 : -dz - 1.80;
    atoms.push(['H', cx, axY, atoms[i][3]]); // 19-23
  }
  // Ring bonds
  for (let i = 0; i < 5; i++) bonds.push([i, i + 1]);
  bonds.push([5, 0]); // close ring O-C1
  // C-OH bonds
  for (let i = 0; i < 4; i++) {
    bonds.push([i, 6 + i * 2]);       // C-O
    bonds.push([6 + i * 2, 7 + i * 2]); // O-H
  }
  // C5-CH₂OH
  bonds.push([4, 14]); bonds.push([14, 15]); bonds.push([15, 16]);
  bonds.push([14, 17]); bonds.push([14, 18]);
  // Ring C-H
  for (let i = 0; i < 5; i++) bonds.push([i, 19 + i]);
  addMol({
    name: 'Glucose',
    category: 'Sugar',
  pubchemCid: 5793,
    atoms: [
    ['C', 2.95, 0.04, 0.17],
    ['C', 1.67, 2.63, 0.3],
    ['C', -2.43, 0.86, -0.12],
    ['C', -1.41, -1.84, -0.22],
    ['C', 1.3, -1.88, -1.22],
    ['O', 5.29, 0.32, -1.14],
    ['O', 3.19, 4.23, 1.85],
    ['H', 4.93, 0.94, -2.84],
    ['O', -0.79, 2.41, 1.37],
    ['H', 3.41, -0.67, 2.06],
    ['O', -5.86, 3.52, 1.13],
    ['H', -5.02, 0.28, 3.03],
    ['O', -2.98, -3.32, -1.84],
    ['H', -6.43, -0.13, 0],
    ['C', -5.05, 0.97, 1.08],
    ['O', 2.29, -4.36, -0.85],
    ['H', 1.34, -1.53, -3.27],
    ['H', -2.56, 1.68, -2.02],
    ['H', -2.95, -2.55, -3.51],
    ['H', 1.55, 3.53, -1.56],
    ['H', -1.46, -2.71, 1.66],
    ['H', -4.62, 4.48, 2.09],
    ['H', 1.19, -5.53, -1.73],
    ['H', 3.86, 3.23, 3.24],
  ],
    bonds,
    he: 28,
    mos: [
      ['\u03C3(C-O) sym', [
        [0, 2, 0, 0, 'real', 0.30], [1, 2, 0, 0, 'real', 0.30],
        [2, 2, 0, 0, 'real', 0.30], [3, 2, 0, 0, 'real', 0.30],
        [4, 2, 0, 0, 'real', 0.30], [5, 2, 0, 0, 'real', 0.35],
        [6, 2, 0, 0, 'real', 0.22], [8, 2, 0, 0, 'real', 0.22],
        [10, 2, 0, 0, 'real', 0.22], [12, 2, 0, 0, 'real', 0.22],
      ]],
      ['O lone pairs', [
        [5, 2, 1, 1, 'sin', 0.45], [6, 2, 1, 1, 'sin', 0.35],
        [8, 2, 1, 1, 'sin', 0.35], [10, 2, 1, 1, 'sin', 0.35],
        [12, 2, 1, 1, 'sin', 0.35], [15, 2, 1, 1, 'sin', 0.30],
      ]],
      ['ring \u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.38], [1, 2, 0, 0, 'real', 0.38],
        [2, 2, 0, 0, 'real', 0.38], [3, 2, 0, 0, 'real', 0.38],
        [4, 2, 0, 0, 'real', 0.38],
      ]],
      ['\u03C3(O-H)', [
        [7, 1, 0, 0, 'real', 0.35], [9, 1, 0, 0, 'real', 0.35],
        [11, 1, 0, 0, 'real', 0.35], [13, 1, 0, 0, 'real', 0.35],
        [16, 1, 0, 0, 'real', 0.35],
      ]],
    ]
  });
}
