// Main entry point: cascading dropdown UI, state management, animation loop.

import * as THREE from 'three';
import { ALL_ORBITALS, ORBITAL_MAP, ORBITAL_TREE } from './orbitals.js';
import { sampleGridAsync, renderLayersAsync, cancelCompute } from './worker-pool.js';
import { computeMultiThresholds, computeThreshold } from './grid.js';
import { getLayerMaterials, updateLegend, applyOpacityScale } from './layer-materials.js';
import { scene, camera, renderer, controls, matPositive, matNegative, updateLabelScales, updateGridExtent } from './scene.js';
import { showMoleculeContext, clearMoleculeContext, setMoleculeContextVisible,
         updateMoleculeContextPositions, resetMoleculeContextPositions,
         MOLECULE_LABELS, MOLECULE_CATEGORIES, getMoleculeAtoms,
         getMoleculeVariants, getMoleculeCid, getMoleculeNist, addMol } from './molecules/index.js';
import { fetchPubChem, pubchemUrl, pubchemCitation, formatFormula } from './pubchem.js';
import { BOND_FORMING_CONFIG, clearBondFormingContext,
         setBondFormingContextVisible } from './bond-forming.js';
import { clearFieldVis, purgeFieldCache, setFieldVisVisible, hasFieldGroup, setFieldMode, setFieldSource, getFieldSource, tickFieldAnimation } from './electric-field.js';
import { computeElectrostaticPotential, computeChargeDensity } from './electrostatic-potential.js';
import { SIM_STATE, SIM3_STATE } from './dynamics.js';
import { initRenderPipeline, adaptiveGrid, getHalfExtent, loadOrbital, loadOrbitalAsync,
         renderFromCaches, renderFromCachesAsync, rebuildFieldVis,
         showProgress, hideProgress, clearMeshes, buildGeometry } from './render-pipeline.js';
import { initDynamicsUI, setupDynamicsEvents, tickDynamics,
         loadBondFormingOrbital, cleanupDynamicsState, triatomicEquilibrium,
         sliderToR, rToSlider, dynWrapper, sepWrapper } from './dynamics-ui.js';
import { VibrationController, generateVibrationalModes } from './vibrations.js';
import { TransitionController, transitionWavelength, wavelengthToRGB } from './transitions.js';
import { renderAtomicDiagram, renderMolecularDiagram, renderDiatomicDiagram, clearDiagram } from './energy-diagram.js';
import { computeELF } from './elf.js';
import { MixerController, COMPONENTS, PRESETS } from './orbital-mixer.js';
import { ReactionController } from './reactions.js';
import { initPanelPersistence } from './ui/panel-persistence.js';
import { createSliderWithDisplay } from './ui/slider-helpers.js';

// ---- Dropdown elements ----
const d1Select = document.getElementById('d1-select');
const d2Select = document.getElementById('d2-select');
const d3Select = document.getElementById('d3-select');
const d4Select = document.getElementById('d4-select');
const d2Label = document.getElementById('d2-label');
const d3Label = document.getElementById('d3-label');
const d4Label = document.getElementById('d4-label');
const d4Wrapper = document.getElementById('d4-wrapper');

const categorySelect = document.getElementById('category-select');
const categoryWrapper = document.getElementById('category-wrapper');

const pubchemWrapper = document.getElementById('pubchem-wrapper');
const pubchemInput = document.getElementById('pubchem-input');
const pubchemBtn = document.getElementById('pubchem-btn');
const pubchemStatus = document.getElementById('pubchem-status');
const pubchemCitationDiv = document.getElementById('pubchem-citation');

const variantWrapper = document.getElementById('variant-wrapper');
const variantSelect = document.getElementById('variant-select');

const densityOptions = document.getElementById('density-options');

const D2_LABELS = { Atomic: 'Shell', Molecular: 'Basis', Hybrid: 'Hybridization', Molecules: 'Molecule', 'Bond Formation': 'Molecule', Transitions: 'Series', Reactions: 'Reaction' };
const D3_LABELS = { Atomic: 'Subshell', Molecular: 'Bond Type', Hybrid: 'Lobe', Molecules: 'Orbital / Field', 'Bond Formation': 'Orbital', Transitions: 'Transition', Reactions: 'View' };
const D4_LABELS = { Atomic: 'Orbital', Molecular: 'Orbital', Hybrid: 'Orbital', Molecules: 'Orbital', 'Bond Formation': 'Orbital' };

function populateSelect(sel, options, labels) {
  sel.innerHTML = '';
  for (const text of options) {
    const opt = document.createElement('option');
    opt.value = text;
    opt.textContent = (labels && labels[text]) || text;
    sel.appendChild(opt);
  }
}

function getD3Orbitals() {
  const t = ORBITAL_TREE[d1Select.value];
  if (!t) return [];
  const t2 = t[d2Select.value];
  if (!t2) return [];
  return t2[d3Select.value] || [];
}

// ---- Shared state ----
let currentMeshes = [];
let currentCaches = [];
let currentProbability = 0.8;
let currentLayers = 5;
let currentOpacityTarget = 70;
let rebuildTimeout = null;
let isBondForming = false;
let isTriatomic = false;
let currentBondOrbital = null;
let currentR = BOND_FORMING_CONFIG.R_EQ;
let isDragging = false;
let isDynamics = false;
let dynOrbitalGroup = null;
let lastSampledR = -1;
let lastSampledR3 = null;
let dynFinalRendered = false;
let lastSampledOrientations = null;
let lastSampledOrientations3 = null;

const layerSelect = document.getElementById('layer-select');
const ballStickToggle = document.getElementById('ball-stick-toggle');
let showBallAndStick = ballStickToggle.checked;

const densityFieldToggle = document.getElementById('density-field-toggle');
let showDensityField = densityFieldToggle.checked;

const energyDiagramContainer = document.getElementById('energy-diagram');

const fieldVisToggle = document.getElementById('field-vis-toggle');
const fieldStyleSelect = document.getElementById('field-style-select');
const fieldSourceSelect = document.getElementById('field-source-select');
const fieldOptions = document.getElementById('field-options');
let showFieldVis = fieldVisToggle.checked;
let fieldStyle = fieldStyleSelect.value;

// ---- Bond-forming defaults ----
let savedProbability = null;
let savedLayers = null;

function applyBondFormingDefaults() {
  // Save current values, apply bond-forming defaults
  if (savedProbability === null) {
    savedProbability = currentProbability;
    savedLayers = currentLayers;
  }
  currentProbability = 0.5;
  probSlider.value = '50';
  probDisplay.textContent = '50%';
  currentLayers = 1;
  layerSelect.value = '1';
}

function restoreNonBondFormingDefaults() {
  if (savedProbability !== null) {
    currentProbability = savedProbability;
    probSlider.value = String(Math.round(savedProbability * 100));
    probDisplay.textContent = Math.round(savedProbability * 100) + '%';
    currentLayers = savedLayers;
    layerSelect.value = String(savedLayers);
    savedProbability = null;
    savedLayers = null;
  }
}

// ---- Atomic numbers for atom info ----
const ATOMIC_Z = {
  H: 1, He: 2, C: 6, N: 7, O: 8, F: 9, Na: 11, Al: 13,
  P: 15, S: 16, Cl: 17, Ca: 20, Ti: 22, Fe: 26, Cu: 29,
};

