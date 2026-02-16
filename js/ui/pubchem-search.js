// PubChem search UI: input, variant selector, molecule registration.

import { fetchPubChem, pubchemUrl, pubchemCitation, formatFormula } from '../pubchem.js';
import { getMoleculeVariants, addMol, MOLECULE_LABELS } from '../molecules/index.js';

let d2Select, variantSelect, pubchemInput, pubchemBtn, pubchemStatus, pubchemCitationDiv;
let d1Select;
let populateCategoryFilter, populateSelect, getFilteredD2Keys, onD2Change;

export function initPubchemSearch(elements, callbacks) {
  // Unpack DOM elements
  ({ d1Select, d2Select, variantSelect, pubchemInput, pubchemBtn, pubchemStatus, pubchemCitationDiv } = elements);

  // Unpack callbacks
  ({ populateCategoryFilter, populateSelect, getFilteredD2Keys, onD2Change } = callbacks);

  // Variant select listener
  variantSelect.addEventListener('change', async () => {
    const molName = d2Select.value;
    const variants = getMoleculeVariants(molName);
    if (!variants) return;
    const v = variants[variantSelect.selectedIndex];
    if (!v) return;

    if (v.molecule) {
      // Jump to another existing molecule
      d2Select.value = v.molecule;
      onD2Change();
    } else if (v.cid) {
      // Fetch from PubChem
      pubchemStatus.textContent = 'Loading variant...';
      try {
        const result = await fetchPubChem(String(v.cid));
        registerPubchemMolecule(result, v.label || result.name);
        pubchemStatus.textContent = '';
      } catch (e) {
        pubchemStatus.textContent = e.message;
      }
    }
    // else: no molecule/cid → this is the current molecule (no-op)
  });

  // PubChem search button/input listeners
  pubchemBtn.addEventListener('click', doPubchemSearch);
  pubchemInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doPubchemSearch();
  });
}

async function doPubchemSearch() {
  const query = pubchemInput.value.trim();
  if (!query) return;

  pubchemStatus.textContent = 'Searching...';
  pubchemBtn.disabled = true;
  try {
    const result = await fetchPubChem(query);
    registerPubchemMolecule(result, result.name);
    pubchemStatus.textContent = '';
    pubchemInput.value = '';
  } catch (e) {
    pubchemStatus.textContent = e.message;
  } finally {
    pubchemBtn.disabled = false;
  }
}

function registerPubchemMolecule(result, displayName) {
  const { cid, name, iupacName, formula, atoms, bonds, he, mos } = result;
  // Build label: "Formula (Name)" with unicode subscripts
  const formattedFormula = formula ? formatFormula(formula) : '';
  const label = formattedFormula
    ? `${formattedFormula} (${displayName})`
    : displayName;

  const molName = `PubChem:${cid}`;
  addMol({
    name: molName,
    label,
    category: 'PubChem',
    atoms,
    bonds,
    he,
    mos,
    pubchemCid: cid,
  });

  // Refresh category filter to include 'PubChem' category
  populateCategoryFilter(d1Select.value);
  // Refresh D2 dropdown
  const labels = MOLECULE_LABELS;
  populateSelect(d2Select, getFilteredD2Keys(d1Select.value), labels);
  // Select the new molecule
  d2Select.value = molName;
  onD2Change();

  // Show citation
  const url = pubchemUrl(cid);
  const cite = pubchemCitation(displayName, cid);
  pubchemCitationDiv.innerHTML = `<a href="${url}" target="_blank" rel="noopener">View on PubChem</a>`;
}
