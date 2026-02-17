#!/usr/bin/env node
// Fetch compounds for newly-added elements + selenium biology.
// Uses name-search to get correct CIDs, then fetches 3D conformers.

import { writeFileSync } from 'fs';
import https from 'https';

const ANG_TO_BOHR = 1.8897259886;
const RATE_LIMIT_MS = 300;

const SUBSCRIPTS = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉' };
function toSub(n) { return String(n).split('').map(d => SUBSCRIPTS[d]??d).join(''); }
function formula(atoms) {
  const c = {};
  for (const a of atoms) c[a[0]] = (c[a[0]]||0)+1;
  const first = ['C','H'].filter(e => c[e]);
  const rest = Object.keys(c).filter(e => e!=='C' && e!=='H').sort();
  return [...first,...rest].map(e => e+(c[e]>1?toSub(c[e]):'')).join('');
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', reject);
  });
}

const atomicSymbols = {
  1:'H', 2:'He', 3:'Li', 4:'Be', 5:'B', 6:'C', 7:'N', 8:'O', 9:'F', 10:'Ne',
  11:'Na', 12:'Mg', 13:'Al', 14:'Si', 15:'P', 16:'S', 17:'Cl', 18:'Ar',
  22:'Ti', 23:'V', 24:'Cr', 25:'Mn', 26:'Fe', 27:'Co', 28:'Ni', 29:'Cu', 30:'Zn',
  34:'Se', 35:'Br', 44:'Ru', 46:'Pd', 47:'Ag', 53:'I',
  74:'W', 77:'Ir', 78:'Pt', 79:'Au', 80:'Hg', 82:'Pb',
};

async function searchCid(name) {
  await sleep(RATE_LIMIT_MS);
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/cids/JSON`;
  const r = await get(url);
  if (r.status !== 200) return null;
  const cids = JSON.parse(r.body).IdentifierList?.CID || [];
  return cids[0] || null;
}

async function fetchCid(cid) {
  await sleep(RATE_LIMIT_MS);
  const r = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/JSON?record_type=3d`);
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  const compound = JSON.parse(r.body).PC_Compounds[0];

  const elements = compound.atoms.element;
  const coords = compound.coords[0].conformers[0];
  const xs = coords.x, ys = coords.y, zs = coords.z || xs.map(() => 0);
  const atoms = elements.map((el, i) => [
    atomicSymbols[el] || `Z${el}`,
    parseFloat((xs[i] * ANG_TO_BOHR).toFixed(4)),
    parseFloat((ys[i] * ANG_TO_BOHR).toFixed(4)),
    parseFloat((zs[i] * ANG_TO_BOHR).toFixed(4)),
  ]);
  const bonds = [];
  if (compound.bonds) {
    const { aid1, aid2, order } = compound.bonds;
    for (let i = 0; i < aid1.length; i++) {
      const o = order[i];
      const b = [aid1[i]-1, aid2[i]-1];
      if (o === 4) b.push(1.5); else if (o > 1) b.push(o);
      bonds.push(b);
    }
  }
  const allCoords = [...xs, ...ys, ...zs];
  const he = Math.ceil((Math.max(...allCoords.map(Math.abs)) * ANG_TO_BOHR + 8) / 2) * 2;
  return { atoms, bonds, he, cid };
}

function fmt(atoms, bonds) {
  const a = atoms.map(a => `    ['${a[0]}', ${a[1].toFixed(4)}, ${a[2].toFixed(4)}, ${a[3].toFixed(4)}]`).join(',\n');
  const b = bonds.map(b => `    [${b.join(', ')}]`).join(',\n');
  return { a, b };
}

function molBlock(name, cat, data) {
  const f = formula(data.atoms);
  const { a, b } = fmt(data.atoms, data.bonds);
  const cidLine = data.cid ? `\n  pubchemCid: ${data.cid},` : '';
  return `// ${name}\naddMol({\n  name: '${name}',\n  label: '${f} (${name})',\n  category: '${cat}',${cidLine}\n  atoms: [\n${a}\n  ],\n  bonds: [\n${b}\n  ],\n  he: ${data.he},\n});\n`;
}

// ── Manual geometries ─────────────────────────────────────────────────────────

function b(x,y,z) { return [parseFloat((x*ANG_TO_BOHR).toFixed(4)), parseFloat((y*ANG_TO_BOHR).toFixed(4)), parseFloat((z*ANG_TO_BOHR).toFixed(4))]; }

