// Test script for verifying molecular orbital orientations and symmetry.
// Run: node test-orbitals.mjs
//
// For each molecule, checks:
// 1. C₂ symmetry (density at (x,y,z) = density(-x,y,z) or density(x,y,-z))
// 2. Planar π test: π MO value should be ~0 in the molecular plane (y=0)
// 3. Individual MO symmetry under the molecule's point group operations

import { evaluateOrbital, cartToSph, psi } from './js/math.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- Parse molecule files to extract atom positions and MO data ----

function parseMoleculeFile(filename) {
  const content = readFileSync(join(__dirname, 'js', 'molecules', filename), 'utf-8');

  // Extract the atoms array
  const atomsMatch = content.match(/atoms:\s*\[([\s\S]*?)\],\s*(?:bonds|he|mos)/);
  if (!atomsMatch) return null;

  const atomsStr = atomsMatch[1];
  const atoms = [];
  const atomRegex = /\['(\w+)',\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\]/g;
  let m;
  while ((m = atomRegex.exec(atomsStr)) !== null) {
    atoms.push([m[1], parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])]);
  }

  // Extract MO definitions
  const mosMatch = content.match(/mos:\s*\[([\s\S]*?)\]\s*\n\s*\}/);
  if (!mosMatch) return { atoms, mos: [] };

  // Parse each MO: ['name', [[atomIdx, n, l, m, angType, coeff, rot?], ...]]
  const mos = [];
  const moStr = mosMatch[1];

  // Find each MO by name pattern
  const moRegex = /\[['"]([^'"]+)['"]\s*,\s*\[([\s\S]*?)\]\s*\]/g;
  let moMatch;
  while ((moMatch = moRegex.exec(moStr)) !== null) {
    const moName = moMatch[1];
    const termsStr = moMatch[2] + ']'; // Fix: regex eats closing ] of last term
    const terms = [];

    // Parse each term: [atomIdx, n, l, m, angType, coeff] or [atomIdx, n, l, m, angType, coeff, [rot...]]
    const termRegex = /\[(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*'(\w+)',\s*([-\d.]+)(?:,\s*\[([-\d., ]+)\])?\]/g;
    let tm;
    while ((tm = termRegex.exec(termsStr)) !== null) {
      const atomIdx = parseInt(tm[1]);
      const n = parseInt(tm[2]);
      const l = parseInt(tm[3]);
      const mq = parseInt(tm[4]);
      const angType = tm[5];
      const coeff = parseFloat(tm[6]);
      let rot = null;
      if (tm[7]) {
        rot = tm[7].split(',').map(s => parseFloat(s.trim()));
      }
      if (atomIdx < atoms.length) {
        const pos = atoms[atomIdx];
        const term = { n, l, m: mq, angType, center: [pos[1], pos[2], pos[3]], coeff };
        if (rot) term.rot = rot;
        terms.push(term);
      }
    }
    if (terms.length > 0) {
      mos.push({ name: moName, terms });
    }
  }

  return { atoms, mos };
}

// ---- Evaluate electron density (sum of |ψ_i|²) at a point ----

function totalDensity(mos, x, y, z) {
  let rho = 0;
  for (const mo of mos) {
    const val = evaluateOrbital(mo, x, y, z);
    rho += val * val;
  }
  return rho;
}

// ---- Test functions ----

let passed = 0;
let failed = 0;
let warnings = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log(`  FAIL: ${msg}`);
  }
}

function warn(msg) {
  warnings++;
  console.log(`  WARN: ${msg}`);
}

function assertClose(a, b, tol, msg) {
  const diff = Math.abs(a - b);
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-10);
  if (diff / scale > tol) {
    failed++;
    console.log(`  FAIL: ${msg} (got ${a.toExponential(4)} vs ${b.toExponential(4)}, rel diff ${(diff/scale).toExponential(2)})`);
  } else {
    passed++;
  }
}

// Test 1: Mirror symmetry of total electron density
function testMirrorSymmetry(filename, axis, testPoints) {
  const mol = parseMoleculeFile(filename);
  if (!mol || mol.mos.length === 0) {
    warn(`${filename}: could not parse or no MOs`);
    return;
  }

  for (const [x, y, z] of testPoints) {
    let mx, my, mz;
    if (axis === 'x') { mx = -x; my = y; mz = z; }
    else if (axis === 'z') { mx = x; my = y; mz = -z; }
    else if (axis === 'y') { mx = x; my = -y; mz = z; }

    const d1 = totalDensity(mol.mos, x, y, z);
    const d2 = totalDensity(mol.mos, mx, my, mz);

    assertClose(d1, d2, 0.05,
      `${filename}: density asymmetry under σ_${axis} at (${x},${y},${z}): ${d1.toFixed(6)} vs ${d2.toFixed(6)}`
    );
  }
}

