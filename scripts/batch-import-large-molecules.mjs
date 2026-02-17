#!/usr/bin/env node
// Batch import large and diverse molecules with many elements

import { writeFileSync } from 'fs';

const ANG_TO_BOHR = 1.8897259886;

const Z_TO_SYMBOL = {
  1:'H', 2:'He', 3:'Li', 4:'Be', 5:'B', 6:'C', 7:'N', 8:'O', 9:'F', 10:'Ne',
  11:'Na', 12:'Mg', 13:'Al', 14:'Si', 15:'P', 16:'S', 17:'Cl', 18:'Ar',
  19:'K', 20:'Ca', 22:'Ti', 24:'Cr', 25:'Mn', 26:'Fe', 27:'Co', 28:'Ni', 29:'Cu', 30:'Zn',
  23:'V', 31:'Ga', 32:'Ge', 33:'As', 34:'Se', 35:'Br', 36:'Kr',
  42:'Mo', 44:'Ru', 45:'Rh', 46:'Pd', 47:'Ag', 48:'Cd', 50:'Sn', 51:'Sb',
  52:'Te', 53:'I', 54:'Xe', 74:'W', 75:'Re', 78:'Pt', 79:'Au', 80:'Hg',
  82:'Pb', 83:'Bi', 84:'Po', 92:'U',
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

  const he = Math.max(14, Math.min(50, 12 + Math.floor(atoms.length / 4)));

  return `
// ${name} - ${iupacName || 'CID ' + cid}
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
    // Auto-generated MOs via fix-mos.mjs
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
      method: 'LCAO-auto'
    }
  }
});
`.trim();
}

// Expanded molecule database
const MOLECULES_TO_IMPORT = {
  nucleotides: [
    { cid: 5957, name: 'AMP', displayName: 'Adenosine monophosphate' },
    { cid: 6022, name: 'ADP', displayName: 'Adenosine diphosphate' },
    { cid: 5957, name: 'ATP', displayName: 'Adenosine triphosphate' },
    { cid: 6076, name: 'GMP', displayName: 'Guanosine monophosphate' },
    { cid: 8977, name: 'GTP', displayName: 'Guanosine triphosphate' },
    { cid: 6083, name: 'cAMP', displayName: 'Cyclic AMP' },
    { cid: 5893, name: 'UMP', displayName: 'Uridine monophosphate' },
    { cid: 6133, name: 'CMP', displayName: 'Cytidine monophosphate' },
  ],

  coenzymes: [
    { cid: 5892, name: 'NAD+', displayName: 'Nicotinamide adenine dinucleotide' },
    { cid: 439153, name: 'NADH', displayName: 'NADH (reduced)' },
    { cid: 5886, name: 'NADP+', displayName: 'NADP+' },
    { cid: 5884, name: 'FAD', displayName: 'Flavin adenine dinucleotide' },
    { cid: 6015, name: 'Coenzyme A', displayName: 'Coenzyme A' },
  ],

  largeSugars: [
    { cid: 439586, name: 'Maltotriose', displayName: 'Maltotriose' },
    { cid: 439357, name: 'Maltotetraose', displayName: 'Maltotetraose' },
    { cid: 440995, name: 'Raffinose', displayName: 'Raffinose' },
    { cid: 439190, name: 'Stachyose', displayName: 'Stachyose' },
  ],

  largePeptides: [
    { cid: 16129778, name: 'Gly-Gly-Gly-Gly', displayName: 'Tetraglycine' },
    { cid: 3081884, name: 'GGGG', displayName: 'Pentaglycine' },
    { cid: 164583, name: 'Glutathione', displayName: 'Glutathione (GSH)' },
    { cid: 444795, name: 'Oxytocin', displayName: 'Oxytocin' }, // 9 AA
    { cid: 439508, name: 'Vasopressin', displayName: 'Vasopressin' }, // 9 AA
  ],

  organometallics: [
    { cid: 7505, name: 'Ferrocene', displayName: 'Ferrocene (Fe)' },
    { cid: 11960555, name: 'Titanocene dichloride', displayName: 'Titanocene dichloride' },
    { cid: 26078, name: 'Cisplatin', displayName: 'Cisplatin (Pt)' },
    { cid: 77991, name: 'Grubbs catalyst', displayName: 'Grubbs catalyst (Ru)' },
  ],

  metalComplexes: [
    { cid: 24437, name: 'Zinc acetate', displayName: 'Zinc acetate' },
    { cid: 24604, name: 'Cobalt(II) acetate', displayName: 'Cobalt(II) acetate' },
    { cid: 61474, name: 'Nickel(II) acetate', displayName: 'Nickel(II) acetate' },
    { cid: 159414, name: 'Vanadyl sulfate', displayName: 'Vanadyl sulfate (V)' },
  ],

  halogenCompounds: [
    { cid: 24841, name: 'Iodoform', displayName: 'Iodoform (CHI₃)' },
    { cid: 6327, name: 'Bromoform', displayName: 'Bromoform (CHBr₃)' },
    { cid: 6212, name: 'Carbon tetraiodide', displayName: 'Carbon tetraiodide' },
    { cid: 11718144, name: 'Iodobenzene', displayName: 'Iodobenzene' },
    { cid: 7847, name: 'Bromobenzene', displayName: 'Bromobenzene' },
  ],

  heavyElements: [
    { cid: 24880, name: 'Tin(IV) chloride', displayName: 'Tin(IV) chloride' },
    { cid: 24814, name: 'Antimony trichloride', displayName: 'Antimony trichloride' },
    { cid: 24297, name: 'Silver nitrate', displayName: 'Silver nitrate' },
    { cid: 14791, name: 'Tungsten hexafluoride', displayName: 'Tungsten hexafluoride' },
    { cid: 24915, name: 'Selenium dioxide', displayName: 'Selenium dioxide' },
  ],

  siliconCompounds: [
    { cid: 6327, name: 'Tetramethylsilane', displayName: 'Tetramethylsilane (TMS)' },
    { cid: 6327, name: 'PDMS unit', displayName: 'Polydimethylsiloxane unit' },
    { cid: 6327, name: 'Silanol', displayName: 'Silanol' },
  ],
};

// Main execution
const category = process.argv[2];
const outputFile = process.argv[3];

if (!category || !outputFile) {
  console.error('Usage: node batch-import-large-molecules.mjs <category> <output-file>');
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
  nucleotides: 'Nucleotide',
  coenzymes: 'Coenzyme',
  largeSugars: 'Sugar',
  largePeptides: 'Peptide',
  organometallics: 'Organometallic',
  metalComplexes: 'Metal Complex',
  halogenCompounds: 'Halide',
  heavyElements: 'Heavy Element',
  siliconCompounds: 'Silicon Compound',
};

(async () => {
  const codes = [];

  for (const { cid, name, displayName } of molecules) {
    try {
      console.log(`Fetching CID ${cid}: ${name}...`);
      const mol = await fetchPubChem(cid);
      const code = generateMoleculeCode(mol, categoryNames[category], displayName);
      codes.push(code);

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
