// Orbital loader: main dispatcher for loading/rendering orbitals, special field modes (ESP, charge, ELF).

import * as THREE from 'three';
import { sampleGridAsync, renderLayersAsync, cancelCompute } from '../worker-pool.js';
import { getLayerMaterials, updateLegend } from '../layer-materials.js';
import { scene, camera, controls, updateGridExtent } from '../scene.js';
import { showMoleculeContext, clearMoleculeContext } from '../molecules/index.js';
import { clearBondFormingContext } from '../bond-forming.js';
import { computeElectrostaticPotential, computeChargeDensity } from '../electrostatic-potential.js';
import { computeELF } from '../elf.js';
import { SIM_STATE, SIM3_STATE } from '../dynamics.js';

let stateGetter, stateSetter;
let getSelectedOrbital, loadOrbitalAsync, renderFromCachesAsync, getHalfExtent, adaptiveGrid;
let showProgress, hideProgress, clearMeshes, applyBallStickVisibility;
let applyBondFormingDefaults, restoreNonBondFormingDefaults;
let updateFieldSourceOptions, updateEnergyDiagram, updateOrbitalOpacity, applyDensityFieldVisibility;
let cleanupDynamicsState, loadBondFormingOrbital;
let cancelVibration, cancelTransition, cancelReaction;
let populateVibModes, startVibBuild, startTransitionBuild, populateMixerSliders, startReactionBuild;
let mixer, vibModeSelect;
let d1Select, dynWrapper, vibWrapper, transitionWrapper, mixerWrapper, reactionWrapper, sepWrapper;

let chargeCache = null;

export function initOrbitalLoader(elements, state, callbacks) {
  // Unpack DOM elements
  ({ d1Select, dynWrapper, vibWrapper, transitionWrapper, mixerWrapper, reactionWrapper, sepWrapper, vibModeSelect } = elements);

  // Unpack state accessors
  ({ stateGetter, stateSetter } = state);

  // Unpack callbacks
  ({ getSelectedOrbital, loadOrbitalAsync, renderFromCachesAsync, getHalfExtent, adaptiveGrid,
     showProgress, hideProgress, clearMeshes, applyBallStickVisibility,
     applyBondFormingDefaults, restoreNonBondFormingDefaults,
     updateFieldSourceOptions, updateEnergyDiagram, updateOrbitalOpacity, applyDensityFieldVisibility,
     cleanupDynamicsState, loadBondFormingOrbital,
     cancelVibration, cancelTransition, cancelReaction,
     populateVibModes, startVibBuild, startTransitionBuild, populateMixerSliders, startReactionBuild,
     mixer } = callbacks);
}

