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

export { generateVibrationalModes, ATOMIC_MASS, BOND_FORCE_CONSTANTS } from './vib-mode-generation.js';

const NUM_FRAMES = 24;

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

    let fieldLayout = null; // captured from frame 0 for consistent positions

    for (let i = 0; i < NUM_FRAMES; i++) {
      if (stale()) return;

      const phase = (i / NUM_FRAMES) * 2 * Math.PI;

      // Compute displaced positions (single mode or mix) and cache for interpolation
      const displacements = this.displacementsAtPhase(phase);
      if (!displacements) return;
      this.cachedDisplacements[i] = displacements;

      // Build displaced sampler: use single-MO wavefunction for orbital mode,
      // density for electron density / charge / ESP / ELF modes
      const sampler = (colorMode === 'orbital' && moIndex !== undefined)
        ? buildDisplacedOrbital(moleculeName, moIndex, displacements)
        : buildDisplacedDensitySampler(moleculeName, displacements);
      if (!sampler || stale()) return;

      // Sample grid (main thread chunked for customSample)
      const gs = gridSize;
      const he = halfExtent;
      const data = await sampleGridAsync(sampler, gs, he, () => {});
      if (!data || stale()) return;

      // Build marching cubes layers
      const group = new THREE.Group();
      const densityGroup = new THREE.Group();
      group.add(densityGroup);
      const mats = getLayerMaterials(layers, colorMode);

      if (colorMode === 'charge') {
        // Compute charge density with displaced atom positions
        const displacedAtomInfo = atomInfo.map((a, ai) => ({
          Z: a.Z,
          x: a.x + displacements[ai][0],
          y: a.y + displacements[ai][1],
          z: a.z + displacements[ai][2],
        }));
        const chargeData = await computeChargeDensity(displacedAtomInfo, data, gs, he, null);
        if (stale()) return;

        // Split positive/negative with independent thresholds
        const N3 = chargeData.length;
        const posData = new Float32Array(N3);
        const negCharge = new Float32Array(N3);
        for (let j = 0; j < N3; j++) {
          if (chargeData[j] > 0) posData[j] = chargeData[j];
          else if (chargeData[j] < 0) negCharge[j] = -chargeData[j];
        }
        const posThresholds = computeMultiThresholds(posData, probability, layers, he, gs);
        const negThresholds = computeMultiThresholds(negCharge, probability, layers, he, gs);
        buildMeshesFromData({
          data: posData,
          halfExtent: he,
          gridSize: gs,
          thresholds: posThresholds,
          materials: mats.pos,
          parent: densityGroup,
          layers: layers,
        });
        buildMeshesFromData({
          data: negCharge,
          halfExtent: he,
          gridSize: gs,
          thresholds: negThresholds,
          materials: mats.neg,
          parent: densityGroup,
          layers: layers,
        });
      } else {
        const thresholds = computeMultiThresholds(data, probability, layers, he, gs);
        buildMeshesFromData({
          data: data,
          halfExtent: he,
          gridSize: gs,
          thresholds: thresholds,
          materials: mats.pos,
          parent: densityGroup,
          layers: layers,
        });

        // Render negative side for orbital mode (density/ESP is always positive)
        if (!isDensityLike) {
          const negData = new Float32Array(data.length);
          for (let j = 0; j < data.length; j++) negData[j] = -data[j];
          buildMeshesFromData({
            data: negData,
            halfExtent: he,
            gridSize: gs,
            thresholds: thresholds,
            materials: mats.neg,
            parent: densityGroup,
            layers: layers,
          });
        }
      }

      // Build field vis (arrows/streamlines) into a separate sub-group
      // so visibility can be toggled without rebuilding frames
      let fieldSubGroup = null;
      let fieldMats = [];
      if (showFieldVis) {
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
        group.traverse(child => {
          if (child.geometry) child.geometry.dispose();
        });
        return;
      }

      scene.add(group);
      group.visible = false;

      this.frames[i] = { group, densityGroup, fieldGroup: fieldSubGroup, fieldMats, caches: [{ data, halfExtent: he, gridSize: gs }] };
      this.framesReady = i + 1;

      if (onFrameReady) onFrameReady(i, NUM_FRAMES);

      // Yield to main thread
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
