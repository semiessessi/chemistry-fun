#!/usr/bin/env node
// Import GIANT molecules from PDB and PubChem

import { writeFileSync } from 'fs';

const ANG_TO_BOHR = 1.8897259886;

// PDB parser for protein structures
async function fetchPDB(pdbId) {
  const url = `https://files.rcsb.org/download/${pdbId}.pdb`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`PDB error ${resp.status} for ${pdbId}`);

  const pdbText = await resp.text();

  // Parse ATOM/HETATM lines
  const atoms = [];
  const atomMap = new Map(); // serial -> index

  const lines = pdbText.split('\n');
  for (const line of lines) {
    if (line.startsWith('ATOM  ') || line.startsWith('HETATM')) {
      const serial = parseInt(line.substring(6, 11).trim());
      const atomName = line.substring(12, 16).trim();
      const resName = line.substring(17, 20).trim();
      const element = line.substring(76, 78).trim() || atomName[0]; // Element symbol
      const x = parseFloat(line.substring(30, 38).trim());
      const y = parseFloat(line.substring(38, 46).trim());
      const z = parseFloat(line.substring(46, 54).trim());

      // Skip if no valid element
      if (!element || element === '') continue;

      atomMap.set(serial, atoms.length);
      atoms.push([element, x * ANG_TO_BOHR, y * ANG_TO_BOHR, z * ANG_TO_BOHR]);
    }
  }

  // Parse CONECT records for bonds
  const bonds = [];
  for (const line of lines) {
    if (line.startsWith('CONECT')) {
      const parts = line.substring(6).trim().split(/\s+/).map(n => parseInt(n));
      const fromSerial = parts[0];
      const fromIdx = atomMap.get(fromSerial);

      for (let i = 1; i < parts.length; i++) {
        const toSerial = parts[i];
        const toIdx = atomMap.get(toSerial);

        if (fromIdx !== undefined && toIdx !== undefined && fromIdx < toIdx) {
          bonds.push([fromIdx, toIdx]);
        }
      }
    }
  }

  // If no CONECT records, infer bonds from distance (< 1.7 Å)
  if (bonds.length === 0) {
    console.log(`  No CONECT records, inferring bonds from distance...`);
    const maxDist = 1.7 * ANG_TO_BOHR; // Bond cutoff

    for (let i = 0; i < Math.min(atoms.length, 200); i++) { // Limit for speed
      for (let j = i + 1; j < Math.min(atoms.length, 200); j++) {
        const [el1, x1, y1, z1] = atoms[i];
        const [el2, x2, y2, z2] = atoms[j];

        const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

        if (dist < maxDist) {
          bonds.push([i, j]);
        }
      }
    }
    console.log(`  Inferred ${bonds.length} bonds`);
  }

  return { atoms, bonds };
}

// PubChem fetcher (reused from previous script)
const Z_TO_SYMBOL = {
  1:'H', 2:'He', 3:'Li', 4:'Be', 5:'B', 6:'C', 7:'N', 8:'O', 9:'F', 10:'Ne',
  11:'Na', 12:'Mg', 13:'Al', 14:'Si', 15:'P', 16:'S', 17:'Cl', 18:'Ar',
  19:'K', 20:'Ca', 22:'Ti', 24:'Cr', 25:'Mn', 26:'Fe', 27:'Co', 28:'Ni', 29:'Cu', 30:'Zn',
  23:'V', 42:'Mo', 44:'Ru', 45:'Rh', 46:'Pd', 47:'Ag', 50:'Sn', 51:'Sb', 52:'Te', 53:'I',
  74:'W', 78:'Pt', 79:'Au', 80:'Hg', 82:'Pb', 35:'Br', 34:'Se',
};

const SUBSCRIPT_MAP = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉' };
function formatFormula(plain) {
  return plain.replace(/(\d+)/g, (_, digits) =>
    [...digits].map(d => SUBSCRIPT_MAP[d] || d).join('')
  );
}