export function loadSelectedOrbital() {
  const orbital = getSelectedOrbital();
  if (!orbital) return;

  const st = stateGetter();

  updateFieldSourceOptions();
  cancelCompute();
  cancelVibration();
  cancelTransition();
  cancelReaction();
  chargeCache = null;
  updateEnergyDiagram();

  if (st.isDynamics || SIM_STATE.running || SIM3_STATE.running) {
    cleanupDynamicsState();
  }

  if (orbital.bondForming) {
    stateSetter({ isBondForming: true, currentBondOrbital: orbital });
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
    stateSetter({ isBondForming: false, isTriatomic: false, currentBondOrbital: null });
    sepWrapper.classList.add('dropdown-hidden');
    dynWrapper.classList.add('dropdown-hidden');
    clearBondFormingContext();
    restoreNonBondFormingDefaults();

    if (d1Select.value === 'Molecules') {
      showMoleculeContext(orbital.name);
      applyBallStickVisibility();
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
      loadOrbitalAsync(orbital).then(() => startTransitionBuild(orbital));
    } else if (orbital.isMixer) {
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

async function loadElectrostaticPotentialAsync(orbital) {
  const st = stateGetter();
  cancelCompute();
  const halfExtent = getHalfExtent(orbital);
  updateGridExtent(halfExtent);
  const gs = adaptiveGrid(halfExtent, false, halfExtent < 28);

  showProgress('Sampling density...', 0);
  const densityData = await sampleGridAsync(orbital, gs, halfExtent,
    (f) => showProgress('Sampling density...', f * 0.3));
  if (!densityData) return;

  const atomInfo = st.getCurrentAtomInfo();
  const potential = await computeElectrostaticPotential(atomInfo, densityData, gs, halfExtent,
    (f) => showProgress('Solving potential...', 0.3 + f * 0.3));

  stateSetter({ currentCaches: [{ data: potential, halfExtent, gridSize: gs }] });
  showProgress('Rendering...', 0.6);
  await renderFromCachesAsync(st.currentProbability, gs);
  hideProgress();

  if (!st.isDragging && !st.isDynamics) {
    const dist = halfExtent * 1.8;
    const dir = camera.position.clone().normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    controls.update();
  }
}

export async function renderChargeVisualisation() {
  if (!chargeCache) return;
  const st = stateGetter();
  const { posData, negData, halfExtent, gridSize } = chargeCache;

  for (const m of st.currentMeshes) {
    if (m.parent) m.parent.remove(m);
    m.geometry.dispose();
  }

  const layers = st.currentLayers;
  const mats = getLayerMaterials(layers, 'charge');
  const step = (2 * halfExtent) / (gridSize - 1);
  const meshes = [];

  const [posResult, negResult] = await Promise.all([
    renderLayersAsync(posData, halfExtent, gridSize, st.currentProbability, layers, true,
      (f) => showProgress('Rendering...', f * 0.5)),
    renderLayersAsync(negData, halfExtent, gridSize, st.currentProbability, layers, true,
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

  addMeshes(posResult, mats.pos);
  addMeshes(negResult, mats.neg);

  stateSetter({ currentMeshes: meshes });
  updateLegend(layers, st.currentProbability, 'charge');
  updateOrbitalOpacity();
  if (!st.showDensityField) applyDensityFieldVisibility();
  hideProgress();
}

async function loadChargeDensityAsync(orbital) {
  const st = stateGetter();
  cancelCompute();
  const halfExtent = getHalfExtent(orbital);
  updateGridExtent(halfExtent);
  const gs = adaptiveGrid(halfExtent, false, halfExtent < 28);

  showProgress('Sampling density...', 0);
  const densityData = await sampleGridAsync(orbital, gs, halfExtent,
    (f) => showProgress('Sampling density...', f * 0.5));
  if (!densityData) return;

  const atomInfo = st.getCurrentAtomInfo();
  const chargeData = await computeChargeDensity(atomInfo, densityData, gs, halfExtent,
    (f) => showProgress('Computing charge visualisation...', 0.5 + f * 0.2));

  const N3 = chargeData.length;
  const posData = new Float32Array(N3);
  const negData = new Float32Array(N3);
  for (let i = 0; i < N3; i++) {
    if (chargeData[i] > 0) posData[i] = chargeData[i];
    else if (chargeData[i] < 0) negData[i] = -chargeData[i];
  }

  chargeCache = { posData, negData, halfExtent, gridSize: gs };
  stateSetter({ currentCaches: [{ data: chargeData, halfExtent, gridSize: gs }], chargeCache });

  showProgress('Rendering...', 0.7);
  clearMeshes();
  await renderChargeVisualisation();

  if (!st.isDragging && !st.isDynamics) {
    const dist = halfExtent * 1.8;
    const dir = camera.position.clone().normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    controls.update();
  }
}

async function loadELFAsync(orbital) {
  const st = stateGetter();
  cancelCompute();
  const halfExtent = orbital.halfExtent || 14;
  updateGridExtent(halfExtent);
  const gs = adaptiveGrid(halfExtent, false, halfExtent < 28);

  showProgress('Computing ELF: sampling MOs...', 0);
  const elfData = await computeELF(orbital.molecule, gs, halfExtent,
    (f) => showProgress(`Computing ELF...`, f * 0.7));

  if (!elfData) return;

  stateSetter({ currentCaches: [{ data: elfData, halfExtent, gridSize: gs }] });
  showProgress('Rendering ELF...', 0.7);
  await renderFromCachesAsync(st.currentProbability, gs);
  hideProgress();

  if (!st.isDragging && !st.isDynamics) {
    const dist = halfExtent * 1.8;
    const dir = camera.position.clone().normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    controls.update();
  }
}
