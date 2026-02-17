// Vector field visualization: arrow glyphs + streamline tubes with direction cones.
// Refactored into 4 focused modules: gradient-computation, arrow-rendering, streamline-rendering, electric-field (cache & API).

import * as THREE from 'three';
import {
  computeGradient, computeMagneticField, computeFilterBounds, computeMagnitudeBounds, trilinearInterpScalar
} from './gradient-computation.js';
import {
  createArrowMeshes, collectArrowCandidates, recomputeArrowVectors
} from './arrow-rendering.js';
import {
  integrateStreamline, createStreamlineMesh, createDirectionCones, collectStreamlineSeeds, streamlineMaterials
} from './streamline-rendering.js';

export { computeGradient, trilinearInterpScalar } from './gradient-computation.js';

let fieldGroup = null;
let fieldMeshes = [];
let currentMode = 'both';          // 'arrows' | 'streamlines' | 'both'
let currentSource = 'gradient';    // 'gradient' | 'electrostatic' | 'magnetic'
let buildGeneration = 0;
let currentCacheKey = null;

// ---- Ring-buffer cache ----

const CACHE_SIZE = 8;
const cache = [];

function cacheFingerprint(caches, probability) {
  let fp = `p${probability.toFixed(3)}m${currentMode}s${currentSource}`;
  for (const c of caches) {
    const d = c.data;
    const n = d.length;
    fp += `|gs${c.gridSize}he${c.halfExtent.toFixed(2)}`;
    const step = Math.max(1, (n / 16) | 0);
    for (let i = 0; i < n; i += step) fp += ',' + d[i].toFixed(6);
  }
  return fp;
}

function cacheGet(key) {
  const idx = cache.findIndex(e => e.key === key);
  if (idx < 0) return null;
  const entry = cache.splice(idx, 1)[0];
  cache.push(entry);
  return entry;
}

function cachePut(key, group, meshes) {
  while (cache.length >= CACHE_SIZE) {
    const old = cache.shift();
    disposeEntry(old);
  }
  cache.push({ key, group, meshes });
}

function disposeEntry(entry) {
  if (!entry) return;
  for (const m of entry.meshes) {
    if (m.parent) m.parent.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      // Remove from tracked materials if it's a streamline shader
      const idx = streamlineMaterials.indexOf(m.material);
      if (idx >= 0) streamlineMaterials.splice(idx, 1);

      if (Array.isArray(m.material)) m.material.forEach(mt => mt.dispose());
      else m.material.dispose();
    }
  }
  if (entry.group && entry.group.parent) entry.group.parent.remove(entry.group);
}

function yield_() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// ---- Standalone field vis builder (no module state, for vibration frames) ----
// When refLayout is null, computes positions from scratch and returns the layout.
// When refLayout is provided, reuses its arrow/seed positions (no flickering).