async function fetchPubChem(cid) {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/JSON?record_type=3d`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`PubChem error ${resp.status}`);

  const data = await resp.json();
  const compound = data.PC_Compounds?.[0];
  if (!compound) throw new Error('No compound data');

  const aids = compound.atoms?.aid || [];
  const elements = compound.atoms?.element || [];
  const conformer = compound.coords?.[0]?.conformers?.[0];
  if (!conformer) throw new Error('No 3D conformer');

  const xs = conformer.x || [];
  const ys = conformer.y || [];
  const zs = conformer.z || [];

  const atoms = aids.map((aid, i) => {
    const sym = Z_TO_SYMBOL[elements[i]];
    if (!sym) throw new Error(`Unknown element ${elements[i]}`);
    return [sym, xs[i] * ANG_TO_BOHR, ys[i] * ANG_TO_BOHR, zs[i] * ANG_TO_BOHR];
  });

  const bondData = compound.bonds || {};
  const aid1 = bondData.aid1 || [];
  const aid2 = bondData.aid2 || [];
  const orders = bondData.order || [];
  const bonds = aid1.map((a1, i) => {
    const idx1 = aids.indexOf(a1);
    const idx2 = aids.indexOf(aid2[i]);
    const order = orders[i] || 1;
    return order === 1 ? [idx1, idx2] : [idx1, idx2, order];
  });

  const props = compound.props || [];
  const formulaProp = props.find(p => p.urn?.label === 'Molecular Formula');
  const formula = formulaProp?.value?.sval || '';

  return { formula: formatFormula(formula), atoms, bonds };
}

function generateMoleculeCode(mol, category, displayName, id, source) {
  const { formula, atoms, bonds } = mol;
  const name = displayName;

  const he = Math.max(20, Math.min(80, 15 + Math.floor(atoms.length / 3)));

  const sourceInfo = source === 'pdb'
    ? `{
      type: 'pdb',
      id: '${id}',
      citation: 'Protein Data Bank',
      url: 'https://www.rcsb.org/structure/${id}'
    }`
    : `{
      type: 'pubchem',
      id: ${id},
      citation: 'PubChem Compound Database',
      url: 'https://pubchem.ncbi.nlm.nih.gov/compound/${id}'
    }`;

  return `
// ${name} - ${atoms.length} atoms! (${source.toUpperCase()} ${id})
addMol({
  name: '${name}',
  label: '${formula ? formula + ' ' : ''}(${displayName})' ,
  category: '${category}',
  atoms: [
${atoms.slice(0, 500).map(([el, x, y, z]) => // Limit to first 500 for file size
  `    ['${el}', ${x.toFixed(4)}, ${y.toFixed(4)}, ${z.toFixed(4)}]`
).join(',\n')}${atoms.length > 500 ? ',\n    // ... truncated for file size' : ''}
  ],
  bonds: [
${bonds.slice(0, 600).map(b => `    [${b.join(', ')}]`).join(',\n')}${bonds.length > 600 ? ',\n    // ... truncated' : ''}
  ],
  he: ${he},
  mos: [
    // Large molecule - MOs to be generated
  ],
  sources: {
    geometry: ${sourceInfo},
    mo: {
      type: 'auto',
      method: 'LCAO-auto (large molecule)'
    }
  }
});
`.trim();
}

// GIANT molecule database
const MOLECULES = [
  // Proteins from PDB
  { type: 'pdb', id: '1CRN', name: 'Crambin', displayName: 'Crambin (46 AA)', category: 'Protein' },
  { type: 'pdb', id: '2MHR', name: 'Myohemerythrin', displayName: 'Myohemerythrin', category: 'Protein' },
  { type: 'pdb', id: '1MBN', name: 'Myoglobin', displayName: 'Myoglobin (153 AA)', category: 'Protein' },
  { type: 'pdb', id: '5INS', name: 'Insulin', displayName: 'Insulin (51 AA)', category: 'Protein' },

  // Giant natural products from PubChem
  { type: 'pubchem', id: 5311497, name: 'Vitamin B12', displayName: 'Vitamin B12 (Cobalamin)', category: 'Vitamin B' },
  { type: 'pubchem', id: 36314, name: 'Taxol', displayName: 'Taxol (anticancer)', category: 'Drug' },
  { type: 'pubchem', id: 5978, name: 'Chlorophyll a', displayName: 'Chlorophyll a', category: 'Organic' },
  { type: 'pubchem', id: 5280343, name: 'Quercetin', displayName: 'Quercetin', category: 'Organic' },
  { type: 'pubchem', id: 5481173, name: 'Heme', displayName: 'Heme (Fe)', category: 'Organometallic' },
];

// Main execution
(async () => {
  const codes = [];

  for (const mol of MOLECULES) {
    try {
      console.log(`Fetching ${mol.type.toUpperCase()} ${mol.id}: ${mol.name}...`);

      let data;
      if (mol.type === 'pdb') {
        data = await fetchPDB(mol.id);
      } else {
        data = await fetchPubChem(mol.id);
      }

      console.log(`  Got ${data.atoms.length} atoms, ${data.bonds.length} bonds`);

      const code = generateMoleculeCode(data, mol.category, mol.displayName, mol.id, mol.type);
      codes.push(code);

      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`  Error: ${err.message}`);
    }
  }

  const fileContent = `import { addMol } from './core.js';\n\n${codes.join('\n\n')}
`;

  writeFileSync('js/molecules/giant-molecules.js', fileContent);
  console.log(`\n✓ Wrote ${codes.length} giant molecules to js/molecules/giant-molecules.js`);
})();
