// Quick import validation script - run with: node test-imports.mjs
import { existsSync } from 'fs';
import { readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';

const jsFiles = [
  'js/bond-forming.js',
  'js/dynamics.js',
  'js/electric-field.js',
  'js/vibrations.js',
  'js/reactions.js',
  'js/pubchem.js',
  'js/molecules/core.js',
  'js/dynamics-ui.js',
];

const errors = [];

for (const file of jsFiles) {
  const fullPath = resolve(file);
  if (!existsSync(fullPath)) {
    errors.push(`Missing file: ${file}`);
    continue;
  }

  const content = readFileSync(fullPath, 'utf-8');
  const importMatches = content.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g);

  for (const match of importMatches) {
    const importPath = match[1];
    const resolvedPath = resolve(dirname(fullPath), importPath);

    if (!existsSync(resolvedPath)) {
      errors.push(`${file}: imports missing file ${importPath} (resolved to ${resolvedPath})`);
    }
  }
}

if (errors.length === 0) {
  console.log('✅ All imports are valid!');
} else {
  console.log('❌ Found errors:');
  errors.forEach(err => console.log(`  - ${err}`));
  process.exit(1);
}
