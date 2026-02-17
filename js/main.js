// Main entry point: state management, module initialization, animation loop.

import * as THREE from 'three';
import { ORBITAL_TREE, ORBITAL_MAP } from './orbitals.js';
import { cancelCompute } from './worker-pool.js';
import { updateLegend, applyOpacityScale } from './layer-materials.js';
import { scene, camera, renderer, controls, matPositive, matNegative, updateLabelScales, setGridVisible } from './scene.js';
import { setMoleculeContextVisible, updateMoleculeContextPositions, trackedAtoms, MOLECULE_LABELS, getMoleculeVariants, getMoleculeCid, getMoleculeNist, getMoleculeAtoms } from './molecules/index.js';
import { updateAtomLabelPositions } from './molecules/bond-rendering.js';
import { pubchemUrl } from './pubchem.js';
import { BOND_FORMING_CONFIG, setBondFormingContextVisible } from './bond-forming.js';
import { setFieldVisVisible, setFieldSource, tickFieldAnimation } from './electric-field.js';
import { SIM_STATE, SIM3_STATE } from './dynamics.js';
import { initRenderPipeline, getHalfExtent, loadOrbital, loadOrbitalAsync, renderFromCachesAsync, rebuildFieldVis, showProgress, hideProgress, clearMeshes, adaptiveGrid } from './render-pipeline.js';
import { initDynamicsUI, setupDynamicsEvents, tickDynamics, loadBondFormingOrbital, cleanupDynamicsState, triatomicEquilibrium } from './dynamics-ui.js';
import { renderAtomicDiagram, renderMolecularDiagram, renderDiatomicDiagram, clearDiagram } from './energy-diagram.js';
import { initPanelPersistence } from './ui/panel-persistence.js';
import { initDropdownCascade, populateSelect, getD3Orbitals, getSelectedOrbital, populateCategoryFilter, getFilteredD2Keys, D2_LABELS, D3_LABELS, D4_LABELS, onD1Change, onD2Change } from './ui/dropdown-cascade.js';
import { initOrbitalLoader, loadSelectedOrbital, renderChargeVisualisation } from './ui/orbital-loader.js';
import { initVisualizationControls } from './ui/visualization-controls.js';
import { initVibrationControls, vibController, updateVibWrapperVisibility, populateVibModes, isVibActive, cancelVibration, startVibBuild } from './ui/vibration-controls.js';
import { initTransitionControls, transitionController, updateTransitionWrapperVisibility, cancelTransition, isTransitionActive, rebuildTransitionIfActive, startTransitionBuild } from './ui/transition-controls.js';
import { initMixerControls, mixer, reactionController, populateMixerSliders, cancelReaction, startReactionBuild } from './ui/mixer-controls.js';
import { initPubchemSearch } from './ui/pubchem-search.js';

// ---- DOM element refs ----

// Dropdowns
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

// PubChem
const pubchemWrapper = document.getElementById('pubchem-wrapper');
const pubchemInput = document.getElementById('pubchem-input');
const pubchemBtn = document.getElementById('pubchem-btn');
const pubchemStatus = document.getElementById('pubchem-status');
const pubchemCitationDiv = document.getElementById('pubchem-citation');

// Variant
const variantWrapper = document.getElementById('variant-wrapper');
const variantSelect = document.getElementById('variant-select');

// Visualization controls
const probSlider = document.getElementById('prob-slider');
const probDisplay = document.getElementById('prob-display');
const layerSelect = document.getElementById('layer-select');
const customLayersRow = document.getElementById('custom-layers-row');
const customLayersInput = document.getElementById('custom-layers-input');
const ballStickToggle = document.getElementById('ball-stick-toggle');
const gridToggle = document.getElementById('grid-toggle');
const densityFieldToggle = document.getElementById('density-field-toggle');
const densityOptions = document.getElementById('density-options');
const fieldVisToggle = document.getElementById('field-vis-toggle');
const fieldStyleSelect = document.getElementById('field-style-select');
const fieldSourceSelect = document.getElementById('field-source-select');
const fieldOptions = document.getElementById('field-options');
const opacitySlider = document.getElementById('opacity-slider');
const opacityDisplay = document.getElementById('opacity-display');

