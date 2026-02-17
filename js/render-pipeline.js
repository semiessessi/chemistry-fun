// Render pipeline: grid sampling, isosurface construction, and field visualization.
// Extracted from main.js for modularity.

import * as THREE from 'three';
import { sampleGrid, computeThreshold, computeMultiThresholds } from './grid.js';
import { sampleGridAsync, renderLayersAsync, cancelCompute } from './worker-pool.js';
import { getLayerMaterials, updateLegend, applyOpacityScale } from './layer-materials.js';
import { marchingCubes } from './marching-cubes.js';
import { scene, camera, controls, matPositive, matNegative, updateGridExtent } from './scene.js';
import { buildFieldVisAsync, clearFieldVis, setFieldVisVisible, getFieldSource } from './electric-field.js';

// ---- Shared state (set by main.js via init) ----

let getState = null;   // () => { currentCaches, currentProbability, currentLayers, ... }
let setState = null;   // (patch) => void

export function initRenderPipeline(getter, setter) {
  getState = getter;
  setState = setter;
}

// ---- Progress UI ----

const computingEl = document.getElementById('computing');
const progressLabel = document.getElementById('progress-label');
const progressFill = document.getElementById('progress-fill');

export function showProgress(label, fraction) {
  computingEl.style.display = 'block';
  progressLabel.textContent = label;
  progressFill.style.width = (fraction * 100) + '%';
}

export function hideProgress() {
  computingEl.style.display = 'none';
  progressFill.style.width = '0%';
}

// ---- Adaptive grid ----

export function adaptiveGrid(halfExtent, lowRes, hiRes) {
  const targetStep = lowRes ? 0.7 : hiRes ? 0.30 : 0.45;  // hiRes: 0.34 → 0.30 for finer detail
  let gs = Math.round(2 * halfExtent / targetStep) + 1;
  if (gs % 2 === 0) gs++;

  // Size-based minimums: small molecules (halfExtent < 15) get higher resolution
  const min = lowRes ? 33 :
              hiRes ? 65 :
              halfExtent < 15 ? 65 :  // Small molecules like H₂, NH₃, H₂O
              57;

  const max = lowRes ? 57 : hiRes ? 129 : 109;
  return Math.max(min, Math.min(max, gs));
}

// ---- Geometry construction ----

export function buildGeometry(data, halfExtent, threshold, gridSize) {
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

// ---- Field visualization rebuild ----

export async function rebuildFieldVis(targetParent, atomInfoFn, potentialGrid) {
  const s = getState();
  if (!s.showFieldVis || s.currentCaches.length === 0) return;
  const parent = targetParent || scene;
  const source = getFieldSource();
  const label = source === 'electrostatic' ? 'Building electron field...'
    : source === 'magnetic' ? 'Building B-field...' : 'Building gradient...';
  const atomInfo = source === 'magnetic' ? atomInfoFn() : null;
  showProgress(label, 0);
  await buildFieldVisAsync(s.currentCaches, null, null, parent, s.currentProbability,
    (frac) => showProgress(label, frac), atomInfo, potentialGrid || null);
  hideProgress();
  // Re-check current state (may have changed during async build)
  if (getState().vibStaticMeshesHidden) setFieldVisVisible(false);
}

// ---- Synchronous render from caches ----

export function renderFromCaches(probability, gridSize, targetParent, numLayers) {
  const s = getState();
  clearCurrentMeshes(s);
  clearFieldVis();
  const parent = targetParent || scene;
  const layers = numLayers || s.currentLayers;
  const colorMode = s.getColorMode();
  const meshes = [];

  for (const cache of s.currentCaches) {
    const gs = gridSize || cache.gridSize;

    if (layers === 1) {
      const threshold = computeThreshold(cache.data, probability, cache.halfExtent, gs);

      const mats1 = colorMode !== 'orbital' ? getLayerMaterials(1, colorMode) : null;
      const posGeo = buildGeometry(cache.data, cache.halfExtent, threshold, gs);
      if (posGeo) {
        const mesh = new THREE.Mesh(posGeo, mats1 ? mats1.pos[0] : matPositive);
        parent.add(mesh);
        meshes.push(mesh);
      }

      const negData = new Float32Array(cache.data.length);
      for (let j = 0; j < cache.data.length; j++) negData[j] = -cache.data[j];
      const negGeo = buildGeometry(negData, cache.halfExtent, threshold, gs);
      if (negGeo) {
        const mesh = new THREE.Mesh(negGeo, mats1 ? mats1.neg[0] : matNegative);
        parent.add(mesh);
        meshes.push(mesh);
      }
    } else {
      const thresholds = computeMultiThresholds(cache.data, probability, layers, cache.halfExtent, gs);
      const negData = new Float32Array(cache.data.length);
      for (let j = 0; j < cache.data.length; j++) negData[j] = -cache.data[j];
      const mats = getLayerMaterials(layers, colorMode);

      for (let i = 0; i < layers; i++) {
        const posGeo = buildGeometry(cache.data, cache.halfExtent, thresholds[i], gs);
        if (posGeo) {
          const mesh = new THREE.Mesh(posGeo, mats.pos[layers - 1 - i]);
          mesh.renderOrder = i;
          parent.add(mesh);
          meshes.push(mesh);
        }

        const negGeo = buildGeometry(negData, cache.halfExtent, thresholds[i], gs);
        if (negGeo) {
          const mesh = new THREE.Mesh(negGeo, mats.neg[layers - 1 - i]);
          mesh.renderOrder = i;
          parent.add(mesh);
          meshes.push(mesh);
        }
      }
    }
  }

  setState({ currentMeshes: meshes });
  const espOpts = s.isESPotentialMode && s.isESPotentialMode() ? { isESP: true, espMaxValue: probability } : undefined;
  updateLegend(layers, probability, colorMode, espOpts);
  s.updateOrbitalOpacity();
  if (!s.showDensityField) s.applyDensityFieldVisibility();
  rebuildFieldVis(parent !== scene ? parent : undefined, s.getCurrentAtomInfo);
}

// ---- Async render from caches ----

export async function renderFromCachesAsync(probability, gridSize, targetParent, numLayers) {
  const s = getState();
  clearCurrentMeshes(s);
  clearFieldVis();
  const parent = targetParent || scene;
  const layers = numLayers || s.currentLayers;
  const colorMode = s.getColorMode();
  const meshes = [];

  const totalCaches = s.currentCaches.length;
  let cacheIdx = 0;

  const _t0rfc = performance.now();
  for (const cache of s.currentCaches) {
    const gs = gridSize || cache.gridSize;
    const baseProgress = cacheIdx / totalCaches;
    const cacheWeight = 1 / totalCaches;

    const result = await renderLayersAsync(
      cache.data, cache.halfExtent, gs, probability, layers, colorMode === 'density',
      (frac) => showProgress('Rendering...', baseProgress + cacheWeight * frac)
    );

    if (!result) return;
    console.log(`[perf] renderLayersAsync done: ${(performance.now()-_t0rfc).toFixed(0)}ms`);
    const _t1rfc = performance.now();

    const step = (2 * cache.halfExtent) / (gs - 1);
    const he = cache.halfExtent;
    const mats = layers === 1 && colorMode === 'orbital' ? null : getLayerMaterials(layers, colorMode);

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
      if (layers === 1 && !mats) {
        mat = r.side === 'pos' ? matPositive : matNegative;
      } else {
        const matIdx = layers - 1 - r.layer;
        mat = r.side === 'pos' ? mats.pos[matIdx] : mats.neg[matIdx];
      }

      const mesh = new THREE.Mesh(geo, mat);
      if (layers > 1) mesh.renderOrder = r.layer;
      parent.add(mesh);
      meshes.push(mesh);
    }
    console.log(`[perf] geometry build+normals ${result.results.length} meshes: ${(performance.now()-_t1rfc).toFixed(0)}ms`);
    cacheIdx++;
  }

  setState({ currentMeshes: meshes });
  const espOpts = s.isESPotentialMode && s.isESPotentialMode() ? { isESP: true, espMaxValue: probability } : undefined;
  updateLegend(layers, probability, colorMode, espOpts);
  s.updateOrbitalOpacity();
  if (!s.showDensityField) s.applyDensityFieldVisibility();
  rebuildFieldVis(parent !== scene ? parent : undefined, s.getCurrentAtomInfo);
}

