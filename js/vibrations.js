// Molecular vibration animation: async frame caching and playback.
// For each molecule, generates vibrational modes from bond topology.
// Pre-caches 24 frames of density isosurfaces + field vis for smooth playback.

import * as THREE from 'three';
import { sampleGridAsync } from './worker-pool.js';
import { computeMultiThresholds } from './grid.js';
import { getLayerMaterials } from './layer-materials.js';
import { buildDisplacedDensitySampler, buildDisplacedOrbital } from './molecules/index.js';
import { scene } from './scene.js';
import { buildFieldVisIntoGroup } from './electric-field.js';
import { computeChargeDensity } from './electrostatic-potential.js';
import { BaseFrameController } from './controllers/base-frame-controller.js';
import { buildMeshesFromData } from './utils/mesh-builder.js';

export { generateVibrationalModes, ATOMIC_MASS, BOND_FORCE_CONSTANTS, SPECTROSCOPIC_DATA } from './vib-mode-generation.js';

const NUM_FRAMES = /Mobi|Android/i.test(navigator.userAgent) ? 12 : 24;

// ---- Vibration Controller ----

export class VibrationController extends BaseFrameController {
  constructor() {
    super();  // Call base constructor
    // Vibration-specific properties
    this.cachedDisplacements = [];
    this.currentMode = null;
    this.mixModes = null; // [{mode, weight, phaseOffset}, ...] for random mix
    this.amplitude = 0.3;
    this.moleculeName = null;
    this.hasFieldVis = false; // whether cached frames include field vis
  }

  setFieldVisVisible(visible) {
    for (const frame of this.frames) {
      if (frame && frame.fieldGroup) frame.fieldGroup.visible = visible;
    }
  }

  setDensityVisible(visible) {
    for (const frame of this.frames) {
      if (frame && frame.densityGroup) frame.densityGroup.visible = visible;
    }
  }

  tickFieldAnimation(dt) {
    for (const frame of this.frames) {
      if (frame && frame.fieldMats) {
        for (const mat of frame.fieldMats) {
          mat.uniforms.uTime.value += dt;
        }
      }
    }
  }

  disposeCache() {
    // Call base class dispose
    super.disposeCache();
    // Clear vibration-specific cached data
    this.cachedDisplacements = [];
  }

  displacementsAtPhase(phase) {
    if (this.mixModes) {
      const numAtoms = this.mixModes[0].mode.displacements.length / 3;
      const result = [];
      for (let i = 0; i < numAtoms; i++) result.push([0, 0, 0]);

      for (const { mode, weight, phaseOffset } of this.mixModes) {
        const scale = this.amplitude * weight * Math.sin(phase + phaseOffset);
        const disp = mode.displacements;
        for (let i = 0; i < numAtoms; i++) {
          result[i][0] += disp[i * 3] * scale;
          result[i][1] += disp[i * 3 + 1] * scale;
          result[i][2] += disp[i * 3 + 2] * scale;
        }
      }
      return result;
    }

    if (!this.currentMode) return null;
    const scale = this.amplitude * Math.sin(phase);
    const disp = this.currentMode.displacements;
    const numAtoms = disp.length / 3;
    const result = [];
    for (let i = 0; i < numAtoms; i++) {
      result.push([
        disp[i * 3] * scale,
        disp[i * 3 + 1] * scale,
        disp[i * 3 + 2] * scale,
      ]);
    }
    return result;
  }

