#!/usr/bin/env node
// Fix missing chemical formulas in molecule files

import { readFileSync, writeFileSync } from 'fs';

// Calculate molecular formula from atoms array
function calculateFormula(atoms) {
  const elementCounts = {};

  for (const atom of atoms) {
    const element = atom[0];
    elementCounts[element] = (elementCounts[element] || 0) + 1;
  }

  // Sort: C, H, then alphabetical
  const order = ['C', 'H'];
  const otherElements = Object.keys(elementCounts)
    .filter(el => !order.includes(el))
    .sort();

  const allElements = [...order.filter(el => elementCounts[el]), ...otherElements];

  // Format with subscripts
  const subscripts = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉' };

  return allElements.map(el => {
    const count = elementCounts[el];
    if (count === 1) return el;
    const countStr = String(count).split('').map(d => subscripts[d] || d).join('');
    return el + countStr;
  }).join('');
}

function fixFile(filePath) {
  console.log(`Fixing formulas in: ${filePath}`);
  let content = readFileSync(filePath, 'utf-8');
  let fixedCount = 0;

  // Find all addMol blocks with empty formulas
  const regex = /label:\s*'\s*\(([^)]+)\)'/g;

  content = content.replace(regex, (match, displayName) => {
    // This label has empty formula, need to calculate it
    // Find the corresponding atoms array

    // For now, mark for manual fix
    return `label: 'FORMULA_NEEDED (${displayName})'`;
  });

  // Better approach: parse each molecule and fix its formula
  const blocks = [];
  let pos = 0;

  while (true) {
    const start = content.indexOf('addMol({', pos);
    if (start === -1) break;

    const end = content.indexOf('});', start);
    if (end === -1) break;

    blocks.push({ start, end: end + 3 });
    pos = end + 3;
  }

  // Process blocks in reverse
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    const molText = content.substring(block.start, block.end);

    // Extract atoms
    const atomsMatch = molText.match(/atoms:\s*\[([\s\S]*?)\n\s*\]/);
    if (!atomsMatch) continue;

    const atomsText = atomsMatch[1];
    const atomLines = atomsText.split('\n').filter(l => l.trim().startsWith('['));
    const atoms = atomLines.map(line => {
      const match = line.match(/\['([^']+)',/);
      return match ? [match[1]] : null;
    }).filter(a => a);

    if (atoms.length === 0) continue;

    // Calculate formula
    const formula = calculateFormula(atoms);

    // Check if label has empty formula
    const labelMatch = molText.match(/label:\s*'([^']*)\s*\(([^)]+)\)'/);
    if (!labelMatch) continue;

    const currentFormula = labelMatch[1].trim();
    const displayName = labelMatch[2];

    if (!currentFormula || currentFormula === '' || currentFormula === 'FORMULA_NEEDED') {
      // Replace the label
      const oldLabel = `label: '${currentFormula ? currentFormula + ' ' : ''}(${displayName})'`;
      const newLabel = `label: '${formula} (${displayName})'`;

      const newMolText = molText.replace(oldLabel, newLabel);
      content = content.substring(0, block.start) + newMolText + content.substring(block.end);

      fixedCount++;
      console.log(`  Fixed: ${displayName} -> ${formula}`);
    }
  }

  writeFileSync(filePath, content);
  console.log(`✓ Fixed ${fixedCount} formulas\n`);
}

// Fix all new molecule files
const files = [
  'js/molecules/saccharides-new.js',
  'js/molecules/oligopeptides-new.js',
  'js/molecules/lipids.js',
  'js/molecules/vitamins-b.js',
  'js/molecules/neurotransmitters-new.js',
  'js/molecules/nucleotides.js',
  'js/molecules/coenzymes.js',
  'js/molecules/large-sugars.js',
  'js/molecules/large-peptides.js',
  'js/molecules/organometallics.js',
  'js/molecules/halogen-compounds.js',
  'js/molecules/heavy-element-compounds.js',
  'js/molecules/giant-molecules.js',
];

files.forEach(fixFile);
console.log('All formulas fixed!');
