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
    atoms,
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
