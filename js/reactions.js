// Reactions module: molecular reaction trajectories with frame-cache pattern.
// Refactored into 4 focused modules: reaction-configs, nbody-simulator, reaction-rendering, reactions (controller).

import * as THREE from 'three';
import { scene } from './scene.js';
import { evaluateOrbital } from './math.js';
import { sampleGrid, computeMultiThresholds } from './grid.js';
import { buildMeshesFromData } from './utils/mesh-builder.js';
import { getLayerMaterials } from './layer-materials.js';
import { BaseFrameController } from './controllers/base-frame-controller.js';

export { REACTIONS } from './reaction-configs.js';
import { simulateReaction } from './nbody-simulator.js';
import { generateMOs, interpolateKeyframes, buildBallAndStick } from './reaction-rendering.js';

const NUM_FRAMES = 24;

// ================================================================
// ReactionController (frame-cache pattern)
// ================================================================

export class ReactionController extends BaseFrameController {
  constructor() {
    super();  // Call base constructor
    // Reaction-specific properties
    this.speed = 0.3;  // Override base speed
    this.reaction = null;
  }

  scrubTo(t) {
    if (this.frames.length < NUM_FRAMES) return '';
    const frameIdx = Math.min(Math.floor(t * NUM_FRAMES), NUM_FRAMES - 1);

    if (this.lastFrameIdx >= 0 && this.frames[this.lastFrameIdx]) {
      this.frames[this.lastFrameIdx].group.visible = false;
    }
    if (this.frames[frameIdx]) {
      this.frames[frameIdx].group.visible = true;
    }
    this.lastFrameIdx = frameIdx;

    return this.frames[frameIdx] ? this.frames[frameIdx].description : '';
  }

  async buildFrameCache(settings, onFrameReady, onComplete) {
    const gen = ++this.generation;
    const stale = () => gen !== this.generation;

    this.disposeCache();
    this.state = 'building';
    this.reaction = settings.reaction;

    const { reaction, probability, layers, gridSize, halfExtent, colorMode } = settings;

    // Generate physics trajectory
    const impactParam = settings.impactParam ?? reaction.defaultImpact ?? 1.0;
    const speed = settings.speed ?? reaction.defaultSpeed ?? 1.0;
    const angle = settings.angle ?? 0;
    const trajectory = simulateReaction(reaction, impactParam, speed, angle);

    // Use trajectory keyframes for interpolation
    const effectiveReaction = { ...reaction, keyframes: trajectory };

    for (let i = 0; i < NUM_FRAMES; i++) {
      if (stale()) return;

      const t = i / (NUM_FRAMES - 1);
      const frame = interpolateKeyframes(effectiveReaction, t);

      // Build density sampler from interpolated geometry
      const mos = generateMOs(frame.atoms, frame.bonds);
      const sampler = {
        customSample: (x, y, z) => {
          let rho = 0;
          for (const mo of mos) {
            const psi = evaluateOrbital(mo, x, y, z);
            rho += 2 * psi * psi;
          }
          return Math.sqrt(Math.max(0, rho));
        }
      };

      const gs = gridSize;
      const he = halfExtent;
      const data = sampleGrid(sampler, gs, he);
      if (!data || stale()) return;

      // Build meshes (same pattern as TransitionController)
      const group = new THREE.Group();
      const mats = getLayerMaterials(layers, colorMode);

      const isDensityLike = colorMode === 'density';
      const thresholds = computeMultiThresholds(data, isDensityLike ? 0.95 : 0.9, layers, he, gs);

      buildMeshesFromData({
        data: data,
        halfExtent: he,
        gridSize: gs,
        thresholds: thresholds,
        materials: mats.pos,
        parent: group,
        layers: layers,
      });

      if (!isDensityLike) {
        const negData = new Float32Array(data.length);
        for (let j = 0; j < data.length; j++) negData[j] = -data[j];
        buildMeshesFromData({
          data: negData,
          halfExtent: he,
          gridSize: gs,
          thresholds: thresholds,
          materials: mats.neg,
          parent: group,
          layers: layers,
        });
      }

      // Add ball-and-stick model to each frame
      buildBallAndStick(group, frame.atoms, frame.bonds);

      if (stale()) {
        group.traverse(child => { if (child.geometry) child.geometry.dispose(); });
        return;
      }

      scene.add(group);
      group.visible = false;

      this.frames[i] = { group, description: frame.description };
      this.framesReady = i + 1;

      if (onFrameReady) onFrameReady(i + 1, NUM_FRAMES);
      await new Promise(r => setTimeout(r, 0));
    }

    if (!stale()) {
      this.state = 'ready';
      if (onComplete) onComplete();
    }
  }

  tick(dt) {
    if (this.state !== 'playing' || this.frames.length < NUM_FRAMES) return false;

    this.phase += this.speed * dt;
    // Bounce between 0 and 1
    if (this.phase > 1) { this.phase = 2 - this.phase; this.speed = -Math.abs(this.speed); }
    if (this.phase < 0) { this.phase = -this.phase; this.speed = Math.abs(this.speed); }

    const frameIdx = Math.min(Math.floor(this.phase * NUM_FRAMES), NUM_FRAMES - 1);

    if (frameIdx !== this.lastFrameIdx) {
      if (this.lastFrameIdx >= 0 && this.frames[this.lastFrameIdx]) {
        this.frames[this.lastFrameIdx].group.visible = false;
      }
      if (this.frames[frameIdx]) {
        this.frames[frameIdx].group.visible = true;
      }
      this.lastFrameIdx = frameIdx;
      return true;
    }
    return false;
  }
}
