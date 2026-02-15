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
    atoms, bonds, he: 24,
    mos: [
      ['\u03C3(C-C) chain', [[0,2,0,0,'real',0.25],[1,2,0,0,'real',0.25],[2,2,0,0,'real',0.25],[3,2,0,0,'real',0.25],[4,2,0,0,'real',0.25],[5,2,0,0,'real',0.25]]],
      ['O lone pair', atoms.filter(a=>a[0]==='O').slice(0,4).map((_,i) => [6+i*3+(i<1?2:1),2,1,1,'cos',0.7])],
      ['\u03C3(O-H)', atoms.filter(a=>a[0]==='O').slice(0,3).map((_,i) => [6+i*3+(i<1?2:1),2,0,0,'real',0.5])],
    ]
  });
}
