#!/usr/bin/env node
// Re-fetch correct 3D coords from PubChem (with rate limiting) and build molecule files.
// For ionic/organometallic compounds with no PubChem 3D data, use known crystal geometries.

import { writeFileSync } from 'fs';
import https from 'https';

const ANG_TO_BOHR = 1.8897259886;
const RATE_LIMIT_MS = 300;  // 300ms between requests (~3 req/s, well under PubChem's 5/s limit)

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

async function fetchCid(cid) {
  await sleep(RATE_LIMIT_MS);
  const r = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/JSON?record_type=3d`);
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  const compound = JSON.parse(r.body).PC_Compounds[0];

  const atomicSymbols = {1:'H',2:'He',3:'Li',4:'Be',5:'B',6:'C',7:'N',8:'O',9:'F',10:'Ne',11:'Na',12:'Mg',13:'Al',14:'Si',15:'P',16:'S',17:'Cl',18:'Ar',26:'Fe',28:'Ni',29:'Cu',34:'Se',35:'Br',47:'Ag',53:'I',80:'Hg',82:'Pb',22:'Ti',27:'Co',44:'Ru',46:'Pd'};
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

// ── Manual geometries for compounds with no PubChem 3D data ──────────────────

function b(x,y,z) { return [parseFloat((x*ANG_TO_BOHR).toFixed(4)), parseFloat((y*ANG_TO_BOHR).toFixed(4)), parseFloat((z*ANG_TO_BOHR).toFixed(4))]; }

// Silver nitrate (AgNO₃) — planar NO₃⁻ + Ag coordinated to one oxygen
// N-O = 1.26 Å (trigonal planar), Ag-O = 2.42 Å
function makeAgNO3() {
  const NO = 1.26, AgO = 2.42;
  const r60 = Math.cos(Math.PI/3), s60 = Math.sin(Math.PI/3);
  const atoms = [
    ['N', ...b(0, 0, 0)],
    ['O', ...b(0, NO, 0)],                  // O1 (top)
    ['O', ...b(-NO*s60, -NO*r60, 0)],       // O2 (bottom-left)
    ['O', ...b( NO*s60, -NO*r60, 0)],       // O3 (bottom-right)
    ['Ag', ...b(0, NO + AgO, 0)],           // Ag above O1
  ];
  const bonds = [[0,1,2],[0,2,2],[0,3,2],[0,4],[4,1]];  // N=O resonance shown as 2, Ag-N bond
  // Actually Ag-N bond; let's do Ag-O bond
  const bonds2 = [[0,1],[0,2],[0,3],[1,4]];
  return { atoms, bonds: bonds2, he: 14 };
}

// Selenium dioxide (SeO₂) — bent molecule
// Se-O = 1.61 Å, O-Se-O = 113.8°
function makeSeO2() {
  const SeO = 1.61, angle = 113.8 * Math.PI / 180;
  const half = angle / 2;
  const atoms = [
    ['Se', ...b(0, 0, 0)],
    ['O',  ...b( Math.sin(half)*SeO, Math.cos(half)*SeO, 0)],
    ['O',  ...b(-Math.sin(half)*SeO, Math.cos(half)*SeO, 0)],
  ];
  return { atoms, bonds: [[0,1,2],[0,2,2]], he: 8 };
}

// Mercury(II) chloride (HgCl₂) — linear molecule
// Hg-Cl = 2.33 Å
function makeHgCl2() {
  const HgCl = 2.33;
  const atoms = [
    ['Hg', ...b(0, 0, 0)],
    ['Cl', ...b( HgCl, 0, 0)],
    ['Cl', ...b(-HgCl, 0, 0)],
  ];
  return { atoms, bonds: [[0,1],[0,2]], he: 10 };
}

// Dimethylmercury (Hg(CH₃)₂) — linear, Hg-C = 2.09 Å
function makeHgMe2() {
  const HgC = 2.09, CH = 1.08, tetAngle = 109.5 * Math.PI / 180;
  const atoms = [
    ['Hg', ...b(0, 0, 0)],
    ['C', ...b( HgC, 0, 0)],
    ['C', ...b(-HgC, 0, 0)],
  ];
  // H atoms on each methyl (tetrahedral)
  const addMethyl = (cx) => {
    const sign = cx > 0 ? 1 : -1;
    for (let i = 0; i < 3; i++) {
      const phi = (i * 2*Math.PI/3) + Math.PI/6;
      const hx = cx + sign * CH * Math.cos(tetAngle);
      const hy = CH * Math.sin(tetAngle) * Math.cos(phi);
      const hz = CH * Math.sin(tetAngle) * Math.sin(phi);
      atoms.push(['H', ...b(hx, hy, hz)]);
    }
  };
  addMethyl(HgC); addMethyl(-HgC);
  const bonds = [[0,1],[0,2]];
  for (let i = 3; i < 6; i++) bonds.push([1,i]);
  for (let i = 6; i < 9; i++) bonds.push([2,i]);
  return { atoms, bonds, he: 12 };
}

// Ferrocene geometry (eclipsed D5h, crystal structure)
// Fe-ring centroid = 1.66 Å, ring C-C = 1.44 Å, C-H = 1.08 Å
function makeMetallocene(metalSymbol) {
  const FeCent = 1.66, CC = 1.44, CH = 1.08;
  const ringRadius = CC / (2 * Math.sin(Math.PI/5));  // circumradius = 1.227 Å
  const atoms = [[metalSymbol, ...b(0, 0, 0)]];
  const bonds = [];
  for (const [ringIdx, z] of [[0, FeCent], [1, -FeCent]]) {
    const offset = ringIdx === 0 ? 0 : Math.PI/5;  // eclipsed configuration
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
    // C-C bonds in ring
    for (let i = 0; i < 5; i++) bonds.push([cStart+i, cStart+(i+1)%5, 1.5]);
    // C-H bonds
    for (let i = 0; i < 5; i++) bonds.push([cStart+i, cStart+5+i]);
    // Metal-C bonds (η5)
    for (let i = 0; i < 5; i++) bonds.push([0, cStart+i, 0.5]);
  }
  return { atoms, bonds, he: 12 };
}

// ── Build files ───────────────────────────────────────────────────────────────

// 1. Heavy element compounds
console.log('Building heavy-element-compounds.js...');
let heavy = `import { addMol } from './core.js';\n\n`;
heavy += molBlock('Silver nitrate',      'Inorganic', makeAgNO3());
heavy += '\n';
heavy += molBlock('Selenium dioxide',    'Inorganic', makeSeO2());
heavy += '\n';
heavy += molBlock('Mercury(II) chloride','Inorganic', makeHgCl2());
heavy += '\n';
heavy += molBlock('Dimethylmercury',     'Inorganic', makeHgMe2());
writeFileSync('js/molecules/heavy-element-compounds.js', heavy);
console.log('  Written.');

// 2. Halogen compounds (already fetched, just re-run to regenerate)
console.log('Building halogen-compounds.js...');
const HALOGENS = [
  { cid: 6374,   name: 'Iodoform',            cat: 'Halogen Compound' },
  { cid: 5558,   name: 'Bromoform',           cat: 'Halogen Compound' },
  { cid: 11205,  name: 'Carbon tetrabromide', cat: 'Halogen Compound' },
  { cid: 10487,  name: 'Carbon tetraiodide',  cat: 'Halogen Compound' },
  { cid: 11575,  name: 'Iodobenzene',         cat: 'Halogen Compound' },
  { cid: 7961,   name: 'Bromobenzene',        cat: 'Halogen Compound' },
  { cid: 10008,  name: 'Fluorobenzene',       cat: 'Halogen Compound' },
];
let halogens = `import { addMol } from './core.js';\n\n`;
for (const m of HALOGENS) {
  process.stdout.write(`  Fetching ${m.name} (CID ${m.cid})...`);
  try {
    const data = await fetchCid(m.cid);
    halogens += molBlock(m.name, m.cat, data) + '\n';
    console.log(` ${formula(data.atoms)} (${data.atoms.length} atoms) ✓`);
  } catch (e) {
    console.log(` SKIP (${e.message})`);
  }
}
writeFileSync('js/molecules/halogen-compounds.js', halogens);

// 3. Organometallics
console.log('Building organometallics.js...');
let organo = `import { addMol } from './core.js';\n\n`;

// Ferrocene from manual geometry (PubChem CID 11985 returns wrong compound)
console.log('  Ferrocene: using manual D5h sandwich geometry');
organo += molBlock('Ferrocene', 'Organometallic', makeMetallocene('Fe')) + '\n';

// Nickelocene (manual, same D5h sandwich, just Ni)
organo += molBlock('Nickelocene', 'Organometallic', makeMetallocene('Ni')) + '\n';
organo += molBlock('Cobaltocene', 'Organometallic', makeMetallocene('Co')) + '\n';

writeFileSync('js/molecules/organometallics.js', organo);
console.log('  Written (Nickelocene + Cobaltocene from known geometry).');

console.log('\nAll done!');