// Vibration
const vibWrapper = document.getElementById('vibration-wrapper');
const vibModeSelect = document.getElementById('vib-mode-select');
const vibAmplitudeSlider = document.getElementById('vib-amplitude');
const vibAmplitudeGroup = document.getElementById('vib-amplitude-group');
const vibAmplitudeDisplay = document.getElementById('vib-amplitude-display');
const vibProgress = document.getElementById('vib-progress');
const vibProgressLabel = document.getElementById('vib-progress-label');
const vibProgressFill = document.getElementById('vib-progress-fill');
const vibPlayBtn = document.getElementById('vib-play');

// Transition
const transitionWrapper = document.getElementById('transition-wrapper');
const transitionProgress = document.getElementById('transition-progress');
const transitionProgressLabel = document.getElementById('transition-progress-label');
const transitionProgressFill = document.getElementById('transition-progress-fill');
const transitionScrubber = document.getElementById('transition-scrubber');
const transitionScrubberDisplay = document.getElementById('transition-scrubber-display');
const transitionPlayBtn = document.getElementById('transition-play');
const spectrumBar = document.getElementById('spectrum-bar');
const spectrumIndicator = document.getElementById('spectrum-indicator');
const spectrumLabel = document.getElementById('spectrum-label');

// Mixer & Reaction
const mixerWrapper = document.getElementById('mixer-wrapper');
const mixerPreset = document.getElementById('mixer-preset');
const mixerSlidersDiv = document.getElementById('mixer-sliders');
const mixerNormalize = document.getElementById('mixer-normalize');
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

// Dynamics
const dynWrapper = document.getElementById('dynamics-wrapper');
const sepWrapper = document.getElementById('separation-wrapper');

// Misc
const energyDiagramContainer = document.getElementById('energy-diagram');
const shareLinkDiv = document.getElementById('share-link');

// ---- Shared state ----

let currentMeshes = [];
let currentCaches = [];
let currentProbability = 0.99;
const isMobile = window.innerWidth < 500 || 'ontouchstart' in window;
let currentLayers = isMobile ? 3 : 24;
let currentOpacityTarget = 90;
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

let showBallAndStick = ballStickToggle.checked;
let showDensityField = densityFieldToggle.checked;
let showFieldVis = true;  // Enable vector field by default
let fieldStyle = 'streamlines';  // Default to streamlines only
let energyDiagramSize = isMobile ? 'collapsed' : 'normal';  // Mobile gets collapsed, desktop gets normal

let vibStaticMeshesHidden = false;
let chargeCache = null;

// Bond-forming defaults
let savedProbability = null;
let savedLayers = null;

function applyBondFormingDefaults() {
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

// Atomic numbers for atom info
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
function isESPotentialMode() { return d3Select.value === 'electrostatic potential'; }

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
  if (!vibRunning) {
    for (const m of currentMeshes) m.visible = showDensityField;
    if (dynOrbitalGroup) dynOrbitalGroup.visible = showDensityField;
  }
  if (vibController.state !== 'idle') {
    vibController.setDensityVisible(showDensityField);
  }
}

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

  if (isFieldMode && hasAtoms) {
    fieldSourceSelect.value = 'magnetic';
    setFieldSource('magnetic');
  } else if (fieldSourceSelect.value !== 'gradient') {
    fieldSourceSelect.value = 'gradient';
    setFieldSource('gradient');
  }
}

