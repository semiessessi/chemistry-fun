// Shared Morse potential parameters for diatomic molecules.
// Used by both bond-forming.js (dynamics mode) and reactions.js (reaction mode).

export const DIATOMIC_MORSE = {
  'H\u2082': { R_EQ: 1.401, De: 4.747, a: 1.028, elements: ['H', 'H'], bondOrder: 1 },
  'N\u2082': { R_EQ: 2.074, De: 9.759, a: 2.689, elements: ['N', 'N'], bondOrder: 3 },
  'O\u2082': { R_EQ: 2.282, De: 5.116, a: 2.667, elements: ['O', 'O'], bondOrder: 2 },
  'CO':      { R_EQ: 2.132, De: 11.09, a: 2.294, elements: ['C', 'O'], bondOrder: 3 },
};