export function buildFieldVisIntoGroup(group, caches, probability, atomInfo, refLayout) {
  if (!caches || caches.length === 0) return null;

  const doArrows = currentMode === 'arrows' || currentMode === 'both';
  const doStreamlines = currentMode === 'streamlines' || currentMode === 'both';
  const isElectrostatic = currentSource === 'electrostatic';
  const isMagnetic = currentSource === 'magnetic';
  const newLayout = refLayout ? null : {};
  const localMats = [];  // track streamline materials for this group

  for (const c of caches) {
    const gs = c.gridSize;
    const he = c.halfExtent;
    const step = (2 * he) / (gs - 1);

    // Compute vector field for this frame
    let grad;
    if (isMagnetic && atomInfo && atomInfo.length > 0) {
      grad = computeMagneticField(atomInfo, gs, he);
    } else if (isElectrostatic) {
      grad = computeGradient(c.data, gs, he);
      for (let i = 0; i < grad.length; i++) grad[i] = -grad[i];
    } else {
      grad = computeGradient(c.data, gs, he);
    }

    // Compute filter bounds only for reference frame (determines positions)
    let bounds = null, magBounds = null;
    if (!refLayout) {
      const useMagnitudeBounds = isElectrostatic || isMagnetic;
      if (isMagnetic) {
        magBounds = computeMagnitudeBounds(grad, gs, 0.001, 0.15);
      } else if (isElectrostatic) {
        magBounds = computeMagnitudeBounds(grad, gs);
      } else {
        bounds = computeFilterBounds(c.data, he, gs, probability || 0.8);
      }
    }

    if (doArrows) {
      let arrows, maxMag, stride;
      if (refLayout) {
        ({ arrows, maxMag } = recomputeArrowVectors(refLayout.arrowPositions, grad, gs, he, step));
        stride = refLayout.arrowStride;
      } else {
        const useMagnitudeBounds = isElectrostatic || isMagnetic;
        ({ arrows, maxMag, stride } = collectArrowCandidates(
          grad, c.data, gs, he, step, bounds, useMagnitudeBounds, magBounds));
        newLayout.arrowPositions = arrows.map(a => ({ x: a.x, y: a.y, z: a.z }));
        newLayout.arrowStride = stride;
      }
      createArrowMeshes(arrows, maxMag, step, stride, group, null, gs, he);
    }

    if (doStreamlines) {
      let seeds;
      if (refLayout) {
        seeds = refLayout.seedPositions;
      } else {
        const useMagnitudeBounds = isElectrostatic || isMagnetic;
        seeds = collectStreamlineSeeds(
          grad, c.data, gs, he, step, bounds, useMagnitudeBounds, magBounds);
        newLayout.seedPositions = seeds.map(s => ({ x: s.x, y: s.y, z: s.z }));
      }

      const dt = step * 0.8;
      const maxSteps = 200;
      const coneDatas = [];

      for (let j = 0; j < seeds.length; j++) {
        const s = seeds[j];
        const fwd = integrateStreamline(grad, gs, he, step, s.x, s.y, s.z, maxSteps, dt, 1);
        const bwd = integrateStreamline(grad, gs, he, step, s.x, s.y, s.z, maxSteps, dt, -1);
        bwd.reverse();
        const allPts = bwd.concat(fwd.slice(1));
        createStreamlineMesh(allPts, group, coneDatas, null, gs, he, localMats);
      }

      createDirectionCones(coneDatas, group, false);
    }
  }

  return { layout: newLayout, materials: localMats };
}

// ---- Public API ----

export async function buildFieldVisAsync(caches, halfExtent, gridSize, parent, probability, onProgress, atomInfo, potentialGrid) {
  detachFieldVis();
  if (!caches || caches.length === 0) return;

  const key = cacheFingerprint(caches, probability);

  const hit = cacheGet(key);
  if (hit) {
    fieldGroup = hit.group;
    fieldMeshes = hit.meshes;
    currentCacheKey = key;
    parent.add(fieldGroup);
    fieldGroup.visible = true;
    if (onProgress) onProgress(1);
    return;
  }

  const gen = ++buildGeneration;
  const stale = () => gen !== buildGeneration;

  fieldGroup = new THREE.Group();
  fieldMeshes = [];
  currentCacheKey = key;
  parent.add(fieldGroup);

  const doArrows = currentMode === 'arrows' || currentMode === 'both';
  const doStreamlines = currentMode === 'streamlines' || currentMode === 'both';
  const isElectrostatic = currentSource === 'electrostatic';
  const isMagnetic = currentSource === 'magnetic';

  const arrowWeight = doArrows ? 0.25 : 0;
  const streamWeight = doStreamlines ? 0.6 : 0;
  const totalWeight = 0.15 + arrowWeight + streamWeight;
  function report(p) { if (onProgress) onProgress(Math.min(1, p / totalWeight)); }

  for (let ci = 0; ci < caches.length; ci++) {
    const c = caches[ci];
    const gs = gridSize || c.gridSize;
    const he = c.halfExtent;
    const step = (2 * he) / (gs - 1);

    if (onProgress) onProgress(0);
    await yield_();
    if (stale()) return;

    // Phase 1: Compute vector field
    let grad, bounds = null, magBounds = null;
    const useMagnitudeBounds = isElectrostatic || isMagnetic;

    if (isMagnetic && atomInfo && atomInfo.length > 0) {
      grad = computeMagneticField(atomInfo, gs, he);
      magBounds = computeMagnitudeBounds(grad, gs, 0.001, 0.15);
    } else if (isElectrostatic) {
      // Electron cloud field: −∇ρ (negative gradient of electron density)
      grad = computeGradient(c.data, gs, he);
      for (let i = 0; i < grad.length; i++) grad[i] = -grad[i];
      magBounds = computeMagnitudeBounds(grad, gs);
    } else {
      grad = computeGradient(c.data, gs, he);
      bounds = computeFilterBounds(c.data, he, gs, probability || 0.8);
    }

    report(0.15);
    await yield_();
    if (stale()) return;

    // Phase 2: Arrows
    if (doArrows) {
      const { arrows, maxMag, stride } = collectArrowCandidates(
        grad, c.data, gs, he, step, bounds, useMagnitudeBounds, magBounds);

      await yield_();
      if (stale()) return;

      const arrowMeshes = createArrowMeshes(arrows, maxMag, step, stride, fieldGroup,
        potentialGrid, gs, he);
      if (arrowMeshes) fieldMeshes.push(...arrowMeshes);
      report(0.15 + arrowWeight);
      await yield_();
      if (stale()) return;
    }

    // Phase 3: Streamlines
    if (doStreamlines) {
      const seeds = collectStreamlineSeeds(
        grad, c.data, gs, he, step, bounds, useMagnitudeBounds, magBounds);

      const dt = step * 0.8;
      const maxSteps = 200;
      const BATCH = 10;
      const coneDatas = [];
      const usePotColor = !!(potentialGrid && gs && he);

      for (let si = 0; si < seeds.length; si += BATCH) {
        if (stale()) return;
        const end = Math.min(si + BATCH, seeds.length);

        for (let j = si; j < end; j++) {
          const s = seeds[j];
          const fwd = integrateStreamline(grad, gs, he, step, s.x, s.y, s.z, maxSteps, dt, 1);
          const bwd = integrateStreamline(grad, gs, he, step, s.x, s.y, s.z, maxSteps, dt, -1);

          bwd.reverse();
          const allPts = bwd.concat(fwd.slice(1));
          const mesh = createStreamlineMesh(allPts, fieldGroup, coneDatas,
            potentialGrid, gs, he);
          if (mesh) fieldMeshes.push(mesh);
        }

        report(0.15 + arrowWeight + streamWeight * (end / seeds.length));
        await yield_();
      }

      if (stale() || !fieldGroup) return;
      const coneMesh = createDirectionCones(coneDatas, fieldGroup, usePotColor);
      if (coneMesh) fieldMeshes.push(coneMesh);
    }
  }

  if (onProgress) onProgress(1);

  if (!stale() && fieldGroup) {
    cachePut(key, fieldGroup, fieldMeshes);
  }
}

