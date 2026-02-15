import { addMol, chairHexPos, pentPos } from './core.js';

// ---- 46. Sucrose (C₁₂H₂₂O₁₁) ----
// Glucose + fructose linked by glycosidic bond (simplified)
{
  const atoms = [];
  const bonds = [];
  const R = 2.88;
  const dz = 0.47;
  // Glucose ring (pyranose, 6-ring): C0-C4, O5
  for (let i = 0; i < 5; i++) {
    const [x, y, z] = chairHexPos(R, i, dz);
    atoms.push(['C', x - 5.5, y, z]); // offset left
  }
  {
    const [x, y, z] = chairHexPos(R, 5, dz);
    atoms.push(['O', x - 5.5, y, z]); // 5: glucose ring O
  }
  // Fructose ring (furanose, 5-ring): C6-C9, O10
  const R5 = 2.20;
  for (let i = 0; i < 4; i++) {
    const [x, y, z] = pentPos(R5, i);
    atoms.push(['C', x + 5.5, y, z]); // 6-9
  }
  {
    const [x, y, z] = pentPos(R5, 4);
    atoms.push(['O', x + 5.5, y, z]); // 10: fructose ring O
  }
  // Extra carbon on fructose (C11 = CH₂OH)
  atoms.push(['C', 5.5 + R5 + 2.88, 0, 0]); // 11
  // Glycosidic bridge O
  atoms.push(['O', 0, 0, 0]); // 12: bridge O
  // OH groups (simplified - 4 on glucose side, 3 on fructose side)
  const ohPositions = [
    [-5.5 - 3.0, 0, 2.5],  // 13: O on glucose
    [-5.5 - 3.0, 0, -2.5], // 15: O on glucose
    [-5.5, 2.5, -3.0],     // 17: O on glucose
    [-5.5 + 3.0, 0, 2.5],  // 19: O on glucose
    [5.5, 2.5, 2.5],       // 21: O on fructose
    [5.5 + 3.0, 0, -2.5],  // 23: O on fructose
    [5.5 + R5 + 2.88 + 2.70, 0, 0], // 25: O on CH₂OH
  ];
  for (const [ox, oy, oz] of ohPositions) {
    atoms.push(['O', ox, oy, oz]);
    const dx2 = ox > 0 ? 1.83 : -1.83;
    atoms.push(['H', ox + dx2, oy, oz]);
  }
  // H atoms on ring carbons (1 each, simplified)
  for (let i = 0; i < 5; i++) {
    const cx = atoms[i][1], cz = atoms[i][3];
    const axY = (i % 2 === 0) ? dz + 1.80 : -dz - 1.80;
    atoms.push(['H', cx, axY, cz]); // 27-31
  }
  for (let i = 6; i < 10; i++) {
    const cx = atoms[i][1], cz = atoms[i][3];
    atoms.push(['H', cx, 1.80, cz]); // 32-35
  }
  // CH₂ H on C11
  atoms.push(['H', atoms[11][1], 1.80, atoms[11][3] - 1.2]); // 36
  atoms.push(['H', atoms[11][1], -1.80, atoms[11][3] - 1.2]); // 37
  // Glucose ring bonds
  for (let i = 0; i < 5; i++) bonds.push([i, i + 1]);
  bonds.push([5, 0]);
  // Fructose ring bonds
  for (let i = 6; i < 9; i++) bonds.push([i, i + 1]);
  bonds.push([9, 10]); bonds.push([10, 6]);
  // Glycosidic bridge
  bonds.push([0, 12]); bonds.push([12, 6]);
  // Fructose-CH₂OH
  bonds.push([9, 11]);
  // OH bonds
  let oIdx = 13;
  const ohAttach = [1, 2, 3, 4, 7, 8, 11];
  for (let i = 0; i < 7; i++) {
    bonds.push([ohAttach[i], oIdx]);
    bonds.push([oIdx, oIdx + 1]);
    oIdx += 2;
  }
  // Ring C-H
  for (let i = 0; i < 5; i++) bonds.push([i, 27 + i]);
  for (let i = 0; i < 4; i++) bonds.push([i + 6, 32 + i]);
  bonds.push([11, 36]); bonds.push([11, 37]);
  addMol({
    name: 'Sucrose',
    category: 'Sugar',
  pubchemCid: 5988,
    atoms,
    bonds,
    he: 35,
    mos: [
      ['\u03C3(C-O) glycosidic', [
        [0, 2, 0, 0, 'real', 0.45], [12, 2, 0, 0, 'real', 0.55], [6, 2, 0, 0, 'real', 0.45],
      ]],
      ['O lone pairs', [
        [5, 2, 1, 1, 'sin', 0.40], [10, 2, 1, 1, 'sin', 0.40],
        [12, 2, 1, 1, 'sin', 0.45],
        [13, 2, 1, 1, 'sin', 0.30], [15, 2, 1, 1, 'sin', 0.30],
        [17, 2, 1, 1, 'sin', 0.30],
      ]],
      ['\u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.25], [1, 2, 0, 0, 'real', 0.25],
        [2, 2, 0, 0, 'real', 0.25], [3, 2, 0, 0, 'real', 0.25],
        [4, 2, 0, 0, 'real', 0.25],
        [6, 2, 0, 0, 'real', 0.25], [7, 2, 0, 0, 'real', 0.25],
        [8, 2, 0, 0, 'real', 0.25], [9, 2, 0, 0, 'real', 0.25],
        [11, 2, 0, 0, 'real', 0.22],
      ]],
      ['\u03C3(O-H)', [
        [14, 1, 0, 0, 'real', 0.35], [16, 1, 0, 0, 'real', 0.35],
        [18, 1, 0, 0, 'real', 0.35], [20, 1, 0, 0, 'real', 0.35],
        [22, 1, 0, 0, 'real', 0.35], [24, 1, 0, 0, 'real', 0.35],
        [26, 1, 0, 0, 'real', 0.35],
      ]],
    ]
  });
}