function getCurrentAtomInfo() {
  const orbital = getSelectedOrbital();
  if (!orbital) return null;

  if (orbital.molecule) {
    const atoms = getMoleculeAtoms(orbital.molecule);
    if (atoms) {
      return atoms.map(a => ({
        Z: ATOMIC_Z[a[0]] || 1,
        x: a[1], y: a[2], z: a[3],
      }));
    }
  }

  if (isBondForming && !isTriatomic && currentBondOrbital) {
    const cfg = BOND_FORMING_CONFIG;
    const halfR = currentR / 2;
    return cfg.elements.map((el, i) => ({
      Z: ATOMIC_Z[el] || 1,
      x: 0, y: 0, z: i === 0 ? -halfR : halfR,
    }));
  }

  if (isBondForming && isTriatomic && currentBondOrbital) {
    const triConfig = currentBondOrbital.bondForming.triatomic;
    const eqPos = triatomicEquilibrium(triConfig);
    return triConfig.atoms.map((el, i) => ({
      Z: ATOMIC_Z[el] || 1,
      x: eqPos[i][0], y: eqPos[i][1], z: eqPos[i][2],
    }));
  }

  return [{ Z: 1, x: 0, y: 0, z: 0 }];
}

// ---- Opacity ----

function updateOrbitalOpacity() {
  const T = currentOpacityTarget / 100;
  const N = currentLayers;
  const colorMode = getColorMode();
  const baseMax = colorMode === 'density' ? 0.65 : 0.70;
  const effectiveLayers = Math.max(1, N * 0.4);
  const correctedMax = 1 - Math.pow(1 - T, 1 / effectiveLayers);
  const scale = correctedMax / baseMax;
  matPositive.opacity = correctedMax;
  matNegative.opacity = correctedMax;
  if (N > 1) applyOpacityScale(N, colorMode, scale);
}

function isDensityMode() { return d3Select.value === 'electron density'; }
function isChargeDensityMode() { return d3Select.value === 'charge visualisation'; }
function isELFMode() { return d3Select.value === 'ELF'; }

function getColorMode() {
  if (isDensityMode() || isESPotentialMode() || isELFMode()) return 'density';
  if (isChargeDensityMode()) return 'charge';
  return 'orbital';
}

function applyBallStickVisibility() {
  setMoleculeContextVisible(showBallAndStick);
  setBondFormingContextVisible(showBallAndStick);
}

function applyDensityFieldVisibility() {
  const vibRunning = vibController.state === 'playing' || vibController.state === 'building';
  // Only toggle static meshes if vibration isn't actively running (statics are hidden during playback)
  if (!vibRunning) {
    for (const m of currentMeshes) m.visible = showDensityField;
    if (dynOrbitalGroup) dynOrbitalGroup.visible = showDensityField;
  }
  // Toggle density sub-group visibility in vibration frames independently
  if (vibController.state !== 'idle') {
    vibController.setDensityVisible(showDensityField);
  }
}

function isESPotentialMode() { return d3Select.value === 'electrostatic potential'; }

function updateFieldSourceOptions() {
  const isFieldMode = isDensityMode() || isESPotentialMode() || isChargeDensityMode() || isELFMode();
  const d1 = d1Select.value;
  const hasAtoms = d1 === 'Molecules' || d1 === 'Bond Formation';

  const gradOpt = fieldSourceSelect.querySelector('option[value="gradient"]');
  const esOpt = fieldSourceSelect.querySelector('option[value="electrostatic"]');
  const magOpt = fieldSourceSelect.querySelector('option[value="magnetic"]');
  if (gradOpt) gradOpt.disabled = isFieldMode;
  if (esOpt) esOpt.disabled = true;
  if (magOpt) magOpt.disabled = !(isFieldMode && hasAtoms);

  // Auto-select: magnetic for field modes, gradient otherwise
  if (isFieldMode && hasAtoms) {
    fieldSourceSelect.value = 'magnetic';
    setFieldSource('magnetic');
  } else if (fieldSourceSelect.value !== 'gradient') {
    fieldSourceSelect.value = 'gradient';
    setFieldSource('gradient');
  }
}

// ---- Energy Level Diagram ----

function updateEnergyDiagram() {
  const d1 = d1Select.value;
  const orbital = getSelectedOrbital();
  const selectedInfo = orbital ? { d1: orbital.d1, d2: orbital.d2, d3: orbital.d3, name: orbital.name } : null;

  if (d1 === 'Atomic') {
    renderAtomicDiagram(energyDiagramContainer, selectedInfo, onEnergyDiagramSelect);
  } else if (d1 === 'Molecules') {
    const molName = d2Select.value;
    const d3Keys = Object.keys((ORBITAL_TREE[d1] || {})[molName] || {});
    // Build MO list from d3 entries that aren't special fields
    const moList = d3Keys
      .filter(k => k !== 'electron density' && k !== 'electrostatic potential' && k !== 'charge visualisation' && k !== 'ELF')
      .map(k => [k]);
    renderMolecularDiagram(energyDiagramContainer, molName, moList, selectedInfo, onEnergyDiagramSelect);
  } else if (d1 === 'Molecular') {
    renderDiatomicDiagram(energyDiagramContainer, selectedInfo, onEnergyDiagramSelect);
  } else {
    clearDiagram(energyDiagramContainer);
  }
}

function onEnergyDiagramSelect(d1Val, d2Val, d3Val, d4Val) {
  // Switch mode if needed — manually populate without triggering full cascade
  if (d1Val && d1Val !== d1Select.value) {
    d1Select.value = d1Val;
    const d1 = d1Val;
    d2Label.textContent = D2_LABELS[d1] || 'Category';
    d3Label.textContent = D3_LABELS[d1] || 'Subcategory';
    d4Label.textContent = D4_LABELS[d1] || 'Orbital';
    populateCategoryFilter(d1);
    pubchemWrapper.classList.toggle('dropdown-hidden', d1 !== 'Molecules');
    const labels = (d1 === 'Molecules' || d1 === 'Bond Formation') ? MOLECULE_LABELS : undefined;
    populateSelect(d2Select, getFilteredD2Keys(d1), labels);
  }
  if (d2Val) {
    d2Select.value = d2Val;
    const d3Keys = Object.keys((ORBITAL_TREE[d1Select.value] || {})[d2Val] || {});
    populateSelect(d3Select, d3Keys);
  }
  if (d3Val) {
    d3Select.value = d3Val;
    const orbitals = getD3Orbitals();
    if (orbitals.length > 1) {
      d4Wrapper.classList.remove('dropdown-hidden');
      populateSelect(d4Select, orbitals.map(o => o.d4 || o.name));
      if (d4Val) d4Select.value = d4Val;
    } else {
      d4Wrapper.classList.add('dropdown-hidden');
    }
  }
  loadSelectedOrbital();
  updateShareLink();
}

// ---- State getter/setter for sub-modules ----

function stateGetter() {
  return {
    currentMeshes, currentCaches, currentProbability, currentLayers,
    currentOpacityTarget, isBondForming, isTriatomic, currentBondOrbital,
    currentR, isDragging, isDynamics, dynOrbitalGroup,
    lastSampledR, lastSampledR3, dynFinalRendered,
    lastSampledOrientations, lastSampledOrientations3,
    showFieldVis, showDensityField, showBallAndStick, vibStaticMeshesHidden,
    isDensityMode, isESPotentialMode, getColorMode, updateOrbitalOpacity, applyDensityFieldVisibility,
    getCurrentAtomInfo,
  };
}

