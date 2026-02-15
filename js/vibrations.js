// Molecular vibration animation: procedural mode generation, async frame caching, playback.
// For each molecule, generates vibrational modes from bond topology.
// Pre-caches 24 frames of density isosurfaces + field vis for smooth playback.

import * as THREE from 'three';
import { sampleGrid } from './grid.js';
import { sampleGridAsync, cancelCompute } from './worker-pool.js';
import { computeMultiThresholds } from './grid.js';
import { getLayerMaterials } from './layer-materials.js';
import { marchingCubes } from './marching-cubes.js';
import { getMoleculeData, buildDisplacedDensitySampler, getMoleculeAtoms } from './molecules/index.js';
import { scene } from './scene.js';
import { buildFieldVisIntoGroup } from './electric-field.js';

const NUM_FRAMES = 24;

// ---- Atomic masses (amu) ----

const ATOMIC_MASS = {
  H: 1.008, He: 4.003, C: 12.011, N: 14.007, O: 15.999, F: 18.998,
  Na: 22.990, Al: 26.982, P: 30.974, S: 32.065, Cl: 35.453,
  Ca: 40.078, Ti: 47.867, Fe: 55.845, Cu: 63.546,
};

// ---- Procedural vibrational mode generation ----

export function generateVibrationalModes(moleculeName) {
  const mol = getMoleculeData(moleculeName);
  if (!mol) return [];

  const atoms = mol.atoms;
  const bonds = mol.bonds;
  const numAtoms = atoms.length;
  const modes = [];

  // Group bonds by type (element pair + order)
  const bondGroups = new Map();
  for (const bond of bonds) {
    const i = bond[0], j = bond[1], order = bond[2] || 1;
    const elA = atoms[i][0], elB = atoms[j][0];
    const key = [elA, elB].sort().join('-') + (order !== 1 ? `=${order}` : '');
    if (!bondGroups.has(key)) bondGroups.set(key, []);
    bondGroups.get(key).push([i, j]);
  }

  // Generate stretch modes: grouped by bond type
  for (const [key, groupBonds] of bondGroups) {
    // Symmetric stretch: all bonds of this type stretch in phase
    const displacements = new Float32Array(numAtoms * 3);
    for (const [i, j] of groupBonds) {
      const ax = atoms[i][1], ay = atoms[i][2], az = atoms[i][3];
      const bx = atoms[j][1], by = atoms[j][2], bz = atoms[j][3];
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-6) continue;
      const nx = dx / len, ny = dy / len, nz = dz / len;

      const massI = ATOMIC_MASS[atoms[i][0]] || 12;
      const massJ = ATOMIC_MASS[atoms[j][0]] || 12;
      const totalMass = massI + massJ;
      // Lighter atom moves more (conservation of momentum)
      const ampI = massJ / totalMass;
      const ampJ = massI / totalMass;

      displacements[i * 3] -= nx * ampI;
      displacements[i * 3 + 1] -= ny * ampI;
      displacements[i * 3 + 2] -= nz * ampI;
      displacements[j * 3] += nx * ampJ;
      displacements[j * 3 + 1] += ny * ampJ;
      displacements[j * 3 + 2] += nz * ampJ;
    }

    // Normalize displacement vector
    let maxD = 0;
    for (let k = 0; k < numAtoms; k++) {
      const d2 = displacements[k * 3] ** 2 + displacements[k * 3 + 1] ** 2 + displacements[k * 3 + 2] ** 2;
      if (d2 > maxD) maxD = d2;
    }
    maxD = Math.sqrt(maxD);
    if (maxD > 1e-8) {
      for (let k = 0; k < displacements.length; k++) displacements[k] /= maxD;
    }

    modes.push({
      name: `${key} stretch`,
      displacements,
    });

    // Asymmetric stretch for groups with 2+ bonds: alternate phase
    if (groupBonds.length >= 2) {
      const asymDisp = new Float32Array(numAtoms * 3);
      for (let bi = 0; bi < groupBonds.length; bi++) {
        const [i, j] = groupBonds[bi];
        const ax = atoms[i][1], ay = atoms[i][2], az = atoms[i][3];
        const bx = atoms[j][1], by = atoms[j][2], bz = atoms[j][3];
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 1e-6) continue;
        const nx = dx / len, ny = dy / len, nz = dz / len;
        const massI = ATOMIC_MASS[atoms[i][0]] || 12;
        const massJ = ATOMIC_MASS[atoms[j][0]] || 12;
        const totalMass = massI + massJ;
        const ampI = massJ / totalMass;
        const ampJ = massI / totalMass;
        const sign = (bi % 2 === 0) ? 1 : -1;

        asymDisp[i * 3] -= nx * ampI * sign;
        asymDisp[i * 3 + 1] -= ny * ampI * sign;
        asymDisp[i * 3 + 2] -= nz * ampI * sign;
        asymDisp[j * 3] += nx * ampJ * sign;
        asymDisp[j * 3 + 1] += ny * ampJ * sign;
        asymDisp[j * 3 + 2] += nz * ampJ * sign;
      }

      let maxA = 0;
      for (let k = 0; k < numAtoms; k++) {
        const d2 = asymDisp[k * 3] ** 2 + asymDisp[k * 3 + 1] ** 2 + asymDisp[k * 3 + 2] ** 2;
        if (d2 > maxA) maxA = d2;
      }
      maxA = Math.sqrt(maxA);
      if (maxA > 1e-8) {
        for (let k = 0; k < asymDisp.length; k++) asymDisp[k] /= maxA;
        modes.push({
          name: `${key} asym. stretch`,
          displacements: asymDisp,
        });
      }
    }
  }

  // Angle bend modes for small molecules (<15 atoms)
  if (numAtoms < 15) {
    // Build adjacency
    const adj = new Map();
    for (const bond of bonds) {
      if (!adj.has(bond[0])) adj.set(bond[0], []);
      if (!adj.has(bond[1])) adj.set(bond[1], []);
      adj.get(bond[0]).push(bond[1]);
      adj.get(bond[1]).push(bond[0]);
    }

    const seenAngles = new Set();
    for (const [center, neighbors] of adj) {
      if (neighbors.length < 2) continue;
      for (let ni = 0; ni < neighbors.length; ni++) {
        for (let nj = ni + 1; nj < neighbors.length; nj++) {
          const a = neighbors[ni], b = neighbors[nj];
          const key = [a, center, b].sort().join(',');
          if (seenAngles.has(key)) continue;
          seenAngles.add(key);

          const cx = atoms[center][1], cy = atoms[center][2], cz = atoms[center][3];
          const ax = atoms[a][1] - cx, ay = atoms[a][2] - cy, az = atoms[a][3] - cz;
          const bx = atoms[b][1] - cx, by = atoms[b][2] - cy, bz = atoms[b][3] - cz;
          const la = Math.sqrt(ax * ax + ay * ay + az * az);
          const lb = Math.sqrt(bx * bx + by * by + bz * bz);
          if (la < 1e-6 || lb < 1e-6) continue;

          // Bisector direction
          const bisX = ax / la + bx / lb, bisY = ay / la + by / lb, bisZ = az / la + bz / lb;
          const bisLen = Math.sqrt(bisX * bisX + bisY * bisY + bisZ * bisZ);
          if (bisLen < 1e-6) continue;

          // Perpendicular to bisector in the a-center-b plane
          const nBisX = bisX / bisLen, nBisY = bisY / bisLen, nBisZ = bisZ / bisLen;
          // Move a and b perpendicular to their bond axes to open/close angle
          const bendDisp = new Float32Array(numAtoms * 3);
          const massA = ATOMIC_MASS[atoms[a][0]] || 12;
          const massB = ATOMIC_MASS[atoms[b][0]] || 12;
          const massC = ATOMIC_MASS[atoms[center][0]] || 12;

          // Move atoms a and b along bisector (opening mode)
          // atom a moves away from bisector, atom b also
          bendDisp[a * 3] = nBisX / massA;
          bendDisp[a * 3 + 1] = nBisY / massA;
          bendDisp[a * 3 + 2] = nBisZ / massA;
          bendDisp[b * 3] = nBisX / massB;
          bendDisp[b * 3 + 1] = nBisY / massB;
          bendDisp[b * 3 + 2] = nBisZ / massB;
          // Center moves opposite
          bendDisp[center * 3] = -nBisX * (1 / massA + 1 / massB) * massC / (massA + massB + massC);
          bendDisp[center * 3 + 1] = -nBisY * (1 / massA + 1 / massB) * massC / (massA + massB + massC);
          bendDisp[center * 3 + 2] = -nBisZ * (1 / massA + 1 / massB) * massC / (massA + massB + massC);

          let maxB = 0;
          for (let k = 0; k < numAtoms; k++) {
            const d2 = bendDisp[k * 3] ** 2 + bendDisp[k * 3 + 1] ** 2 + bendDisp[k * 3 + 2] ** 2;
            if (d2 > maxB) maxB = d2;
          }
          maxB = Math.sqrt(maxB);
          if (maxB > 1e-8) {
            for (let k = 0; k < bendDisp.length; k++) bendDisp[k] /= maxB;

            const nameA = atoms[a][0], nameC = atoms[center][0], nameB = atoms[b][0];
            modes.push({
              name: `${nameA}-${nameC}-${nameB} bend`,
              displacements: bendDisp,
            });
          }
        }
      }
    }
  }

  return modes;
}

