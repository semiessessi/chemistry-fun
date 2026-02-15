// PubChem PUG REST API integration: fetch, parse, convert, auto-MO generation.

import { ELEMENTS } from './molecules/core.js';

export const ANG_TO_BOHR = 1.8897259886;

// Atomic number → element symbol
export const Z_TO_SYMBOL = {
  1:'H', 2:'He', 3:'Li', 4:'Be', 5:'B', 6:'C', 7:'N', 8:'O', 9:'F', 10:'Ne',
  11:'Na', 12:'Mg', 13:'Al', 14:'Si', 15:'P', 16:'S', 17:'Cl', 18:'Ar',
  19:'K', 20:'Ca', 22:'Ti', 25:'Mn', 26:'Fe', 27:'Co', 28:'Ni', 29:'Cu', 30:'Zn',
  33:'As', 34:'Se', 35:'Br', 47:'Ag', 53:'I', 78:'Pt', 79:'Au', 80:'Hg',
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

// Valence shell principal quantum number
const VALENCE_N = {
  H:1, He:1,
  Li:2, Be:2, B:2, C:2, N:2, O:2, F:2, Ne:2,
  Na:3, Mg:3, Al:3, Si:3, P:3, S:3, Cl:3, Ar:3,
  K:4, Ca:4, Ti:4, Mn:4, Fe:4, Co:4, Ni:4, Cu:4, Zn:4,
  As:4, Se:4, Br:4,
  Ag:5, I:5,
  Pt:6, Au:6, Hg:6,
};

// Typical valence (number of bonds expected)
const TYPICAL_VALENCE = {
  H:1, C:4, N:3, O:2, F:1, S:2, Cl:1, Br:1, I:1, P:3, Si:4,
  Na:1, K:1, Ca:2, Mg:2, Al:3, Fe:3, Cu:2, Ti:4,
};

// Electronegativity (Pauling scale, approximate)
const ELECTRONEGATIVITY = {
  H:2.2, C:2.55, N:3.04, O:3.44, F:3.98, S:2.58, Cl:3.16,
  Br:2.96, I:2.66, P:2.19, Si:1.90, Na:0.93, K:0.82, Ca:1.0,
  Mg:1.31, Al:1.61, Fe:1.83, Cu:1.90, Ti:1.54, B:2.04,
};

// Convert plain-text formula "C6H12O6" → Unicode subscripts "C₆H₁₂O₆"
const SUBSCRIPT_MAP = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉' };
export function formatFormula(plain) {
  return plain.replace(/(\d+)/g, (_, digits) =>
    [...digits].map(d => SUBSCRIPT_MAP[d] || d).join('')
  );
}

// Build a rotation matrix that maps global z → dir (unit vector).
// Returns flat 9-element array [m00..m22] for term.rot.
export function buildRotationMatrix(dx, dy, dz) {
  const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
  if (len < 1e-10) return [1,0,0, 0,1,0, 0,0,1];
  const zx = dx/len, zy = dy/len, zz = dz/len;

  // Pick a reference vector not parallel to z-axis
  let refx, refy, refz;
  if (Math.abs(zz) < 0.9) {
    refx = 0; refy = 0; refz = 1;
  } else {
    refx = 1; refy = 0; refz = 0;
  }

  // x-axis = ref × z (cross product), normalized
  let xx = refy*zz - refz*zy;
  let xy = refz*zx - refx*zz;
  let xz = refx*zy - refy*zx;
  const xLen = Math.sqrt(xx*xx + xy*xy + xz*xz);
  xx /= xLen; xy /= xLen; xz /= xLen;

  // y-axis = z × x
  const yx = zy*xz - zz*xy;
  const yy = zz*xx - zx*xz;
  const yz = zx*xy - zy*xx;

  // Rotation matrix: maps local coords to global, so the INVERSE (transpose) maps global → local
  // term.rot rotates displacement into local frame, so we want columns = [x, y, z]:
  // rot * [global_dx, global_dy, global_dz]^T = [local_x, local_y, local_z]^T
  // Row 0 = x-axis, Row 1 = y-axis, Row 2 = z-axis
  return [xx, xy, xz, yx, yy, yz, zx, zy, zz];
}

/**
 * Generate approximate LCAO molecular orbitals from bond/atom data.
 * Returns array of [moName, termDefs] matching addMol format.
 * termDefs format: [atomIdx, n, l, m, angType, coeff, rot?]
 *
 * Extended term format: the 7th element (index 6) is an optional rotation matrix.
 */
export function generateMOs(atoms, bonds) {
  const mos = [];

  // Build adjacency: atomIdx → array of {other, order}
  const adj = atoms.map(() => []);
  for (const [ai, aj, order] of bonds) {
    adj[ai].push({ other: aj, order: order || 1 });
    adj[aj].push({ other: ai, order: order || 1 });
  }

  // Count bonds per atom
  const bondCount = atoms.map((_, i) => adj[i].length);

  // Helper: get bond direction vector (A → B)
  function bondDir(ai, aj) {
    const [, ax, ay, az] = atoms[ai];
    const [, bx, by, bz] = atoms[aj];
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (len < 1e-10) return [0, 0, 1];
    return [dx/len, dy/len, dz/len];
  }

  // Helper: get principal quantum number for atom
  function getN(sym) { return VALENCE_N[sym] || 2; }

  // Helper: coefficient based on electronegativity
  function getCoeff(symA, symB) {
    const enA = ELECTRONEGATIVITY[symA] || 2.5;
    const enB = ELECTRONEGATIVITY[symB] || 2.5;
    const diff = Math.abs(enA - enB);
    // More electronegative atom gets higher coefficient
    if (diff < 0.3) return [0.45, 0.45];
    const total = enA + enB;
    return [enA/total * 0.9, enB/total * 0.9];
  }

  // 1. σ bonding orbitals for each bond
  const processedBonds = new Set();
  for (const [ai, aj, order] of bonds) {
    const bondKey = Math.min(ai, aj) + ',' + Math.max(ai, aj);
    if (processedBonds.has(bondKey)) continue;
    processedBonds.add(bondKey);

    const symA = atoms[ai][0], symB = atoms[aj][0];
    const nA = getN(symA), nB = getN(symB);
    const [dx, dy, dz] = bondDir(ai, aj);
    const rot = buildRotationMatrix(dx, dy, dz);
    const [cA, cB] = getCoeff(symA, symB);
    const effectiveOrder = order || 1;

    // σ bond: both atoms contribute s orbital + oriented p_z along bond
    const terms = [];
    if (symA === 'H') {
      terms.push([ai, 1, 0, 0, 'real', cA]);
    } else {
      // s contribution + p_z along bond direction
      terms.push([ai, nA, 0, 0, 'real', cA * 0.4]);
      terms.push([ai, nA, 1, 0, 'real', cA * 0.7, rot]);
    }
    if (symB === 'H') {
      terms.push([aj, 1, 0, 0, 'real', cB]);
    } else {
      // For the second atom, p_z points back toward first atom (negative direction)
      const rotB = buildRotationMatrix(-dx, -dy, -dz);
      terms.push([aj, nB, 0, 0, 'real', cB * 0.4]);
      terms.push([aj, nB, 1, 0, 'real', cB * 0.7, rotB]);
    }
    mos.push([`σ(${symA}-${symB})`, terms]);

    // 2. π orbitals for double/triple bonds
    if (effectiveOrder >= 2) {
      // π₁: p_x perpendicular to bond (m=1, cos in rotated frame)
      const piTerms = [];
      if (symA !== 'H') piTerms.push([ai, nA, 1, 1, 'cos', 0.5, rot]);
      if (symB !== 'H') {
        const rotB = buildRotationMatrix(-dx, -dy, -dz);
        piTerms.push([aj, nB, 1, 1, 'cos', 0.5, rotB]);
      }
      if (piTerms.length > 0) mos.push([`π(${symA}-${symB})`, piTerms]);
    }

    if (effectiveOrder >= 3) {
      // π₂: p_y perpendicular to bond (m=1, sin in rotated frame)
      const pi2Terms = [];
      if (symA !== 'H') pi2Terms.push([ai, nA, 1, 1, 'sin', 0.5, rot]);
      if (symB !== 'H') {
        const rotB = buildRotationMatrix(-dx, -dy, -dz);
        pi2Terms.push([aj, nB, 1, 1, 'sin', 0.5, rotB]);
      }
      if (pi2Terms.length > 0) mos.push([`π₂(${symA}-${symB})`, pi2Terms]);
    }
  }

  // 3. Aromatic π system: detect rings with bond order 1.5
  const aromaticAtoms = new Set();
  for (const [ai, aj, order] of bonds) {
    if ((order || 1) === 1.5) {
      aromaticAtoms.add(ai);
      aromaticAtoms.add(aj);
    }
  }

  if (aromaticAtoms.size >= 5) {
    // Compute average ring normal from aromatic atoms
    const aroArr = [...aromaticAtoms];
    // Use first 3 atoms to estimate plane normal
    if (aroArr.length >= 3) {
      const [, x0, y0, z0] = atoms[aroArr[0]];
      const [, x1, y1, z1] = atoms[aroArr[1]];
      const [, x2, y2, z2] = atoms[aroArr[2]];
      const e1x = x1-x0, e1y = y1-y0, e1z = z1-z0;
      const e2x = x2-x1, e2y = y2-y1, e2z = z2-z1;
      let nx = e1y*e2z - e1z*e2y;
      let ny = e1z*e2x - e1x*e2z;
      let nz = e1x*e2y - e1y*e2x;
      const nLen = Math.sqrt(nx*nx + ny*ny + nz*nz);
      if (nLen > 1e-10) {
        nx /= nLen; ny /= nLen; nz /= nLen;
        const rot = buildRotationMatrix(nx, ny, nz);
        // Delocalized π: all aromatic atoms contribute p orbital perpendicular to ring
        const piTerms = [];
        const coeff = 1 / Math.sqrt(aromaticAtoms.size);
        for (const idx of aroArr) {
          const n = getN(atoms[idx][0]);
          piTerms.push([idx, n, 1, 0, 'real', coeff, rot]);
        }
        mos.push(['π (aromatic)', piTerms]);
      }
    }
  }

  // 4. Lone pairs for O, N, F, S, Cl, Br, I with fewer bonds than expected valence
  for (let i = 0; i < atoms.length; i++) {
    const sym = atoms[i][0];
    const expected = TYPICAL_VALENCE[sym];
    if (!expected) continue;
    const actual = bondCount[i];
    if (actual >= expected) continue;
    if (sym === 'H' || sym === 'C') continue;

    const n = getN(sym);
    // Compute direction away from bonded atoms (average anti-bond direction)
    let awayX = 0, awayY = 0, awayZ = 0;
    for (const { other } of adj[i]) {
      const [dx, dy, dz] = bondDir(i, other);
      awayX -= dx; awayY -= dy; awayZ -= dz;
    }
    const awayLen = Math.sqrt(awayX*awayX + awayY*awayY + awayZ*awayZ);
    if (awayLen > 1e-10) {
      awayX /= awayLen; awayY /= awayLen; awayZ /= awayLen;
    } else {
      // If no clear direction (e.g. symmetric), use y-axis
      awayX = 0; awayY = 1; awayZ = 0;
    }
    const rot = buildRotationMatrix(awayX, awayY, awayZ);
    const lpTerms = [[i, n, 1, 0, 'real', 0.85, rot]];
    mos.push([`lone pair (${sym}${i+1})`, lpTerms]);
  }

  // 5. If no MOs were generated at all, create at minimum an s-orbital sum
  if (mos.length === 0) {
    const terms = atoms.map((a, i) => [i, getN(a[0]), 0, 0, 'real', 1/Math.sqrt(atoms.length)]);
    mos.push(['σ (total)', terms]);
  }

  return mos;
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
