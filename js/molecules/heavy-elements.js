import { addMol, pentPos } from './core.js';

// ---- XeF₂ (Linear) ----
addMol({
  name: 'XeF₂',
  label: 'XeF₂ (Xenon Difluoride)',
  category: 'Heavy Element',
  atoms: [
    ['Xe', 0, 0, 0],
    ['F', 0, 0, -3.72],
    ['F', 0, 0, 3.72],
  ],
  bonds: [[0, 1], [0, 2]],
  he: 22,
  mos: [
    ['σ bond (3c-4e)', [
      [0, 5, 1, 0, 'real', 0.6],
      [1, 2, 1, 0, 'real', -0.5],
      [2, 2, 1, 0, 'real', 0.5],
    ]],
    ['Xe lone pair (px)', [[0, 5, 1, 1, 'cos', 1.0]]],
    ['Xe lone pair (py)', [[0, 5, 1, 1, 'sin', 1.0]]],
    ['σ frame', [
      [0, 5, 0, 0, 'real', 0.35],
      [1, 2, 0, 0, 'real', 0.3],
      [2, 2, 0, 0, 'real', 0.3],
    ]],
  ]
});

// ---- XeF₄ (Square Planar) ----
addMol({
  name: 'XeF₄',
  label: 'XeF₄ (Xenon Tetrafluoride)',
  category: 'Heavy Element',
  atoms: [
    ['Xe', 0, 0, 0],
    ['F', 3.72, 0, 0],
    ['F', -3.72, 0, 0],
    ['F', 0, 0, 3.72],
    ['F', 0, 0, -3.72],
  ],
  bonds: [[0, 1], [0, 2], [0, 3], [0, 4]],
  he: 28,
  mos: [
    ['σ bond (a1g)', [
      [0, 5, 0, 0, 'real', 0.5],
      [1, 2, 1, 0, 'real', -0.35],
      [2, 2, 1, 0, 'real', -0.35],
      [3, 2, 1, 0, 'real', -0.35],
      [4, 2, 1, 0, 'real', -0.35],
    ]],
    ['Xe lone pair (y)', [[0, 5, 1, 1, 'sin', 1.0]]],
    ['σ frame', [
      [0, 5, 0, 0, 'real', 0.35],
      [1, 2, 0, 0, 'real', 0.25],
      [2, 2, 0, 0, 'real', 0.25],
      [3, 2, 0, 0, 'real', 0.25],
      [4, 2, 0, 0, 'real', 0.25],
    ]],
  ]
});

// ---- PbCl₂ (Bent, ~95°) ----
{
  const r = 4.72;
  const halfAng = (95 / 2) * Math.PI / 180;
  addMol({
    name: 'PbCl₂',
    label: 'PbCl₂ (Lead(II) Chloride)',
    category: 'Heavy Element',
    atoms: [
      ['Pb', 0, 0, 0],
      ['Cl', r * Math.sin(halfAng), 0, -r * Math.cos(halfAng)],
      ['Cl', -r * Math.sin(halfAng), 0, -r * Math.cos(halfAng)],
    ],
    bonds: [[0, 1], [0, 2]],
    he: 18,
    mos: [
      ['σ bond', [
        [0, 6, 1, 0, 'real', 0.6],
        [1, 3, 1, 0, 'real', -0.5],
        [2, 3, 1, 0, 'real', -0.5],
      ]],
      ['Pb lone pair', [[0, 6, 0, 0, 'real', 0.8]]],
      ['σ frame', [
        [0, 6, 0, 0, 'real', 0.35],
        [1, 3, 0, 0, 'real', 0.3],
        [2, 3, 0, 0, 'real', 0.3],
      ]],
    ]
  });
}