// Energy diagram
function updateEnergyDiagram() {
  const d1 = d1Select.value;
  const orbital = getSelectedOrbital();
  const selectedInfo = orbital ? { d1: orbital.d1, d2: orbital.d2, d3: orbital.d3, name: orbital.name } : null;

  if (d1 === 'Atomic') {
    renderAtomicDiagram(energyDiagramContainer, selectedInfo, onEnergyDiagramSelect, energyDiagramSize);
  } else if (d1 === 'Molecules') {
    const molName = d2Select.value;
    const d3Keys = Object.keys((ORBITAL_TREE[d1] || {})[molName] || {});
    const moList = d3Keys
      .filter(k => k !== 'electron density' && k !== 'electrostatic potential' && k !== 'charge visualisation' && k !== 'ELF')
      .map(k => [k]);
    renderMolecularDiagram(energyDiagramContainer, molName, moList, selectedInfo, onEnergyDiagramSelect, energyDiagramSize);
  } else if (d1 === 'Molecular') {
    renderDiatomicDiagram(energyDiagramContainer, selectedInfo, onEnergyDiagramSelect, energyDiagramSize);
  } else {
    clearDiagram(energyDiagramContainer);
  }
}

function onEnergyDiagramSelect(d1Val, d2Val, d3Val, d4Val) {
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

// State getter/setter for sub-modules
function stateGetter() {
  return {
    currentMeshes, currentCaches, currentProbability, currentLayers,
    currentOpacityTarget, isBondForming, isTriatomic, currentBondOrbital,
    currentR, isDragging, isDynamics, dynOrbitalGroup,
    lastSampledR, lastSampledR3, dynFinalRendered,
    lastSampledOrientations, lastSampledOrientations3,
    showFieldVis, showDensityField, showBallAndStick, vibStaticMeshesHidden, chargeCache,
    isDensityMode, isESPotentialMode, isChargeDensityMode, getColorMode, updateOrbitalOpacity,
    applyDensityFieldVisibility, getCurrentAtomInfo,
  };
}

function stateSetter(patch) {
  if ('currentMeshes' in patch) currentMeshes = patch.currentMeshes;
  if ('currentCaches' in patch) currentCaches = patch.currentCaches;
  if ('currentProbability' in patch) currentProbability = patch.currentProbability;
  if ('currentLayers' in patch) currentLayers = patch.currentLayers;
  if ('currentOpacityTarget' in patch) currentOpacityTarget = patch.currentOpacityTarget;
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
  if ('showFieldVis' in patch) showFieldVis = patch.showFieldVis;
  if ('showDensityField' in patch) showDensityField = patch.showDensityField;
  if ('showBallAndStick' in patch) showBallAndStick = patch.showBallAndStick;
  if ('vibStaticMeshesHidden' in patch) vibStaticMeshesHidden = patch.vibStaticMeshesHidden;
  if ('chargeCache' in patch) chargeCache = patch.chargeCache;
  if ('fieldStyle' in patch) fieldStyle = patch.fieldStyle;
}

// ---- Initialize sub-modules ----

initRenderPipeline(stateGetter, stateSetter);
initDynamicsUI(stateGetter, stateSetter);
setupDynamicsEvents();

// ---- Initialize UI modules ----

const state = { stateGetter, stateSetter };

// Dropdown cascade
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

initDropdownCascade(
  { d1Select, d2Select, d3Select, d4Select, d2Label, d3Label, d4Label, d4Wrapper,
    categorySelect, categoryWrapper,
    pubchemWrapper, pubchemStatus, pubchemCitationDiv, variantWrapper },
  { loadSelectedOrbital, updateShareLink, updateVariantDropdown, updatePubchemLink }
);

// Orbital loader
initOrbitalLoader(
  { d1Select, dynWrapper, vibWrapper, transitionWrapper, mixerWrapper, reactionWrapper, sepWrapper, vibModeSelect },
  state,
  { getSelectedOrbital, loadOrbitalAsync, renderFromCachesAsync, getHalfExtent, adaptiveGrid,
    showProgress, hideProgress, clearMeshes, applyBallStickVisibility,
    applyBondFormingDefaults, restoreNonBondFormingDefaults,
    updateFieldSourceOptions, updateEnergyDiagram, updateOrbitalOpacity, applyDensityFieldVisibility,
    cleanupDynamicsState, loadBondFormingOrbital,
    cancelVibration, cancelTransition, cancelReaction,
    populateVibModes, startVibBuild, startTransitionBuild, populateMixerSliders, startReactionBuild,
    mixer }
);

// Visualization controls
initVisualizationControls(
  { probSlider, probDisplay, layerSelect, customLayersRow, customLayersInput,
    ballStickToggle, densityFieldToggle, densityOptions,
    fieldVisToggle, fieldStyleSelect, fieldSourceSelect, fieldOptions,
    opacitySlider, opacityDisplay, vibPlayBtn, vibProgress },
  state,
  { renderFromCachesAsync, rebuildFieldVis, hideProgress, renderChargeVisualisation,
    updateShareLink, updateOrbitalOpacity, applyDensityFieldVisibility,
    vibController, isVibActive, cancelVibration, startVibBuild, rebuildTransitionIfActive }
);

// Vibration controls
initVibrationControls(
  { vibWrapper, vibModeSelect, vibAmplitudeSlider, vibAmplitudeGroup, vibAmplitudeDisplay,
    vibProgress, vibProgressLabel, vibProgressFill, vibPlayBtn, d1Select },
  state,
  { getSelectedOrbital, getHalfExtent, adaptiveGrid, getColorMode, updateOrbitalOpacity,
    rebuildFieldVis, updateShareLink }
);

// Transition controls
initTransitionControls(
  { transitionWrapper, transitionProgress, transitionProgressLabel, transitionProgressFill,
    transitionScrubber, transitionScrubberDisplay, transitionPlayBtn,
    spectrumBar, spectrumIndicator, spectrumLabel, d1Select },
  state,
  { getSelectedOrbital, adaptiveGrid, getColorMode }
);

// Mixer controls
initMixerControls(
  { mixerWrapper, mixerPreset, mixerSlidersDiv, mixerNormalize,
    reactionWrapper, rxnScrubber, rxnPlayBtn, rxnProgress, rxnProgressLabel, rxnProgressFill,
    rxnDescription, rxnImpactSlider, rxnImpactDisplay, rxnSpeedSlider, rxnSpeedDisplay,
    rxnAngleSlider, rxnAngleDisplay },
  state,
  { getSelectedOrbital, adaptiveGrid, getColorMode, loadOrbitalAsync, clearMeshes }
);

// PubChem search
initPubchemSearch(
  { d1Select, d2Select, variantSelect, pubchemInput, pubchemBtn, pubchemStatus, pubchemCitationDiv },
  { populateCategoryFilter, populateSelect, getFilteredD2Keys, onD2Change }
);

// Auto-rotation
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

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
  const transitionChanged = transitionController.tick(dt * 0.2);  // 20% speed - slow enough for study

  // Update scrubber position during playback
  if (transitionChanged && transitionController.state === 'playing') {
    transitionScrubber.value = (transitionController.phase * 100).toFixed(1);
    transitionScrubberDisplay.textContent = `${(transitionController.phase * 100).toFixed(1)}%`;
  }

  const rxnFrameChanged = reactionController.tick(dt);
  if (rxnFrameChanged) {
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
  updateAtomLabelPositions(trackedAtoms, camera, 0.6);
  renderer.render(scene, camera);
}

animate();

// ---- Shareable link ----

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
  p.set('vector', fieldVisToggle.checked ? '1' : '0');
  if (fieldVisToggle.checked) {
    p.set('vsrc', fieldSourceSelect.value);
    p.set('vstyle', fieldStyleSelect.value);
  }
  if (!ballStickToggle.checked) p.set('atoms', '0');
  if (!gridToggle.checked) p.set('grid', '0');
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

  const d2 = d2Select.value;
  const d3Keys = Object.keys((ORBITAL_TREE[d1] || {})[d2] || {});
  populateSelect(d3Select, d3Keys);

  if (p.has('d3')) {
    const d3v = p.get('d3');
    if ([...d3Select.options].some(o => o.value === d3v)) {
      d3Select.value = d3v;
    }
  }

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

  if (p.has('prob')) {
    const pv = parseInt(p.get('prob'));
    if (pv >= 1 && pv <= 99) {
      probSlider.value = pv;
      currentProbability = pv / 100;
      probDisplay.textContent = pv + '%';
    }
  }

  if (p.has('opacity')) {
    const ov = parseInt(p.get('opacity'));
    if (ov >= 5 && ov <= 90) {
      opacitySlider.value = ov;
      currentOpacityTarget = ov;
      opacityDisplay.textContent = ov + '%';
    }
  }

  if (p.get('density') === '0') {
    densityFieldToggle.checked = false;
    showDensityField = false;
    densityOptions.style.display = 'none';
  }

  // Default vector field OFF when loading from URL params; only enable if explicitly requested
  fieldVisToggle.checked = false;
  showFieldVis = false;
  fieldOptions.classList.add('dropdown-hidden');

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

  if (p.get('atoms') === '0') {
    ballStickToggle.checked = false;
    showBallAndStick = false;
  }

  if (p.get('grid') === '0') {
    gridToggle.checked = false;
    setGridVisible(false);
  }

  updateVariantDropdown(d2);
  updatePubchemLink(d2);

  return true;
}

