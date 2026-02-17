// Electron transition animation: superposition states showing emission/absorption dynamics.
// ψ(r,t) = c₁ψ₁e^{-iE₁t} + c₂ψ₂e^{-iE₂t}
// |ψ|² oscillates at frequency ω = (E₂−E₁)/ℏ with interference term 2c₁c₂ψ₁ψ₂cos(ωt)
// Frame-cache pattern identical to VibrationController.

import * as THREE from 'three';
import { evaluateOrbital } from './math.js';
import { sampleGrid, computeMultiThresholds } from './grid.js';
import { getLayerMaterials } from './layer-materials.js';
import { marchingCubes } from './marching-cubes.js';
import { scene } from './scene.js';
import { BaseFrameController } from './controllers/base-frame-controller.js';
import { buildMeshesFromData } from './utils/mesh-builder.js';

const NUM_FRAMES = 48;
const RYDBERG = 13.605693122994; // Rydberg constant in eV
const HC_EV_NM = 1239.84193; // hc in eV·nm

// ---- Predefined transitions ----

export const TRANSITIONS = {
  lyman: [
    { from: '1s', to: '2pz', n1: 1, n2: 2, label: '1s \u2192 2p (Lyman \u03B1)' },
    { from: '1s', to: '3pz', n1: 1, n2: 3, label: '1s \u2192 3p (Lyman \u03B2)' },
    { from: '1s', to: '4pz', n1: 1, n2: 4, label: '1s \u2192 4p (Lyman \u03B3)' },
  ],
  balmer: [
    { from: '2s', to: '3pz', n1: 2, n2: 3, label: '2s \u2192 3p (H\u03B1)' },
    { from: '2pz', to: '3s', n1: 2, n2: 3, label: '2p \u2192 3s (H\u03B1 alt)' },
    { from: '2pz', to: '3dz\u00B2', n1: 2, n2: 3, label: '2p \u2192 3d (H\u03B1 dipole)' },
  ],
  paschen: [
    { from: '3s', to: '4pz', n1: 3, n2: 4, label: '3s \u2192 4p (Paschen \u03B1)' },
    { from: '3pz', to: '4dz\u00B2', n1: 3, n2: 4, label: '3p \u2192 4d (Paschen dipole)' },
    { from: '3dz\u00B2', to: '4fz\u00B3', n1: 3, n2: 4, label: '3d \u2192 4f (Paschen quad)' },
  ],
};

// ---- Wavelength and color utilities ----

export function transitionWavelength(n1, n2) {
  const deltaE = RYDBERG * (1 / (n1 * n1) - 1 / (n2 * n2));
  if (deltaE <= 0) return Infinity;
  return HC_EV_NM / deltaE;
}

export function wavelengthToRGB(nm) {
  if (nm < 380 || nm > 780) {
    return nm < 380 ? new THREE.Color(0.5, 0, 0.5) : new THREE.Color(0.5, 0, 0);
  }

  let r = 0, g = 0, b = 0;
  if (nm < 440) {
    r = -(nm - 440) / 60; b = 1;
  } else if (nm < 490) {
    g = (nm - 440) / 50; b = 1;
  } else if (nm < 510) {
    g = 1; b = -(nm - 510) / 20;
  } else if (nm < 580) {
    r = (nm - 510) / 70; g = 1;
  } else if (nm < 645) {
    r = 1; g = -(nm - 645) / 65;
  } else {
    r = 1;
  }

  let factor = 1;
  if (nm < 420) factor = 0.3 + 0.7 * (nm - 380) / 40;
  else if (nm > 700) factor = 0.3 + 0.7 * (780 - nm) / 80;

  return new THREE.Color(r * factor, g * factor, b * factor);
}

// ---- TransitionController class ----

export class TransitionController extends BaseFrameController {
  constructor() {
    super();  // Call base constructor
    // Transition-specific properties
    this.transition = null;
    this.orbital1 = null;
    this.orbital2 = null;
  }

  async buildFrameCache(settings, onFrameReady, onComplete) {
    const gen = ++this.generation;
    const stale = () => gen !== this.generation;

    this.disposeCache();
    this.state = 'building';
    this.framesReady = 0;

    const {
      orbital1, orbital2, transition, probability, layers,
      gridSize, halfExtent, colorMode,
    } = settings;

    this.transition = transition;
    this.orbital1 = orbital1;
    this.orbital2 = orbital2;

    for (let i = 0; i < NUM_FRAMES; i++) {
      if (stale()) return;

      // Animation sequence:
      // Frames 0-9: Hold initial state (pure initial orbital)
      // Frames 10-39: Very slow smooth transition
      // Frames 40-47: Hold final state (pure final orbital)
      const initialHold = 10;
      const finalHold = 8;
      const transitionFrames = NUM_FRAMES - initialHold - finalHold;
      let t;

      if (i < initialHold) {
        // Hold initial state
        t = 0;
      } else if (i >= NUM_FRAMES - finalHold) {
        // Hold final state
        t = 1;
      } else {
        // Smooth transition with S-curve
        const frameInTransition = i - initialHold;
        const rawT = frameInTransition / transitionFrames;
        t = rawT * rawT * (3 - 2 * rawT);  // S-curve smoothstep
      }

      const c1 = Math.cos(Math.PI * t / 2);
      const c2 = Math.sin(Math.PI * t / 2);

      // ψ(r,t) = c₁·ψ₁(r) + c₂·ψ₂(r)
      const sampler = {
        customSample: (x, y, z) => {
          const psi1 = evaluateOrbital(orbital1, x, y, z);
          const psi2 = evaluateOrbital(orbital2, x, y, z);
          return c1 * psi1 + c2 * psi2;
        }
      };

      const gs = gridSize;
      const he = halfExtent;
      const data = sampleGrid(sampler, gs, he);
      if (!data || stale()) return;

      // Build meshes — exact same pattern as VibrationController
      const group = new THREE.Group();
      const mats = getLayerMaterials(layers, colorMode);

      // computeMultiThresholds(data, probability, numLayers, halfExtent, gridSize)
      const thresholds = computeMultiThresholds(data, probability, layers, he, gs);
      buildMeshesFromData({
        data: data,
        halfExtent: he,
        gridSize: gs,
        thresholds: thresholds,
        materials: mats.pos,
        parent: group,
        layers: layers,
      });

      if (colorMode !== 'density') {
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

      if (stale()) {
        group.traverse(child => { if (child.geometry) child.geometry.dispose(); });
        return;
      }

      scene.add(group);
      group.visible = false;

      this.frames[i] = { group, caches: [{ data, halfExtent: he, gridSize: gs }] };
      this.framesReady = i + 1;

      if (onFrameReady) onFrameReady(i + 1, NUM_FRAMES);

      await new Promise(r => setTimeout(r, 0));
    }

    if (!stale()) {
      this.state = 'ready';
      if (onComplete) onComplete();
    }
  }

}
