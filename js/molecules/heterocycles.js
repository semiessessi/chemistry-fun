import { addMol, pentPos } from './core.js';

// Rotation matrix mapping y -> perpendicular (for π out of xz plane)
const piRot = [1, 0, 0, 0, 0, 1, 0, -1, 0];

// ---- Furan (C₄H₄O) ----
{
  const R = 2.14;
  const HR = R + 2.0;
  addMol({
    name: 'C₄H₄O',
    label: 'C₄H₄O (Furan)',
    category: 'Heterocyclic',
    pubchemCid: 8029,
    atoms: [
      ['O', ...pentPos(R, 0)],  // 0: O at top
      ['C', ...pentPos(R, 1)],  // 1
      ['C', ...pentPos(R, 2)],  // 2
      ['C', ...pentPos(R, 3)],  // 3
      ['C', ...pentPos(R, 4)],  // 4
      ['H', ...pentPos(HR, 1)], // 5
      ['H', ...pentPos(HR, 2)], // 6
      ['H', ...pentPos(HR, 3)], // 7
      ['H', ...pentPos(HR, 4)], // 8
    ],
    bonds: [
      [0, 1, 1.5], [0, 4, 1.5], [1, 2, 1.5], [2, 3, 1.5], [3, 4, 1.5],
      [1, 5], [2, 6], [3, 7], [4, 8],
    ],
    he: 12,
    mos: [
      ['π ring', [
        [0, 2, 1, 0, 'real', 0.41, piRot],
        [1, 2, 1, 0, 'real', 0.41, piRot],
        [2, 2, 1, 0, 'real', 0.41, piRot],
        [3, 2, 1, 0, 'real', 0.41, piRot],
        [4, 2, 1, 0, 'real', 0.41, piRot],
      ]],
      ['O lone pair', [[0, 2, 1, 0, 'real', 0.8]]],
      ['σ frame', [
        [0, 2, 0, 0, 'real', 0.35],
        [1, 2, 0, 0, 'real', 0.35], [2, 2, 0, 0, 'real', 0.35],
        [3, 2, 0, 0, 'real', 0.35], [4, 2, 0, 0, 'real', 0.35],
      ]],
    ]
  });
}

// ---- Pyrrole (C₄H₅N) ----
{
  const R = 2.14;
  const HR = R + 2.0;
  const [nx, ny, nz] = pentPos(R, 0);
  addMol({
    name: 'C₄H₅N',
    label: 'C₄H₅N (Pyrrole)',
    category: 'Heterocyclic',
    pubchemCid: 8027,
    atoms: [
      ['N', ...pentPos(R, 0)],  // 0
      ['C', ...pentPos(R, 1)],  // 1
      ['C', ...pentPos(R, 2)],  // 2
      ['C', ...pentPos(R, 3)],  // 3
      ['C', ...pentPos(R, 4)],  // 4
      ['H', nx, 1.0, nz],       // 5: N-H above plane
      ['H', ...pentPos(HR, 1)], // 6
      ['H', ...pentPos(HR, 2)], // 7
      ['H', ...pentPos(HR, 3)], // 8
      ['H', ...pentPos(HR, 4)], // 9
    ],
    bonds: [
      [0, 1, 1.5], [0, 4, 1.5], [1, 2, 1.5], [2, 3, 1.5], [3, 4, 1.5],
      [0, 5], [1, 6], [2, 7], [3, 8], [4, 9],
    ],
    he: 12,
    mos: [
      ['π ring', [
        [0, 2, 1, 0, 'real', 0.41, piRot],
        [1, 2, 1, 0, 'real', 0.41, piRot],
        [2, 2, 1, 0, 'real', 0.41, piRot],
        [3, 2, 1, 0, 'real', 0.41, piRot],
        [4, 2, 1, 0, 'real', 0.41, piRot],
      ]],
      ['σ frame', [
        [0, 2, 0, 0, 'real', 0.35],
        [1, 2, 0, 0, 'real', 0.35], [2, 2, 0, 0, 'real', 0.35],
        [3, 2, 0, 0, 'real', 0.35], [4, 2, 0, 0, 'real', 0.35],
      ]],
    ]
  });
}

// ---- Thiophene (C₄H₄S) ----
{
  const R = 2.30;
  const HR = R + 2.0;
  addMol({
    name: 'C₄H₄S',
    label: 'C₄H₄S (Thiophene)',
    category: 'Heterocyclic',
    pubchemCid: 8030,
    atoms: [
      ['S', ...pentPos(R, 0)],  // 0
      ['C', ...pentPos(R, 1)],  // 1
      ['C', ...pentPos(R, 2)],  // 2
      ['C', ...pentPos(R, 3)],  // 3
      ['C', ...pentPos(R, 4)],  // 4
      ['H', ...pentPos(HR, 1)], // 5
      ['H', ...pentPos(HR, 2)], // 6
      ['H', ...pentPos(HR, 3)], // 7
      ['H', ...pentPos(HR, 4)], // 8
    ],
    bonds: [
      [0, 1, 1.5], [0, 4, 1.5], [1, 2, 1.5], [2, 3, 1.5], [3, 4, 1.5],
      [1, 5], [2, 6], [3, 7], [4, 8],
    ],
    he: 14,
    mos: [
      ['π ring', [
        [0, 3, 1, 0, 'real', 0.41, piRot],
        [1, 2, 1, 0, 'real', 0.41, piRot],
        [2, 2, 1, 0, 'real', 0.41, piRot],
        [3, 2, 1, 0, 'real', 0.41, piRot],
        [4, 2, 1, 0, 'real', 0.41, piRot],
      ]],
      ['S lone pair', [[0, 3, 1, 0, 'real', 0.8]]],
      ['σ frame', [
        [0, 3, 0, 0, 'real', 0.35],
        [1, 2, 0, 0, 'real', 0.35], [2, 2, 0, 0, 'real', 0.35],
        [3, 2, 0, 0, 'real', 0.35], [4, 2, 0, 0, 'real', 0.35],
      ]],
    ]
  });
}

