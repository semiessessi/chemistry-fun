// Cascading dropdown logic: d1→d2→d3→d4 orbital selector with category filter.

import { ORBITAL_TREE, ALL_ORBITALS } from '../orbitals.js';
import { MOLECULE_LABELS, MOLECULE_CATEGORIES, getMoleculeVariants, getMoleculeCid, getMoleculeNist } from '../molecules/index.js';
import { pubchemUrl } from '../pubchem.js';
import { updateCitationDisplay } from './citation-display.js';

export const D2_LABELS = { Atomic: 'Shell', Molecular: 'Basis', Hybrid: 'Hybridization', Molecules: 'Molecule', 'Bond Formation': 'Molecule', Transitions: 'Series', Reactions: 'Reaction' };
export const D3_LABELS = { Atomic: 'Subshell', Molecular: 'Bond Type', Hybrid: 'Lobe', Molecules: 'Orbital / Field', 'Bond Formation': 'Orbital', Transitions: 'Transition', Reactions: 'View' };
export const D4_LABELS = { Atomic: 'Orbital', Molecular: 'Orbital', Hybrid: 'Orbital', Molecules: 'Orbital', 'Bond Formation': 'Orbital' };

let loadSelectedOrbital, updateShareLink, updateVariantDropdown, updatePubchemLink;

// DOM elements
let d1Select, d2Select, d3Select, d4Select;
let d2Label, d3Label, d4Label, d4Wrapper;
let categorySelect, categoryWrapper;
let pubchemWrapper, pubchemStatus, pubchemCitationDiv, variantWrapper;

export function initDropdownCascade(elements, callbacks) {
  // Unpack DOM elements
  ({ d1Select, d2Select, d3Select, d4Select, d2Label, d3Label, d4Label, d4Wrapper,
     categorySelect, categoryWrapper,
     pubchemWrapper, pubchemStatus, pubchemCitationDiv, variantWrapper } = elements);

  // Unpack callbacks
  ({ loadSelectedOrbital, updateShareLink, updateVariantDropdown, updatePubchemLink } = callbacks);

  // Initialize d1 dropdown
  populateSelect(d1Select, Object.keys(ORBITAL_TREE));

  // Event listeners
  d1Select.addEventListener('change', onD1Change);
  categorySelect.addEventListener('change', () => {
    const d1 = d1Select.value;
    const labels = d1 === 'Molecules' ? MOLECULE_LABELS : undefined;
    populateSelect(d2Select, getFilteredD2Keys(d1), labels);
    onD2Change();
  });
  d2Select.addEventListener('change', onD2Change);
  d3Select.addEventListener('change', onD3Change);
  d4Select.addEventListener('change', onD4Change);
}

export function populateSelect(sel, options, labels) {
  sel.innerHTML = '';
  for (const text of options) {
    const opt = document.createElement('option');
    opt.value = text;
    opt.textContent = (labels && labels[text]) || text;
    sel.appendChild(opt);
  }
}

export function getD3Orbitals() {
  const t = ORBITAL_TREE[d1Select.value];
  if (!t) return [];
  const t2 = t[d2Select.value];
  if (!t2) return [];
  return t2[d3Select.value] || [];
}

export function getSelectedOrbital() {
  const orbitals = getD3Orbitals();
  if (orbitals.length === 0) return null;
  if (orbitals.length === 1) return orbitals[0];
  const idx = d4Select.selectedIndex;
  return orbitals[idx >= 0 ? idx : 0];
}

export function populateCategoryFilter(d1) {
  if (d1 !== 'Molecules') {
    categoryWrapper.classList.add('dropdown-hidden');
    return;
  }
  const molNames = Object.keys(ORBITAL_TREE[d1] || {});
  const catSet = new Set();
  for (const n of molNames) {
    const c = MOLECULE_CATEGORIES[n];
    if (c) catSet.add(c);
  }
  const cats = Array.from(catSet).sort();
  categorySelect.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'All';
  categorySelect.appendChild(allOpt);
  for (const c of cats) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    categorySelect.appendChild(opt);
  }
  categoryWrapper.classList.remove('dropdown-hidden');
}

export function getFilteredD2Keys(d1) {
  const allKeys = Object.keys(ORBITAL_TREE[d1] || {});
  if (d1 !== 'Molecules' || !categorySelect.value) return allKeys;
  const cat = categorySelect.value;
  return allKeys.filter(n => MOLECULE_CATEGORIES[n] === cat);
}

export function onD1Change() {
  const d1 = d1Select.value;
  d2Label.textContent = D2_LABELS[d1] || 'Category';
  d3Label.textContent = D3_LABELS[d1] || 'Subcategory';
  d4Label.textContent = D4_LABELS[d1] || 'Orbital';
  populateCategoryFilter(d1);

  pubchemWrapper.classList.toggle('dropdown-hidden', d1 !== 'Molecules');
  if (d1 !== 'Molecules') {
    pubchemStatus.textContent = '';
    pubchemCitationDiv.innerHTML = '';
    variantWrapper.classList.add('dropdown-hidden');
  }

  const labels = (d1 === 'Molecules' || d1 === 'Bond Formation') ? MOLECULE_LABELS : undefined;
  populateSelect(d2Select, getFilteredD2Keys(d1), labels);
  onD2Change();
}

export function onD2Change() {
  const d1 = d1Select.value;
  const d2 = d2Select.value;
  const d3Keys = Object.keys((ORBITAL_TREE[d1] || {})[d2] || {});
  populateSelect(d3Select, d3Keys);

  if (d1 === 'Molecules' || d1 === 'Bond Formation') {
    const densIdx = d3Keys.indexOf('electron density');
    if (densIdx >= 0) d3Select.selectedIndex = densIdx;
  }

  updateVariantDropdown(d2);
  updatePubchemLink(d2);
  updateCitationDisplay(d2);  // Update citation sources display
  onD3Change();
}

function onD3Change() {
  const orbitals = getD3Orbitals();
  if (orbitals.length <= 1) {
    d4Wrapper.classList.add('dropdown-hidden');
  } else {
    d4Wrapper.classList.remove('dropdown-hidden');
    populateSelect(d4Select, orbitals.map(o => o.d4 || o.name));
  }
  loadSelectedOrbital();
  updateShareLink();
}

function onD4Change() {
  loadSelectedOrbital();
  updateShareLink();
}
