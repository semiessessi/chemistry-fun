// Electron transition animation: superposition states showing emission/absorption dynamics.
// ψ(r,t) = c₁ψ₁e^{-iE₁t} + c₂ψ₂e^{-iE₂t}
// |ψ|² oscillates at frequency ω = (E₂−E₁)/ℏ with interference term 2c₁c₂ψ₁ψ₂cos(ωt)
// Frame-cache pattern identical to VibrationController.

import * as THREE from 'three';
import { evaluateOrbital } from './math.js';
import { sampleGrid, computeMultiThresholds } from './grid.js';
import { getLayerMaterials, clearTransitionMaterials, tickTransitionMaterials } from './layer-materials.js';
import { marchingCubes } from './marching-cubes.js';
import { scene } from './scene.js';
import { BaseFrameController } from './controllers/base-frame-controller.js';
import { buildMeshesFromData } from './utils/mesh-builder.js';
import { setFieldOscillation, modulateFieldOpacity } from './electric-field.js';

const NUM_FRAMES = /Mobi|Android/i.test(navigator.userAgent) ? 24 : 48;
const RYDBERG = 13.605693122994; // Rydberg constant in eV
const HC_EV_NM = 1239.84193; // hc in eV·nm
const HBAR_EV_S = 6.582119569e-16;  // ℏ in eV·s

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

// ---- Bohr frequency calculation (QED oscillations) ----

export function computeBohrFrequency(n1, n2) {
  const E1 = -RYDBERG / (n1 * n1);
  const E2 = -RYDBERG / (n2 * n2);
  const deltaE = E2 - E1;
  return deltaE / HBAR_EV_S;  // rad/s
}

export function oscillationPeriod(n1, n2) {
  const omega = computeBohrFrequency(n1, n2);
  return 2 * Math.PI / omega * 1e15;  // fs
}

// ---- TransitionController class ----

export class TransitionController extends BaseFrameController {
  constructor() {
    super();  // Call base constructor
    // Transition-specific properties
    this.transition = null;
    this.orbital1 = null;
    this.orbital2 = null;
    // QED oscillation properties
    this.omega = 0;
    this.displayOmega = 0;
    this.qedMode = true;
    this.oscillationTime = 0;
    this.oscillationSpeedMultiplier = 2.0;
    this.showEmField = false;
    this.showDipole = true;
    this.dipoleArrow = null;
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

    // Calculate Bohr frequency for QED oscillations
    this.omega = computeBohrFrequency(transition.n1, transition.n2);
    // Scale for visualization (real period ~0.4 fs → visible ~0.4s)
    this.displayOmega = this.omega * 1e-15 * 2.5;  // rad/s

    // Enable field oscillation
    if (this.showEmField) {
      setFieldOscillation(true, this.displayOmega);
    }

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
      const mats = getLayerMaterials(layers, colorMode, true);  // true = use QED oscillating shaders

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
      // Create dipole moment arrow after frames are built
      this.createDipoleArrow();
      if (onComplete) onComplete();
    }
  }

  computeTransitionDipole() {
    // For hydrogen s→p transitions, dipole points along z
    // More generally: ⟨ψ₁|er|ψ₂⟩
    // Simplified: use l,m quantum numbers
    if (!this.orbital1 || !this.orbital2) return new THREE.Vector3(0, 0, 1);

    const l1 = this.orbital1.terms[0].l;
    const l2 = this.orbital2.terms[0].l;

    if (l1 === 0 && l2 === 1) {
      return new THREE.Vector3(0, 0, 1);  // s→p: z-direction
    } else if (l1 === 1 && l2 === 0) {
      return new THREE.Vector3(0, 0, -1); // p→s: -z-direction
    } else if (l1 === 1 && l2 === 2) {
      return new THREE.Vector3(0, 0, 1);  // p→d: z-direction
    } else if (l1 === 2 && l2 === 3) {
      return new THREE.Vector3(0, 0, 1);  // d→f: z-direction
    }
    // Default: z-direction
    return new THREE.Vector3(0, 0, 1);
  }

  createDipoleArrow() {
    if (this.dipoleArrow) {
      if (this.dipoleArrow.parent) this.dipoleArrow.parent.remove(this.dipoleArrow);
      this.dipoleArrow = null;
    }

    // Compute transition dipole direction
    const dipoleDir = this.computeTransitionDipole();

    // Create arrow geometry (shaft + cone)
    const arrowHelper = new THREE.ArrowHelper(
      dipoleDir,
      new THREE.Vector3(0, 0, 0),
      5.0,  // length
      0xff00ff,  // magenta color
      1.0,  // head length
      0.5   // head width
    );

    scene.add(arrowHelper);
    arrowHelper.visible = false;  // Hidden by default, shown during oscillation
    this.dipoleArrow = arrowHelper;
  }

  tick(dt) {
    const baseChanged = super.tick(dt);

    if (this.state === 'playing' && this.qedMode) {
      this.oscillationTime += dt * this.oscillationSpeedMultiplier;

      const t = this.phase;
      const c1 = Math.cos(Math.PI * t / 2);
      const c2 = Math.sin(Math.PI * t / 2);

      // Update shader materials (pass oscillationTime directly so speed multiplier applies)
      tickTransitionMaterials(this.oscillationTime, this.displayOmega, c1, c2);

      // Modulate EM field opacity (if enabled) — don't tick time, main.js already does that
      if (this.showEmField) {
        const emAmplitude = 1.0 - t;  // Absorption: field decays from 1 to 0
        modulateFieldOpacity(this.oscillationTime, this.displayOmega, emAmplitude);
      }

      // Update dipole arrow
      if (this.dipoleArrow && this.showDipole) {
        const interferenceStrength = 2 * c1 * c2;
        const oscillation = Math.cos(this.displayOmega * this.oscillationTime);
        const dipoleMagnitude = interferenceStrength * oscillation;

        // Scale arrow length
        this.dipoleArrow.setLength(Math.abs(dipoleMagnitude) * 5.0, 1.0, 0.5);

        // Color by direction: red for positive, blue for negative
        const color = dipoleMagnitude > 0 ? 0xff0000 : 0x0000ff;
        this.dipoleArrow.setColor(new THREE.Color(color));

        this.dipoleArrow.visible = true;
      }
    }

    return baseChanged;
  }

  cancel() {
    super.cancel();
    clearTransitionMaterials();
    setFieldOscillation(false);
    if (this.dipoleArrow) {
      if (this.dipoleArrow.parent) this.dipoleArrow.parent.remove(this.dipoleArrow);
      this.dipoleArrow = null;
    }
    this.oscillationTime = 0;
  }

}