// ---- Imidazole (C₃H₄N₂) ----
{
  const R = 2.14;
  const HR = R + 2.0;
  const [n1x, n1y, n1z] = pentPos(R, 0);
  addMol({
    name: 'C₃H₄N₂',
    label: 'C₃H₄N₂ (Imidazole)',
    category: 'Heterocyclic',
    pubchemCid: 795,
    atoms: [
      ['N', ...pentPos(R, 0)],  // 0: N-H (pyrrole-type)
      ['C', ...pentPos(R, 1)],  // 1
      ['N', ...pentPos(R, 2)],  // 2: pyridine-type N
      ['C', ...pentPos(R, 3)],  // 3
      ['C', ...pentPos(R, 4)],  // 4
      ['H', n1x, 1.0, n1z],     // 5: N-H
      ['H', ...pentPos(HR, 1)], // 6
      ['H', ...pentPos(HR, 3)], // 7
      ['H', ...pentPos(HR, 4)], // 8
    ],
    bonds: [
      [0, 1, 1.5], [0, 4, 1.5], [1, 2, 1.5], [2, 3, 1.5], [3, 4, 1.5],
      [0, 5], [1, 6], [3, 7], [4, 8],
    ],
    he: 12,
    mos: [
      ['π ring', [
        [0, 2, 1, 0, 'real', 0.41, piRot],
        [1, 2, 1, 0, 'real', 0.41, piRot],
        [2, 2, 1, 0, 'real', 0.41, piRot],
        [3, 2, 1, 0, 'real', 0.41, piRot],
        [4, 2, 1, 0, 'real', 0.41, piRot],
      ]],
      ['N lone pair', [[2, 2, 1, 0, 'real', 0.8]]],
      ['σ frame', [
        [0, 2, 0, 0, 'real', 0.35], [1, 2, 0, 0, 'real', 0.35],
        [2, 2, 0, 0, 'real', 0.35], [3, 2, 0, 0, 'real', 0.35],
        [4, 2, 0, 0, 'real', 0.35],
      ]],
    ]
  });
}

// ---- Piperidine (C₅H₁₁N) – chair conformation ----
{
  const R = 2.88;
  const dz = 0.48;
  // Chair hexagon: N at position 0, C at 1-5
  const chairPos = (r, i) => {
    const angle = (i * Math.PI) / 3;
    const yOff = (i % 2 === 0) ? dz : -dz;
    return [r * Math.cos(angle), yOff, r * Math.sin(angle)];
  };
  const HR = R + 1.9;
  const atoms = [];
  // Ring: N + 5C
  const [nx, ny, nz] = chairPos(R, 0);
  atoms.push(['N', nx, ny, nz]);  // 0
  for (let i = 1; i < 6; i++) {
    atoms.push(['C', ...chairPos(R, i)]);
  }
  // N-H
  atoms.push(['H', nx, ny + 1.9, nz]); // 6
  // Equatorial + axial H on each C (2 per C = 10 H)
  for (let i = 1; i < 6; i++) {
    const [cx, cy, cz] = chairPos(R, i);
    const [hx, , hz] = chairPos(HR, i);
    atoms.push(['H', hx, cy, hz]);         // equatorial
    atoms.push(['H', cx, cy + 1.8, cz]);   // axial
  }
  const bonds = [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
    [0, 6],
  ];
  for (let i = 1; i < 6; i++) {
    bonds.push([i, 5 + 2 * i]);
    bonds.push([i, 6 + 2 * i]);
  }

  addMol({
    name: 'C₅H₁₁N',
    label: 'C₅H₁₁N (Piperidine)',
    category: 'Heterocyclic',
    pubchemCid: 8082,
    atoms,
    bonds,
    he: 14,
    mos: [
      ['N lone pair', [[0, 2, 1, 0, 'real', 0.8, piRot]]],
      ['σ frame', [
        [0, 2, 0, 0, 'real', 0.35],
        [1, 2, 0, 0, 'real', 0.35], [2, 2, 0, 0, 'real', 0.35],
        [3, 2, 0, 0, 'real', 0.35], [4, 2, 0, 0, 'real', 0.35],
        [5, 2, 0, 0, 'real', 0.35],
      ]],
    ]
  });
}