// ---- Vibration Controller ----

export class VibrationController {
  constructor() {
    this.state = 'idle';  // idle | building | ready | playing
    this.generation = 0;
    this.frames = [];
    this.framesReady = 0;
    this.phase = 0;
    this.speed = 1;
    this.lastFrameIdx = -1;
    this.currentMode = null;
    this.mixModes = null; // [{mode, weight, phaseOffset}, ...] for random mix
    this.amplitude = 0.3;
    this.moleculeName = null;
  }

  cancel() {
    this.generation++;
    if (this.state === 'playing') this.pause();
    this.disposeCache();
    this.state = 'idle';
  }

  pause() {
    if (this.state === 'playing') {
      this.state = 'ready';
      // Hide current frame
      if (this.lastFrameIdx >= 0 && this.frames[this.lastFrameIdx]) {
        this.frames[this.lastFrameIdx].group.visible = false;
      }
    }
  }

  play() {
    if (this.state === 'ready') {
      this.state = 'playing';
    }
  }

  disposeCache() {
    for (const frame of this.frames) {
      if (frame && frame.group) {
        if (frame.group.parent) frame.group.parent.remove(frame.group);
        frame.group.traverse(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
          }
        });
      }
    }
    this.frames = [];
    this.framesReady = 0;
    this.lastFrameIdx = -1;
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
      moleculeName, mode, mixModes, amplitude, probability, layers,
      gridSize, halfExtent, isDensity, showFieldVis, atomInfo,
    } = settings;

    this.moleculeName = moleculeName;
    this.amplitude = amplitude;
    if (mixModes) {
      this.mixModes = mixModes;
      this.currentMode = null;
    } else {
      this.currentMode = mode;
      this.mixModes = null;
    }

    for (let i = 0; i < NUM_FRAMES; i++) {
      if (stale()) return;

      const phase = (i / NUM_FRAMES) * 2 * Math.PI;

      // Compute displaced positions (single mode or mix)
      const displacements = this.displacementsAtPhase(phase);
      if (!displacements) return;

      // Build displaced density sampler
      const sampler = buildDisplacedDensitySampler(moleculeName, displacements);
      if (!sampler || stale()) return;

      // Sample grid (main thread chunked for customSample)
      const gs = gridSize;
      const he = halfExtent;
      const data = await sampleGridAsync(sampler, gs, he, () => {});
      if (!data || stale()) return;

      // Build marching cubes layers
      const group = new THREE.Group();
      const thresholds = computeMultiThresholds(data, probability, layers, he, gs);
      const mats = getLayerMaterials(layers, isDensity);
      const step = (2 * he) / (gs - 1);

      for (let li = 0; li < layers; li++) {
        const result = marchingCubes(data, gs, thresholds[li]);
        if (result.indices.length > 0) {
          const verts = result.vertices;
          for (let vi = 0; vi < verts.length; vi += 3) {
            verts[vi] = verts[vi] * step - he;
            verts[vi + 1] = verts[vi + 1] * step - he;
            verts[vi + 2] = verts[vi + 2] * step - he;
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
          geo.setIndex(new THREE.BufferAttribute(result.indices, 1));
          geo.computeVertexNormals();
          const matIdx = layers - 1 - li;
          const mesh = new THREE.Mesh(geo, mats.pos[matIdx]);
          mesh.renderOrder = li;
          group.add(mesh);
        }

        // Density is always positive (no neg side needed for electron density)
        if (!isDensity) {
          const negData = new Float32Array(data.length);
          for (let j = 0; j < data.length; j++) negData[j] = -data[j];
          const negResult = marchingCubes(negData, gs, thresholds[li]);
          if (negResult.indices.length > 0) {
            const verts = negResult.vertices;
            for (let vi = 0; vi < verts.length; vi += 3) {
              verts[vi] = verts[vi] * step - he;
              verts[vi + 1] = verts[vi + 1] * step - he;
              verts[vi + 2] = verts[vi + 2] * step - he;
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
            geo.setIndex(new THREE.BufferAttribute(negResult.indices, 1));
            geo.computeVertexNormals();
            const matIdx = layers - 1 - li;
            const mesh = new THREE.Mesh(geo, mats.neg[matIdx]);
            mesh.renderOrder = li;
            group.add(mesh);
          }
        }
      }

      // Build field vis (arrows/streamlines) into this frame's group
      if (showFieldVis) {
        let displacedAtomInfo = null;
        if (atomInfo) {
          displacedAtomInfo = atomInfo.map((a, ai) => ({
            Z: a.Z,
            x: a.x + displacements[ai][0],
            y: a.y + displacements[ai][1],
            z: a.z + displacements[ai][2],
          }));
        }
        buildFieldVisIntoGroup(group,
          [{ data, halfExtent: he, gridSize: gs }],
          probability, displacedAtomInfo);
      }

      if (stale()) {
        group.traverse(child => {
          if (child.geometry) child.geometry.dispose();
        });
        return;
      }

      scene.add(group);
      group.visible = false;

      this.frames[i] = { group, caches: [{ data, halfExtent: he, gridSize: gs }] };
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

  // Called each animation frame — swap visible groups
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
      return true; // frame changed
    }
    return false;
  }
}
