import { addMol } from './core.js';

// Silver nitrate
addMol({
  name: 'Silver nitrate',
  label: 'AgNO₃ (Silver nitrate)',
  category: 'Inorganic',
  atoms: [
    ['N', 0.0000, 0.0000, 0.0000],
    ['O', 0.0000, 2.3811, 0.0000],
    ['O', -2.0621, -1.1905, 0.0000],
    ['O', 2.0621, -1.1905, 0.0000],
    ['Ag', 0.0000, 6.9542, 0.0000]
  ],
  bonds: [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 4]
  ],
  he: 14,
});

// Selenium dioxide
addMol({
  name: 'Selenium dioxide',
  label: 'O₂Se (Selenium dioxide)',
  category: 'Inorganic',
  atoms: [
    ['Se', 0.0000, 0.0000, 0.0000],
    ['O', 2.5487, 1.6615, 0.0000],
    ['O', -2.5487, 1.6615, 0.0000]
  ],
  bonds: [
    [0, 1, 2],
    [0, 2, 2]
  ],
  he: 8,
});

// Mercury(II) chloride
addMol({
  name: 'Mercury(II) chloride',
  label: 'Cl₂Hg (Mercury(II) chloride)',
  category: 'Inorganic',
  atoms: [
    ['Hg', 0.0000, 0.0000, 0.0000],
    ['Cl', 4.4031, 0.0000, 0.0000],
    ['Cl', -4.4031, 0.0000, 0.0000]
  ],
  bonds: [
    [0, 1],
    [0, 2]
  ],
  he: 10,
});

// Dimethylmercury
addMol({
  name: 'Dimethylmercury',
  label: 'C₂H₆Hg (Dimethylmercury)',
  category: 'Inorganic',
  atoms: [
    ['Hg', 0.0000, 0.0000, 0.0000],
    ['C', 3.9495, 0.0000, 0.0000],
    ['C', -3.9495, 0.0000, 0.0000],
    ['H', 3.2683, 1.6661, 0.9619],
    ['H', 3.2683, -1.6661, 0.9619],
    ['H', 3.2683, 0.0000, -1.9238],
    ['H', -3.2683, 1.6661, 0.9619],
    ['H', -3.2683, -1.6661, 0.9619],
    ['H', -3.2683, 0.0000, -1.9238]
  ],
  bonds: [
    [0, 1],
    [0, 2],
    [1, 3],
    [1, 4],
    [1, 5],
    [2, 6],
    [2, 7],
    [2, 8]
  ],
  he: 12,
});