  async buildFrameCache(settings, onFrameReady, onComplete) {
    const gen = ++this.generation;
    const stale = () => gen !== this.generation;

    this.disposeCache();
    this.state = 'building';
    this.framesReady = 0;

    const {
      moleculeName, moIndex, mode, mixModes, amplitude, probability, layers,
      gridSize, halfExtent, colorMode, showFieldVis, atomInfo,
    } = settings;
    const isDensityLike = colorMode === 'density';

    this.moleculeName = moleculeName;
    this.amplitude = amplitude;
    this.hasFieldVis = !!showFieldVis;
    if (mixModes) {
      this.mixModes = mixModes;
      this.currentMode = null;
    } else {
      this.currentMode = mode;
      this.mixModes = null;
    }

    let fieldLayout = null; // captured from frame 0 for consistent arrow/seed positions

    const gs = gridSize;
    const he = halfExtent;
    const BATCH = 4; // frames sampled in parallel per batch

    // Pre-compute all displacements and samplers (cheap, synchronous)
    const frameInfos = [];
    for (let i = 0; i < NUM_FRAMES; i++) {
      const phase = (i / NUM_FRAMES) * 2 * Math.PI;
      const displacements = this.displacementsAtPhase(phase);
      if (!displacements) return;
      this.cachedDisplacements[i] = displacements;
      const sampler = (colorMode === 'orbital' && moIndex !== undefined)
        ? buildDisplacedOrbital(moleculeName, moIndex, displacements)
        : buildDisplacedDensitySampler(moleculeName, displacements);
      frameInfos.push({ phase, displacements, sampler });
    }

    // Process frames in batches: parallel sampling, then sequential mesh building
    for (let batchStart = 0; batchStart < NUM_FRAMES; batchStart += BATCH) {
      if (stale()) return;
      const batchEnd = Math.min(batchStart + BATCH, NUM_FRAMES);

      // Dispatch all samplings in this batch simultaneously
      const sampledData = await Promise.all(
        frameInfos.slice(batchStart, batchEnd).map(fi =>
          fi.sampler ? sampleGridAsync(fi.sampler, gs, he, () => {}) : Promise.resolve(null)
        )
      );
      if (stale()) return;

      // Build meshes for each frame in the batch (main thread, sequential)
      for (let bi = 0; bi < batchEnd - batchStart; bi++) {
        const i = batchStart + bi;
        if (stale()) return;

        const { displacements } = frameInfos[i];
        const data = sampledData[bi];

        const group = new THREE.Group();
        const densityGroup = new THREE.Group();
        group.add(densityGroup);

        if (data) {
          const mats = getLayerMaterials(layers, colorMode);

          if (colorMode === 'charge') {
            const displacedAtomInfo = atomInfo.map((a, ai) => ({
              Z: a.Z,
              x: a.x + displacements[ai][0],
              y: a.y + displacements[ai][1],
              z: a.z + displacements[ai][2],
            }));
            const chargeData = await computeChargeDensity(displacedAtomInfo, data, gs, he, null);
            if (stale()) return;

            const N3 = chargeData.length;
            const posData = new Float32Array(N3);
            const negCharge = new Float32Array(N3);
            for (let j = 0; j < N3; j++) {
              if (chargeData[j] > 0) posData[j] = chargeData[j];
              else if (chargeData[j] < 0) negCharge[j] = -chargeData[j];
            }
            buildMeshesFromData({ data: posData, halfExtent: he, gridSize: gs,
              thresholds: computeMultiThresholds(posData, probability, layers, he, gs), materials: mats.pos, parent: densityGroup, layers });
            buildMeshesFromData({ data: negCharge, halfExtent: he, gridSize: gs,
              thresholds: computeMultiThresholds(negCharge, probability, layers, he, gs), materials: mats.neg, parent: densityGroup, layers });
          } else {
            const thresholds = computeMultiThresholds(data, probability, layers, he, gs);
            buildMeshesFromData({ data, halfExtent: he, gridSize: gs, thresholds, materials: mats.pos, parent: densityGroup, layers });

            if (!isDensityLike) {
              const negData = new Float32Array(data.length);
              for (let j = 0; j < data.length; j++) negData[j] = -data[j];
              buildMeshesFromData({ data: negData, halfExtent: he, gridSize: gs, thresholds, materials: mats.neg, parent: densityGroup, layers });
            }
          }
        }

        // Field vis (synchronous, uses fieldLayout from frame 0)
        let fieldSubGroup = null;
        let fieldMats = [];
        if (showFieldVis && data) {
          fieldSubGroup = new THREE.Group();
          let displacedAtomInfo = null;
          if (atomInfo) {
            displacedAtomInfo = atomInfo.map((a, ai) => ({
              Z: a.Z,
              x: a.x + displacements[ai][0],
              y: a.y + displacements[ai][1],
              z: a.z + displacements[ai][2],
            }));
          }
          const result = buildFieldVisIntoGroup(fieldSubGroup,
            [{ data, halfExtent: he, gridSize: gs }],
            probability, displacedAtomInfo, fieldLayout);
          if (result) {
            if (!fieldLayout && result.layout) fieldLayout = result.layout;
            fieldMats = result.materials || [];
          }
          group.add(fieldSubGroup);
        }

        if (stale()) {
          group.traverse(child => { if (child.geometry) child.geometry.dispose(); });
          return;
        }

        scene.add(group);
        group.visible = false;

        this.frames[i] = { group, densityGroup, fieldGroup: fieldSubGroup, fieldMats, caches: data ? [{ data, halfExtent: he, gridSize: gs }] : [] };
        this.framesReady = i + 1;
        if (onFrameReady) onFrameReady(i, NUM_FRAMES);
      }

      // Yield to main thread between batches
      await new Promise(r => setTimeout(r, 0));
    }

    if (!stale()) {
      this.state = 'ready';
      if (onComplete) onComplete();
    }
  }