// Test 2: π orbital should be zero in molecular plane
function testPiZeroInPlane(filename, piMoName) {
  const mol = parseMoleculeFile(filename);
  if (!mol) { warn(`${filename}: could not parse`); return; }

  // MO names in raw file contain \u03C0 as literal text (not decoded to π)
  const searchName = piMoName || '\\u03C0';
  const piMo = mol.mos.find(m => m.name.includes(searchName));
  if (!piMo) { warn(`${filename}: no π MO found`); return; }

  // Test at several points in the xz plane (y=0)
  const testPoints = [
    [0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
    [2, 0, 0], [-2, 0, 0], [1, 0, 1], [-1, 0, -1],
  ];

  for (const [x, y, z] of testPoints) {
    const val = evaluateOrbital(piMo, x, y, z);
    assert(Math.abs(val) < 1e-10,
      `${filename}: π orbital '${piMo.name}' non-zero at (${x},${y},${z}) in plane: ${val.toExponential(4)}`
    );
  }
}

// Test 3: Check that each MO has valid quantum numbers
function testQuantumNumbers(filename) {
  const mol = parseMoleculeFile(filename);
  if (!mol) { warn(`${filename}: could not parse`); return; }

  for (const mo of mol.mos) {
    for (const term of mo.terms) {
      assert(term.l >= 0, `${filename} MO '${mo.name}': l must be >= 0, got ${term.l}`);
      assert(term.m >= 0 && term.m <= term.l,
        `${filename} MO '${mo.name}': |m| must be <= l, got m=${term.m}, l=${term.l}`);
      assert(term.n >= term.l + 1,
        `${filename} MO '${mo.name}': n must be >= l+1, got n=${term.n}, l=${term.l}`);
      assert(['real', 'cos', 'sin'].includes(term.angType),
        `${filename} MO '${mo.name}': invalid angType '${term.angType}'`);
      // Zero coefficients are OK for nodal atoms in MOs (e.g. π₂ with nodes)
    }
  }
}

// Test 4: Total density should be positive (sanity check)
function testDensityPositive(filename) {
  const mol = parseMoleculeFile(filename);
  if (!mol || mol.mos.length === 0) { warn(`${filename}: could not parse or no MOs`); return; }

  const testPoints = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1],
    [1, 1, 0], [0, 1, 1], [1, 0, 1], [2, 0, 0],
  ];

  for (const [x, y, z] of testPoints) {
    const d = totalDensity(mol.mos, x, y, z);
    assert(d >= 0, `${filename}: negative density at (${x},${y},${z}): ${d}`);
  }
}

// ---- Run tests ----

console.log('=== Orbital Orientation Tests ===\n');

// Molecules with C₂ symmetry about x-axis (mirror at x=0)
const c2x_molecules = [
  ['o3.js', [[1, 0, 0.5], [1, 0.5, 0.5], [2, 0, 1], [1.5, 0, 0]]],
  ['h2o.js', [[0.5, 0, 0.5], [1, 0.5, 0.5], [0.5, 0, -0.5]]],
  ['so2.js', [[1, 0, 0.5], [1, 0.5, 0.5], [2, 0, 1]]],
  ['co2.js', [[0, 0, 1], [0, 0.5, 1], [0, 1, 0]]],
];

console.log('--- Mirror Symmetry (σ_x at x=0) ---');
for (const [file, points] of c2x_molecules) {
  console.log(`Testing ${file}...`);
  testMirrorSymmetry(file, 'x', points);
}

// Molecules with C₂ symmetry about z-axis (mirror at z=0)
const c2z_molecules = [
  ['n2.js', [[0, 0.5, 0.5], [0, 1, 0], [0.5, 0, 0.5]]],
  ['o2.js', [[0, 0.5, 0.5], [0, 1, 0], [0.5, 0.5, 0]]],
  ['h2.js', [[0, 0.5, 0.5], [0, 1, 0]]],
  ['acetylene.js', [[0, 0.5, 0.5], [0, 1, 0], [0.5, 0.5, 0]]],
];

console.log('\n--- Mirror Symmetry (σ_z at z=0) ---');
for (const [file, points] of c2z_molecules) {
  console.log(`Testing ${file}...`);
  testMirrorSymmetry(file, 'z', points);
}

// Planar molecules: π orbital should be zero in xz plane (y=0)
console.log('\n--- π Zero in Molecular Plane (y=0) ---');
const planar_pi_molecules = [
  ['o3.js', '\\u03C0 deloc'],
  ['benzene.js', '\\u03C0\\u2081'],
  ['ethylene.js', '\\u03C0'],
  ['naphthalene.js', '\\u03C0\\u2081'],
  ['pyridine.js', '\\u03C0\\u2081'],
  ['triazine.js', '\\u03C0\\u2081'],
];
for (const [file, piName] of planar_pi_molecules) {
  console.log(`Testing ${file}...`);
  testPiZeroInPlane(file, piName);
}

// Quantum number validation
console.log('\n--- Quantum Number Validation ---');
const allMolFiles = [
  'h2.js', 'n2.js', 'o2.js', 'co.js', 'hf.js',
  'h2o.js', 'h2s.js', 'co2.js', 'o3.js', 'so2.js',
  'nh3.js', 'ch4.js', 'acetylene.js', 'hno3.js',
  'benzene.js', 'naphthalene.js', 'ethylene.js',
  'triazine.js', 'uracil.js', 'pyridine.js',
  'methanol.js', 'ethanol.js', 'phenol.js',
];
for (const file of allMolFiles) {
  testQuantumNumbers(file);
}

// Density positivity
console.log('\n--- Density Positivity ---');
for (const file of allMolFiles) {
  testDensityPositive(file);
}

// ---- Summary ----

console.log(`\n=== Results: ${passed} passed, ${failed} failed, ${warnings} warnings ===`);
if (failed > 0) {
  console.log('Some tests FAILED — check MO orientations!');
  process.exit(1);
} else {
  console.log('All tests passed.');
}