// Cisplatin: cis-[PtCl2(NH3)2], square planar
// Pt-Cl = 2.33 Å, Pt-N = 2.05 Å, N-H = 1.01 Å
function makeCisplatin() {
  const PtCl = 2.33, PtN = 2.05, NH = 1.01;
  // Pt at origin; Cl cis (x, -y); N cis (+y, +x) — square planar in xy plane
  const atoms = [
    ['Pt', ...b(0, 0, 0)],
    ['Cl', ...b(-PtCl, 0, 0)],
    ['Cl', ...b(0, -PtN - 0.28, 0)],  // use proper Pt-Cl
    ['N',  ...b( PtN, 0, 0)],
    ['N',  ...b(0,  PtN, 0)],
  ];
  // Fix: both are Cl, rebuild properly
  const atoms2 = [
    ['Pt', ...b(0, 0, 0)],
    ['Cl', ...b(-PtCl, 0, 0)],
    ['Cl', ...b(0, -PtCl, 0)],
    ['N',  ...b( PtN, 0, 0)],
    ['N',  ...b(0,  PtN, 0)],
  ];
  // Add H atoms on each N (3 per NH3, umbrella-like)
  const addNH3 = (nx, ny, sign) => {
    const hDist = NH, tilt = 20 * Math.PI / 180;
    for (let i = 0; i < 3; i++) {
      const phi = i * 2*Math.PI/3;
      // H above plane slightly and outward from N
      const hx = nx + sign * hDist * Math.cos(tilt);
      const hy = ny;
      const hz = hDist * Math.sin(tilt) * Math.cos(phi);
      const hy2 = hDist * Math.sin(tilt) * Math.sin(phi);
      atoms2.push(['H', ...b(hx + (sign < 0 ? 0 : 0), ny + hy2, hz)]);
    }
  };
  addNH3(PtN, 0, 1);
  addNH3(0, PtN, 1);

  const bonds = [[0,1],[0,2],[0,3],[0,4]];
  for (let i = 5; i < 8; i++) bonds.push([3, i]);
  for (let i = 8; i < 11; i++) bonds.push([4, i]);

  return { atoms: atoms2, bonds, he: 10 };
}

// Nickel tetracarbonyl: Ni(CO)4, tetrahedral
// Ni-C = 1.84 Å, C-O = 1.14 Å
function makeNiCO4() {
  const NiC = 1.84, CO = 1.14;
  // Tetrahedral vertices
  const tet = [
    [ 1,  1,  1],
    [-1, -1,  1],
    [-1,  1, -1],
    [ 1, -1, -1],
  ].map(v => { const n = Math.sqrt(3); return v.map(x => x/n); });

  const atoms = [['Ni', ...b(0, 0, 0)]];
  const bonds = [];
  for (let i = 0; i < 4; i++) {
    const cx = tet[i][0] * NiC, cy = tet[i][1] * NiC, cz = tet[i][2] * NiC;
    const ox = tet[i][0] * (NiC + CO), oy = tet[i][1] * (NiC + CO), oz = tet[i][2] * (NiC + CO);
    atoms.push(['C', ...b(cx, cy, cz)]);
    atoms.push(['O', ...b(ox, oy, oz)]);
    bonds.push([0, 1 + i*2]);          // Ni-C
    bonds.push([1 + i*2, 2 + i*2, 3]); // C≡O
  }
  return { atoms, bonds, he: 10 };
}

// Chromium hexacarbonyl: Cr(CO)6, octahedral
// Cr-C = 1.916 Å, C-O = 1.140 Å
function makeCrCO6() {
  const CrC = 1.916, CO = 1.140;
  const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  const atoms = [['Cr', ...b(0, 0, 0)]];
  const bonds = [];
  for (let i = 0; i < 6; i++) {
    const [dx,dy,dz] = dirs[i];
    atoms.push(['C', ...b(dx*CrC, dy*CrC, dz*CrC)]);
    atoms.push(['O', ...b(dx*(CrC+CO), dy*(CrC+CO), dz*(CrC+CO))]);
    bonds.push([0, 1+i*2]);
    bonds.push([1+i*2, 2+i*2, 3]);
  }
  return { atoms, bonds, he: 10 };
}

