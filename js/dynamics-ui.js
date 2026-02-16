// Dynamics UI: bond-forming dynamics simulation controls, orbital resampling,
// and group orientation management. Extracted from main.js.

import * as THREE from 'three';
import { scene, camera, controls } from './scene.js';
import { sampleGrid } from './grid.js';
import { sampleGridAsync, cancelCompute } from './worker-pool.js';
import { showBondFormingContext, clearBondFormingContext,
         BOND_FORMING_CONFIG, setActiveBondConfig, setContextAtomStyle,
         showBondFormingContextAtPositions, setBondCylinderOpacity,
         setContextMode, showTriatomicContext, setTriatomicBondOpacity,
         setBondFormingContextVisible } from './bond-forming.js';
import { SIM_STATE, SIM_CONFIG, stepSimulation, resetSimulation, getAtomPositions,
         getAtomOrientations, initTrails, recordTrailPoint, clearTrails,
         SIM3_STATE, step3Simulation, reset3Simulation, get3AtomPositions,
         get3AtomOrientations, init3Trails, record3TrailPoint, clear3Trails } from './dynamics.js';
import { adaptiveGrid, getHalfExtent, loadOrbital, loadOrbitalAsync,
         renderFromCaches, renderFromCachesAsync,
         showProgress, hideProgress } from './render-pipeline.js';
import { sliderToR, rToSlider, updateSepDisplay, updateDynInfo, updateDyn3Info,
         getImpactParam, getApproachSpeed, updateDynImpactDisplay, updateDynSpeedDisplay,
         triatomicEquilibrium, dist3, getSliderParams_export } from './dynamics-display.js';

// ---- State (shared with main.js via init) ----

let getState = null;
let setState = null;

export function initDynamicsUI(getter, setter) {
  getState = getter;
  setState = setter;
}

// ---- DOM elements ----

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

// ---- Orientation comparison ----

function orientationChanged(current, last) {
  if (!current) return false;
  if (!last) return true;
  for (let i = 0; i < current.length; i++) {
    const a = current[i], b = last[i];
    let dotSum = 0;
    for (let j = 0; j < 9; j++) dotSum += a[j] * b[j];
    if (dotSum < 2.992) return true;
  }
  return false;
}

// ---- Bond render helpers ----

function renderBondAtR(R, lowRes) {
  const s = getState();
  if (!s.currentBondOrbital) return;
  const generated = s.currentBondOrbital.bondForming.generate(R);
  const he = getHalfExtent(generated);
  loadOrbital(generated, adaptiveGrid(he, lowRes), undefined, true);
  showBondFormingContext(R);
  setBondCylinderOpacity(R);
}

async function renderBondAtRAsync(R) {
  const s = getState();
  if (!s.currentBondOrbital) return;
  const generated = s.currentBondOrbital.bondForming.generate(R);
  const he = getHalfExtent(generated);
  await loadOrbitalAsync(generated, adaptiveGrid(he, false), undefined, true);
  showBondFormingContext(R);
  setBondCylinderOpacity(R);
}

// ---- Dynamics group management ----

function ensureDynGroup() {
  const s = getState();
  if (!s.dynOrbitalGroup) {
    const g = new THREE.Group();
    scene.add(g);
    setState({ dynOrbitalGroup: g });
  }
}

function clearDynGroup() {
  const s = getState();
  if (s.dynOrbitalGroup) {
    scene.remove(s.dynOrbitalGroup);
    setState({ dynOrbitalGroup: null });
  }
}

function resampleDynOrbital(R, lowRes) {
  const s = getState();
  if (!s.currentBondOrbital) return;
  ensureDynGroup();
  const orientations = getAtomOrientations();
  const generated = s.currentBondOrbital.bondForming.generate(R, orientations);
  const he = getHalfExtent(generated);
  const gs = adaptiveGrid(he, lowRes !== false);
  const halfExtent = getHalfExtent(generated);
  const parts = generated.lobes || [generated];
  const caches = [];
  for (const part of parts) {
    const data = sampleGrid(part, gs, halfExtent);
    caches.push({ data, halfExtent, gridSize: gs });
  }
  setState({ currentCaches: caches });
  renderFromCaches(s.currentProbability, gs, getState().dynOrbitalGroup, lowRes ? 1 : s.currentLayers);
  setState({ lastSampledR: R, lastSampledOrientations: orientations });
}

