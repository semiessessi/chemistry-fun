#!/usr/bin/env node
// Re-import molecules by searching PubChem by name (more reliable than CIDs)

import { writeFileSync } from 'fs';

const ANG_TO_BOHR = 1.8897259886;

const Z_TO_SYMBOL = {
  1:'H', 2:'He', 3:'Li', 4:'Be', 5:'B', 6:'C', 7:'N', 8:'O', 9:'F', 10:'Ne',
  11:'Na', 12:'Mg', 13:'Al', 14:'Si', 15:'P', 16:'S', 17:'Cl', 18:'Ar',
  19:'K', 20:'Ca', 22:'Ti', 24:'Cr', 25:'Mn', 26:'Fe', 27:'Co', 28:'Ni', 29:'Cu', 30:'Zn',
  23:'V', 34:'Se', 35:'Br', 42:'Mo', 44:'Ru', 46:'Pd', 47:'Ag', 50:'Sn', 51:'Sb', 53:'I',
  74:'W', 78:'Pt', 79:'Au', 80:'Hg', 82:'Pb', 83:'Bi',
};

const SUBSCRIPT_MAP = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉' };
function toSub(n) { return String(n).split('').map(d => SUBSCRIPT_MAP[d]||d).join(''); }

function calcFormula(atoms) {
  const c = {};
  for (const [el] of atoms) c[el] = (c[el]||0)+1;
  const f = ['C','H'].filter(e=>c[e]);
  const r = Object.keys(c).filter(e=>!['C','H'].includes(e)).sort();
  return [...f,...r].map(e=>e+(c[e]>1?toSub(c[e]):'')).join('');
}

async function fetchByName(name) {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/JSON?record_type=3d`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`PubChem ${resp.status} for "${name}"`);

  const data = await resp.json();
  const compound = data.PC_Compounds?.[0];
  if (!compound) throw new Error('No compound');

  const cid = compound.id?.id?.cid;
  const aids = compound.atoms?.aid || [];
  const elements = compound.atoms?.element || [];
  const conformer = compound.coords?.[0]?.conformers?.[0];
  if (!conformer) throw new Error('No 3D conformer');

  const xs = conformer.x || [], ys = conformer.y || [], zs = conformer.z || [];
  const atoms = aids.map((_, i) => {
    const sym = Z_TO_SYMBOL[elements[i]];
    if (!sym) throw new Error(`Unknown element ${elements[i]}`);
    return [sym, xs[i]*ANG_TO_BOHR, ys[i]*ANG_TO_BOHR, zs[i]*ANG_TO_BOHR];
  });

  const bondData = compound.bonds || {};
  const bonds = (bondData.aid1||[]).map((a1,i) => {
    const idx1 = aids.indexOf(a1), idx2 = aids.indexOf(bondData.aid2[i]);
    const order = bondData.order[i]||1;
    return order===1 ? [idx1,idx2] : [idx1,idx2,order];
  });

  return { cid, atoms, bonds };
}

function molCode(mol, displayName, category) {
  const { cid, atoms, bonds } = mol;
  const formula = calcFormula(atoms);
  const he = Math.max(12, Math.min(30, 10 + Math.floor(atoms.length/5)));

  return `
// ${displayName} (CID ${cid})
addMol({
  name: '${displayName}',
  label: '${formula} (${displayName})' ,
  category: '${category}',
  pubchemCid: ${cid},
  atoms: [
${atoms.map(([el,x,y,z])=>`    ['${el}', ${x.toFixed(4)}, ${y.toFixed(4)}, ${z.toFixed(4)}]`).join(',\n')}
  ],
  bonds: [
${bonds.map(b=>`    [${b.join(', ')}]`).join(',\n')}
  ],
  he: ${he},
  mos: [],
  sources: {
    geometry: { type: 'pubchem', id: ${cid}, citation: 'PubChem Compound Database', url: 'https://pubchem.ncbi.nlm.nih.gov/compound/${cid}' },
    mo: { type: 'auto', method: 'LCAO-auto' }
  }
});`.trim();
}

// Molecules to re-import - searched by name
const MOLECULES = [
  // Fixed oligopeptides
  { name: 'Gly-Gly-Gly', displayName: 'Gly-Gly-Gly', category: 'Peptide' },
  { name: 'Ala-Gly-Gly', displayName: 'Ala-Gly-Gly', category: 'Peptide' },
  { name: 'Gly-Gly-Ala', displayName: 'Gly-Gly-Ala', category: 'Peptide' },
  { name: 'Val-Ala', displayName: 'Val-Ala', category: 'Peptide' },
  { name: 'Ser-Gly', displayName: 'Ser-Gly', category: 'Peptide' },
  // Larger peptides
  { name: 'Tetraglycine', displayName: 'Tetraglycine (Gly×4)', category: 'Peptide' },
  { name: 'Pentaglycine', displayName: 'Pentaglycine (Gly×5)', category: 'Peptide' },
  { name: 'Leu-enkephalin', displayName: 'Leu-enkephalin', category: 'Peptide' },
  { name: 'Met-enkephalin', displayName: 'Met-enkephalin', category: 'Peptide' },
  // Coenzyme A (correct CID)
  { name: 'Coenzyme A', displayName: 'Coenzyme A', category: 'Coenzyme' },
  // Fix stachyose and maltotetraose
  { name: 'Stachyose', displayName: 'Stachyose', category: 'Sugar' },
  { name: 'Maltotetraose', displayName: 'Maltotetraose', category: 'Sugar' },
  // Vitamin B12
  { name: 'Cyanocobalamin', displayName: 'Vitamin B12 (Cyanocobalamin)', category: 'Vitamin B' },
  // Taxol
  { name: 'Paclitaxel', displayName: 'Paclitaxel (Taxol)', category: 'Drug' },
  // Chlorophyll a
  { name: 'Chlorophyll a', displayName: 'Chlorophyll a (Mg)', category: 'Organic' },
];

(async () => {
  const codes = [];
  let succeeded = 0, failed = 0;

  for (const m of MOLECULES) {
    try {
      process.stdout.write(`  Searching "${m.name}"...`);
      const mol = await fetchByName(m.name);
      const formula = calcFormula(mol.atoms);
      console.log(` CID ${mol.cid}, ${mol.atoms.length} atoms → ${formula}`);
      codes.push(molCode(mol, m.displayName, m.category));
      succeeded++;
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.log(` FAILED: ${e.message}`);
      failed++;
    }
  }

  const out = `import { addMol } from './core.js';\n\n${codes.join('\n\n')}\n`;
  writeFileSync('js/molecules/corrected-molecules.js', out);
  console.log(`\n✓ ${succeeded} succeeded, ${failed} failed`);
  console.log('Written to js/molecules/corrected-molecules.js');
})();