// ---- UF₆ (Octahedral) ----
addMol({
  name: 'UF₆',
  label: 'UF₆ (Uranium Hexafluoride)',
  category: 'Heavy Element',
  atoms: [
    ['U', 0, 0, 0],
    ['F', 3.78, 0, 0],
    ['F', -3.78, 0, 0],
    ['F', 0, 3.78, 0],
    ['F', 0, -3.78, 0],
    ['F', 0, 0, 3.78],
    ['F', 0, 0, -3.78],
  ],
  bonds: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6]],
  he: 24,
  mos: [
    ['σ bond (a1g)', [
      [0, 6, 0, 0, 'real', 0.45],
      [1, 2, 1, 0, 'real', -0.3],
      [2, 2, 1, 0, 'real', -0.3],
      [3, 2, 1, 0, 'real', -0.3],
      [4, 2, 1, 0, 'real', -0.3],
      [5, 2, 1, 0, 'real', -0.3],
      [6, 2, 1, 0, 'real', -0.3],
    ]],
    ['σ frame', [
      [0, 6, 0, 0, 'real', 0.35],
      [1, 2, 0, 0, 'real', 0.2], [2, 2, 0, 0, 'real', 0.2],
      [3, 2, 0, 0, 'real', 0.2], [4, 2, 0, 0, 'real', 0.2],
      [5, 2, 0, 0, 'real', 0.2], [6, 2, 0, 0, 'real', 0.2],
    ]],
  ]
});

// ---- Ferrocene Fe(C₅H₅)₂ ----
{
  const cpR = 2.20;   // Cp ring C radius
  const cpHR = cpR + 2.0;
  const cpZ = 3.12;   // distance of Cp ring from Fe
  const atoms = [['Fe', 0, 0, 0]]; // 0: Fe at origin
  const bonds = [];

  // Top Cp ring (atoms 1-5), H (atoms 11-15)
  for (let i = 0; i < 5; i++) {
    const [x, , z] = pentPos(cpR, i);
    atoms.push(['C', x, cpZ, z]);
  }
  // Bottom Cp ring (atoms 6-10), H (atoms 16-20)
  for (let i = 0; i < 5; i++) {
    const [x, , z] = pentPos(cpR, i);
    atoms.push(['C', x, -cpZ, z]);
  }
  // Top H
  for (let i = 0; i < 5; i++) {
    const [x, , z] = pentPos(cpHR, i);
    atoms.push(['H', x, cpZ, z]);
  }
  // Bottom H
  for (let i = 0; i < 5; i++) {
    const [x, , z] = pentPos(cpHR, i);
    atoms.push(['H', x, -cpZ, z]);
  }

  // Cp ring bonds (aromatic)
  for (let i = 0; i < 5; i++) {
    bonds.push([1 + i, 1 + (i + 1) % 5, 1.5]);
    bonds.push([6 + i, 6 + (i + 1) % 5, 1.5]);
  }
  // Fe-C bonds (haptic, use 0.5 for display)
  for (let i = 0; i < 5; i++) {
    bonds.push([0, 1 + i, 0.5]);
    bonds.push([0, 6 + i, 0.5]);
  }
  // C-H bonds
  for (let i = 0; i < 5; i++) {
    bonds.push([1 + i, 11 + i]);
    bonds.push([6 + i, 16 + i]);
  }

  addMol({
    name: 'Fe(C₅H₅)₂',
    label: 'Fe(C₅H₅)₂ (Ferrocene)',
    category: 'Organometallic',
    pubchemCid: 7611,
    atoms,
    bonds,
    he: 18,
    mos: [
      ['π₁ Cp (top)', [
        [1, 2, 1, 1, 'sin', 0.41], [2, 2, 1, 1, 'sin', 0.41],
        [3, 2, 1, 1, 'sin', 0.41], [4, 2, 1, 1, 'sin', 0.41],
        [5, 2, 1, 1, 'sin', 0.41],
      ]],
      ['π₁ Cp (bottom)', [
        [6, 2, 1, 1, 'sin', 0.41], [7, 2, 1, 1, 'sin', 0.41],
        [8, 2, 1, 1, 'sin', 0.41], [9, 2, 1, 1, 'sin', 0.41],
        [10, 2, 1, 1, 'sin', 0.41],
      ]],
      ['Fe dz²', [[0, 3, 2, 0, 'real', 0.9]]],
      ['Fe dxz', [[0, 3, 2, 1, 'cos', 0.9]]],
      ['σ frame', [
        [0, 3, 0, 0, 'real', 0.35],
        [1, 2, 0, 0, 'real', 0.2], [2, 2, 0, 0, 'real', 0.2],
        [3, 2, 0, 0, 'real', 0.2], [4, 2, 0, 0, 'real', 0.2],
        [5, 2, 0, 0, 'real', 0.2], [6, 2, 0, 0, 'real', 0.2],
        [7, 2, 0, 0, 'real', 0.2], [8, 2, 0, 0, 'real', 0.2],
        [9, 2, 0, 0, 'real', 0.2], [10, 2, 0, 0, 'real', 0.2],
      ]],
    ]
  });
}
