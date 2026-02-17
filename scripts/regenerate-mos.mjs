#!/usr/bin/env node
// Regenerate proper MOs for molecules using simplified generateMOs logic

import { readFileSync, writeFileSync } from 'fs';

// Valence shell principal quantum number
const VALENCE_N = {
  H:1, He:1,
  Li:2, Be:2, B:2, C:2, N:2, O:2, F:2, Ne:2,
  Na:3, Mg:3, Al:3, Si:3, P:3, S:3, Cl:3, Ar:3,
};

// Typical valence (number of bonds expected)
const TYPICAL_VALENCE = {
  H:1, C:4, N:3, O:2, F:1, S:2, Cl:1, Br:1, I:1, P:3, Si:4,
};

// Build rotation matrix that maps z-axis to direction (dx, dy, dz)
function buildRotationMatrix(dx, dy, dz) {
  const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
  if (len < 1e-10) return [1,0,0, 0,1,0, 0,0,1];

  const nx = dx/len, ny = dy/len, nz = dz/len;

  // Find perpendicular vector
  let ux, uy, uz;
  if (Math.abs(nz) < 0.9) {
    ux = 0; uy = nz; uz = -ny;
  } else {
    ux = ny; uy = -nx; uz = 0;
  }
  const ulen = Math.sqrt(ux*ux + uy*uy + uz*uz);
  ux /= ulen; uy /= ulen; uz /= ulen;

  // Cross product for third axis
  const vx = ny*uz - nz*uy;
  const vy = nz*ux - nx*uz;
  const vz = nx*uy - ny*ux;

  return [
    ux, vx, nx,
    uy, vy, ny,
    uz, vz, nz
  ];
}

// Simplified MO generation
function generateMOs(atoms, bonds) {
  const mos = [];

  // Build adjacency
  const adj = atoms.map(() => []);
  for (const bond of bonds) {
    const [ai, aj, order] = bond.length === 3 ? bond : [...bond, 1];
    adj[ai].push({ other: aj, order });
    adj[aj].push({ other: ai, order });
  }

  // Bond direction vector
  function bondDir(ai, aj) {
    const [, ax, ay, az] = atoms[ai];
    const [, bx, by, bz] = atoms[aj];
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (len < 1e-10) return [0, 0, 1];
    return [dx/len, dy/len, dz/len];
  }

  function getN(sym) { return VALENCE_N[sym] || 2; }

  // σ bonding orbitals
  const processedBonds = new Set();
  for (const bond of bonds) {
    const [ai, aj, order] = bond.length === 3 ? bond : [...bond, 1];
    const bondKey = Math.min(ai, aj) + ',' + Math.max(ai, aj);
    if (processedBonds.has(bondKey)) continue;
    processedBonds.add(bondKey);

    const symA = atoms[ai][0], symB = atoms[aj][0];
    const nA = getN(symA), nB = getN(symB);
    const [dx, dy, dz] = bondDir(ai, aj);
    const rot = buildRotationMatrix(dx, dy, dz);
    const rotB = buildRotationMatrix(-dx, -dy, -dz);

    const terms = [];
    if (symA === 'H') {
      terms.push([ai, 1, 0, 0, 'real', 0.45]);
    } else {
      terms.push([ai, nA, 0, 0, 'real', 0.18]);
      terms.push([ai, nA, 1, 0, 'real', 0.32, rot]);
    }
    if (symB === 'H') {
      terms.push([aj, 1, 0, 0, 'real', 0.45]);
    } else {
      terms.push([aj, nB, 0, 0, 'real', 0.18]);
      terms.push([aj, nB, 1, 0, 'real', 0.32, rotB]);
    }

    const label = order >= 2 ? `σ ${symA}-${symB} (${order})` : `σ ${symA}-${symB}`;
    mos.push([label, terms]);
  }

  // Lone pairs for O, N, F, S, Cl
  for (let i = 0; i < atoms.length; i++) {
    const sym = atoms[i][0];
    const valence = TYPICAL_VALENCE[sym];
    if (!valence) continue;

    const numBonds = adj[i].length;
    const numLonePairs = Math.floor((valence - numBonds) / 2);

    if (numLonePairs > 0 && (sym === 'O' || sym === 'N' || sym === 'F' || sym === 'S' || sym === 'Cl')) {
      const n = getN(sym);

      // If atom has bonds, orient lone pair perpendicular to first bond
      if (adj[i].length > 0) {
        const [dx, dy, dz] = bondDir(i, adj[i][0].other);
        const rot = buildRotationMatrix(dy, -dx, 0); // Perpendicular
        mos.push([`${sym}${i} lone pair`, [[i, n, 1, 0, 'real', 0.85, rot]]]);
      } else {
        mos.push([`${sym}${i} lone pair`, [[i, n, 1, 0, 'real', 0.85]]]);
      }
    }
  }

  return mos;
}

// Parse and update file
function updateMoleculeFile(filePath) {
  console.log(`Processing: ${filePath}`);
  let content = readFileSync(filePath, 'utf-8');

  // Find all molecules
  const molRegex = /addMol\(\{([\s\S]*?)\}\);/g;
  let updatedContent = content;
  let count = 0;

  let match;
  const regex = /addMol\(\{([\s\S]*?)\}\);/g;

  while ((match = regex.exec(content)) !== null) {
    const molBlock = match[1];

    // Extract atoms
    const atomsMatch = molBlock.match(/atoms:\s*\[([\s\S]*?)\]/);
    if (!atomsMatch) continue;

    const atomsText = atomsMatch[1];
    const atomMatches = [...atomsText.matchAll(/\['([^']+)',\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\]/g)];
    const atoms = atomMatches.map(m => [m[1], parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])]);

    // Extract bonds
    const bondsMatch = molBlock.match(/bonds:\s*\[([\s\S]*?)\]/);
    if (!bondsMatch) continue;

    const bondsText = bondsMatch[1];
    const bondMatches = [...bondsText.matchAll(/\[(\d+),\s*(\d+)(?:,\s*(\d+))?\]/g)];
    const bonds = bondMatches.map(m => {
      const bond = [parseInt(m[1]), parseInt(m[2])];
      if (m[3]) bond.push(parseInt(m[3]));
      return bond;
    });

    // Generate MOs
    const mos = generateMOs(atoms, bonds);

    // Format MOs
    let mosText = '  mos: [\n';
    for (const [moName, termDefs] of mos) {
      mosText += `    ['${moName}', [\n`;
      for (const term of termDefs) {
        const [atomIdx, n, l, m, angType, coeff, rot] = term;
        if (rot) {
          const rotStr = '[' + rot.map(v => v.toFixed(4)).join(', ') + ']';
          mosText += `      [${atomIdx}, ${n}, ${l}, ${m}, '${angType}', ${coeff.toFixed(4)}, ${rotStr}],\n`;
        } else {
          mosText += `      [${atomIdx}, ${n}, ${l}, ${m}, '${angType}', ${coeff.toFixed(4)}],\n`;
        }
      }
      mosText += `    ]],\n`;
    }
    mosText += '  ]';

    // Replace the old mos block
    const oldMosMatch = molBlock.match(/mos:\s*\[[\s\S]*?\]/);
    if (oldMosMatch) {
      const oldMosText = oldMosMatch[0];
      updatedContent = updatedContent.replace(oldMosText, mosText);
      count++;
    }
  }

  writeFileSync(filePath, updatedContent);
  console.log(`✓ Updated ${count} molecules in ${filePath}`);
}

// Main
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node regenerate-mos.mjs <file1.js> [file2.js ...]');
  process.exit(1);
}

files.forEach(updateMoleculeFile);
console.log('Done!');