function detachFieldVis() {
  buildGeneration++;
  if (fieldGroup && fieldGroup.parent) fieldGroup.parent.remove(fieldGroup);
  fieldGroup = null;
  fieldMeshes = [];
  currentCacheKey = null;
  streamlineMaterials.length = 0;
}

export function clearFieldVis() { detachFieldVis(); }

export function purgeFieldCache() {
  detachFieldVis();
  for (const entry of cache) disposeEntry(entry);
  cache.length = 0;
}

export function setFieldVisVisible(visible) {
  if (fieldGroup) fieldGroup.visible = visible;
}

export function hasFieldGroup() { return fieldGroup != null; }

export function setFieldMode(mode) { currentMode = mode; }
export function setFieldSource(source) { currentSource = source; }
export function getFieldSource() { return currentSource; }

// ---- QED field oscillation support ----

let fieldOscillationEnabled = false;
let fieldOscillationOmega = 0;

export function setFieldOscillation(enabled, omega = 1.0) {
  fieldOscillationEnabled = enabled;
  fieldOscillationOmega = omega;
  if (!enabled) {
    // Restore default opacity on all tracked materials
    for (const mat of streamlineMaterials) {
      if (mat.uniforms.uOpacity) mat.uniforms.uOpacity.value = 0.28;
    }
  }
}

// Called from main.js every frame — advances streamline flow animation only
export function tickFieldAnimation(dt) {
  for (const mat of streamlineMaterials) {
    mat.uniforms.uTime.value += dt;
  }
}

// Called from TransitionController.tick() — modulates opacity for QED coupling,
// without re-ticking uTime (which main.js already handles)
export function modulateFieldOpacity(oscillationTime, omega, emAmplitude = 1.0) {
  if (!fieldOscillationEnabled) return;
  const oscillation = Math.cos(omega * oscillationTime);
  const opacityScale = 0.5 + 0.5 * oscillation;
  for (const mat of streamlineMaterials) {
    if (mat.uniforms.uOpacity) {
      mat.uniforms.uOpacity.value = 0.28 * opacityScale * emAmplitude;
    }
  }
}