// ---- Panel persistence ----
initPanelPersistence();

// ---- Set default values ----
d1Select.value = 'Molecules';
probSlider.value = '99';
probDisplay.textContent = '99%';
layerSelect.value = String(currentLayers);
opacitySlider.value = '90';
opacityDisplay.textContent = '90%';
fieldVisToggle.checked = true;
fieldSourceSelect.value = 'magnetic';
fieldStyleSelect.value = 'streamlines';
fieldOptions.classList.remove('dropdown-hidden');

// ---- Grid & Axes toggle ----
gridToggle.addEventListener('change', () => {
  setGridVisible(gridToggle.checked);
  updateShareLink();
});

// ---- Energy diagram size controls ----
document.getElementById('diagram-collapsed-btn').addEventListener('click', () => {
  energyDiagramSize = 'collapsed';
  localStorage.setItem('energyDiagramSize', 'collapsed');
  updateEnergyDiagram();
});
document.getElementById('diagram-tiny-btn').addEventListener('click', () => {
  energyDiagramSize = 'tiny';
  localStorage.setItem('energyDiagramSize', 'tiny');
  updateEnergyDiagram();
});
document.getElementById('diagram-normal-btn').addEventListener('click', () => {
  energyDiagramSize = 'normal';
  localStorage.setItem('energyDiagramSize', 'normal');
  updateEnergyDiagram();
});
document.getElementById('diagram-large-btn').addEventListener('click', () => {
  energyDiagramSize = 'large';
  localStorage.setItem('energyDiagramSize', 'large');
  updateEnergyDiagram();
});

// Restore energy diagram size preference
const savedSize = localStorage.getItem('energyDiagramSize');
if (savedSize && ['collapsed', 'tiny', 'normal', 'large'].includes(savedSize)) {
  energyDiagramSize = savedSize;
}

// ---- Initial load ----
const hadParams = applyUrlParams();
if (hadParams) {
  loadSelectedOrbital();
  updateShareLink();
} else {
  // Set molecule defaults before calling onD1Change
  onD1Change();
  d2Select.value = 'NH₃';
  onD2Change();
  d3Select.value = 'charge visualisation';
  loadSelectedOrbital();
  updateShareLink();
}