// Metallocene sandwich: same function as in refetch-molecules.mjs
function makeMetallocene(metal, centDist = 1.66) {
  const CC = 1.44, CH = 1.08;
  const ringRadius = CC / (2 * Math.sin(Math.PI/5));
  const atoms = [[metal, ...b(0, 0, 0)]];
  const bonds = [];
  for (const [ringIdx, z] of [[0, centDist], [1, -centDist]]) {
    const offset = ringIdx === 0 ? 0 : Math.PI/5;
    const cStart = atoms.length;
    for (let i = 0; i < 5; i++) {
      const angle = offset + i * 2*Math.PI/5;
      atoms.push(['C', ...b(ringRadius*Math.cos(angle), ringRadius*Math.sin(angle), z)]);
    }
    for (let i = 0; i < 5; i++) {
      const angle = offset + i * 2*Math.PI/5;
      const hR = ringRadius + CH;
      atoms.push(['H', ...b(hR*Math.cos(angle), hR*Math.sin(angle), z)]);
    }
    for (let i = 0; i < 5; i++) bonds.push([cStart+i, cStart+(i+1)%5, 1.5]);
    for (let i = 0; i < 5; i++) bonds.push([cStart+i, cStart+5+i]);
    for (let i = 0; i < 5; i++) bonds.push([0, cStart+i, 0.5]);
  }
  return { atoms, bonds, he: 12 };
}

// Dibenzenechromium: Cr(C6H6)2, two benzene rings, staggered (D6h)
// Cr-ring centroid = 1.614 Å, C-C = 1.423 Å (benzene in complex), C-H = 1.083 Å
function makeDibenzeneCr() {
  const CrCent = 1.614, CC = 1.423, CH = 1.083;
  const ringR = CC / (2 * Math.sin(Math.PI/6));  // = CC (for hexagon circumradius = side length)
  const atoms = [['Cr', ...b(0, 0, 0)]];
  const bonds = [];
  for (const [ringIdx, z] of [[0, CrCent], [1, -CrCent]]) {
    const offset = ringIdx === 0 ? 0 : Math.PI/6;  // staggered
    const cStart = atoms.length;
    for (let i = 0; i < 6; i++) {
      const angle = offset + i * 2*Math.PI/6;
      atoms.push(['C', ...b(ringR*Math.cos(angle), ringR*Math.sin(angle), z)]);
    }
    for (let i = 0; i < 6; i++) {
      const angle = offset + i * 2*Math.PI/6;
      const hR = ringR + CH;
      atoms.push(['H', ...b(hR*Math.cos(angle), hR*Math.sin(angle), z)]);
    }
    for (let i = 0; i < 6; i++) bonds.push([cStart+i, cStart+(i+1)%6, 1.5]);
    for (let i = 0; i < 6; i++) bonds.push([cStart+i, cStart+6+i]);
    for (let i = 0; i < 6; i++) bonds.push([0, cStart+i, 0.5]);
  }
  return { atoms, bonds, he: 12 };
}

// ── Fetch helper: search by name, try 3D, return data or null ────────────────

async function fetchByName(displayName, searchName) {
  process.stdout.write(`  ${displayName}... `);
  try {
    const cid = await searchCid(searchName);
    if (!cid) { console.log('no CID found'); return null; }
    const data = await fetchCid(cid);
    if (data.atoms.length > 200) { console.log(`SKIP (${data.atoms.length} atoms > 200)`); return null; }
    console.log(`${formula(data.atoms)} (${data.atoms.length} atoms, CID ${cid}) ✓`);
    return data;
  } catch(e) {
    console.log(`SKIP (${e.message})`);
    return null;
  }
}

// ── 1. Platinum drugs ─────────────────────────────────────────────────────────

console.log('\nBuilding platinum-drugs.js...');
let ptFile = `import { addMol } from './core.js';\n\n`;

const platinumMols = [
  ['Cisplatin',    'cisplatin'],
  ['Carboplatin',  'carboplatin'],
  ['Oxaliplatin',  'oxaliplatin'],
];

let cisplatinDone = false;
for (const [name, search] of platinumMols) {
  const data = await fetchByName(name, search);
  if (data) {
    ptFile += molBlock(name, 'Platinum Drug', data) + '\n';
    if (name === 'Cisplatin') cisplatinDone = true;
  } else if (name === 'Cisplatin' && !cisplatinDone) {
    console.log('  Cisplatin: falling back to manual square-planar geometry');
    ptFile += molBlock('Cisplatin', 'Platinum Drug', makeCisplatin()) + '\n';
  }
}

writeFileSync('js/molecules/platinum-drugs.js', ptFile);
console.log('  Written.');

// ── 2. Selenium biology ───────────────────────────────────────────────────────

console.log('\nBuilding selenium-biology.js...');
let seFile = `import { addMol } from './core.js';\n\n`;

