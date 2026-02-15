// Main entry point: cascading dropdown UI, state management, animation loop.

import * as THREE from 'three';
import { ALL_ORBITALS, ORBITAL_MAP, ORBITAL_TREE } from './orbitals.js';
import { sampleGridAsync, cancelCompute } from './worker-pool.js';
import { getLayerMaterials, updateLegend, applyOpacityScale } from './layer-materials.js';
import { scene, camera, renderer, controls, matPositive, matNegative, updateLabelScales } from './scene.js';
import { showMoleculeContext, clearMoleculeContext, setMoleculeContextVisible,
         updateMoleculeContextPositions, resetMoleculeContextPositions,
         MOLECULE_LABELS, MOLECULE_CATEGORIES, getMoleculeAtoms,
         getMoleculeVariants, getMoleculeCid, addMol } from './molecules/index.js';
import { fetchPubChem, pubchemUrl, pubchemCitation, formatFormula } from './pubchem.js';
import { BOND_FORMING_CONFIG, clearBondFormingContext,
         setBondFormingContextVisible } from './bond-forming.js';
import { clearFieldVis, purgeFieldCache, setFieldVisVisible, setFieldMode, setFieldSource, getFieldSource } from './electric-field.js';
import { computeElectrostaticPotential } from './electrostatic-potential.js';
import { SIM_STATE, SIM3_STATE } from './dynamics.js';
import { initRenderPipeline, adaptiveGrid, getHalfExtent, loadOrbital, loadOrbitalAsync,
         renderFromCaches, renderFromCachesAsync, rebuildFieldVis,
         showProgress, hideProgress, clearMeshes, buildGeometry } from './render-pipeline.js';
import { initDynamicsUI, setupDynamicsEvents, tickDynamics,
         loadBondFormingOrbital, cleanupDynamicsState, triatomicEquilibrium,
         sliderToR, rToSlider, dynWrapper, sepWrapper } from './dynamics-ui.js';
import { VibrationController, generateVibrationalModes } from './vibrations.js';

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

const D2_LABELS = { Atomic: 'Shell', Molecular: 'Basis', Hybrid: 'Hybridization', Molecules: 'Molecule', 'Bond Formation': 'Molecule' };
const D3_LABELS = { Atomic: 'Subshell', Molecular: 'Bond Type', Hybrid: 'Lobe', Molecules: 'Orbital / Field', 'Bond Formation': 'Orbital' };
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
  const density = isDensityMode();
  const baseMax = density ? 0.65 : 0.70;
  const effectiveLayers = Math.max(1, N * 0.4);
  const correctedMax = 1 - Math.pow(1 - T, 1 / effectiveLayers);
  const scale = correctedMax / baseMax;
  matPositive.opacity = correctedMax;
  matNegative.opacity = correctedMax;
  if (N > 1) applyOpacityScale(N, density, scale);
}

function isDensityMode() { return d3Select.value === 'electron density'; }

function applyBallStickVisibility() {
  setMoleculeContextVisible(showBallAndStick);
  setBondFormingContextVisible(showBallAndStick);
}

function applyDensityFieldVisibility() {
  for (const m of currentMeshes) m.visible = showDensityField;
  if (dynOrbitalGroup) dynOrbitalGroup.visible = showDensityField;
  // Also apply to vibration frames during playback
  if (vibController.state === 'playing') {
    for (const frame of vibController.frames) {
      if (frame && frame.group) frame.group.visible = false;
    }
    if (showDensityField && vibController.lastFrameIdx >= 0 &&
        vibController.frames[vibController.lastFrameIdx]) {
      vibController.frames[vibController.lastFrameIdx].group.visible = true;
    }
  }
}

function isESPotentialMode() { return d3Select.value === 'electrostatic potential'; }

function updateFieldSourceOptions() {
  const isFieldMode = isDensityMode() || isESPotentialMode();
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

// ---- State getter/setter for sub-modules ----

function stateGetter() {
  return {
    currentMeshes, currentCaches, currentProbability, currentLayers,
    currentOpacityTarget, isBondForming, isTriatomic, currentBondOrbital,
    currentR, isDragging, isDynamics, dynOrbitalGroup,
    lastSampledR, lastSampledR3, dynFinalRendered,
    lastSampledOrientations, lastSampledOrientations3,
    showFieldVis, showDensityField, showBallAndStick,
    isDensityMode, updateOrbitalOpacity, applyDensityFieldVisibility,
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
  const cid = getMoleculeCid(molName);
  if (cid) {
    const url = pubchemUrl(cid);
    pubchemCitationDiv.innerHTML = `<a href="${url}" target="_blank" rel="noopener">View on PubChem</a>`;
  } else {
    pubchemCitationDiv.innerHTML = '';
  }
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
}

function onD4Change() { loadSelectedOrbital(); }

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

  // Clean up dynamics state when switching orbitals
  if (isDynamics || SIM_STATE.running || SIM3_STATE.running) {
    cleanupDynamicsState();
  }

  if (orbital.bondForming) {
    isBondForming = true;
    currentBondOrbital = orbital;
    dynWrapper.classList.remove('dropdown-hidden');
    vibWrapper.classList.add('dropdown-hidden');
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
      // Show vibration controls for electron density mode
      if (isDensityMode() && orbital.molecule) {
        populateVibModes(orbital.molecule);
        vibWrapper.classList.remove('dropdown-hidden');
      } else {
        vibWrapper.classList.add('dropdown-hidden');
      }
    } else {
      clearMoleculeContext();
      vibWrapper.classList.add('dropdown-hidden');
    }
    if (orbital.isElectrostaticPotential) {
      loadElectrostaticPotentialAsync(orbital);
    } else {
      loadOrbitalAsync(orbital).then(() => {
        // After orbital load completes, auto-start vibration build if a mode is selected
        if (!vibWrapper.classList.contains('dropdown-hidden') &&
            (vibModeSelect.value === 'random' || parseInt(vibModeSelect.value) >= 0)) {
          startVibBuild();
        }
      });
    }
  }
}