async function resampleDynOrbitalAsync(R) {
  const s = getState();
  if (!s.currentBondOrbital) return;
  ensureDynGroup();
  const orientations = getAtomOrientations();
  const generated = s.currentBondOrbital.bondForming.generate(R, orientations);
  const he = getHalfExtent(generated);
  const gs = adaptiveGrid(he, false);
  const halfExtent = getHalfExtent(generated);
  const parts = generated.lobes || [generated];
  const caches = [];
  for (const part of parts) {
    const data = await sampleGridAsync(part, gs, halfExtent,
      (frac) => showProgress('Sampling grid...', frac * 0.7)
    );
    if (!data) return;
    caches.push({ data, halfExtent, gridSize: gs });
  }
  setState({ currentCaches: caches });
  showProgress('Rendering...', 0.7);
  await renderFromCachesAsync(s.currentProbability, gs, getState().dynOrbitalGroup, s.currentLayers);
  setState({ lastSampledR: R, lastSampledOrientations: orientations });
}

async function resampleTriatomicOrbitalAsync(posArrays) {
  const s = getState();
  if (!s.currentBondOrbital) return;
  ensureDynGroup();
  const orientations = get3AtomOrientations();
  const generated = s.currentBondOrbital.bondForming.generate3(posArrays, orientations);
  const he = getHalfExtent(generated);
  const gs = adaptiveGrid(he, false);
  const halfExtent = getHalfExtent(generated);
  const parts = generated.lobes || [generated];
  const caches = [];
  for (const part of parts) {
    const data = await sampleGridAsync(part, gs, halfExtent,
      (frac) => showProgress('Sampling grid...', frac * 0.7)
    );
    if (!data) return;
    caches.push({ data, halfExtent, gridSize: gs });
  }
  setState({ currentCaches: caches });
  showProgress('Rendering...', 0.7);
  await renderFromCachesAsync(s.currentProbability, gs, getState().dynOrbitalGroup, s.currentLayers);
  setState({ lastSampledOrientations3: orientations });
}

function resampleTriatomicOrbital(posArrays, lowRes) {
  const s = getState();
  if (!s.currentBondOrbital) return;
  ensureDynGroup();
  const orientations = get3AtomOrientations();
  const generated = s.currentBondOrbital.bondForming.generate3(posArrays, orientations);
  const he = getHalfExtent(generated);
  const gs = adaptiveGrid(he, lowRes !== false);
  const halfExtent = getHalfExtent(generated);
  const parts = generated.lobes || [generated];
  const caches = [];
  for (const part of parts) {
    const data = sampleGrid(part, gs, halfExtent);
    caches.push({ data, halfExtent, gridSize: gs });
  }
  setState({ currentCaches: caches });
  renderFromCaches(s.currentProbability, gs, getState().dynOrbitalGroup, lowRes ? 1 : s.currentLayers);
  setState({ lastSampledOrientations3: orientations });
}

// ---- Group orientation ----

