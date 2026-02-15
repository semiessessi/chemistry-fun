// Main entry point: cascading dropdown UI, grid sampling, rendering, dynamics.

import * as THREE from 'three';
import { ALL_ORBITALS, ORBITAL_MAP, ORBITAL_TREE } from './orbitals.js';
import { sampleGrid, computeThreshold, computeMultiThresholds } from './grid.js';
import { sampleGridAsync, renderLayersAsync, cancelCompute } from './worker-pool.js';
import { getLayerMaterials, updateLegend, applyOpacityScale } from './layer-materials.js';
import { marchingCubes } from './marching-cubes.js';
import { scene, camera, renderer, controls, matPositive, matNegative, updateLabelScales } from './scene.js';
import { showMoleculeContext, clearMoleculeContext, setMoleculeContextVisible } from './molecules.js';
import { showBondFormingContext, clearBondFormingContext, morseEnergy,
         BOND_FORMING_CONFIG, generateH2Orbital, setActiveBondConfig, setContextAtomStyle,
         showBondFormingContextAtPositions, setBondCylinderOpacity,
         setContextMode, showTriatomicContext, setTriatomicBondOpacity,
         setBondFormingContextVisible } from './bond-forming.js';
import { SIM_STATE, SIM_CONFIG, stepSimulation, resetSimulation, getAtomPositions,
         getAtomOrientations, initTrails, recordTrailPoint, clearTrails,
         SIM3_STATE, step3Simulation, reset3Simulation, get3AtomPositions,
         get3AtomOrientations, init3Trails, record3TrailPoint, clear3Trails } from './dynamics.js';

// ---- Dropdown elements ----
const d1Select = document.getElementById('d1-select');
const d2Select = document.getElementById('d2-select');
const d3Select = document.getElementById('d3-select');
const d4Select = document.getElementById('d4-select');
const d2Label = document.getElementById('d2-label');
const d3Label = document.getElementById('d3-label');
const d4Label = document.getElementById('d4-label');
const d4Wrapper = document.getElementById('d4-wrapper');

const D2_LABELS = { Atomic: 'Shell', Molecular: 'Basis', Hybrid: 'Hybridization', Molecules: 'Molecule', 'Bond Formation': 'Molecule' };
const D3_LABELS = { Atomic: 'Subshell', Molecular: 'Bond Type', Hybrid: 'Lobe', Molecules: 'Orbital', 'Bond Formation': 'Orbital' };
const D4_LABELS = { Atomic: 'Orbital', Molecular: 'Orbital', Hybrid: 'Orbital', Molecules: 'Orbital', 'Bond Formation': 'Orbital' };