// ---- Electrostatic potential loader (two-step: density → potential) ----

async function loadElectrostaticPotentialAsync(orbital) {
  cancelCompute();
  const halfExtent = getHalfExtent(orbital);
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
      const target = isDynamics && dynOrbitalGroup ? dynOrbitalGroup : undefined;
      await renderFromCachesAsync(currentProbability, undefined, target);
      hideProgress();
    }
    if (isVibActive()) { cancelVibration(); startVibBuild(); }
  }, 50);
}

// ---- Layer select ----
layerSelect.addEventListener('change', async () => {
  currentLayers = parseInt(layerSelect.value);
  if (currentCaches.length > 0) {
    cancelCompute();
    const target = isDynamics && dynOrbitalGroup ? dynOrbitalGroup : undefined;
    await renderFromCachesAsync(currentProbability, undefined, target);
    hideProgress();
  }
  if (isVibActive()) { cancelVibration(); startVibBuild(); }
});

// ---- Ball & Stick toggle ----
ballStickToggle.addEventListener('change', () => {
  showBallAndStick = ballStickToggle.checked;
  applyBallStickVisibility();
});

// ---- Density Field toggle ----
densityFieldToggle.addEventListener('change', () => {
  showDensityField = densityFieldToggle.checked;
  densityOptions.style.display = showDensityField ? '' : 'none';
  applyDensityFieldVisibility();
});

// ---- Vector Field toggle ----

function rebuildVibIfActive() {
  if (isVibActive()) { cancelVibration(); startVibBuild(); }
}

fieldVisToggle.addEventListener('change', () => {
  showFieldVis = fieldVisToggle.checked;
  if (showFieldVis) {
    fieldOptions.classList.remove('dropdown-hidden');
    rebuildFieldVis(isDynamics && dynOrbitalGroup ? dynOrbitalGroup : undefined, getCurrentAtomInfo);
  } else {
    fieldOptions.classList.add('dropdown-hidden');
    clearFieldVis();
  }
  rebuildVibIfActive();
});

fieldStyleSelect.addEventListener('change', () => {
  fieldStyle = fieldStyleSelect.value;
  setFieldMode(fieldStyle);
  if (showFieldVis && currentCaches.length > 0) {
    rebuildFieldVis(isDynamics && dynOrbitalGroup ? dynOrbitalGroup : undefined, getCurrentAtomInfo);
  }
  rebuildVibIfActive();
});

fieldSourceSelect.addEventListener('change', () => {
  setFieldSource(fieldSourceSelect.value);
  if (showFieldVis && currentCaches.length > 0) {
    rebuildFieldVis(isDynamics && dynOrbitalGroup ? dynOrbitalGroup : undefined, getCurrentAtomInfo);
  }
  rebuildVibIfActive();
});

// ---- Opacity slider ----
const opacitySlider = document.getElementById('opacity-slider');
const opacityDisplay = document.getElementById('opacity-display');

if (opacitySlider) {
  opacitySlider.addEventListener('input', () => {
    currentOpacityTarget = parseInt(opacitySlider.value);
    opacityDisplay.textContent = currentOpacityTarget + '%';
    updateOrbitalOpacity();
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
  const show = d1 === 'Molecules' && isDensityMode();
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

  // Pre-select Random Mix as default (build starts after main orbital load)
  if (vibCurrentModes.length > 0) {
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
    if (showFieldVis) setFieldVisVisible(true);
    vibStaticMeshesHidden = false;
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

  const settings = {
    moleculeName: orbital.molecule,
    amplitude,
    probability: currentProbability,
    layers: currentLayers,
    gridSize: gs,
    halfExtent,
    isDensity: true,
    showFieldVis,
    atomInfo: showFieldVis ? getCurrentAtomInfo() : null,
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
      vibPlayBtn.textContent = '\u25B6 Play';
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
  const vibFrameChanged = vibController.tick(dt * 3);
  if (vibFrameChanged && vibController.moleculeName) {
    // Hide frame if density field toggle is off
    if (!showDensityField && vibController.lastFrameIdx >= 0 &&
        vibController.frames[vibController.lastFrameIdx]) {
      vibController.frames[vibController.lastFrameIdx].group.visible = false;
    }
    const disps = vibController.displacementsAtPhase(vibController.phase);
    if (disps) updateMoleculeContextPositions(vibController.moleculeName, disps);
  }
  controls.update();
  updateLabelScales();
  renderer.render(scene, camera);
}

animate();

// ---- Initial load ----
onD1Change();
