#!/usr/bin/env node
// Import MASSIVE proteins from PDB (4-8x larger than current biggest)
// Focus: 1,000-20,000 atoms, real structures, diverse elements

import { writeFileSync } from 'fs';

const ANG_TO_BOHR = 1.8897259886;

// Atomic mass table for formula calculation
const STANDARD_ELEMENTS = new Set([
  'H','He','Li','Be','B','C','N','O','F','Ne',
  'Na','Mg','Al','Si','P','S','Cl','Ar',
  'K','Ca','V','Cr','Mn','Fe','Co','Ni','Cu','Zn',
  'Ga','Ge','As','Se','Br','Kr',
  'Mo','Ru','Rh','Pd','Ag','Cd','Sn','Sb','Te','I','Xe',
  'W','Re','Os','Ir','Pt','Au','Hg','Pb','Bi',
]);

const SUBSCRIPT_MAP = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉' };
function toSubscript(n) {
  return String(n).split('').map(d => SUBSCRIPT_MAP[d] || d).join('');
}

function calcFormula(atoms) {
  const counts = {};
  for (const [el] of atoms) {
    if (STANDARD_ELEMENTS.has(el)) counts[el] = (counts[el] || 0) + 1;
  }
  const first = ['C','H'].filter(e => counts[e]);
  const rest = Object.keys(counts).filter(e => !['C','H'].includes(e)).sort();
  return [...first, ...rest].map(e => e + (counts[e] > 1 ? toSubscript(counts[e]) : '')).join('');
}

// Parse PDB file - heavy atoms only option to keep file manageable
async function fetchPDB(pdbId, options = {}) {
  const { heavyOnly = false, maxAtoms = 5000, chainId = null } = options;

  console.log(`  Fetching PDB ${pdbId}...`);
  const url = `https://files.rcsb.org/download/${pdbId}.pdb`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`PDB ${resp.status}`);
  const text = await resp.text();

  const atoms = [];
  const serialToIdx = new Map();
  const bondSet = new Set();
  const bonds = [];

  for (const line of text.split('\n')) {
    if (!line.startsWith('ATOM  ') && !line.startsWith('HETATM')) continue;

    const serial    = parseInt(line.substring(6, 11));
    const atomName  = line.substring(12, 16).trim();
    const chain     = line.substring(21, 22).trim();
    const element   = line.substring(76, 78).trim();
    const x = parseFloat(line.substring(30, 38));
    const y = parseFloat(line.substring(38, 46));
    const z = parseFloat(line.substring(46, 54));

    if (chainId && chain !== chainId) continue;
    if (heavyOnly && atomName.startsWith('H')) continue;
    if (isNaN(x) || isNaN(y) || isNaN(z)) continue;

    const sym = element || atomName.replace(/[^A-Za-z]/g, '').substring(0, 2);
    const symClean = sym.charAt(0).toUpperCase() + sym.slice(1).toLowerCase();
    if (!STANDARD_ELEMENTS.has(symClean)) continue;

    if (atoms.length >= maxAtoms) break;

    serialToIdx.set(serial, atoms.length);
    atoms.push([symClean, x * ANG_TO_BOHR, y * ANG_TO_BOHR, z * ANG_TO_BOHR]);
  }

  // Parse CONECT records
  for (const line of text.split('\n')) {
    if (!line.startsWith('CONECT')) continue;
    const parts = line.substring(6).trim().split(/\s+/).map(Number);
    const from = serialToIdx.get(parts[0]);
    if (from === undefined) continue;
    for (let i = 1; i < parts.length; i++) {
      const to = serialToIdx.get(parts[i]);
      if (to === undefined || from === to) continue;
      const key = from < to ? `${from},${to}` : `${to},${from}`;
      if (!bondSet.has(key)) { bondSet.add(key); bonds.push([Math.min(from,to), Math.max(from,to)]); }
    }
  }

  // Backbone bond inference for proteins when no CONECT (connect sequential C-alpha)
  if (bonds.length < atoms.length / 4) {
    console.log(`  Inferring bonds (only ${bonds.length} CONECT found for ${atoms.length} atoms)...`);
    const maxBondBohr = 1.9 * ANG_TO_BOHR;
    // Only infer for first 500 atoms to keep it fast
    const limit = Math.min(atoms.length, 500);
    for (let i = 0; i < limit; i++) {
      for (let j = i+1; j < limit; j++) {
        const dx = atoms[i][1]-atoms[j][1], dy = atoms[i][2]-atoms[j][2], dz = atoms[i][3]-atoms[j][3];
        if (dx*dx+dy*dy+dz*dz < maxBondBohr*maxBondBohr) {
          bonds.push([i, j]);
        }
        if (j - i > 10) break; // Only check nearby atoms for speed
      }
    }
  }

  return { atoms, bonds };
}

