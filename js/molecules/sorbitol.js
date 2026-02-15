import { addMol } from './core.js';

// ============================================================
// Sorbitol — C₆H₁₄O₆ — 26 atoms
// ============================================================
{
  // Linear sugar alcohol: HOCH₂-(CHOH)₄-CH₂OH
  // Zigzag chain along z-axis
  const atoms = [];
  const bonds = [];
  const cz = [-7.20, -4.32, -1.44, 1.44, 4.32, 7.20]; // 6 carbons spaced 2.88 apart
  for (let i = 0; i < 6; i++) {
    const cx = (i % 2 === 0) ? 0.5 : -0.5;
    atoms.push(['C', cx, 0, cz[i]]);
  }
  // C-C bonds
  for (let i = 0; i < 5; i++) bonds.push([i, i+1]);
  let ai = 6;
  // OH and H on each carbon
  for (let i = 0; i < 6; i++) {
    const cx = atoms[i][1];
    if (i === 0 || i === 5) {
      // terminal: CH₂OH (2H + OH)
      atoms.push(['H', cx+2.06, 0, cz[i]]);
      atoms.push(['H', cx-2.06, 0, cz[i]]);
      atoms.push(['O', cx, 1.83, cz[i]+(i===0?-1.5:1.5)]);
      atoms.push(['H', cx, 3.66, cz[i]+(i===0?-1.5:1.5)]);
      bonds.push([i, ai], [i, ai+1], [i, ai+2], [ai+2, ai+3]);
      ai += 4;
    } else {
      // interior: CHOH (1H + OH)
      atoms.push(['H', cx+(i%2===0?2.06:-2.06), 0, cz[i]]);
      atoms.push(['O', cx+(i%2===0?-2.70:2.70), 0, cz[i]]);
      atoms.push(['H', cx+(i%2===0?-4.53:4.53), 0, cz[i]]);
      bonds.push([i, ai], [i, ai+1], [ai+1, ai+2]);
      ai += 3;
    }
  }
  addMol({
    name: 'Sorbitol', category: 'Sugar',
  pubchemCid: 5780,
    label: 'C\u2086H\u2081\u2084O\u2086 (Sorbitol)',
    atoms: [
    ['C', 0.78, 0.13, -1.78],
    ['C', -1.58, -1.33, -0.92],
    ['C', 2.92, 0.17, 0.21],
    ['C', -2.83, -0.22, 1.47],
    ['C', -3.65, 2.53, 1.22],
    ['C', 5.31, 1.55, -0.65],
    ['H', 2.24, -2.68, -3.68],
    ['H', -3.64, 0.37, -3.49],
    ['O', 1.7, -0.97, -4.06],
    ['H', 0.26, 2.07, -2.28],
    ['H', -1.11, -3.32, -0.59],
    ['O', 4.7, 4.09, -1.3],
    ['H', 6.16, 0.63, -2.29],
    ['H', 2.23, 1.04, 1.96],
    ['O', -3.36, -1.36, -2.94],
    ['H', -5.03, 2.8, -0.3],
    ['H', -1.6, -0.43, 3.12],
    ['O', 3.63, -2.39, 0.74],
    ['H', 4.89, -2.34, 2.08],
    ['H', 6.74, 1.56, 0.85],
    ['O', -5.06, -1.67, 2],
    ['H', -6.25, 2.18, 3.8],
    ['H', -2.04, 3.79, 0.89],
    ['H', -4.55, -3.41, 2.23],
    ['O', -4.82, 3.3, 3.51],
    ['H', 3.98, 4.88, 0.19],
  ], bonds, he: 24,
    mos: [
      ['\u03C3(C-C) chain', [[0,2,0,0,'real',0.25],[1,2,0,0,'real',0.25],[2,2,0,0,'real',0.25],[3,2,0,0,'real',0.25],[4,2,0,0,'real',0.25],[5,2,0,0,'real',0.25]]],
      ['O lone pair', atoms.filter(a=>a[0]==='O').slice(0,4).map((_,i) => [6+i*3+(i<1?2:1),2,1,1,'cos',0.7])],
      ['\u03C3(O-H)', atoms.filter(a=>a[0]==='O').slice(0,3).map((_,i) => [6+i*3+(i<1?2:1),2,0,0,'real',0.5])],
    ]
  });
}
