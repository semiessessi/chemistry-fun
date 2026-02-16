// PubChem PUG REST API integration: fetch, parse, convert.

import { ELEMENTS } from './molecules/element-data.js';
import { generateMOs } from './pubchem-mo.js';

export const ANG_TO_BOHR = 1.8897259886;

// Atomic number → element symbol
export const Z_TO_SYMBOL = {
  1:'H', 2:'He', 3:'Li', 4:'Be', 5:'B', 6:'C', 7:'N', 8:'O', 9:'F', 10:'Ne',
  11:'Na', 12:'Mg', 13:'Al', 14:'Si', 15:'P', 16:'S', 17:'Cl', 18:'Ar',
  19:'K', 20:'Ca', 22:'Ti', 25:'Mn', 26:'Fe', 27:'Co', 28:'Ni', 29:'Cu', 30:'Zn',
  32:'Ge', 33:'As', 34:'Se', 35:'Br', 36:'Kr', 42:'Mo', 47:'Ag', 50:'Sn', 53:'I',
  54:'Xe', 75:'Re', 78:'Pt', 79:'Au', 80:'Hg', 82:'Pb', 83:'Bi', 92:'U',
};

// Default CPK colors + covalent radii for elements PubChem may return
const FALLBACK_ELEMENTS = {
  Li: { color: 0xcc80ff, radius: 0.52 },
  Be: { color: 0xc2ff00, radius: 0.38 },
  B:  { color: 0xffb5b5, radius: 0.36 },
  Si: { color: 0xf0c8a0, radius: 0.46 },
  K:  { color: 0x8f40d4, radius: 0.62 },
  Mg: { color: 0x8aff00, radius: 0.55 },
  Mn: { color: 0x9c7ac7, radius: 0.50 },
  Co: { color: 0xf090a0, radius: 0.48 },
  Ni: { color: 0x50d050, radius: 0.48 },
  Zn: { color: 0x7d80b0, radius: 0.48 },
  As: { color: 0xbd80e3, radius: 0.44 },
  Se: { color: 0xffa100, radius: 0.46 },
  Br: { color: 0xa62929, radius: 0.44 },
  Ag: { color: 0xc0c0c0, radius: 0.52 },
  I:  { color: 0x940094, radius: 0.50 },
  Pt: { color: 0xd0d0e0, radius: 0.50 },
  Au: { color: 0xffd123, radius: 0.50 },
  Hg: { color: 0xb8b8d0, radius: 0.50 },
};

// Ensure ELEMENTS table has an entry (add at runtime if missing)
function ensureElement(sym) {
  if (!ELEMENTS[sym]) {
    ELEMENTS[sym] = FALLBACK_ELEMENTS[sym] || { color: 0xcccccc, radius: 0.40 };
  }
}

// Convert plain-text formula "C6H12O6" → Unicode subscripts "C₆H₁₂O₆"
const SUBSCRIPT_MAP = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉' };
export function formatFormula(plain) {
  return plain.replace(/(\d+)/g, (_, digits) =>
    [...digits].map(d => SUBSCRIPT_MAP[d] || d).join('')
  );
}

/**
 * Fetch molecule data from PubChem PUG REST API.
 * @param {string} query - molecule name or CID number
 * @returns {{ cid, name, iupacName, formula, atoms, bonds, he, mos }}
 */