function orientDynGroup() {
  const s = getState();
  if (!s.dynOrbitalGroup) return;
  const { a, b } = getAtomPositions();
  const axis = new THREE.Vector3().subVectors(b, a);
  const len = axis.length();
  if (len < 0.01) return;
  axis.divideScalar(len);
  s.dynOrbitalGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  s.dynOrbitalGroup.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

function orientTriatomicDynGroup(positions, triConfig) {
  const s = getState();
  if (!s.dynOrbitalGroup) return;

  if (triConfig.geometry === 'linear') {
    const axis = new THREE.Vector3().subVectors(positions[2], positions[0]).normalize();
    s.dynOrbitalGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    s.dynOrbitalGroup.position.copy(positions[1]);
  } else {
    const center = positions[1];
    const u1 = new THREE.Vector3().subVectors(positions[0], center).normalize();
    const u2 = new THREE.Vector3().subVectors(positions[2], center).normalize();
    const bisector = new THREE.Vector3().addVectors(u1, u2);

    if (bisector.length() < 0.01) {
      const axis = new THREE.Vector3().subVectors(positions[2], positions[0]).normalize();
      s.dynOrbitalGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    } else {
      bisector.normalize();
      const normal = new THREE.Vector3().crossVectors(u1, u2).normalize();
      const side = new THREE.Vector3().crossVectors(normal, bisector).normalize();
      if (side.dot(u1) < 0) { side.negate(); normal.negate(); }
      const m = new THREE.Matrix4().makeBasis(side, normal, bisector);
      s.dynOrbitalGroup.quaternion.setFromRotationMatrix(m);
    }
    s.dynOrbitalGroup.position.copy(center);
  }
}

// ---- Setup event listeners ----

export function setupDynamicsEvents() {
  dynImpactSlider.addEventListener('input', () => {
    const s = getState();
    updateDynImpactDisplay(dynImpactSlider, dynImpactDisplay);
    const impact = getImpactParam(dynImpactSlider);
    const speed = getApproachSpeed(dynSpeedSlider);
    if (s.isTriatomic) {
      if (!SIM3_STATE.running)
        reset3Simulation(s.currentBondOrbital.bondForming.triatomic, impact, speed);
    } else {
      if (!SIM_STATE.running)
        resetSimulation(impact, speed);
    }
  });

  dynSpeedSlider.addEventListener('input', () => {
    const s = getState();
    updateDynSpeedDisplay(dynSpeedSlider, dynSpeedDisplay);
    const impact = getImpactParam(dynImpactSlider);
    const speed = getApproachSpeed(dynSpeedSlider);
    if (s.isTriatomic) {
      if (!SIM3_STATE.running)
        reset3Simulation(s.currentBondOrbital.bondForming.triatomic, impact, speed);
    } else {
      if (!SIM_STATE.running)
        resetSimulation(impact, speed);
    }
  });

  dynPlayBtn.addEventListener('click', () => {
    const s = getState();
    if (!s.isBondForming) return;
    const simRunning = s.isTriatomic ? SIM3_STATE.running : SIM_STATE.running;

    if (simRunning) {
      // Pause
      if (s.isTriatomic) SIM3_STATE.running = false;
      else SIM_STATE.running = false;
      dynPlayBtn.textContent = '\u25B6 Play';
      sepSlider.disabled = false;
      controls.autoRotate = true;
      (async () => {
        if (s.isTriatomic) {
          const posArrays = get3AtomPositions().map(p => [p.x, p.y, p.z]);
          await resampleTriatomicOrbitalAsync(posArrays);
          orientTriatomicDynGroup(get3AtomPositions(), s.currentBondOrbital.bondForming.triatomic);
        } else {
          await resampleDynOrbitalAsync(SIM_STATE.R);
          orientDynGroup();
        }
        hideProgress();
      })();
    } else {
      // Start / resume
      const impact = getImpactParam(dynImpactSlider);
      const speed = getApproachSpeed(dynSpeedSlider);
      if (s.isTriatomic) {
        if (SIM3_STATE.settled || SIM3_STATE.frameCount === 0) {
          reset3Simulation(s.currentBondOrbital.bondForming.triatomic, impact, speed);
          clear3Trails(scene);
          init3Trails(scene);
          setState({ lastSampledR3: null, lastSampledOrientations3: null, dynFinalRendered: false });
        }
        SIM3_STATE.running = true;
      } else {
        if (SIM_STATE.settled || SIM_STATE.frameCount === 0) {
          resetSimulation(impact, speed);
          clearTrails(scene);
          initTrails(scene);
          setState({ lastSampledR: -1, lastSampledOrientations: null, dynFinalRendered: false });
        }
        SIM_STATE.running = true;
      }
      setState({ isDynamics: true });
      controls.autoRotate = false;
      dynPlayBtn.textContent = '\u23F8 Pause';
      sepSlider.disabled = true;

      const camDist = s.isTriatomic ? 24 : 18;
      const dir = camera.position.clone().normalize();
      if (dir.length() < 0.01) dir.set(0, 1, 1).normalize();
      camera.position.copy(dir.multiplyScalar(camDist));
      controls.update();
    }
  });

  dynResetBtn.addEventListener('click', () => {
    const s = getState();
    if (s.isTriatomic) SIM3_STATE.running = false;
    else SIM_STATE.running = false;
    setState({ isDynamics: false, dynFinalRendered: false });
    controls.autoRotate = true;
    dynPlayBtn.textContent = '\u25B6 Play';
    sepSlider.disabled = false;

    if (s.isTriatomic) {
      clear3Trails(scene);
      clearDynGroup();
      dynInfo.textContent = '';
      const triConfig = s.currentBondOrbital.bondForming.triatomic;
      const eqPos = triatomicEquilibrium(triConfig);
      (async () => {
        const generated = s.currentBondOrbital.bondForming.generate3(eqPos);
        await loadOrbitalAsync(generated, undefined, undefined, true);
        showTriatomicContext(eqPos, triConfig.bonds);
        const eqDists = triConfig.bonds.map(([bi, bj]) => dist3(eqPos[bi], eqPos[bj]));
        setTriatomicBondOpacity(eqDists, triConfig.morse);
      })();
    } else {
      clearTrails(scene);
      clearDynGroup();
      dynInfo.textContent = '';
      const currentR = sliderToR(parseInt(sepSlider.value));
      setState({ currentR });
      updateSepDisplay(currentR, sepDisplay);
      renderBondAtRAsync(currentR);
    }
  });

  // ---- Separation slider events ----
  sepSlider.addEventListener('input', () => {
    const s = getState();
    if (s.isDynamics) return;
    setState({ isDragging: true });
    const currentR = sliderToR(parseInt(sepSlider.value));
    setState({ currentR });
    updateSepDisplay(currentR, sepDisplay);
    renderBondAtR(currentR, true);
  });

  sepSlider.addEventListener('pointerup', () => {
    const s = getState();
    if (s.isDynamics) return;
    setState({ isDragging: false });
    renderBondAtRAsync(s.currentR);
  });

  sepSlider.addEventListener('change', () => {
    const s = getState();
    if (s.isDynamics) return;
    if (!s.isDragging) {
      const currentR = sliderToR(parseInt(sepSlider.value));
      setState({ currentR });
      updateSepDisplay(currentR, sepDisplay);
      renderBondAtRAsync(currentR);
    }
  });
}

// ---- Dynamics animation tick (called from main animate loop) ----

export function tickDynamics() {
  const s = getState();

  if (s.isDynamics && s.isTriatomic && SIM3_STATE.running) {
    step3Simulation();
    record3TrailPoint();

    const positions = get3AtomPositions();
    const posArrays = positions.map(p => [p.x, p.y, p.z]);
    const triConfig = s.currentBondOrbital.bondForming.triatomic;
    const bondDists = triConfig.bonds.map(([bi, bj]) => positions[bi].distanceTo(positions[bj]));

    const currentOrientations3 = get3AtomOrientations();
    const maxDelta = s.lastSampledR3
      ? Math.max(...bondDists.map((d, i) => Math.abs(d - s.lastSampledR3[i])))
      : Infinity;
    const needResample3 = maxDelta > 0.2
      || orientationChanged(currentOrientations3, s.lastSampledOrientations3);
    if (needResample3 && !s.dynFinalRendered) {
      resampleTriatomicOrbital(posArrays, true);
      setState({ lastSampledR3: [...bondDists] });
    }

    orientTriatomicDynGroup(positions, triConfig);
    showTriatomicContext(positions, triConfig.bonds);
    setTriatomicBondOpacity(bondDists, triConfig.morse);
    updateDyn3Info(dynInfo);

    if (SIM3_STATE.settled && !s.dynFinalRendered) {
      setState({ dynFinalRendered: true });
      SIM3_STATE.running = false;
      controls.autoRotate = true;
      dynPlayBtn.textContent = '\u25B6 Play';
      (async () => {
        await resampleTriatomicOrbitalAsync(posArrays);
        orientTriatomicDynGroup(positions, triConfig);
        hideProgress();
      })();
    }
  } else if (s.isDynamics && !s.isTriatomic && SIM_STATE.running) {
    stepSimulation();
    recordTrailPoint();

    const R = SIM_STATE.R;

    const currentOrientations = getAtomOrientations();
    const needResample = s.lastSampledR < 0
      || Math.abs(R - s.lastSampledR) > 0.15
      || orientationChanged(currentOrientations, s.lastSampledOrientations);
    if (needResample && !s.dynFinalRendered) {
      resampleDynOrbital(R, true);
    }

    orientDynGroup();

    const { a, b } = getAtomPositions();
    showBondFormingContextAtPositions(a, b);
    setBondCylinderOpacity(R);

    updateSepDisplay(R, sepDisplay);
    updateDynInfo(dynInfo);

    const { R_EQ: rEq, R_MAX: rMax } = getSliderParams_export();
    const clampedR = Math.max(rEq, Math.min(rMax, R));
    sepSlider.value = rToSlider(clampedR);

    if (SIM_STATE.settled && !s.dynFinalRendered) {
      setState({ dynFinalRendered: true });
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
}

// ---- Bond-forming orbital loading ----

export async function loadBondFormingOrbital(orbital) {
  const bf = orbital.bondForming;

  if (bf.triatomic) {
    const triConfig = bf.triatomic;
    setContextMode(3, triConfig.bonds.map(b => b[2] || 1));
    setContextAtomStyle(triConfig.atoms);

    setState({ isTriatomic: true });
    document.getElementById('separation-wrapper').classList.add('dropdown-hidden');
    reset3Simulation(triConfig, 0.1, 1.0);

    const eqPos = triatomicEquilibrium(triConfig);
    const generated = bf.generate3(eqPos);
    await loadOrbitalAsync(generated, undefined, undefined, true);
    showTriatomicContext(eqPos, triConfig.bonds);
    const eqDists = triConfig.bonds.map(([bi, bj]) => dist3(eqPos[bi], eqPos[bj]));
    setTriatomicBondOpacity(eqDists, triConfig.morse);
  } else {
    setActiveBondConfig(bf.molecule);
    setContextMode(2, [BOND_FORMING_CONFIG.bondOrder]);
    setContextAtomStyle(BOND_FORMING_CONFIG.elements);

    setState({ isTriatomic: false });
    document.getElementById('separation-wrapper').classList.remove('dropdown-hidden');

    const currentR = sliderToR(parseInt(sepSlider.value));
    setState({ currentR });
    updateSepDisplay(currentR, sepDisplay);

    await renderBondAtRAsync(currentR);
  }

  // Common
  updateDynImpactDisplay(dynImpactSlider, dynImpactDisplay);
  updateDynSpeedDisplay(dynSpeedSlider, dynSpeedDisplay);
}

export function cleanupDynamicsState() {
  SIM_STATE.running = false;
  SIM3_STATE.running = false;
  setState({ isDynamics: false, dynFinalRendered: false });
  dynPlayBtn.textContent = '\u25B6 Play';
  document.getElementById('sep-slider').disabled = false;
  clearTrails(scene);
  clear3Trails(scene);
  clearDynGroup();
  dynInfo.textContent = '';
}

export { dynWrapper, sepWrapper, clearDynGroup, sliderToR, rToSlider, triatomicEquilibrium };
