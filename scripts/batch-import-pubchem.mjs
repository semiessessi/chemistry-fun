#!/usr/bin/env node
// Batch import molecules from PubChem and generate molecule definition files

import { writeFileSync } from 'fs';

const ANG_TO_BOHR = 1.8897259886;

const Z_TO_SYMBOL = {
  1:'H', 2:'He', 3:'Li', 4:'Be', 5:'B', 6:'C', 7:'N', 8:'O', 9:'F', 10:'Ne',
  11:'Na', 12:'Mg', 13:'Al', 14:'Si', 15:'P', 16:'S', 17:'Cl', 18:'Ar',
  19:'K', 20:'Ca', 22:'Ti', 25:'Mn', 26:'Fe', 27:'Co', 28:'Ni', 29:'Cu', 30:'Zn',
  32:'Ge', 33:'As', 34:'Se', 35:'Br', 36:'Kr', 42:'Mo', 47:'Ag', 50:'Sn', 53:'I',
  54:'Xe', 75:'Re', 78:'Pt', 79:'Au', 80:'Hg', 82:'Pb', 83:'Bi', 92:'U',
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
  if (!resp.ok) {
    throw new Error(`PubChem error ${resp.status} for CID ${cid}`);
  }

  const data = await resp.json();
  const compound = data.PC_Compounds?.[0];
  if (!compound) throw new Error('No compound data');

  const aids = compound.atoms?.aid || [];
  const elements = compound.atoms?.element || [];
  const conformer = compound.coords?.[0]?.conformers?.[0];
  if (!conformer) throw new Error(`No 3D conformer for CID ${cid}`);

  const xs = conformer.x || [];
  const ys = conformer.y || [];
  const zs = conformer.z || [];

  // Build atoms array
  const atoms = aids.map((aid, i) => {
    const sym = Z_TO_SYMBOL[elements[i]];
    if (!sym) throw new Error(`Unknown element ${elements[i]}`);
    return [sym, xs[i] * ANG_TO_BOHR, ys[i] * ANG_TO_BOHR, zs[i] * ANG_TO_BOHR];
  });

  // Extract bonds
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

  // Get properties
  const props = compound.props || [];
  const formulaProp = props.find(p => p.urn?.label === 'Molecular Formula');
  const formula = formulaProp?.value?.sval || '';
  const iupacProp = props.find(p => p.urn?.label === 'IUPAC Name' && p.urn?.name === 'Preferred');
  const iupacName = iupacProp?.value?.sval || '';

  return {
    cid,
    formula: formatFormula(formula),
    iupacName,
    atoms,
    bonds
  };
}

function generateMoleculeCode(mol, category, displayName) {
  const { cid, formula, iupacName, atoms, bonds } = mol;
  const name = displayName || formula;

  // Estimate halfExtent based on number of atoms
  const he = Math.max(12, Math.min(30, 10 + Math.floor(atoms.length / 5)));

  return `
// ${name} - ${iupacName}
addMol({
  name: '${name}',
  label: '${formula} (${displayName || iupacName})' ,
  category: '${category}',
  pubchemCid: ${cid},
  atoms: [
${atoms.map(([el, x, y, z]) =>
  `    ['${el}', ${x.toFixed(4)}, ${y.toFixed(4)}, ${z.toFixed(4)}]`
).join(',\n')}
  ],
  bonds: [
${bonds.map(b => `    [${b.join(', ')}]`).join(',\n')}
  ],
  he: ${he},
  mos: [
    // TODO: Generate MOs using pubchem-mo.js generateMOs() or add manually
  ],
  sources: {
    geometry: {
      type: 'pubchem',
      id: ${cid},
      citation: 'PubChem Compound Database',
      url: 'https://pubchem.ncbi.nlm.nih.gov/compound/${cid}'
    },
    mo: {
      type: 'auto',
      method: 'LCAO-auto (to be generated)'
    }
  }
});
`.trim();
}

