#!/usr/bin/env node
// Recalculate every molecule's label formula from its atoms array.
// Also strips formula/parens from name fields that shouldn't have them.

import { readFileSync, writeFileSync } from 'fs';

const SUBSCRIPTS = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉' };

function toSubscript(n) {
  return String(n).split('').map(d => SUBSCRIPTS[d] ?? d).join('');
}

function calcFormula(atomLines) {
  const counts = {};
  for (const line of atomLines) {
    const m = line.match(/\[\s*'([A-Za-z]+)'/);
    if (m) counts[m[1]] = (counts[m[1]] || 0) + 1;
  }
  // Hill order: C, H, then rest alphabetical
  const first = ['C', 'H'].filter(e => counts[e]);
  const rest = Object.keys(counts).filter(e => e !== 'C' && e !== 'H').sort();
  return [...first, ...rest].map(e => e + (counts[e] > 1 ? toSubscript(counts[e]) : '')).join('');
}

// Strip formula/parens suffix from name: "Bromoform (CHBr₃)" → "Bromoform"
// Keep acronyms that are all-caps and short: "Glutathione (GSH)" → keep GSH? No, clean to "Glutathione"
// Keep things like "Vitamin B1 (Thiamine)" → "Vitamin B1 (Thiamine)" — actually these are helpful, leave them
// Only strip if the paren content looks like a chemical formula (contains digits or element symbols with subscripts)
function cleanName(name) {
  // Remove paren suffixes that look like chemical formulas: contain unicode subscript digits or element+digit patterns
  return name.replace(/\s*\([A-Za-z₀-₉₁₂₃₄₅₆₇₈₉\d]+\)\s*$/, match => {
    const inner = match.replace(/[()]/g, '').trim();
    // If it looks like a formula (has subscript chars or uppercase element pattern), strip it
    if (/[₀-₉]/.test(inner) || /^[A-Z][a-z]?\d*([A-Z]|$)/.test(inner)) return '';
    return match; // keep descriptive parens like "(Thiamine)"
  }).trim();
}

function fixFile(filePath) {
  let content = readFileSync(filePath, 'utf-8');
  let fixedFormulas = 0, fixedNames = 0;

  // Split into prefix + addMol blocks
  const addMolRe = /addMol\s*\(\s*\{/g;
  const positions = [];
  let m;
  while ((m = addMolRe.exec(content)) !== null) positions.push(m.index);

  if (positions.length === 0) return;

  // Process blocks in reverse so replacements don't shift indices
  for (let i = positions.length - 1; i >= 0; i--) {
    const start = positions[i];
    // Find the matching closing }); — simplistic: find next "})" after a balanced scan
    let depth = 0, j = start;
    let blockEnd = -1;
    while (j < content.length) {
      if (content[j] === '{') depth++;
      else if (content[j] === '}') {
        depth--;
        if (depth === 0) { blockEnd = j + 1; break; }
      }
      j++;
    }
    if (blockEnd === -1) continue;

    const block = content.slice(start, blockEnd);

    // Extract atoms lines
    const atomsMatch = block.match(/atoms\s*:\s*\[([\s\S]*?)\n\s*\]/);
    if (!atomsMatch) continue;
    const atomLines = atomsMatch[1].split('\n');
    const formula = calcFormula(atomLines);
    if (!formula) continue;

    // Fix name field — strip formula-looking parens
    let newBlock = block.replace(/(\bname\s*:\s*')(.*?)'/, (match, prefix, nameVal) => {
      const cleaned = cleanName(nameVal);
      if (cleaned !== nameVal) { fixedNames++; return prefix + cleaned + "'"; }
      return match;
    });

    // Fix label field — replace whatever is before the (DisplayName) with calculated formula
    newBlock = newBlock.replace(/(\blabel\s*:\s*')[^']*\(([^)]+)\)(.*?)'/, (match, prefix, displayName, suffix) => {
      const newLabel = `${prefix}${formula} (${displayName})'`;
      if (newLabel !== match) fixedFormulas++;
      return newLabel;
    });

    content = content.slice(0, start) + newBlock + content.slice(blockEnd);
  }

  writeFileSync(filePath, content);
  console.log(`${filePath}: ${fixedFormulas} formulas fixed, ${fixedNames} names cleaned`);
}

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

for (const f of files) fixFile(f);
console.log('Done.');
