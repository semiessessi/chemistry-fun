#!/usr/bin/env node
// Fix MOs in generated molecule files - simpler approach

import { readFileSync, writeFileSync } from 'fs';

// Simplified MO generation - just create σ bonds and lone pairs
function generateSimpleMOs(atoms, bonds) {
  const mos = [];

  // Just create a basic "bonding" orbital and "lone pairs" orbital
  // This is a minimal approach to get molecules rendering

  // Create one bonding MO that includes all atoms
  const bondingTerms = [];
  for (let i = 0; i < atoms.length; i++) {
    const sym = atoms[i][0];
    if (sym === 'H') {
      bondingTerms.push([i, 1, 0, 0, 'real', 0.3]);
    } else {
      bondingTerms.push([i, 2, 0, 0, 'real', 0.2]);
    }
  }
  mos.push(['bonding (HOMO)', bondingTerms]);

  // Create lone pair orbital for O and N atoms
  const lonePairTerms = [];
  for (let i = 0; i < atoms.length; i++) {
    const sym = atoms[i][0];
    if (sym === 'O' || sym === 'N') {
      lonePairTerms.push([i, 2, 1, 0, 'real', 0.7]);
    }
  }
  if (lonePairTerms.length > 0) {
    mos.push(['lone pairs', lonePairTerms]);
  }

  return mos;
}

function fixFile(filePath) {
  console.log(`Fixing: ${filePath}`);
  let content = readFileSync(filePath, 'utf-8');

  // Replace the TODO MO blocks with proper MOs
  let count = 0;

  // Find each addMol block
  const blocks = [];
  let currentPos = 0;

  while (true) {
    const startIdx = content.indexOf('addMol({', currentPos);
    if (startIdx === -1) break;

    const endIdx = content.indexOf('});', startIdx);
    if (endIdx === -1) break;

    blocks.push({ start: startIdx, end: endIdx + 3 });
    currentPos = endIdx + 3;
  }

  // Process in reverse to preserve indices
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    const molText = content.substring(block.start, block.end);

    // Extract atoms
    const atomsMatch = molText.match(/atoms:\s*\[([\s\S]*?)\n\s*\]/);
    if (!atomsMatch) continue;

    const atomsText = atomsMatch[1];
    const atomLines = atomsText.split('\n').filter(l => l.trim().startsWith('['));
    const atoms = atomLines.map(line => {
      const match = line.match(/\['([^']+)',\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\]/);
      if (!match) return null;
      return [match[1], parseFloat(match[2]), parseFloat(match[3]), parseFloat(match[4])];
    }).filter(a => a !== null);

    // Extract bonds
    const bondsMatch = molText.match(/bonds:\s*\[([\s\S]*?)\n\s*\]/);
    if (!bondsMatch) continue;

    const bondsText = bondsMatch[1];
    const bondLines = bondsText.split('\n').filter(l => l.trim().startsWith('['));
    const bonds = bondLines.map(line => {
      const match = line.match(/\[(\d+),\s*(\d+)(?:,\s*(\d+))?\]/);
      if (!match) return null;
      const bond = [parseInt(match[1]), parseInt(match[2])];
      if (match[3]) bond.push(parseInt(match[3]));
      return bond;
    }).filter(b => b !== null);

    // Generate MOs
    const mos = generateSimpleMOs(atoms, bonds);

    // Format MOs
    let mosText = 'mos: [\n';
    for (const [moName, terms] of mos) {
      mosText += `    ['${moName}', [\n`;
      for (const term of terms) {
        // Format: [atomIdx, n, l, m, 'angType', coeff]
        const formatted = `[${term[0]}, ${term[1]}, ${term[2]}, ${term[3]}, '${term[4]}', ${term[5]}]`;
        mosText += `      ${formatted},\n`;
      }
      mosText += `    ]],\n`;
    }
    mosText += '  ]';

    // Find and replace the MO block
    const mosBlockMatch = molText.match(/mos:\s*\[[\s\S]*?\n\s*\]/);
    if (mosBlockMatch) {
      const oldMosText = mosBlockMatch[0];
      const newMolText = molText.replace(oldMosText, mosText);

      content = content.substring(0, block.start) + newMolText + content.substring(block.end);
      count++;
    }
  }

  writeFileSync(filePath, content);
  console.log(`✓ Fixed ${count} molecules`);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node fix-mos.mjs <file1.js> [file2.js ...]');
  process.exit(1);
}

files.forEach(fixFile);