function molCode(mol, name, displayName, category, sourceType, sourceId) {
  const { atoms, bonds } = mol;
  const formula = calcFormula(atoms);
  const he = Math.max(25, Math.min(100, 18 + Math.floor(atoms.length / 8)));

  const sourceBlock = sourceType === 'pdb'
    ? `{ type: 'pdb', id: '${sourceId}', citation: 'RCSB Protein Data Bank', url: 'https://www.rcsb.org/structure/${sourceId}' }`
    : `{ type: 'pubchem', id: ${sourceId}, citation: 'PubChem Compound Database', url: 'https://pubchem.ncbi.nlm.nih.gov/compound/${sourceId}' }`;

  return `
// ${displayName} - ${atoms.length.toLocaleString()} atoms (${sourceType.toUpperCase()} ${sourceId})
addMol({
  name: '${name}',
  label: '${formula} (${displayName})' ,
  category: '${category}',
  atoms: [
${atoms.map(([el,x,y,z]) => `    ['${el}', ${x.toFixed(4)}, ${y.toFixed(4)}, ${z.toFixed(4)}]`).join(',\n')}
  ],
  bonds: [
${bonds.slice(0, 800).map(b => `    [${b.join(', ')}]`).join(',\n')}${bonds.length > 800 ? '\n    // ...more bonds not shown' : ''}
  ],
  he: ${he},
  mos: [
    // Large protein - MOs generated below
  ],
  sources: {
    geometry: ${sourceBlock},
    mo: { type: 'auto', method: 'LCAO-auto (protein backbone)' }
  }
});`.trim();
}

// MASSIVE proteins - target 8000-20000 atoms!
// We keep heavy atoms only and up to 5000-10000 atoms per molecule
const TARGETS = [
  // Hemoglobin - the user specifically asked for this!
  // 1A3N = deoxy-hemoglobin, 4 chains (α2β2) ~4,500 heavy atoms total
  { pdb: '1A3N', name: 'Hemoglobin', display: 'Hemoglobin (tetramer, deoxy)', cat: 'Protein', chain: null, max: 5000 },

  // Lysozyme - 129 AA, classic enzyme, nice medium size
  { pdb: '2LYZ', name: 'Lysozyme', display: 'Lysozyme (129 AA)', cat: 'Protein', chain: null, max: 2000 },

  // Cytochrome c - 104 AA with HEME, contains Fe!
  { pdb: '1HRC', name: 'Cytochrome c', display: 'Cytochrome c (Fe-heme, 104 AA)', cat: 'Protein', chain: null, max: 2000 },

  // Thrombin - serine protease, ~4000 atoms, medical importance
  { pdb: '1PPB', name: 'Thrombin', display: 'Thrombin (serine protease)', cat: 'Protein', chain: null, max: 5000 },

  // Green Fluorescent Protein - GFP, 238 AA, famous in biology
  { pdb: '1EMA', name: 'GFP', display: 'Green Fluorescent Protein (GFP)', cat: 'Protein', chain: null, max: 4000 },

  // Hexokinase - 460 AA, phosphorylates glucose in glycolysis
  { pdb: '1HKG', name: 'Hexokinase', display: 'Hexokinase (460 AA)', cat: 'Enzyme', chain: null, max: 7000 },

  // Serum albumin - 585 AA, most abundant blood protein
  { pdb: '1AO6', name: 'Serum albumin', display: 'Human Serum Albumin (585 AA)', cat: 'Protein', chain: null, max: 8000 },

  // Calmodulin - 148 AA, Ca2+ signalling, contains Ca!
  { pdb: '1CLL', name: 'Calmodulin', display: 'Calmodulin (Ca²⁺ binding)', cat: 'Protein', chain: null, max: 2000 },

  // Acetylcholinesterase - 537 AA, nerve signal enzyme, 4 AChE molecules need degraded
  { pdb: '1ACL', name: 'Acetylcholinesterase', display: 'Acetylcholinesterase (537 AA)', cat: 'Enzyme', chain: null, max: 7000 },

  // Adenylate kinase - catalyzes ATP + AMP → 2 ADP, 214 AA
  { pdb: '4AKE', name: 'Adenylate kinase', display: 'Adenylate Kinase (214 AA)', cat: 'Enzyme', chain: null, max: 3500 },
];

const codes = [];

(async () => {
  for (const t of TARGETS) {
    try {
      const data = await fetchPDB(t.pdb, { heavyOnly: false, maxAtoms: t.max, chainId: t.chain });
      console.log(`  ✓ ${t.display}: ${data.atoms.length} atoms, ${data.bonds.length} bonds`);

      if (data.atoms.length < 100) { console.log('  Skipping - too few atoms'); continue; }
      codes.push(molCode(data, t.name, t.display, t.cat, 'pdb', t.pdb));
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      console.error(`  ✗ ${t.display}: ${e.message}`);
    }
  }

  const out = `import { addMol } from './core.js';\n\n${codes.join('\n\n')}\n`;
  writeFileSync('js/molecules/proteins-large.js', out);
  console.log(`\n✓ Wrote ${codes.length} proteins to js/molecules/proteins-large.js`);
})();
