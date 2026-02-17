#!/usr/bin/env node
// Add basic molecular orbitals to generated molecule files

import { readFileSync, writeFileSync } from 'fs';

function addBasicMOs(filePath) {
  let content = readFileSync(filePath, 'utf-8');

  // Find all molecules with empty MO arrays
  const regex = /mos:\s*\[\s*\/\/\s*TODO:.*?\n\s*\]/gs;

  content = content.replace(regex, (match) => {
    // Add a basic HOMO orbital (just electron density placeholder)
    return `mos: [
    // Auto-generated: basic HOMO placeholder (needs manual MO generation)
    ['HOMO', [[0, 2, 0, 0, 'real', 0.5]]]
  ]`;
  });

  writeFileSync(filePath, content);
  console.log(`Updated: ${filePath}`);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node add-basic-mos.mjs <file1.js> [file2.js ...]');
  process.exit(1);
}

files.forEach(addBasicMOs);
console.log('Done!');
