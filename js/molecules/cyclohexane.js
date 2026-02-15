import { addMol, chairHexPos } from './core.js';

{
  const R = 2.88; // C-C distance ~ ring radius for chair
  const dz = 0.47; // chair puckering amplitude
  const atoms = [];
  const bonds = [];
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = chairHexPos(R, i, dz);
    atoms.push(['C', x, y, z]);
  }
  // Each C has 2H: one axial, one equatorial
  for (let i = 0; i < 6; i++) {
    const [cx, cy, cz] = [atoms[i][1], atoms[i][2], atoms[i][3]];
    const axY = (i % 2 === 0) ? dz + 1.8 : -dz - 1.8;
    atoms.push(['H', cx, axY, cz]); // axial
    const angle = (i * Math.PI) / 3;
    const eqX = cx + Math.cos(angle) * 1.5;
    const eqZ = cz + Math.sin(angle) * 1.5;
    atoms.push(['H', eqX, cy, eqZ]); // equatorial
  }
  // C-C ring bonds
  for (let i = 0; i < 6; i++) bonds.push([i, (i + 1) % 6]);
  // C-H bonds
  for (let i = 0; i < 6; i++) {
    bonds.push([i, 6 + i * 2]);     // axial H
    bonds.push([i, 6 + i * 2 + 1]); // equatorial H
  }
  addMol({
    name: 'Cyclohexane',
    category: 'Cyclic',
  pubchemCid: 8078,
    atoms: [
    ['C', 2.22, -1.34, -1.02],
    ['C', -1.76, -1.45, 1.6],
    ['C', -2.22, 1.34, 1.02],
    ['C', -0.25, -2.73, -0.49],
    ['C', 1.76, 1.45, -1.6],
    ['C', 0.25, 2.73, 0.49],
    ['H', 3.58, 2.42, -1.85],
    ['H', 3.48, -1.5, 0.62],
    ['H', -0.74, -1.62, 3.4],
    ['H', 1.38, 2.81, 2.22],
    ['H', -3.19, 2.23, 2.62],
    ['H', -3.58, -2.42, 1.85],
    ['H', -1.38, -2.81, -2.22],
    ['H', -3.48, 1.5, -0.62],
    ['H', 0.74, 1.62, -3.4],
    ['H', -0.16, 4.69, -0.05],
    ['H', 3.19, -2.23, -2.62],
    ['H', 0.16, -4.69, 0.05],
  ],
    bonds,
    he: 22,
    mos: [
      ['\u03C3(C-C) sym', [
        [0, 2, 0, 0, 'real', 0.38], [1, 2, 0, 0, 'real', 0.38],
        [2, 2, 0, 0, 'real', 0.38], [3, 2, 0, 0, 'real', 0.38],
        [4, 2, 0, 0, 'real', 0.38], [5, 2, 0, 0, 'real', 0.38],
      ]],
      ['\u03C3(C-H) sym', [
        [6, 1, 0, 0, 'real', 0.18], [7, 1, 0, 0, 'real', 0.18],
        [8, 1, 0, 0, 'real', 0.18], [9, 1, 0, 0, 'real', 0.18],
        [10, 1, 0, 0, 'real', 0.18], [11, 1, 0, 0, 'real', 0.18],
        [12, 1, 0, 0, 'real', 0.18], [13, 1, 0, 0, 'real', 0.18],
        [14, 1, 0, 0, 'real', 0.18], [15, 1, 0, 0, 'real', 0.18],
        [16, 1, 0, 0, 'real', 0.18], [17, 1, 0, 0, 'real', 0.18],
      ]],
      ['\u03C3(C-C) anti', [
        [0, 2, 1, 0, 'real', 0.45], [1, 2, 1, 0, 'real', -0.45],
        [2, 2, 1, 0, 'real', 0.45], [3, 2, 1, 0, 'real', -0.45],
        [4, 2, 1, 0, 'real', 0.45], [5, 2, 1, 0, 'real', -0.45],
      ]],
      ['\u03C3(C-H) anti', [
        [0, 2, 1, 1, 'sin', 0.45], [1, 2, 1, 1, 'sin', -0.45],
        [2, 2, 1, 1, 'sin', 0.45], [3, 2, 1, 1, 'sin', -0.45],
        [4, 2, 1, 1, 'sin', 0.45], [5, 2, 1, 1, 'sin', -0.45],
      ]],
    ]
  });
}