const seleniumMols = [
  ['Selenomethionine', 'L-selenomethionine',   'Selenium Compound'],
  ['Selenocysteine',   'L-selenocysteine',      'Selenium Compound'],
  ['Ebselen',          'ebselen',               'Selenium Compound'],
  ['Selenourea',       'selenourea',            'Selenium Compound'],
];

for (const [name, search, cat] of seleniumMols) {
  const data = await fetchByName(name, search);
  if (data) seFile += molBlock(name, cat, data) + '\n';
}

writeFileSync('js/molecules/selenium-biology.js', seFile);
console.log('  Written.');

// ── 3. Bioinorganic (Mg, Co, Au) ──────────────────────────────────────────────

console.log('\nBuilding bioinorganic.js...');
let bioFile = `import { addMol } from './core.js';\n\n`;

const bioinorganicMols = [
  ['Auranofin',       'auranofin',        'Gold Drug'],
  ['Chlorophyll a',   'chlorophyll a',    'Bioinorganic'],
  ['Methylcobalamin', 'methylcobalamin',  'Bioinorganic'],
  ['Zinc protoporphyrin', 'zinc protoporphyrin IX', 'Bioinorganic'],
  ['Magnesium porphine',  'magnesium porphine',     'Bioinorganic'],
];

for (const [name, search, cat] of bioinorganicMols) {
  const data = await fetchByName(name, search);
  if (data) bioFile += molBlock(name, cat, data) + '\n';
}

writeFileSync('js/molecules/bioinorganic.js', bioFile);
console.log('  Written.');

// ── 4. More organometallics (Cr, Ru, Ni, V) ───────────────────────────────────

console.log('\nBuilding more-organometallics.js...');
let orgFile = `import { addMol } from './core.js';\n\n`;

// Try PubChem first, fall back to manual
const metallocenes = [
  { name: 'Ruthenocene', search: 'ruthenocene',  metal: 'Ru', centDist: 1.82 },
  { name: 'Chromocene',  search: 'chromocene',   metal: 'Cr', centDist: 1.79 },
  { name: 'Vanadocene',  search: 'vanadocene',   metal: 'V',  centDist: 1.92 },
];

for (const { name, search, metal, centDist } of metallocenes) {
  const data = await fetchByName(name, search);
  if (data) {
    orgFile += molBlock(name, 'Organometallic', data) + '\n';
  } else {
    console.log(`  ${name}: using manual D5h sandwich geometry`);
    orgFile += molBlock(name, 'Organometallic', makeMetallocene(metal, centDist)) + '\n';
  }
}

// Dibenzenechromium — try PubChem, fall back to manual
{
  const data = await fetchByName('Dibenzenechromium', 'dibenzenechromium');
  if (data) {
    orgFile += molBlock('Dibenzenechromium', 'Organometallic', data) + '\n';
  } else {
    console.log('  Dibenzenechromium: using manual D6h sandwich geometry');
    orgFile += molBlock('Dibenzenechromium', 'Organometallic', makeDibenzeneCr()) + '\n';
  }
}

// Carbonyls — try PubChem, fall back to manual
{
  const data = await fetchByName('Nickel tetracarbonyl', 'nickel tetracarbonyl');
  if (data) {
    orgFile += molBlock('Nickel tetracarbonyl', 'Organometallic', data) + '\n';
  } else {
    console.log('  Nickel tetracarbonyl: using manual Td geometry');
    orgFile += molBlock('Nickel tetracarbonyl', 'Organometallic', makeNiCO4()) + '\n';
  }
}

{
  const data = await fetchByName('Chromium hexacarbonyl', 'chromium hexacarbonyl');
  if (data) {
    orgFile += molBlock('Chromium hexacarbonyl', 'Organometallic', data) + '\n';
  } else {
    console.log('  Chromium hexacarbonyl: using manual Oh geometry');
    orgFile += molBlock('Chromium hexacarbonyl', 'Organometallic', makeCrCO6()) + '\n';
  }
}

// Vanadocene dichloride — search
{
  const data = await fetchByName('Vanadocene dichloride', 'vanadocene dichloride');
  if (data) orgFile += molBlock('Vanadocene dichloride', 'Organometallic', data) + '\n';
}

// Titanocene dichloride — (Ti already in elements)
{
  const data = await fetchByName('Titanocene dichloride', 'titanocene dichloride');
  if (data) orgFile += molBlock('Titanocene dichloride', 'Organometallic', data) + '\n';
}

writeFileSync('js/molecules/more-organometallics.js', orgFile);
console.log('  Written.');

console.log('\nAll done!');