function stateSetter(patch) {
  if ('currentMeshes' in patch) currentMeshes = patch.currentMeshes;
  if ('currentCaches' in patch) currentCaches = patch.currentCaches;
  if ('currentProbability' in patch) currentProbability = patch.currentProbability;
  if ('currentLayers' in patch) currentLayers = patch.currentLayers;
  if ('isBondForming' in patch) isBondForming = patch.isBondForming;
  if ('isTriatomic' in patch) isTriatomic = patch.isTriatomic;
  if ('currentBondOrbital' in patch) currentBondOrbital = patch.currentBondOrbital;
  if ('currentR' in patch) currentR = patch.currentR;
  if ('isDragging' in patch) isDragging = patch.isDragging;
  if ('isDynamics' in patch) isDynamics = patch.isDynamics;
  if ('dynOrbitalGroup' in patch) dynOrbitalGroup = patch.dynOrbitalGroup;
  if ('lastSampledR' in patch) lastSampledR = patch.lastSampledR;
  if ('lastSampledR3' in patch) lastSampledR3 = patch.lastSampledR3;
  if ('dynFinalRendered' in patch) dynFinalRendered = patch.dynFinalRendered;
  if ('lastSampledOrientations' in patch) lastSampledOrientations = patch.lastSampledOrientations;
  if ('lastSampledOrientations3' in patch) lastSampledOrientations3 = patch.lastSampledOrientations3;
}

// ---- Initialize sub-modules ----
initRenderPipeline(stateGetter, stateSetter);
initDynamicsUI(stateGetter, stateSetter);
setupDynamicsEvents();

// ---- Cascading dropdown logic ----