// Molecule database to import
const MOLECULES_TO_IMPORT = {
  saccharides: [
    { cid: 5779, name: 'Ribose', displayName: 'Ribose' },
    { cid: 5984, name: 'Fructose', displayName: 'Fructose' },
    { cid: 6134, name: 'Lactose', displayName: 'Lactose' },
    { cid: 10991283, name: 'Maltose', displayName: 'Maltose' },
    { cid: 135191, name: 'Xylose', displayName: 'Xylose' },
  ],
  oligopeptides: [
    { cid: 90488, name: 'Gly-Gly-Gly', displayName: 'Gly-Gly-Gly' },
    { cid: 7009340, name: 'Ala-Gly-Gly', displayName: 'Ala-Gly-Gly' },
    { cid: 439680, name: 'Gly-Pro-Hyp', displayName: 'Gly-Pro-Hyp' },
    { cid: 7009329, name: 'Ser-Gly', displayName: 'Ser-Gly' },
    { cid: 7009365, name: 'Val-Ala', displayName: 'Val-Ala' },
  ],
  lipids: [
    { cid: 753, name: 'Glycerol', displayName: 'Glycerol' },
    { cid: 1030, name: 'Propylene glycol', displayName: 'Propylene glycol' },
    { cid: 985, name: 'Palmitic acid', displayName: 'Palmitic acid' },
    { cid: 5281, name: 'Stearic acid', displayName: 'Stearic acid' },
  ],
  vitaminsB: [
    { cid: 1130, name: 'Thiamine', displayName: 'Vitamin B1 (Thiamine)' },
    { cid: 493570, name: 'Riboflavin', displayName: 'Vitamin B2 (Riboflavin)' },
    { cid: 938, name: 'Niacin', displayName: 'Vitamin B3 (Niacin)' },
    { cid: 6613, name: 'Pantothenic acid', displayName: 'Vitamin B5' },
    { cid: 1054, name: 'Pyridoxine', displayName: 'Vitamin B6 (Pyridoxine)' },
    { cid: 171548, name: 'Biotin', displayName: 'Vitamin B7 (Biotin)' },
    { cid: 6037, name: 'Folic acid', displayName: 'Vitamin B9 (Folic acid)' },
  ],
  neurotransmitters: [
    { cid: 89594, name: 'Nicotine', displayName: 'Nicotine' },
    { cid: 305, name: 'Choline', displayName: 'Choline' },
    { cid: 187, name: 'Acetylcholine', displayName: 'Acetylcholine' },
  ],
};

// Main execution
const category = process.argv[2];
const outputFile = process.argv[3];

if (!category || !outputFile) {
  console.error('Usage: node batch-import-pubchem.mjs <category> <output-file>');
  console.error('Categories:', Object.keys(MOLECULES_TO_IMPORT).join(', '));
  process.exit(1);
}

const molecules = MOLECULES_TO_IMPORT[category];
if (!molecules) {
  console.error(`Unknown category: ${category}`);
  process.exit(1);
}

console.log(`Fetching ${molecules.length} molecules for category: ${category}`);

const categoryNames = {
  saccharides: 'Sugar',
  oligopeptides: 'Peptide',
  lipids: 'Lipid',
  vitaminsB: 'Vitamin B',
  neurotransmitters: 'Neurotransmitter',
};

(async () => {
  const codes = [];

  for (const { cid, name, displayName } of molecules) {
    try {
      console.log(`Fetching CID ${cid}: ${name}...`);
      const mol = await fetchPubChem(cid);
      const code = generateMoleculeCode(mol, categoryNames[category], displayName);
      codes.push(code);

      // Rate limit: wait 0.5s between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error(`Error fetching ${name} (CID ${cid}):`, err.message);
    }
  }

  const fileContent = `import { addMol } from './core.js';\n\n${codes.join('\n\n')}
`;

  writeFileSync(outputFile, fileContent);
  console.log(`\nWrote ${codes.length} molecules to ${outputFile}`);
})();
