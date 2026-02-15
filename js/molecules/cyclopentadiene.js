import { addMol, pentPos } from './core.js';

{
  const R = 2.20; // pentagon C-C ring radius
  const HR = R + 2.06;
  const atoms = [];
  const bonds = [];
  for (let i = 0; i < 5; i++) {
    const [x, y, z] = pentPos(R, i);
    atoms.push(['C', x, y, z]);
  }
  // C1 (index 0, top) is sp3 with 2H above/below
  atoms.push(['H', pentPos(R, 0)[0], 1.0, pentPos(R, 0)[2]]);  // 5: H above
  atoms.push(['H', pentPos(R, 0)[0], -1.0, pentPos(R, 0)[2]]); // 6: H below
  // C2-C5 (indices 1-4) each have 1H in-plane
  for (let i = 1; i < 5; i++) {
    const [hx, hy, hz] = pentPos(HR, i);
    atoms.push(['H', hx, hy, hz]);
  }
  // Bonds: C2=C3, C4=C5 double; rest single
  bonds.push([0, 1]); bonds.push([1, 2, 2]); bonds.push([2, 3]);
  bonds.push([3, 4, 2]); bonds.push([4, 0]);
  bonds.push([0, 5]); bonds.push([0, 6]);
  for (let i = 1; i < 5; i++) bonds.push([i, i + 6]);
  addMol({
    name: 'C\u2085H\u2086',
    category: 'Aromatic',
    atoms,
    bonds,
    he: 18,
    mos: [
      ['\u03C0\u2081 bonding', [
        [1, 2, 1, 1, 'sin', 0.50], [2, 2, 1, 1, 'sin', 0.50],
        [3, 2, 1, 1, 'sin', 0.50], [4, 2, 1, 1, 'sin', 0.50],
      ]],
      ['\u03C0\u2082 bonding', [
        [1, 2, 1, 1, 'sin', 0.50], [2, 2, 1, 1, 'sin', -0.50],
        [3, 2, 1, 1, 'sin', -0.50], [4, 2, 1, 1, 'sin', 0.50],
      ]],
      ['\u03C3(C-H) sym', [
        [0, 2, 0, 0, 'real', 0.4], [1, 2, 0, 0, 'real', 0.4],
        [2, 2, 0, 0, 'real', 0.4], [3, 2, 0, 0, 'real', 0.4],
        [4, 2, 0, 0, 'real', 0.4],
        [5, 1, 0, 0, 'real', 0.18], [6, 1, 0, 0, 'real', 0.18],
        [7, 1, 0, 0, 'real', 0.18], [8, 1, 0, 0, 'real', 0.18],
        [9, 1, 0, 0, 'real', 0.18], [10, 1, 0, 0, 'real', 0.18],
      ]],
      ['HOMO lone pair', [[0, 2, 1, 1, 'sin', 0.9]]],
    ]
  });
}