function populateCategoryFilter(d1) {
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

function getFilteredD2Keys(d1) {
  const allKeys = Object.keys(ORBITAL_TREE[d1] || {});
  if (d1 !== 'Molecules' || !categorySelect.value) return allKeys;
  const cat = categorySelect.value;
  return allKeys.filter(n => MOLECULE_CATEGORIES[n] === cat);
}

function onD1Change() {
  const d1 = d1Select.value;
  d2Label.textContent = D2_LABELS[d1] || 'Category';
  d3Label.textContent = D3_LABELS[d1] || 'Subcategory';
  d4Label.textContent = D4_LABELS[d1] || 'Orbital';
  populateCategoryFilter(d1);
  // Show/hide PubChem search for Molecules mode
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

function onD2Change() {
  const d1 = d1Select.value;
  const d2 = d2Select.value;
  const d3Keys = Object.keys((ORBITAL_TREE[d1] || {})[d2] || {});
  populateSelect(d3Select, d3Keys);
  if (d1 === 'Molecules' || d1 === 'Bond Formation') {
    const densIdx = d3Keys.indexOf('electron density');
    if (densIdx >= 0) d3Select.selectedIndex = densIdx;
  }
  // Update variant dropdown
  updateVariantDropdown(d2);
  // Update PubChem citation/link
  updatePubchemLink(d2);
  onD3Change();
}

function updateVariantDropdown(molName) {
  const variants = getMoleculeVariants(molName);
  if (!variants || variants.length === 0) {
    variantWrapper.classList.add('dropdown-hidden');
    return;
  }
  variantSelect.innerHTML = '';
  for (let i = 0; i < variants.length; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = variants[i].label;
    variantSelect.appendChild(opt);
  }
  variantWrapper.classList.remove('dropdown-hidden');
}

function updatePubchemLink(molName) {
  let html = '';
  const cid = getMoleculeCid(molName);
  if (cid) {
    const url = pubchemUrl(cid);
    html += `<a href="${url}" target="_blank" rel="noopener">View on PubChem</a>`;
  }
  if (getMoleculeNist(molName)) {
    if (html) html += '<br>';
    html += `<a href="https://cccbdb.nist.gov/" target="_blank" rel="noopener">Geometry: NIST CCCBDB</a>`;
  }
  pubchemCitationDiv.innerHTML = html;
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

function onD4Change() { loadSelectedOrbital(); updateShareLink(); }

function getSelectedOrbital() {
  const orbitals = getD3Orbitals();
  if (orbitals.length === 0) return null;
  if (orbitals.length === 1) return orbitals[0];
  const idx = d4Select.selectedIndex;
  return orbitals[idx >= 0 ? idx : 0];
}

// ---- Initialize dropdowns ----
populateSelect(d1Select, Object.keys(ORBITAL_TREE));

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

// ---- Auto-rotation ----
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

// ---- Load selected orbital ----

function loadSelectedOrbital() {
  const orbital = getSelectedOrbital();
  if (!orbital) return;

  updateFieldSourceOptions();
  cancelCompute();
  cancelVibration();
  cancelTransition();
  cancelReaction();
  chargeCache = null;
  updateEnergyDiagram();

  // Clean up dynamics state when switching orbitals
  if (isDynamics || SIM_STATE.running || SIM3_STATE.running) {
    cleanupDynamicsState();
  }

  if (orbital.bondForming) {
    isBondForming = true;
    currentBondOrbital = orbital;
    dynWrapper.classList.remove('dropdown-hidden');
    vibWrapper.classList.add('dropdown-hidden');
    reactionWrapper.classList.add('dropdown-hidden');
    clearMoleculeContext();
    applyBondFormingDefaults();

    (async () => {
      await loadBondFormingOrbital(orbital);
      applyBallStickVisibility();
    })();
  } else {
    isBondForming = false;
    isTriatomic = false;
    currentBondOrbital = null;
    sepWrapper.classList.add('dropdown-hidden');
    dynWrapper.classList.add('dropdown-hidden');
    clearBondFormingContext();
    restoreNonBondFormingDefaults();

    if (d1Select.value === 'Molecules') {
      showMoleculeContext(orbital.name);
      applyBallStickVisibility();
      // Show vibration controls for any molecule field mode
      if (orbital.molecule) {
        populateVibModes(orbital.molecule);
        vibWrapper.classList.remove('dropdown-hidden');
      } else {
        vibWrapper.classList.add('dropdown-hidden');
      }
      transitionWrapper.classList.add('dropdown-hidden');
      mixerWrapper.classList.add('dropdown-hidden');
      reactionWrapper.classList.add('dropdown-hidden');
    } else if (d1Select.value === 'Transitions') {
      clearMoleculeContext();
      vibWrapper.classList.add('dropdown-hidden');
      transitionWrapper.classList.remove('dropdown-hidden');
      mixerWrapper.classList.add('dropdown-hidden');
      reactionWrapper.classList.add('dropdown-hidden');
    } else if (d1Select.value === 'Orbital Mixer') {
      clearMoleculeContext();
      vibWrapper.classList.add('dropdown-hidden');
      transitionWrapper.classList.add('dropdown-hidden');
      mixerWrapper.classList.remove('dropdown-hidden');
      reactionWrapper.classList.add('dropdown-hidden');
      populateMixerSliders();
    } else if (d1Select.value === 'Reactions') {
      clearMoleculeContext();
      vibWrapper.classList.add('dropdown-hidden');
      transitionWrapper.classList.add('dropdown-hidden');
      mixerWrapper.classList.add('dropdown-hidden');
      reactionWrapper.classList.remove('dropdown-hidden');
    } else {
      clearMoleculeContext();
      vibWrapper.classList.add('dropdown-hidden');
      transitionWrapper.classList.add('dropdown-hidden');
      mixerWrapper.classList.add('dropdown-hidden');
      reactionWrapper.classList.add('dropdown-hidden');
    }
    const startVibAfterLoad = () => {
      if (!vibWrapper.classList.contains('dropdown-hidden') &&
          (vibModeSelect.value === 'random' || parseInt(vibModeSelect.value) >= 0)) {
        startVibBuild();
      }
    };
    if (orbital.isReaction) {
      startReactionBuild(orbital);
    } else if (orbital.isTransition) {
      // Load initial state first, then start transition build
      loadOrbitalAsync(orbital).then(() => startTransitionBuild(orbital));
    } else if (orbital.isMixer) {
      // Load the mixer's current orbital (with updated coefficients)
      loadOrbitalAsync(mixer.buildOrbital());
    } else if (orbital.isELF) {
      loadELFAsync(orbital).then(startVibAfterLoad);
    } else if (orbital.isElectrostaticPotential) {
      loadElectrostaticPotentialAsync(orbital).then(startVibAfterLoad);
    } else if (orbital.isChargeDensity) {
      loadChargeDensityAsync(orbital).then(startVibAfterLoad);
    } else {
      loadOrbitalAsync(orbital).then(startVibAfterLoad);
    }
  }
}

// ---- Electrostatic potential loader (two-step: density → potential) ----

async function loadElectrostaticPotentialAsync(orbital) {
  cancelCompute();
  const halfExtent = getHalfExtent(orbital);
  updateGridExtent(halfExtent);
  const gs = adaptiveGrid(halfExtent, false, halfExtent < 28);

  // Step 1: sample electron density grid
  showProgress('Sampling density...', 0);
  const densityData = await sampleGridAsync(orbital, gs, halfExtent,
    (f) => showProgress('Sampling density...', f * 0.3));
  if (!densityData) return;

  // Step 2: solve Poisson equation for electron potential + add nuclear Coulomb
  const atomInfo = getCurrentAtomInfo();
  const potential = await computeElectrostaticPotential(atomInfo, densityData, gs, halfExtent,
    (f) => showProgress('Solving potential...', 0.3 + f * 0.3));

  // Step 3: cache potential data and render through normal isosurface pipeline
  currentCaches = [{ data: potential, halfExtent, gridSize: gs }];
  showProgress('Rendering...', 0.6);
  await renderFromCachesAsync(currentProbability, gs);
  hideProgress();

  if (!isDragging && !isDynamics) {
    const dist = halfExtent * 1.8;
    const dir = camera.position.clone().normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    controls.update();
  }
}

// ---- Charge visualisation ----
// Renders positive (nuclear) and negative (electronic) with independent
// thresholds so both sides get balanced isosurfaces despite very different
// spatial distributions.

let chargeCache = null; // { posData, negData, halfExtent, gridSize }

async function renderChargeVisualisation() {
  if (!chargeCache) return;
  const { posData, negData, halfExtent, gridSize } = chargeCache;

  for (const m of currentMeshes) {
    if (m.parent) m.parent.remove(m);
    m.geometry.dispose();
  }

  const layers = currentLayers;
  const mats = getLayerMaterials(layers, 'charge');
  const step = (2 * halfExtent) / (gridSize - 1);
  const meshes = [];

  // Dispatch both sides to workers in parallel
  const [posResult, negResult] = await Promise.all([
    renderLayersAsync(posData, halfExtent, gridSize, currentProbability, layers, true,
      (f) => showProgress('Rendering...', f * 0.5)),
    renderLayersAsync(negData, halfExtent, gridSize, currentProbability, layers, true,
      (f) => showProgress('Rendering...', 0.5 + f * 0.5)),
  ]);

  const addMeshes = (result, matArr) => {
    if (!result) return;
    for (const r of result.results) {
      if (r.indices.length === 0 || r.side !== 'pos') continue;
      const verts = r.vertices;
      for (let i = 0; i < verts.length; i += 3) {
        verts[i] = verts[i] * step - halfExtent;
        verts[i + 1] = verts[i + 1] * step - halfExtent;
        verts[i + 2] = verts[i + 2] * step - halfExtent;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      geo.setIndex(new THREE.BufferAttribute(r.indices, 1));
      geo.computeVertexNormals();
      const matIdx = layers === 1 ? 0 : layers - 1 - r.layer;
      const mesh = new THREE.Mesh(geo, matArr[matIdx]);
      if (layers > 1) mesh.renderOrder = r.layer;
      scene.add(mesh);
      meshes.push(mesh);
    }
  };

  addMeshes(posResult, mats.pos); // nuclear (red)
  addMeshes(negResult, mats.neg); // electronic (blue)

  currentMeshes = meshes;
  updateLegend(layers, currentProbability, 'charge');
  updateOrbitalOpacity();
  if (!showDensityField) applyDensityFieldVisibility();
  hideProgress();
}

async function loadChargeDensityAsync(orbital) {
  cancelCompute();
  const halfExtent = getHalfExtent(orbital);
  updateGridExtent(halfExtent);
  const gs = adaptiveGrid(halfExtent, false, halfExtent < 28);

  showProgress('Sampling density...', 0);
  const densityData = await sampleGridAsync(orbital, gs, halfExtent,
    (f) => showProgress('Sampling density...', f * 0.5));
  if (!densityData) return;

  const atomInfo = getCurrentAtomInfo();
  const chargeData = await computeChargeDensity(atomInfo, densityData, gs, halfExtent,
    (f) => showProgress('Computing charge visualisation...', 0.5 + f * 0.2));

  // Split into positive-only and negative-only (negated) arrays
  const N3 = chargeData.length;
  const posData = new Float32Array(N3);
  const negData = new Float32Array(N3);
  for (let i = 0; i < N3; i++) {
    if (chargeData[i] > 0) posData[i] = chargeData[i];
    else if (chargeData[i] < 0) negData[i] = -chargeData[i];
  }

  chargeCache = { posData, negData, halfExtent, gridSize: gs };
  currentCaches = [{ data: chargeData, halfExtent, gridSize: gs }];

  showProgress('Rendering...', 0.7);
  clearMeshes();
  await renderChargeVisualisation();

  if (!isDragging && !isDynamics) {
    const dist = halfExtent * 1.8;
    const dir = camera.position.clone().normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    controls.update();
  }
}

// ---- ELF loader ----

async function loadELFAsync(orbital) {
  cancelCompute();
  const halfExtent = orbital.halfExtent || 14;
  updateGridExtent(halfExtent);
  const gs = adaptiveGrid(halfExtent, false, halfExtent < 28);

  showProgress('Computing ELF: sampling MOs...', 0);
  const elfData = await computeELF(orbital.molecule, gs, halfExtent,
    (f) => showProgress(`Computing ELF...`, f * 0.7));

  if (!elfData) return;

  // Store as cache for re-rendering (treated as density-like field)
  currentCaches = [{ data: elfData, halfExtent, gridSize: gs }];
  showProgress('Rendering ELF...', 0.7);
  await renderFromCachesAsync(currentProbability, gs);
  hideProgress();

  if (!isDragging && !isDynamics) {
    const dist = halfExtent * 1.8;
    const dir = camera.position.clone().normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    controls.update();
  }
}

// ---- Probability slider ----
const probSlider = document.getElementById('prob-slider');
const probDisplay = document.getElementById('prob-display');
let probDragging = false;

probSlider.addEventListener('input', () => {
  currentProbability = parseInt(probSlider.value) / 100;
  probDisplay.textContent = probSlider.value + '%';
  probDragging = true;
  cancelCompute();
  if (rebuildTimeout) clearTimeout(rebuildTimeout);
});

probSlider.addEventListener('pointerup', () => {
  probDragging = false;
  triggerProbRebuild();
  updateShareLink();
});

probSlider.addEventListener('change', () => {
  if (!probDragging) {
    currentProbability = parseInt(probSlider.value) / 100;
    probDisplay.textContent = probSlider.value + '%';
    triggerProbRebuild();
  }
});

function triggerProbRebuild() {
  if (rebuildTimeout) clearTimeout(rebuildTimeout);
  rebuildTimeout = setTimeout(async () => {
    if (currentCaches.length > 0) {
      cancelCompute();
      if (isChargeDensityMode() && chargeCache) {
        await renderChargeVisualisation();
      } else {
        const target = isDynamics && dynOrbitalGroup ? dynOrbitalGroup : undefined;
        await renderFromCachesAsync(currentProbability, undefined, target);
        hideProgress();
      }
    }
    if (isVibActive()) { cancelVibration(); startVibBuild(); }
    rebuildTransitionIfActive();
  }, 50);
}

// ---- Layer select ----
const customLayersRow = document.getElementById('custom-layers-row');
const customLayersInput = document.getElementById('custom-layers-input');

async function applyLayerChange() {
  if (currentCaches.length > 0) {
    cancelCompute();
    if (isChargeDensityMode() && chargeCache) {
      await renderChargeVisualisation();
    } else {
      const target = isDynamics && dynOrbitalGroup ? dynOrbitalGroup : undefined;
      await renderFromCachesAsync(currentProbability, undefined, target);
      hideProgress();
    }
  }
  if (isVibActive()) { cancelVibration(); startVibBuild(); }
  rebuildTransitionIfActive();
  updateShareLink();
}

layerSelect.addEventListener('change', async () => {
  if (layerSelect.value === 'custom') {
    customLayersRow.classList.remove('dropdown-hidden');
    customLayersInput.value = currentLayers;
    customLayersInput.focus();
  } else {
    customLayersRow.classList.add('dropdown-hidden');
    currentLayers = parseInt(layerSelect.value);
    await applyLayerChange();
  }
});

customLayersInput.addEventListener('change', async () => {
  const v = Math.max(1, Math.min(500, parseInt(customLayersInput.value) || 5));
  customLayersInput.value = v;
  currentLayers = v;
  await applyLayerChange();
});

// ---- Ball & Stick toggle ----
ballStickToggle.addEventListener('change', () => {
  showBallAndStick = ballStickToggle.checked;
  applyBallStickVisibility();
  updateShareLink();
});

// ---- Density Field toggle ----
densityFieldToggle.addEventListener('change', () => {
  showDensityField = densityFieldToggle.checked;
  densityOptions.style.display = showDensityField ? '' : 'none';
  applyDensityFieldVisibility();
  updateShareLink();
});


// ---- Vector Field toggle ----

function rebuildVibIfActive() {
  if (isVibActive()) {
    // Cancel without restoring static meshes (we're starting a new build immediately)
    vibController.cancel();
    vibPlayBtn.disabled = true;
    vibPlayBtn.textContent = '\u25B6 Play';
    vibProgress.classList.add('dropdown-hidden');
    resetMoleculeContextPositions();
    startVibBuild();
  }
}

fieldVisToggle.addEventListener('change', () => {
  showFieldVis = fieldVisToggle.checked;
  const vibPlaying = vibController.state === 'playing' || vibController.state === 'building';
  if (showFieldVis) {
    fieldOptions.classList.remove('dropdown-hidden');
    // Show/build static field vis only when vibration is NOT actively running
    if (!vibPlaying) {
      if (hasFieldGroup()) {
        setFieldVisVisible(true);
      } else {
        rebuildFieldVis(isDynamics && dynOrbitalGroup ? dynOrbitalGroup : undefined, getCurrentAtomInfo);
      }
    }
    // Handle vibration frame field vis
    if (isVibActive() && !vibController.hasFieldVis) {
      rebuildVibIfActive();
    } else if (isVibActive()) {
      vibController.setFieldVisVisible(true);
    }
  } else {
    fieldOptions.classList.add('dropdown-hidden');
    setFieldVisVisible(false);
    vibController.setFieldVisVisible(false);
  }
  updateShareLink();
});

fieldStyleSelect.addEventListener('change', () => {
  fieldStyle = fieldStyleSelect.value;
  setFieldMode(fieldStyle);
  if (showFieldVis && currentCaches.length > 0) {
    rebuildFieldVis(isDynamics && dynOrbitalGroup ? dynOrbitalGroup : undefined, getCurrentAtomInfo);
  }
  rebuildVibIfActive();
  updateShareLink();
});

fieldSourceSelect.addEventListener('change', () => {
  setFieldSource(fieldSourceSelect.value);
  if (showFieldVis && currentCaches.length > 0) {
    rebuildFieldVis(isDynamics && dynOrbitalGroup ? dynOrbitalGroup : undefined, getCurrentAtomInfo);
  }
  rebuildVibIfActive();
  updateShareLink();
});

// ---- Opacity slider ----
const opacitySlider = document.getElementById('opacity-slider');
const opacityDisplay = document.getElementById('opacity-display');

if (opacitySlider) {
  opacitySlider.addEventListener('input', () => {
    currentOpacityTarget = parseInt(opacitySlider.value);
    opacityDisplay.textContent = currentOpacityTarget + '%';
    updateOrbitalOpacity();
    updateShareLink();
  });
}

// ---- Vibration ----

const vibController = new VibrationController();
const vibWrapper = document.getElementById('vibration-wrapper');
const vibModeSelect = document.getElementById('vib-mode-select');
const vibAmplitudeSlider = document.getElementById('vib-amplitude');
const vibAmplitudeGroup = document.getElementById('vib-amplitude-group');
const vibAmplitudeDisplay = document.getElementById('vib-amplitude-display');
const vibProgress = document.getElementById('vib-progress');
const vibProgressLabel = document.getElementById('vib-progress-label');
const vibProgressFill = document.getElementById('vib-progress-fill');
const vibPlayBtn = document.getElementById('vib-play');
let vibAmplitudeTimeout = null;
let vibCurrentModes = [];
let vibStaticMeshesHidden = false;

function updateVibWrapperVisibility() {
  const d1 = d1Select.value;
  const show = d1 === 'Molecules';
  vibWrapper.classList.toggle('dropdown-hidden', !show);
  if (!show) cancelVibration();
}

function populateVibModes(moleculeName) {
  vibModeSelect.innerHTML = '';
  const noneOpt = document.createElement('option');
  noneOpt.value = '-1';
  noneOpt.textContent = 'None';
  vibModeSelect.appendChild(noneOpt);

  vibCurrentModes = generateVibrationalModes(moleculeName);

  if (vibCurrentModes.length > 0) {
    const mixOpt = document.createElement('option');
    mixOpt.value = 'random';
    mixOpt.textContent = 'Random Mix';
    vibModeSelect.appendChild(mixOpt);
  }

  for (let i = 0; i < vibCurrentModes.length; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = vibCurrentModes[i].name;
    vibModeSelect.appendChild(opt);
  }

  // Pre-select Random Mix as default, but None on mobile to avoid expensive builds
  const isMobile = window.innerWidth < 500 || 'ontouchstart' in window;
  if (vibCurrentModes.length > 0 && !isMobile) {
    vibModeSelect.value = 'random';
  }
  updateVibAmplitudeVisibility();
}

// Show amplitude controls only for individual modes (not Random Mix or None)
function updateVibAmplitudeVisibility() {
  const modeVal = vibModeSelect.value;
  const showAmplitude = parseInt(modeVal) >= 0; // individual mode selected
  vibAmplitudeGroup.classList.toggle('dropdown-hidden', !showAmplitude);
}

function isVibActive() {
  return vibController.state !== 'idle' &&
    (vibModeSelect.value === 'random' || parseInt(vibModeSelect.value) >= 0);
}

function cancelVibration() {
  vibController.cancel();
  vibPlayBtn.disabled = true;
  vibPlayBtn.textContent = '\u25B6 Play';
  vibProgress.classList.add('dropdown-hidden');
  restoreStaticMeshes();
  resetMoleculeContextPositions();
}

function restoreStaticMeshes() {
  if (vibStaticMeshesHidden) {
    for (const m of currentMeshes) m.visible = showDensityField;
    if (showFieldVis) {
      if (hasFieldGroup()) {
        setFieldVisVisible(true);
      } else {
        rebuildFieldVis(isDynamics && dynOrbitalGroup ? dynOrbitalGroup : undefined, getCurrentAtomInfo);
      }
    }
    vibStaticMeshesHidden = false;
    // Re-sync opacity and legend so static view matches current settings
    updateOrbitalOpacity();
    const espOpts = isESPotentialMode() ? { isESP: true, espMaxValue: currentProbability } : undefined;
    updateLegend(currentLayers, currentProbability, getColorMode(), espOpts);
  }
}

function hideStaticMeshes() {
  if (!vibStaticMeshesHidden) {
    for (const m of currentMeshes) m.visible = false;
    // Only hide static field vis if cached frames have their own
    if (vibController.hasFieldVis) setFieldVisVisible(false);
    vibStaticMeshesHidden = true;
  }
}

async function startVibBuild() {
  const modeVal = vibModeSelect.value;
  const isRandom = modeVal === 'random';
  const modeIdx = isRandom ? -1 : parseInt(modeVal);

  if (!isRandom && (modeIdx < 0 || modeIdx >= vibCurrentModes.length)) {
    cancelVibration();
    return;
  }

  const orbital = getSelectedOrbital();
  if (!orbital || !orbital.molecule) return;

  const amplitude = parseInt(vibAmplitudeSlider.value) / 100;
  const halfExtent = getHalfExtent(orbital);
  const gs = adaptiveGrid(halfExtent, true);

  vibPlayBtn.disabled = true;
  vibPlayBtn.textContent = '\u25B6 Play';
  vibProgress.classList.remove('dropdown-hidden');

  const colorMode = getColorMode();
  const settings = {
    moleculeName: orbital.molecule,
    moIndex: orbital.moIndex,
    amplitude,
    probability: currentProbability,
    layers: currentLayers,
    gridSize: gs,
    halfExtent,
    colorMode,
    showFieldVis,
    atomInfo: (showFieldVis || colorMode === 'charge') ? getCurrentAtomInfo() : null,
  };

  if (isRandom) {
    // Use physically computed zero-point amplitudes as weights
    settings.mixModes = vibCurrentModes.map(mode => ({
      mode,
      weight: mode.physicalAmplitude || 0.15,
      phaseOffset: Math.random() * 2 * Math.PI,
    }));
    settings.amplitude = 1.0; // weights are already in Bohr
  } else {
    settings.mode = vibCurrentModes[modeIdx];
  }

  await vibController.buildFrameCache(
    settings,
    (frameIdx, total) => {
      vibProgressLabel.textContent = `Building frame ${frameIdx + 1}/${total}...`;
      vibProgressFill.style.width = ((frameIdx + 1) / total * 100) + '%';
    },
    () => {
      vibProgress.classList.add('dropdown-hidden');
      vibPlayBtn.disabled = false;
      hideStaticMeshes();
      vibController.play();
      vibPlayBtn.textContent = '\u23F8 Pause';
    }
  );
}

vibModeSelect.addEventListener('change', () => {
  cancelVibration();
  updateVibAmplitudeVisibility();
  if (vibModeSelect.value === 'random' || parseInt(vibModeSelect.value) >= 0) {
    startVibBuild();
  }
});

vibAmplitudeSlider.addEventListener('input', () => {
  const v = parseInt(vibAmplitudeSlider.value) / 100;
  vibAmplitudeDisplay.textContent = v.toFixed(2) + ' a\u2080';
  if (vibAmplitudeTimeout) clearTimeout(vibAmplitudeTimeout);
  vibAmplitudeTimeout = setTimeout(() => {
    if (vibModeSelect.value === 'random' || parseInt(vibModeSelect.value) >= 0) {
      cancelVibration();
      startVibBuild();
    }
  }, 300);
});

vibPlayBtn.addEventListener('click', () => {
  if (vibController.state === 'playing') {
    vibController.pause();
    vibPlayBtn.textContent = '\u25B6 Play';
    restoreStaticMeshes();
    resetMoleculeContextPositions();
  } else if (vibController.state === 'ready') {
    hideStaticMeshes();
    vibController.play();
    vibPlayBtn.textContent = '\u23F8 Pause';
  }
});

// ---- Electron Transitions ----

const transitionController = new TransitionController();
const transitionWrapper = document.getElementById('transition-wrapper');
const transitionProgress = document.getElementById('transition-progress');
const transitionProgressLabel = document.getElementById('transition-progress-label');
const transitionProgressFill = document.getElementById('transition-progress-fill');
const transitionPlayBtn = document.getElementById('transition-play');
const spectrumBar = document.getElementById('spectrum-bar');
const spectrumIndicator = document.getElementById('spectrum-indicator');
const spectrumLabel = document.getElementById('spectrum-label');

function updateTransitionWrapperVisibility() {
  const d1 = d1Select.value;
  const show = d1 === 'Transitions';
  transitionWrapper.classList.toggle('dropdown-hidden', !show);
  if (!show) cancelTransition();
}

function cancelTransition() {
  transitionController.cancel();
  transitionPlayBtn.disabled = true;
  transitionPlayBtn.textContent = '\u25B6 Play';
  transitionProgress.classList.add('dropdown-hidden');
  for (const m of currentMeshes) m.visible = showDensityField;
}

function isTransitionActive() {
  return transitionController.state !== 'idle' && d1Select.value === 'Transitions';
}

function rebuildTransitionIfActive() {
  if (!isTransitionActive()) return;
  const orbital = getSelectedOrbital();
  if (orbital && orbital.isTransition) {
    cancelTransition();
    startTransitionBuild(orbital);
  }
}

async function startTransitionBuild(orbital) {
  if (!orbital.isTransition || !orbital.transition) return;

  const trans = orbital.transition;
  const halfExtent = orbital.halfExtent || 20;
  const gs = adaptiveGrid(halfExtent, true);

  transitionPlayBtn.disabled = true;
  transitionPlayBtn.textContent = '\u25B6 Play';
  transitionProgress.classList.remove('dropdown-hidden');

  // Update spectrum bar
  const wavelength = transitionWavelength(trans.n1, trans.n2);
  updateSpectrumBar(wavelength);

  const colorMode = getColorMode();
  const settings = {
    orbital1: trans.orbital1,
    orbital2: trans.orbital2,
    transition: trans,
    probability: currentProbability,
    layers: currentLayers,
    gridSize: gs,
    halfExtent,
    colorMode,
  };

  await transitionController.buildFrameCache(
    settings,
    (ready, total) => {
      transitionProgressLabel.textContent = `Building frame ${ready}/${total}...`;
      transitionProgressFill.style.width = `${(ready / total) * 100}%`;
    },
    () => {
      transitionProgress.classList.add('dropdown-hidden');
      transitionPlayBtn.disabled = false;
      // Hide static meshes, start playback
      for (const m of currentMeshes) m.visible = false;
      transitionController.play();
      transitionPlayBtn.textContent = '\u23F8 Pause';
    }
  );
}

function updateSpectrumBar(wavelength) {
  if (wavelength < 380) {
    // UV
    spectrumIndicator.style.left = '0%';
    spectrumLabel.textContent = `UV: ${wavelength.toFixed(1)} nm`;
  } else if (wavelength > 780) {
    // IR
    spectrumIndicator.style.left = '100%';
    spectrumLabel.textContent = `IR: ${wavelength.toFixed(1)} nm`;
  } else {
    // Visible spectrum: map 380-780nm to 0-100%
    const percent = ((wavelength - 380) / 400) * 100;
    spectrumIndicator.style.left = `${percent}%`;
    spectrumLabel.textContent = `${wavelength.toFixed(1)} nm`;

    // Update indicator color
    const color = wavelengthToRGB(wavelength);
    spectrumIndicator.style.borderTopColor = `rgb(${color.r * 255}, ${color.g * 255}, ${color.b * 255})`;
  }
}

transitionPlayBtn.addEventListener('click', () => {
  if (transitionController.state === 'playing') {
    transitionController.pause();
    transitionPlayBtn.textContent = '\u25B6 Play';
    // Hide current frame
    if (transitionController.lastFrameIdx >= 0 && transitionController.frames[transitionController.lastFrameIdx]) {
      transitionController.frames[transitionController.lastFrameIdx].group.visible = false;
    }
    // Show static mesh
    for (const m of currentMeshes) m.visible = showDensityField;
  } else if (transitionController.state === 'ready') {
    // Hide static mesh
    for (const m of currentMeshes) m.visible = false;
    // Start playing (tick will show frame 0)
    transitionController.play();
    transitionPlayBtn.textContent = '\u23F8 Pause';
    // Immediately show frame 0 if not started yet
    if (transitionController.lastFrameIdx < 0 && transitionController.frames[0]) {
      transitionController.frames[0].group.visible = true;
      transitionController.lastFrameIdx = 0;
    }
  }
});

// ---- Orbital Mixer ----

const mixer = new MixerController();
const mixerWrapper = document.getElementById('mixer-wrapper');
const mixerPreset = document.getElementById('mixer-preset');
const mixerSlidersDiv = document.getElementById('mixer-sliders');
const mixerNormalize = document.getElementById('mixer-normalize');
let mixerRebuildTimeout = null;

// ---- Reaction Pathway Scrubber ----

const reactionController = new ReactionController();
const reactionWrapper = document.getElementById('reaction-wrapper');
const rxnScrubber = document.getElementById('rxn-scrubber');
const rxnPlayBtn = document.getElementById('rxn-play');
const rxnProgress = document.getElementById('rxn-progress');
const rxnProgressLabel = document.getElementById('rxn-progress-label');
const rxnProgressFill = document.getElementById('rxn-progress-fill');
const rxnDescription = document.getElementById('rxn-description');
const rxnImpactSlider = document.getElementById('rxn-impact');
const rxnImpactDisplay = document.getElementById('rxn-impact-display');
const rxnSpeedSlider = document.getElementById('rxn-speed');
const rxnSpeedDisplay = document.getElementById('rxn-speed-display');
const rxnAngleSlider = document.getElementById('rxn-angle');
const rxnAngleDisplay = document.getElementById('rxn-angle-display');

function populateMixerSliders() {
  mixerSlidersDiv.innerHTML = '';
  const active = mixer.getActiveComponents();
  for (const comp of active) {
    const row = document.createElement('div');
    row.className = 'mixer-slider-row';

    const label = document.createElement('span');
    label.className = 'mixer-label';
    label.textContent = comp.name;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '-100';
    slider.max = '100';
    slider.value = String(Math.round(mixer.coeffs[comp.index] * 100));
    slider.dataset.idx = comp.index;

    const valSpan = document.createElement('span');
    valSpan.className = 'mixer-value';
    valSpan.textContent = (mixer.coeffs[comp.index]).toFixed(2);

    slider.addEventListener('input', () => {
      const val = parseInt(slider.value) / 100;
      mixer.setCoefficient(comp.index, val);
      valSpan.textContent = val.toFixed(2);
      scheduleMixerRebuild();
    });

    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(valSpan);
    mixerSlidersDiv.appendChild(row);
  }
}

function scheduleMixerRebuild() {
  if (mixerRebuildTimeout) clearTimeout(mixerRebuildTimeout);
  mixerRebuildTimeout = setTimeout(() => {
    const orbital = mixer.buildOrbital();
    // Replace the registered orbital in ORBITAL_MAP and tree
    const existing = ORBITAL_MAP['Custom Mix'];
    if (existing) {
      existing.terms = orbital.terms;
      existing.halfExtent = orbital.halfExtent;
    }
    loadOrbitalAsync(orbital);
  }, 150);
}

mixerPreset.addEventListener('change', () => {
  mixer.setPreset(mixerPreset.value);
  populateMixerSliders();
  scheduleMixerRebuild();
});

mixerNormalize.addEventListener('change', () => {
  mixer.normalize = mixerNormalize.checked;
  scheduleMixerRebuild();
});

// ---- Reaction pathway functions ----

function cancelReaction() {
  reactionController.cancel();
  rxnPlayBtn.disabled = true;
  rxnPlayBtn.textContent = '\u25B6 Play';
  rxnProgress.classList.add('dropdown-hidden');
  rxnScrubber.value = '0';
  rxnDescription.textContent = '';
}

async function startReactionBuild(orbital, keepSliders) {
  if (!orbital.isReaction || !orbital.reaction) return;

  const rxn = orbital.reaction;
  const halfExtent = rxn.halfExtent || 14;
  const gs = adaptiveGrid(halfExtent, true);

  rxnPlayBtn.disabled = true;
  rxnPlayBtn.textContent = '\u25B6 Play';
  rxnProgress.classList.remove('dropdown-hidden');
  rxnScrubber.value = '0';

  // Show initial description
  if (rxn.descriptions && rxn.descriptions.length > 0) {
    rxnDescription.textContent = rxn.descriptions[0];
  }

  // Set slider defaults from reaction config (only on first load)
  if (!keepSliders) {
    const defaultImpact = rxn.defaultImpact ?? 1.0;
    const defaultSpeed = rxn.defaultSpeed ?? 1.0;
    rxnImpactSlider.value = String(Math.round(defaultImpact * 10));
    rxnImpactDisplay.textContent = `b = ${defaultImpact.toFixed(1)} a\u2080`;
    rxnSpeedSlider.value = String(Math.round(defaultSpeed * 10));
    rxnSpeedDisplay.textContent = `v\u2080 = ${defaultSpeed.toFixed(1)}`;
    rxnAngleSlider.value = '0';
    rxnAngleDisplay.textContent = '\u03B8 = 0\u00B0';
  }

  const impactParam = parseInt(rxnImpactSlider.value) / 10;
  const speed = parseInt(rxnSpeedSlider.value) / 10;
  const angle = parseInt(rxnAngleSlider.value);

  const colorMode = getColorMode();
  const settings = {
    reaction: rxn,
    probability: currentProbability,
    layers: currentLayers,
    gridSize: gs,
    halfExtent,
    colorMode,
    impactParam,
    speed,
    angle,
  };

  // Clear static meshes since reaction frames include ball-and-stick
  clearMeshes();
  clearMoleculeContext();

  await reactionController.buildFrameCache(
    settings,
    (ready, total) => {
      rxnProgressLabel.textContent = `Building frame ${ready}/${total}...`;
      rxnProgressFill.style.width = `${(ready / total) * 100}%`;
    },
    () => {
      rxnProgress.classList.add('dropdown-hidden');
      rxnPlayBtn.disabled = false;
      // Show first frame via scrub
      const desc = reactionController.scrubTo(0);
      if (desc) rxnDescription.textContent = desc;
    }
  );

  if (!isDragging && !isDynamics) {
    const dist = halfExtent * 2.2;
    const dir = camera.position.clone().normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    controls.update();
  }
}

rxnScrubber.addEventListener('input', () => {
  const t = parseInt(rxnScrubber.value) / 100;
  // Pause playback when scrubbing manually
  if (reactionController.state === 'playing') {
    reactionController.pause();
    rxnPlayBtn.textContent = '\u25B6 Play';
  }
  const desc = reactionController.scrubTo(t);
  if (desc) rxnDescription.textContent = desc;
});

rxnPlayBtn.addEventListener('click', () => {
  if (reactionController.state === 'playing') {
    reactionController.pause();
    rxnPlayBtn.textContent = '\u25B6 Play';
  } else if (reactionController.state === 'ready') {
    reactionController.play();
    rxnPlayBtn.textContent = '\u23F8 Pause';
  }
});

// Impact parameter slider: update display on input, rebuild on change
createSliderWithDisplay(rxnImpactSlider, rxnImpactDisplay, {
  parse: (v) => parseInt(v) / 10,
  format: (v) => `b = ${v.toFixed(1)} a\u2080`,
  onChange: () => {
    const orbital = getSelectedOrbital();
    if (orbital && orbital.isReaction) {
      cancelReaction();
      startReactionBuild(orbital, true);
    }
  },
});

// Approach speed slider: update display on input, rebuild on change
createSliderWithDisplay(rxnSpeedSlider, rxnSpeedDisplay, {
  parse: (v) => parseInt(v) / 10,
  format: (v) => `v\u2080 = ${v.toFixed(1)}`,
  onChange: () => {
    const orbital = getSelectedOrbital();
    if (orbital && orbital.isReaction) {
      cancelReaction();
      startReactionBuild(orbital, true);
    }
  },
});

// Approach angle slider: update display on input, rebuild on change
createSliderWithDisplay(rxnAngleSlider, rxnAngleDisplay, {
  parse: (v) => parseInt(v),
  format: (v) => `\u03B8 = ${v}\u00B0`,
  onChange: () => {
    const orbital = getSelectedOrbital();
    if (orbital && orbital.isReaction) {
      cancelReaction();
      startReactionBuild(orbital, true);
    }
  },
});

// ---- Variant select ----
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

// ---- PubChem search ----
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

pubchemBtn.addEventListener('click', doPubchemSearch);
pubchemInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doPubchemSearch();
});

// ---- Animation loop ----
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  tickDynamics();
  tickFieldAnimation(dt);
  vibController.tickFieldAnimation(dt);
  const vibFrameChanged = vibController.tick(dt * 3);
  transitionController.tick(dt * 2);
  const rxnFrameChanged = reactionController.tick(dt);
  if (rxnFrameChanged) {
    // Sync scrubber position and description with playback
    const t = reactionController.phase;
    rxnScrubber.value = String(Math.round(t * 100));
    const frame = reactionController.frames[reactionController.lastFrameIdx];
    if (frame) rxnDescription.textContent = frame.description;
  }
  if (vibFrameChanged && vibController.moleculeName) {
    const disps = vibController.interpolatedDisplacements();
    if (disps) updateMoleculeContextPositions(vibController.moleculeName, disps);
  }
  controls.update();
  updateLabelScales();
  renderer.render(scene, camera);
}

animate();

// ---- Shareable link ----
const shareLinkDiv = document.getElementById('share-link');

function updateShareLink() {
  const p = new URLSearchParams();
  p.set('mode', d1Select.value);
  p.set('d2', d2Select.value);
  p.set('d3', d3Select.value);
  if (!d4Wrapper.classList.contains('dropdown-hidden')) p.set('d4', d4Select.value);
  if (categorySelect.value) p.set('cat', categorySelect.value);
  if (layerSelect.value === 'custom') {
    p.set('layers', customLayersInput.value);
  } else {
    p.set('layers', layerSelect.value);
  }
  p.set('prob', probSlider.value);
  p.set('opacity', opacitySlider.value);
  if (!densityFieldToggle.checked) p.set('density', '0');
  if (fieldVisToggle.checked) {
    p.set('vector', '1');
    p.set('vsrc', fieldSourceSelect.value);
    p.set('vstyle', fieldStyleSelect.value);
  }
  if (!ballStickToggle.checked) p.set('atoms', '0');
  const url = window.location.origin + window.location.pathname + '?' + p.toString();
  shareLinkDiv.innerHTML = `<a href="${url}">Shareable link</a>`;
}

function applyUrlParams() {
  const p = new URLSearchParams(window.location.search);
  if (!p.has('mode')) return false;

  const mode = p.get('mode');
  if ([...d1Select.options].some(o => o.value === mode)) {
    d1Select.value = mode;
  }

  // Trigger d1 cascade to populate d2
  const d1 = d1Select.value;
  d2Label.textContent = D2_LABELS[d1] || 'Category';
  d3Label.textContent = D3_LABELS[d1] || 'Subcategory';
  d4Label.textContent = D4_LABELS[d1] || 'Orbital';
  populateCategoryFilter(d1);
  pubchemWrapper.classList.toggle('dropdown-hidden', d1 !== 'Molecules');

  if (p.has('cat') && p.get('cat')) {
    categorySelect.value = p.get('cat');
  }

  const labels = (d1 === 'Molecules' || d1 === 'Bond Formation') ? MOLECULE_LABELS : undefined;
  populateSelect(d2Select, getFilteredD2Keys(d1), labels);

  if (p.has('d2')) {
    const d2v = p.get('d2');
    if ([...d2Select.options].some(o => o.value === d2v)) {
      d2Select.value = d2v;
    }
  }

  // Populate d3
  const d2 = d2Select.value;
  const d3Keys = Object.keys((ORBITAL_TREE[d1] || {})[d2] || {});
  populateSelect(d3Select, d3Keys);

  if (p.has('d3')) {
    const d3v = p.get('d3');
    if ([...d3Select.options].some(o => o.value === d3v)) {
      d3Select.value = d3v;
    }
  }

  // Populate d4
  const orbitals = getD3Orbitals();
  if (orbitals.length > 1) {
    d4Wrapper.classList.remove('dropdown-hidden');
    populateSelect(d4Select, orbitals.map(o => o.d4 || o.name));
    if (p.has('d4')) {
      const d4v = p.get('d4');
      if ([...d4Select.options].some(o => o.value === d4v)) {
        d4Select.value = d4v;
      }
    }
  } else {
    d4Wrapper.classList.add('dropdown-hidden');
  }

  // Layers
  if (p.has('layers')) {
    const lv = p.get('layers');
    const presets = [...layerSelect.options].map(o => o.value).filter(v => v !== 'custom');
    if (presets.includes(lv)) {
      layerSelect.value = lv;
      customLayersRow.classList.add('dropdown-hidden');
    } else {
      layerSelect.value = 'custom';
      customLayersInput.value = parseInt(lv) || 5;
      customLayersRow.classList.remove('dropdown-hidden');
    }
    currentLayers = parseInt(lv) || 5;
  }

  // Probability
  if (p.has('prob')) {
    const pv = parseInt(p.get('prob'));
    if (pv >= 1 && pv <= 99) {
      probSlider.value = pv;
      currentProbability = pv / 100;
      probDisplay.textContent = pv + '%';
    }
  }

  // Opacity
  if (p.has('opacity')) {
    const ov = parseInt(p.get('opacity'));
    if (ov >= 5 && ov <= 90) {
      opacitySlider.value = ov;
      currentOpacityTarget = ov;
      opacityDisplay.textContent = ov + '%';
    }
  }

  // Density field
  if (p.get('density') === '0') {
    densityFieldToggle.checked = false;
    showDensityField = false;
    densityOptions.style.display = 'none';
  }

  // Vector field
  if (p.get('vector') === '1') {
    fieldVisToggle.checked = true;
    showFieldVis = true;
    fieldOptions.classList.remove('dropdown-hidden');
    if (p.has('vsrc')) fieldSourceSelect.value = p.get('vsrc');
    if (p.has('vstyle')) {
      fieldStyleSelect.value = p.get('vstyle');
      fieldStyle = fieldStyleSelect.value;
    }
  }

  // Ball & stick
  if (p.get('atoms') === '0') {
    ballStickToggle.checked = false;
    showBallAndStick = false;
  }


  // Update variant + pubchem link
  updateVariantDropdown(d2);
  updatePubchemLink(d2);

  return true;
}

// ---- Panel persistence ----
initPanelPersistence();

// ---- Initial load ----
const hadParams = applyUrlParams();
if (hadParams) {
  loadSelectedOrbital();
  updateShareLink();
} else {
  onD1Change();
}