function populateSelect(sel, options) {
  sel.innerHTML = '';
  for (const text of options) {
    const opt = document.createElement('option');
    opt.value = text;
    opt.textContent = text;
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

// ---- Cascading dropdown logic ----
function onD1Change() {
  const d1 = d1Select.value;
  d2Label.textContent = D2_LABELS[d1] || 'Category';
  d3Label.textContent = D3_LABELS[d1] || 'Subcategory';
  d4Label.textContent = D4_LABELS[d1] || 'Orbital';
  populateSelect(d2Select, Object.keys(ORBITAL_TREE[d1] || {}));
  onD2Change();
}

function onD2Change() {
  const d1 = d1Select.value;
  const d2 = d2Select.value;
  const d3Keys = Object.keys((ORBITAL_TREE[d1] || {})[d2] || {});
  populateSelect(d3Select, d3Keys);
  // Default to electron density for Molecules and Bond Formation
  if (d1 === 'Molecules' || d1 === 'Bond Formation') {
    const densIdx = d3Keys.indexOf('electron density');
    if (densIdx >= 0) d3Select.selectedIndex = densIdx;
  }
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
}

function onD4Change() {
  loadSelectedOrbital();
}

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
d2Select.addEventListener('change', onD2Change);
d3Select.addEventListener('change', onD3Change);
d4Select.addEventListener('change', onD4Change);

// ---- Auto-rotation ----
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

// ---- Isosurface state ----
// Adaptive grid: keep voxel size consistent regardless of molecule extent
function adaptiveGrid(halfExtent, lowRes, hiRes) {
  const targetStep = lowRes ? 0.7 : hiRes ? 0.34 : 0.45; // Bohr per voxel
  let gs = Math.round(2 * halfExtent / targetStep) + 1;
  if (gs % 2 === 0) gs++;
  const max = lowRes ? 57 : hiRes ? 129 : 97;
  const min = lowRes ? 33 : hiRes ? 65 : 57;
  return Math.max(min, Math.min(max, gs));
}
const GRID_SIZE = 80;      // fallback
const GRID_SIZE_LOW = 48;  // fallback
let currentMeshes = [];
let currentCaches = []; // Array of { data, halfExtent, gridSize }
let currentProbability = 0.8;
let currentLayers = 5;
let rebuildTimeout = null;
let currentOpacityTarget = 70; // percentage (5-90)

// Perceptual opacity correction: adjusts per-layer opacity so the visual
// combined result roughly matches the slider value, regardless of layer count.
function updateOrbitalOpacity() {
  const T = currentOpacityTarget / 100;
  const N = currentLayers;
  const density = isDensityMode();
  const baseMax = density ? 0.65 : 0.70;

  // With multiple overlapping layers, reduce per-layer opacity so the
  // visual combination matches T. Use effective overlap of N*0.4 layers
  // (average viewpoint sees about 40% of all layers overlapping).
  const effectiveLayers = Math.max(1, N * 0.4);
  const correctedMax = 1 - Math.pow(1 - T, 1 / effectiveLayers);
  const scale = correctedMax / baseMax;

  // Single-layer materials
  matPositive.opacity = correctedMax;
  matNegative.opacity = correctedMax;

  // Multi-layer materials
  if (N > 1) applyOpacityScale(N, density, scale);
}

// ---- Bond-forming state ----
let isBondForming = false;
let isTriatomic = false;
let currentBondOrbital = null; // the orbital entry with .bondForming
let currentR = BOND_FORMING_CONFIG.R_EQ;
let isDragging = false;

// ---- Dynamics state ----
let isDynamics = false;
let dynOrbitalGroup = null;
let lastSampledR = -1;
let lastSampledR3 = null;
let dynFinalRendered = false;
let lastSampledOrientations = null;  // for orientation-change detection
let lastSampledOrientations3 = null;

// Compare two orientation arrays (each element is a 9-element flat rotation matrix).
// Returns true if any atom has rotated more than ~5° since last sample.
function orientationChanged(current, last) {
  if (!current) return false;  // no angular dynamics (e.g. H₂)
  if (!last) return true;      // first sample
  for (let i = 0; i < current.length; i++) {
    // Compare rotation matrices via trace: tr(R1^T * R2) = 1 + 2*cos(angle)
    // For small differences, using dot product of flattened matrices as proxy:
    // dot ≈ 3 when identical (trace of identity), < 3 when rotated
    const a = current[i], b = last[i];
    let dotSum = 0;
    for (let j = 0; j < 9; j++) dotSum += a[j] * b[j];
    // trace of R1^T * R2: rows of a dotted with rows of b
    // Actually the flattened dot = sum of all element products = trace of (A^T B) for 3x3
    // For identity: dotSum = 3. threshold for ~5°: cos(5°) ≈ 0.996, trace = 1 + 2*0.996 = 2.992
    if (dotSum < 2.992) return true;
  }
  return false;
}

const layerSelect = document.getElementById('layer-select');
const ballStickToggle = document.getElementById('ball-stick-toggle');
let showBallAndStick = ballStickToggle.checked;

const densityFieldToggle = document.getElementById('density-field-toggle');
let showDensityField = densityFieldToggle.checked;

function applyBallStickVisibility() {
  setMoleculeContextVisible(showBallAndStick);
  setBondFormingContextVisible(showBallAndStick);
}

function applyDensityFieldVisibility() {
  for (const m of currentMeshes) m.visible = showDensityField;
  if (dynOrbitalGroup) dynOrbitalGroup.visible = showDensityField;
}

function isDensityMode() {
  return d3Select.value === 'electron density';
}

function getHalfExtent(orbital) {
  if (orbital.halfExtent) return orbital.halfExtent;
  let maxN = 1;
  const parts = orbital.lobes || [orbital];
  for (const part of parts) {
    for (const t of part.terms) {
      if (t.n > maxN) maxN = t.n;
    }
  }
  return maxN * maxN * 3.5 + 4;
}

function triatomicEquilibrium(triConfig) {
  if (triConfig.geometry === 'linear') {
    return [
      [0, 0, -triConfig.morse[0].R_EQ],
      [0, 0, 0],
      [0, 0, triConfig.morse[1].R_EQ],
    ];
  } else {
    const d = triConfig.morse[0].R_EQ;
    const halfAngle = triConfig.angle.thetaEq / 2;
    return [
      [d * Math.sin(halfAngle), 0, d * Math.cos(halfAngle)],
      [0, 0, 0],
      [-d * Math.sin(halfAngle), 0, d * Math.cos(halfAngle)],
    ];
  }
}

function dist3(a, b) {
  const dx = b[0]-a[0], dy = b[1]-a[1], dz = b[2]-a[2];
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

function clearMeshes() {
  for (const m of currentMeshes) {
    if (m.parent) m.parent.remove(m);
    m.geometry.dispose();
  }
  currentMeshes = [];
}

function buildGeometry(data, halfExtent, threshold, gridSize) {
  const result = marchingCubes(data, gridSize, threshold);
  if (result.indices.length === 0) return null;

  const step = (2 * halfExtent) / (gridSize - 1);
  const verts = result.vertices;
  for (let i = 0; i < verts.length; i += 3) {
    verts[i] = verts[i] * step - halfExtent;
    verts[i + 1] = verts[i + 1] * step - halfExtent;
    verts[i + 2] = verts[i + 2] * step - halfExtent;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex(new THREE.BufferAttribute(result.indices, 1));
  geo.computeVertexNormals();
  return geo;
}

function renderFromCaches(probability, gridSize, targetParent, numLayers) {
  clearMeshes();
  const parent = targetParent || scene;
  const layers = numLayers || currentLayers;
  const density = isDensityMode();

  for (const cache of currentCaches) {
    const gs = gridSize || cache.gridSize;

    if (layers === 1) {
      // Fast path: single layer, use original materials
      const threshold = computeThreshold(cache.data, probability, cache.halfExtent, gs);

      const posGeo = buildGeometry(cache.data, cache.halfExtent, threshold, gs);
      if (posGeo) {
        const mesh = new THREE.Mesh(posGeo, matPositive);
        parent.add(mesh);
        currentMeshes.push(mesh);
      }

      const negData = new Float32Array(cache.data.length);
      for (let j = 0; j < cache.data.length; j++) negData[j] = -cache.data[j];
      const negGeo = buildGeometry(negData, cache.halfExtent, threshold, gs);
      if (negGeo) {
        const mesh = new THREE.Mesh(negGeo, matNegative);
        parent.add(mesh);
        currentMeshes.push(mesh);
      }
    } else {
      // Multi-layer path
      const thresholds = computeMultiThresholds(cache.data, probability, layers, cache.halfExtent, gs);
      const negData = new Float32Array(cache.data.length);
      for (let j = 0; j < cache.data.length; j++) negData[j] = -cache.data[j];
      const mats = getLayerMaterials(layers, density);

      for (let i = 0; i < layers; i++) {
        // i=0 is outermost, i=layers-1 is innermost
        const posGeo = buildGeometry(cache.data, cache.halfExtent, thresholds[i], gs);
        if (posGeo) {
          const mesh = new THREE.Mesh(posGeo, mats.pos[layers - 1 - i]);
          mesh.renderOrder = i;
          parent.add(mesh);
          currentMeshes.push(mesh);
        }

        const negGeo = buildGeometry(negData, cache.halfExtent, thresholds[i], gs);
        if (negGeo) {
          const mesh = new THREE.Mesh(negGeo, mats.neg[layers - 1 - i]);
          mesh.renderOrder = i;
          parent.add(mesh);
          currentMeshes.push(mesh);
        }
      }
    }
  }

  updateLegend(layers, probability, density);
  updateOrbitalOpacity();
  if (!showDensityField) applyDensityFieldVisibility();
}

function loadOrbital(orbital, gridSize, targetParent) {
  const halfExt = getHalfExtent(orbital);
  const gs = gridSize || adaptiveGrid(halfExt, false, !isBondForming);
  currentCaches = [];
  const halfExtent = getHalfExtent(orbital);
  const parts = orbital.lobes || [orbital];
  for (const part of parts) {
    const data = sampleGrid(part, gs, halfExtent);
    currentCaches.push({ data, halfExtent, gridSize: gs });
  }
  renderFromCaches(currentProbability, gs, targetParent);

  // Auto-adjust camera distance (skip during drag and dynamics)
  if (!isDragging && !isDynamics) {
    const dist = halfExtent * 1.8;
    const dir = camera.position.clone().normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    controls.update();
  }
}

// ---- Async computation pipeline ----

async function renderFromCachesAsync(probability, gridSize, targetParent, numLayers) {
  clearMeshes();
  const parent = targetParent || scene;
  const layers = numLayers || currentLayers;
  const density = isDensityMode();

  const totalCaches = currentCaches.length;
  let cacheIdx = 0;

  for (const cache of currentCaches) {
    const gs = gridSize || cache.gridSize;
    const baseProgress = cacheIdx / totalCaches;
    const cacheWeight = 1 / totalCaches;

    const result = await renderLayersAsync(
      cache.data, cache.halfExtent, gs, probability, layers, density,
      (frac) => showProgress('Rendering...', baseProgress + cacheWeight * frac)
    );

    if (!result) return; // cancelled

    const step = (2 * cache.halfExtent) / (gs - 1);
    const he = cache.halfExtent;
    const mats = layers === 1 ? null : getLayerMaterials(layers, density);

    for (const r of result.results) {
      if (r.indices.length === 0) continue;
      const verts = r.vertices;
      for (let i = 0; i < verts.length; i += 3) {
        verts[i] = verts[i] * step - he;
        verts[i + 1] = verts[i + 1] * step - he;
        verts[i + 2] = verts[i + 2] * step - he;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      geo.setIndex(new THREE.BufferAttribute(r.indices, 1));
      geo.computeVertexNormals();

      let mat;
      if (layers === 1) {
        mat = r.side === 'pos' ? matPositive : matNegative;
      } else {
        const matIdx = layers - 1 - r.layer;
        mat = r.side === 'pos' ? mats.pos[matIdx] : mats.neg[matIdx];
      }

      const mesh = new THREE.Mesh(geo, mat);
      if (layers > 1) mesh.renderOrder = r.layer;
      parent.add(mesh);
      currentMeshes.push(mesh);
    }
    cacheIdx++;
  }

  updateLegend(layers, probability, density);
  updateOrbitalOpacity();
  if (!showDensityField) applyDensityFieldVisibility();
}

async function loadOrbitalAsync(orbital, gridSize, targetParent) {
  cancelCompute();
  const halfExtent = getHalfExtent(orbital);
  const gs = gridSize || adaptiveGrid(halfExtent, false, !isBondForming);
  currentCaches = [];
  const parts = orbital.lobes || [orbital];
  const totalParts = parts.length;

  showProgress('Sampling grid...', 0);

  for (let pi = 0; pi < totalParts; pi++) {
    const part = parts[pi];
    const partBase = pi / totalParts;
    const partWeight = 1 / totalParts;

    const data = await sampleGridAsync(part, gs, halfExtent,
      (frac) => showProgress('Sampling grid...', (partBase + partWeight * frac) * 0.7)
    );

    if (!data) return; // cancelled
    currentCaches.push({ data, halfExtent, gridSize: gs });
  }

  showProgress('Rendering...', 0.7);
  await renderFromCachesAsync(currentProbability, gs, targetParent);

  hideProgress();

  // Auto-adjust camera distance (skip during drag and dynamics)
  if (!isDragging && !isDynamics) {
    const dist = halfExtent * 1.8;
    const dir = camera.position.clone().normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    controls.update();
  }
}

// ---- UI event handlers ----
const probSlider = document.getElementById('prob-slider');
const probDisplay = document.getElementById('prob-display');
const computingEl = document.getElementById('computing');
const sepWrapper = document.getElementById('separation-wrapper');
const sepSlider = document.getElementById('sep-slider');
const sepDisplay = document.getElementById('sep-display');
const dynWrapper = document.getElementById('dynamics-wrapper');
const dynImpactSlider = document.getElementById('dyn-impact');
const dynImpactDisplay = document.getElementById('dyn-impact-display');
const dynSpeedSlider = document.getElementById('dyn-speed');
const dynSpeedDisplay = document.getElementById('dyn-speed-display');
const dynPlayBtn = document.getElementById('dyn-play');
const dynResetBtn = document.getElementById('dyn-reset');
const dynInfo = document.getElementById('dyn-info');

const progressLabel = document.getElementById('progress-label');
const progressFill = document.getElementById('progress-fill');

function showComputing() { computingEl.style.display = 'block'; progressFill.style.width = '0%'; }
function hideComputing() { computingEl.style.display = 'none'; progressFill.style.width = '0%'; }

function showProgress(label, fraction) {
  computingEl.style.display = 'block';
  progressLabel.textContent = label;
  progressFill.style.width = (fraction * 100) + '%';
}
function hideProgress() {
  computingEl.style.display = 'none';
  progressFill.style.width = '0%';
}

// ---- Slider-to-R mapping (exponential, dynamic per molecule) ----

function getSliderParams() {
  const { R_EQ, R_MAX } = BOND_FORMING_CONFIG;
  return { R_EQ, R_MAX, LOG_RATIO: Math.log(R_EQ / R_MAX) };
}

function sliderToR(sliderValue) {
  const { R_MAX, LOG_RATIO } = getSliderParams();
  const t = sliderValue / 100;
  return R_MAX * Math.exp(LOG_RATIO * t);
}

function rToSlider(R) {
  const { R_MAX, LOG_RATIO } = getSliderParams();
  return Math.round(100 * Math.log(R / R_MAX) / LOG_RATIO);
}

const BOHR_TO_ANGSTROM = 0.529177;

function updateSepDisplay(R) {
  const angstrom = R * BOHR_TO_ANGSTROM;
  const energy = morseEnergy(R);
  const eSign = energy < 0 ? '\u2212' : '';
  sepDisplay.textContent = `R = ${R.toFixed(3)} a\u2080 (${angstrom.toFixed(3)} \u00C5) \u00B7 E = ${eSign}${Math.abs(energy).toFixed(3)} eV`;
}

function renderBondAtR(R, lowRes) {
  if (!currentBondOrbital) return;
  const generated = currentBondOrbital.bondForming.generate(R);
  const he = getHalfExtent(generated);
  loadOrbital(generated, adaptiveGrid(he, lowRes));
  showBondFormingContext(R);
  setBondCylinderOpacity(R);
}

async function renderBondAtRAsync(R) {
  if (!currentBondOrbital) return;
  const generated = currentBondOrbital.bondForming.generate(R);
  const he = getHalfExtent(generated);
  await loadOrbitalAsync(generated, adaptiveGrid(he, false));
  showBondFormingContext(R);
  setBondCylinderOpacity(R);
}

// ---- Dynamics orbital group management ----

function ensureDynGroup() {
  if (!dynOrbitalGroup) {
    dynOrbitalGroup = new THREE.Group();
    scene.add(dynOrbitalGroup);
  }
}

function clearDynGroup() {
  if (dynOrbitalGroup) {
    scene.remove(dynOrbitalGroup);
    dynOrbitalGroup = null;
  }
}

// Resample the orbital along the z-axis, put meshes into dynOrbitalGroup
function resampleDynOrbital(R, lowRes) {
  if (!currentBondOrbital) return;
  ensureDynGroup();
  const orientations = getAtomOrientations();
  const generated = currentBondOrbital.bondForming.generate(R, orientations);
  const he = getHalfExtent(generated);
  const gs = adaptiveGrid(he, lowRes !== false);
  currentCaches = [];
  const halfExtent = getHalfExtent(generated);
  const parts = generated.lobes || [generated];
  for (const part of parts) {
    const data = sampleGrid(part, gs, halfExtent);
    currentCaches.push({ data, halfExtent, gridSize: gs });
  }
  renderFromCaches(currentProbability, gs, dynOrbitalGroup, lowRes ? 1 : currentLayers);
  lastSampledR = R;
  lastSampledOrientations = orientations;
}

async function resampleDynOrbitalAsync(R) {
  if (!currentBondOrbital) return;
  ensureDynGroup();
  const orientations = getAtomOrientations();
  const generated = currentBondOrbital.bondForming.generate(R, orientations);
  const he = getHalfExtent(generated);
  const gs = adaptiveGrid(he, false);
  currentCaches = [];
  const halfExtent = getHalfExtent(generated);
  const parts = generated.lobes || [generated];
  for (const part of parts) {
    const data = await sampleGridAsync(part, gs, halfExtent,
      (frac) => showProgress('Sampling grid...', frac * 0.7)
    );
    if (!data) return;
    currentCaches.push({ data, halfExtent, gridSize: gs });
  }
  showProgress('Rendering...', 0.7);
  await renderFromCachesAsync(currentProbability, gs, dynOrbitalGroup, currentLayers);
  lastSampledR = R;
  lastSampledOrientations = orientations;
}

async function resampleTriatomicOrbitalAsync(posArrays) {
  if (!currentBondOrbital) return;
  ensureDynGroup();
  const orientations = get3AtomOrientations();
  const generated = currentBondOrbital.bondForming.generate3(posArrays, orientations);
  const he = getHalfExtent(generated);
  const gs = adaptiveGrid(he, false);
  currentCaches = [];
  const halfExtent = getHalfExtent(generated);
  const parts = generated.lobes || [generated];
  for (const part of parts) {
    const data = await sampleGridAsync(part, gs, halfExtent,
      (frac) => showProgress('Sampling grid...', frac * 0.7)
    );
    if (!data) return;
    currentCaches.push({ data, halfExtent, gridSize: gs });
  }
  showProgress('Rendering...', 0.7);
  await renderFromCachesAsync(currentProbability, gs, dynOrbitalGroup, currentLayers);
  lastSampledOrientations3 = orientations;
}

// Orient the dynOrbitalGroup so its z-axis aligns with the molecular axis
function orientDynGroup() {
  if (!dynOrbitalGroup) return;
  const { a, b } = getAtomPositions();
  const axis = new THREE.Vector3().subVectors(b, a);
  const len = axis.length();
  if (len < 0.01) return;
  axis.divideScalar(len);

  // The orbital was generated along z-axis, so rotate z-axis to match actual axis
  dynOrbitalGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  // Position at midpoint
  dynOrbitalGroup.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

// ---- Triatomic orbital management ----

function resampleTriatomicOrbital(posArrays, lowRes) {
  if (!currentBondOrbital) return;
  ensureDynGroup();
  const orientations = get3AtomOrientations();
  const generated = currentBondOrbital.bondForming.generate3(posArrays, orientations);
  const he = getHalfExtent(generated);
  const gs = adaptiveGrid(he, lowRes !== false);
  currentCaches = [];
  const halfExtent = getHalfExtent(generated);
  const parts = generated.lobes || [generated];
  for (const part of parts) {
    const data = sampleGrid(part, gs, halfExtent);
    currentCaches.push({ data, halfExtent, gridSize: gs });
  }
  renderFromCaches(currentProbability, gs, dynOrbitalGroup, lowRes ? 1 : currentLayers);
  lastSampledOrientations3 = orientations;
}

function orientTriatomicDynGroup(positions, triConfig) {
  if (!dynOrbitalGroup) return;

  if (triConfig.geometry === 'linear') {
    const axis = new THREE.Vector3().subVectors(positions[2], positions[0]).normalize();
    dynOrbitalGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    dynOrbitalGroup.position.copy(positions[1]);
  } else {
    // Bent: canonical has center at origin, bisector along +z, molecule in xz-plane
    const center = positions[1];
    const u1 = new THREE.Vector3().subVectors(positions[0], center).normalize();
    const u2 = new THREE.Vector3().subVectors(positions[2], center).normalize();
    const bisector = new THREE.Vector3().addVectors(u1, u2);

    if (bisector.length() < 0.01) {
      // Degenerate: essentially linear
      const axis = new THREE.Vector3().subVectors(positions[2], positions[0]).normalize();
      dynOrbitalGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    } else {
      bisector.normalize();
      const normal = new THREE.Vector3().crossVectors(u1, u2).normalize();
      const side = new THREE.Vector3().crossVectors(normal, bisector).normalize();
      // Canonical has atom 0 at +x; ensure side points toward atom 0
      if (side.dot(u1) < 0) { side.negate(); normal.negate(); }
      // Canonical: x→side, y→normal, z→bisector
      const m = new THREE.Matrix4().makeBasis(side, normal, bisector);
      dynOrbitalGroup.quaternion.setFromRotationMatrix(m);
    }
    dynOrbitalGroup.position.copy(center);
  }
}

function updateDyn3Info() {
  const Rs = SIM3_STATE.R;
  const E = SIM3_STATE.energy;
  const eSign = E < 0 ? '\u2212' : '+';
  let status = '';
  if (SIM3_STATE.settled) status = ' [settled]';
  else if (Rs.every(r => r < 5)) status = ' [bonded]';
  else if (SIM3_STATE.running) status = ' [approaching]';
  const rStr = Rs.map((r, i) => `R${i + 1}=${r.toFixed(2)}`).join(' ');
  dynInfo.textContent = `${rStr} E=${eSign}${Math.abs(E).toFixed(2)}eV${status}`;
}

// ---- Dynamics slider helpers ----

function getImpactParam() {
  return parseInt(dynImpactSlider.value) / 10;
}

function getApproachSpeed() {
  return parseInt(dynSpeedSlider.value) / 10;
}

function updateDynImpactDisplay() {
  const b = getImpactParam();
  dynImpactDisplay.textContent = `b = ${b.toFixed(1)} a\u2080`;
}

function updateDynSpeedDisplay() {
  const v = getApproachSpeed();
  dynSpeedDisplay.textContent = `v\u2080 = ${v.toFixed(1)}`;
}

function updateDynInfo() {
  const R = SIM_STATE.R;
  const E = SIM_STATE.energy;
  const angstrom = R * BOHR_TO_ANGSTROM;
  const eSign = E < 0 ? '\u2212' : '+';
  let status = '';
  if (SIM_STATE.settled) status = ' [settled]';
  else if (R < 3) status = ' [bonded]';
  else if (SIM_STATE.running) status = ' [approaching]';
  dynInfo.textContent = `R=${R.toFixed(2)} a\u2080 (${angstrom.toFixed(2)}\u00C5) E=${eSign}${Math.abs(E).toFixed(2)}eV${status}`;
}

// ---- Dynamics UI events ----

dynImpactSlider.addEventListener('input', () => {
  updateDynImpactDisplay();
  if (isTriatomic) {
    if (!SIM3_STATE.running) {
      reset3Simulation(currentBondOrbital.bondForming.triatomic, getImpactParam(), getApproachSpeed());
    }
  } else {
    if (!SIM_STATE.running) {
      resetSimulation(getImpactParam(), getApproachSpeed());
    }
  }
});

dynSpeedSlider.addEventListener('input', () => {
  updateDynSpeedDisplay();
  if (isTriatomic) {
    if (!SIM3_STATE.running) {
      reset3Simulation(currentBondOrbital.bondForming.triatomic, getImpactParam(), getApproachSpeed());
    }
  } else {
    if (!SIM_STATE.running) {
      resetSimulation(getImpactParam(), getApproachSpeed());
    }
  }
});

dynPlayBtn.addEventListener('click', () => {
  if (!isBondForming) return;

  const simRunning = isTriatomic ? SIM3_STATE.running : SIM_STATE.running;

  if (simRunning) {
    // Pause
    if (isTriatomic) SIM3_STATE.running = false;
    else SIM_STATE.running = false;
    dynPlayBtn.textContent = '\u25B6 Play';
    sepSlider.disabled = false;
    controls.autoRotate = true;
    (async () => {
      if (isTriatomic) {
        const posArrays = get3AtomPositions().map(p => [p.x, p.y, p.z]);
        await resampleTriatomicOrbitalAsync(posArrays);
        orientTriatomicDynGroup(get3AtomPositions(), currentBondOrbital.bondForming.triatomic);
      } else {
        await resampleDynOrbitalAsync(SIM_STATE.R);
        orientDynGroup();
      }
      hideProgress();
    })();
  } else {
    // Start / resume
    if (isTriatomic) {
      if (SIM3_STATE.settled || SIM3_STATE.frameCount === 0) {
        reset3Simulation(currentBondOrbital.bondForming.triatomic, getImpactParam(), getApproachSpeed());
        clear3Trails(scene);
        init3Trails(scene);
        lastSampledR3 = null;
        lastSampledOrientations3 = null;
        dynFinalRendered = false;
      }
      SIM3_STATE.running = true;
    } else {
      if (SIM_STATE.settled || SIM_STATE.frameCount === 0) {
        resetSimulation(getImpactParam(), getApproachSpeed());
        clearTrails(scene);
        initTrails(scene);
        lastSampledR = -1;
        lastSampledOrientations = null;
        dynFinalRendered = false;
      }
      SIM_STATE.running = true;
    }
    isDynamics = true;
    controls.autoRotate = false;
    dynPlayBtn.textContent = '\u23F8 Pause';
    sepSlider.disabled = true;

    const camDist = isTriatomic ? 24 : 18;
    const dir = camera.position.clone().normalize();
    if (dir.length() < 0.01) dir.set(0, 1, 1).normalize();
    camera.position.copy(dir.multiplyScalar(camDist));
    controls.update();
  }
});

dynResetBtn.addEventListener('click', () => {
  if (isTriatomic) SIM3_STATE.running = false;
  else SIM_STATE.running = false;
  isDynamics = false;
  controls.autoRotate = true;
  dynPlayBtn.textContent = '\u25B6 Play';
  sepSlider.disabled = false;
  dynFinalRendered = false;

  if (isTriatomic) {
    clear3Trails(scene);
    clearDynGroup();
    dynInfo.textContent = '';
    const triConfig = currentBondOrbital.bondForming.triatomic;
    const eqPos = triatomicEquilibrium(triConfig);
    (async () => {
      const generated = currentBondOrbital.bondForming.generate3(eqPos);
      await loadOrbitalAsync(generated);
      showTriatomicContext(eqPos, triConfig.bonds);
      const eqDists = triConfig.bonds.map(([bi, bj]) => dist3(eqPos[bi], eqPos[bj]));
      setTriatomicBondOpacity(eqDists, triConfig.morse);
    })();
  } else {
    clearTrails(scene);
    clearDynGroup();
    dynInfo.textContent = '';
    currentR = sliderToR(parseInt(sepSlider.value));
    updateSepDisplay(currentR);
    renderBondAtRAsync(currentR);
  }
});

// ---- Load selected orbital ----

function loadSelectedOrbital() {
  const orbital = getSelectedOrbital();
  if (!orbital) return;

  cancelCompute(); // cancel any in-flight async work

  // Clean up dynamics state when switching orbitals
  if (isDynamics || SIM_STATE.running || SIM3_STATE.running) {
    SIM_STATE.running = false;
    SIM3_STATE.running = false;
    isDynamics = false;
    dynPlayBtn.textContent = '\u25B6 Play';
    sepSlider.disabled = false;
    clearTrails(scene);
    clear3Trails(scene);
    clearDynGroup();
    dynInfo.textContent = '';
    dynFinalRendered = false;
  }

  if (orbital.bondForming) {
    const bf = orbital.bondForming;
    isBondForming = true;
    currentBondOrbital = orbital;
    dynWrapper.classList.remove('dropdown-hidden');
    clearMoleculeContext();

    if (bf.triatomic) {
      // Triatomic mode
      isTriatomic = true;
      const triConfig = bf.triatomic;
      setContextMode(3, triConfig.bonds.map(b => b[2] || 1));
      setContextAtomStyle(triConfig.atoms);
      sepWrapper.classList.add('dropdown-hidden');
      reset3Simulation(triConfig, getImpactParam(), getApproachSpeed());
      updateDynImpactDisplay();
      updateDynSpeedDisplay();

      (async () => {
        const eqPos = triatomicEquilibrium(triConfig);
        const generated = bf.generate3(eqPos);
        await loadOrbitalAsync(generated);
        showTriatomicContext(eqPos, triConfig.bonds);
        const eqDists = triConfig.bonds.map(([bi, bj]) => dist3(eqPos[bi], eqPos[bj]));
        setTriatomicBondOpacity(eqDists, triConfig.morse);
        applyBallStickVisibility();
      })();
    } else {
      // Diatomic mode
      isTriatomic = false;
      setActiveBondConfig(bf.molecule);
      setContextMode(2, [BOND_FORMING_CONFIG.bondOrder]);
      setContextAtomStyle(BOND_FORMING_CONFIG.elements);
      sepWrapper.classList.remove('dropdown-hidden');

      currentR = sliderToR(parseInt(sepSlider.value));
      updateSepDisplay(currentR);
      updateDynImpactDisplay();
      updateDynSpeedDisplay();

      (async () => {
        await renderBondAtRAsync(currentR);
        applyBallStickVisibility();
      })();
    }
  } else {
    // Normal mode
    isBondForming = false;
    isTriatomic = false;
    currentBondOrbital = null;
    sepWrapper.classList.add('dropdown-hidden');
    dynWrapper.classList.add('dropdown-hidden');
    clearBondFormingContext();

    if (d1Select.value === 'Molecules') {
      showMoleculeContext(orbital.name);
      applyBallStickVisibility();
    } else {
      clearMoleculeContext();
    }
    loadOrbitalAsync(orbital);
  }
}

// ---- Separation slider events ----
sepSlider.addEventListener('input', () => {
  if (isDynamics) return; // slider disabled during dynamics
  isDragging = true;
  currentR = sliderToR(parseInt(sepSlider.value));
  updateSepDisplay(currentR);
  renderBondAtR(currentR, true);
});

sepSlider.addEventListener('pointerup', () => {
  if (isDynamics) return;
  isDragging = false;
  renderBondAtRAsync(currentR);
});

sepSlider.addEventListener('change', () => {
  if (isDynamics) return;
  if (!isDragging) {
    currentR = sliderToR(parseInt(sepSlider.value));
    updateSepDisplay(currentR);
    renderBondAtRAsync(currentR);
  }
});

// ---- Probability slider ----
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
});

// ---- Ball & Stick toggle ----
ballStickToggle.addEventListener('change', () => {
  showBallAndStick = ballStickToggle.checked;
  applyBallStickVisibility();
});

// ---- Density Field toggle ----
densityFieldToggle.addEventListener('change', () => {
  showDensityField = densityFieldToggle.checked;
  applyDensityFieldVisibility();
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

// ---- Animation loop ----
function animate() {
  requestAnimationFrame(animate);

  if (isDynamics && isTriatomic && SIM3_STATE.running) {
    // 3-body dynamics
    step3Simulation();
    record3TrailPoint();

    const positions = get3AtomPositions();
    const posArrays = positions.map(p => [p.x, p.y, p.z]);
    const triConfig = currentBondOrbital.bondForming.triatomic;
    const bondDists = triConfig.bonds.map(([bi, bj]) => positions[bi].distanceTo(positions[bj]));

    // Resample when bond distances change enough or orientation changes enough
    const currentOrientations3 = get3AtomOrientations();
    const maxDelta = lastSampledR3
      ? Math.max(...bondDists.map((d, i) => Math.abs(d - lastSampledR3[i])))
      : Infinity;
    const needResample3 = maxDelta > 0.2
      || orientationChanged(currentOrientations3, lastSampledOrientations3);
    if (needResample3 && !dynFinalRendered) {
      resampleTriatomicOrbital(posArrays, true);
      lastSampledR3 = [...bondDists];
    }

    orientTriatomicDynGroup(positions, triConfig);
    showTriatomicContext(positions, triConfig.bonds);
    setTriatomicBondOpacity(bondDists, triConfig.morse);
    updateDyn3Info();

    if (SIM3_STATE.settled && !dynFinalRendered) {
      dynFinalRendered = true;
      SIM3_STATE.running = false;
      controls.autoRotate = true;
      dynPlayBtn.textContent = '\u25B6 Play';
      (async () => {
        await resampleTriatomicOrbitalAsync(posArrays);
        orientTriatomicDynGroup(positions, triConfig);
        hideProgress();
      })();
    }
  } else if (isDynamics && !isTriatomic && SIM_STATE.running) {
    // 2-body dynamics
    stepSimulation();
    recordTrailPoint();

    const R = SIM_STATE.R;

    // Resample orbital when R changes enough or orientation changes enough
    const currentOrientations = getAtomOrientations();
    const needResample = lastSampledR < 0
      || Math.abs(R - lastSampledR) > 0.15
      || orientationChanged(currentOrientations, lastSampledOrientations);
    if (needResample && !dynFinalRendered) {
      resampleDynOrbital(R, true);
    }

    // Orient group to match molecular axis
    orientDynGroup();

    // Update context meshes (atom spheres, bond cylinder)
    const { a, b } = getAtomPositions();
    showBondFormingContextAtPositions(a, b);
    setBondCylinderOpacity(R);

    // Update separation display
    updateSepDisplay(R);
    updateDynInfo();

    // Update slider position to match current R (clamped to range)
    const { R_EQ: rEq, R_MAX: rMax } = getSliderParams();
    const clampedR = Math.max(rEq, Math.min(rMax, R));
    sepSlider.value = rToSlider(clampedR);

    // Settling: do one final high-res render, then stop resampling
    if (SIM_STATE.settled && !dynFinalRendered) {
      dynFinalRendered = true;
      SIM_STATE.running = false;
      controls.autoRotate = true;
      dynPlayBtn.textContent = '\u25B6 Play';
      (async () => {
        await resampleDynOrbitalAsync(R);
        orientDynGroup();
        hideProgress();
      })();
    }
  }

  controls.update();
  updateLabelScales();
  renderer.render(scene, camera);
}

animate();

// ---- Initial load ----
onD1Change();