  // Called each animation frame — swap visible groups.
  // Returns true every frame when playing so atom positions update at 60fps.
  tick(dt) {
    if (this.state !== 'playing' || this.frames.length < NUM_FRAMES) return false;

    this.phase += this.speed * dt;
    if (this.phase >= 2 * Math.PI) this.phase -= 2 * Math.PI;
    if (this.phase < 0) this.phase += 2 * Math.PI;

    const frameIdx = Math.floor((this.phase / (2 * Math.PI)) * NUM_FRAMES) % NUM_FRAMES;

    if (frameIdx !== this.lastFrameIdx) {
      if (this.lastFrameIdx >= 0 && this.frames[this.lastFrameIdx]) {
        this.frames[this.lastFrameIdx].group.visible = false;
      }
      if (this.frames[frameIdx]) {
        this.frames[frameIdx].group.visible = true;
      }
      this.lastFrameIdx = frameIdx;
    }
    return true; // always true for smooth cubic atom interpolation
  }

  // Catmull-Rom interpolation of cached per-frame displacements (cyclic).
  // Gives smooth cubic atom positions between keyframes, wrapping at ends.
  interpolatedDisplacements() {
    if (!this.cachedDisplacements || this.cachedDisplacements.length < NUM_FRAMES) {
      return this.displacementsAtPhase(this.phase);
    }

    const N = NUM_FRAMES;
    const raw = (this.phase / (2 * Math.PI)) * N;
    const i1 = Math.floor(raw) % N;
    const t = raw - Math.floor(raw);

    // Four cyclic keyframe indices
    const i0 = (i1 - 1 + N) % N;
    const i2 = (i1 + 1) % N;
    const i3 = (i1 + 2) % N;

    const d0 = this.cachedDisplacements[i0];
    const d1 = this.cachedDisplacements[i1];
    const d2 = this.cachedDisplacements[i2];
    const d3 = this.cachedDisplacements[i3];

    const numAtoms = d1.length;
    const result = [];
    const t2 = t * t, t3 = t2 * t;
    for (let a = 0; a < numAtoms; a++) {
      const r = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        const p0 = d0[a][c], p1 = d1[a][c], p2 = d2[a][c], p3 = d3[a][c];
        r[c] = 0.5 * ((2 * p1) + (-p0 + p2) * t +
          (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
          (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      }
      result.push(r);
    }
    return result;
  }
}