export async function fetchPubChem(query) {
  const q = query.trim();
  if (!q) throw new Error('Empty search query');

  // Determine endpoint: numeric → CID, otherwise → name
  const isNumeric = /^\d+$/.test(q);
  const path = isNumeric ? `cid/${q}` : `name/${encodeURIComponent(q)}`;
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/${path}/JSON?record_type=3d`;

  let resp;
  try {
    resp = await fetch(url);
  } catch (e) {
    throw new Error('Network error connecting to PubChem');
  }

  if (!resp.ok) {
    if (resp.status === 404) {
      throw new Error(`No 3D structure found for "${q}". Try a different name or CID.`);
    }
    const text = await resp.text().catch(() => '');
    // PubChem returns JSON errors for some cases
    try {
      const err = JSON.parse(text);
      if (err.Fault) throw new Error(err.Fault.Message || 'PubChem error');
    } catch (_) { /* not JSON */ }
    throw new Error(`PubChem error (${resp.status}): ${text.slice(0, 100)}`);
  }

  const data = await resp.json();
  const compound = data.PC_Compounds?.[0];
  if (!compound) throw new Error('No compound data in PubChem response');

  const cid = compound.id?.id?.cid;
  if (!cid) throw new Error('No CID in PubChem response');

  // Extract atoms
  const aids = compound.atoms?.aid || [];
  const elements = compound.atoms?.element || [];
  const conformer = compound.coords?.[0]?.conformers?.[0];
  if (!conformer) throw new Error(`No 3D conformer data for "${q}". This molecule may not have computed 3D coordinates.`);

  const xs = conformer.x || [];
  const ys = conformer.y || [];
  const zs = conformer.z || [];

  if (aids.length === 0 || aids.length !== xs.length) {
    throw new Error('Malformed atom/coordinate data from PubChem');
  }

  // Map aids to 0-indexed, convert coords Å → Bohr
  const aidToIdx = {};
  const atoms = [];
  for (let i = 0; i < aids.length; i++) {
    aidToIdx[aids[i]] = i;
    const sym = Z_TO_SYMBOL[elements[i]] || 'X';
    ensureElement(sym);
    atoms.push([sym, xs[i] * ANG_TO_BOHR, ys[i] * ANG_TO_BOHR, zs[i] * ANG_TO_BOHR]);
  }

  // Extract bonds (convert 1-indexed aids → 0-indexed)
  const bAid1 = compound.bonds?.aid1 || [];
  const bAid2 = compound.bonds?.aid2 || [];
  const bOrder = compound.bonds?.order || [];
  const bonds = [];
  for (let i = 0; i < bAid1.length; i++) {
    const ai = aidToIdx[bAid1[i]];
    const aj = aidToIdx[bAid2[i]];
    const order = bOrder[i] || 1;
    if (ai !== undefined && aj !== undefined) {
      bonds.push([ai, aj, order]);
    }
  }

  // Compute half-extent from max atom coordinate + padding
  let maxCoord = 0;
  for (const [, x, y, z] of atoms) {
    maxCoord = Math.max(maxCoord, Math.abs(x), Math.abs(y), Math.abs(z));
  }
  const he = Math.max(12, Math.ceil(maxCoord + 8));

  // Extract properties (name, IUPAC name, formula)
  let name = q, iupacName = '', formula = '';
  const props = compound.props || [];
  for (const prop of props) {
    const urn = prop.urn;
    const val = prop.value?.sval;
    if (!val) continue;
    if (urn?.label === 'IUPAC Name' && urn?.name === 'Preferred') iupacName = val;
    if (urn?.label === 'Molecular Formula') formula = val;
  }
  if (!iupacName) {
    // Try any IUPAC name
    for (const prop of props) {
      if (prop.urn?.label === 'IUPAC Name' && prop.value?.sval) {
        iupacName = prop.value.sval;
        break;
      }
    }
  }

  // Use IUPAC name as display name if query was numeric
  if (isNumeric && iupacName) name = iupacName;

  // Generate MOs from bond/atom data
  const mos = generateMOs(atoms, bonds);

  return { cid, name, iupacName, formula, atoms, bonds, he, mos };
}

/**
 * Returns the PubChem compound page URL for a given CID.
 */
export function pubchemUrl(cid) {
  return `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`;
}

/**
 * Returns a formatted citation string per PubChem guidelines.
 */
export function pubchemCitation(name, cid) {
  const today = new Date();
  const months = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  const dateStr = `${months[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;
  return `National Center for Biotechnology Information (${today.getFullYear()}). ` +
    `PubChem Compound Summary for CID ${cid}, ${name}. ` +
    `Retrieved ${dateStr} from ${pubchemUrl(cid)}.`;
}