// ---- Load orbital (sync + async) ----

export function loadOrbital(orbital, gridSize, targetParent, isBondForming) {
  const s = getState();
  const halfExtent = getHalfExtent(orbital);
  updateGridExtent(halfExtent);
  const gs = gridSize || adaptiveGrid(halfExtent, false, !isBondForming && halfExtent < 28);
  const caches = [];
  const parts = orbital.lobes || [orbital];
  for (const part of parts) {
    const data = sampleGrid(part, gs, halfExtent);
    caches.push({ data, halfExtent, gridSize: gs });
  }
  setState({ currentCaches: caches });
  renderFromCaches(s.currentProbability, gs, targetParent);

  if (!s.isDragging && !s.isDynamics) {
    const dist = halfExtent * 1.8;
    const dir = camera.position.clone().normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    controls.update();
  }
}

export async function loadOrbitalAsync(orbital, gridSize, targetParent, isBondForming) {
  cancelCompute();
  const _t0loa = performance.now();
  const s = getState();

  // Structure-only placeholder (molecules without MO data): clear old surfaces, position camera.
  if (orbital.noDensity) {
    clearCurrentMeshes(s);
    clearFieldVis();
    setState({ currentCaches: [] });
    const halfExtent = getHalfExtent(orbital);
    updateGridExtent(halfExtent);
    if (!s.isDragging && !s.isDynamics) {
      const dist = halfExtent * 1.8;
      const dir = camera.position.clone().normalize();
      camera.position.copy(dir.multiplyScalar(dist));
      controls.update();
    }
    return;
  }

  const halfExtent = getHalfExtent(orbital);
  updateGridExtent(halfExtent);
  const gs = gridSize || adaptiveGrid(halfExtent, false, !isBondForming && halfExtent < 28);
  const caches = [];
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

    if (!data) return;
    caches.push({ data, halfExtent, gridSize: gs });
  }

  setState({ currentCaches: caches });
  showProgress('Rendering...', 0.7);
  await renderFromCachesAsync(s.currentProbability, gs, targetParent);
  console.log(`[perf] loadOrbitalAsync total: ${(performance.now()-_t0loa).toFixed(0)}ms`);

  hideProgress();

  if (!s.isDragging && !s.isDynamics) {
    const dist = halfExtent * 1.8;
    const dir = camera.position.clone().normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    controls.update();
  }
}

// ---- Helpers ----

export function getHalfExtent(orbital) {
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

function clearCurrentMeshes(s) {
  for (const m of s.currentMeshes) {
    if (m.parent) m.parent.remove(m);
    m.geometry.dispose();
  }
  setState({ currentMeshes: [] });
}

export function clearMeshes() {
  const s = getState();
  clearCurrentMeshes(s);
  clearFieldVis();
}
