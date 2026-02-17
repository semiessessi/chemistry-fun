// Electrostatic potential visualization: red/blue isosurfaces + colored field arrows.
// V(r) = V_nuc(r) + V_el(r)
//   V_nuc = Σ Zᵢ / |r - Rᵢ|  (softened Coulomb, always positive near nuclei)
//   V_el  = Poisson solve of ∇²V_el = 4πρ → negative potential from electrons
// Rendered as red (positive) / blue (negative) isosurfaces using marching cubes.

import * as THREE from 'three';
import { marchingCubes } from './marching-cubes.js';
import { solvePoissonGPU } from './webgpu-sampler.js';

// ---- Atomic numbers ----

const ATOMIC_Z = {
  H: 1, He: 2, C: 6, N: 7, O: 8, F: 9, Na: 11, Al: 13,
  P: 15, S: 16, Cl: 17, Ca: 20, Ti: 22, Fe: 26, Cu: 29,
};

// ---- Mesh tracking ----

let potentialMeshes = [];
let currentPotentialGrid = null;

// ---- Potential computation (Poisson solver) ----

export async function computeElectrostaticPotential(atomInfo, densityData, gridSize, halfExtent, onProgress) {
  const N = gridSize, N2 = N * N, N3 = N * N * N;
  const step = (2 * halfExtent) / (N - 1);
  const softening = 0.5;

  let totalZ = 0;
  for (const atom of atomInfo) totalZ += atom.Z;

  // Build normalized electron number density: ∫ρ dV = totalZ
  let densitySum = 0;
  const voxelVol = step * step * step;
  const rho = new Float32Array(N3);
  for (let i = 0; i < N3; i++) {
    rho[i] = densityData[i] * densityData[i]; // densityData stores √ρ
    densitySum += rho[i] * voxelVol;
  }
  const elScale = densitySum > 0 ? totalZ / densitySum : 0;
  for (let i = 0; i < N3; i++) rho[i] *= elScale;

  // Step 1: Nuclear potential (softened Coulomb, always positive)
  const potential = new Float32Array(N3);
  for (let iz = 0; iz < N; iz++) {
    const z = -halfExtent + iz * step;
    for (let iy = 0; iy < N; iy++) {
      const y = -halfExtent + iy * step;
      for (let ix = 0; ix < N; ix++) {
        const x = -halfExtent + ix * step;
        const idx = iz * N2 + iy * N + ix;
        let vNuc = 0;
        for (const atom of atomInfo) {
          const dx = x - atom.x, dy = y - atom.y, dz = z - atom.z;
          const r = Math.sqrt(dx * dx + dy * dy + dz * dz + softening * softening);
          vNuc += atom.Z / r;
        }
        potential[idx] = vNuc;
      }
    }
  }

  // Step 2: Solve Poisson equation for electron potential via SOR
  // ∇²V_el = 4πρ  (electrons are negative charges → V_el converges to negative values)
  // Boundary: V_el = 0 at grid edges (valid since ρ → 0 at boundaries)
  const numIter = 80;
  if (onProgress) onProgress(0.15);

  let Vel = await solvePoissonGPU(rho, N, step, numIter);

  if (!Vel) {
    // JS fallback
    Vel = new Float32Array(N3);
    const h2 = step * step;
    const fourPiH2 = 4 * Math.PI * h2;
    const omega = 1.85;
    for (let iter = 0; iter < numIter; iter++) {
      for (let iz = 1; iz < N - 1; iz++) {
        for (let iy = 1; iy < N - 1; iy++) {
          for (let ix = 1; ix < N - 1; ix++) {
            const idx = iz * N2 + iy * N + ix;
            const neighbors = Vel[idx - 1] + Vel[idx + 1] +
                              Vel[idx - N] + Vel[idx + N] +
                              Vel[idx - N2] + Vel[idx + N2];
            const newVal = (neighbors - fourPiH2 * rho[idx]) / 6;
            Vel[idx] += omega * (newVal - Vel[idx]);
          }
        }
      }
      if (iter % 8 === 0) {
        if (onProgress) onProgress(0.15 + 0.7 * iter / numIter);
        await new Promise(r => setTimeout(r, 0));
      }
    }
  }

  // Step 3: Total potential = V_nuc + V_el
  for (let i = 0; i < N3; i++) {
    potential[i] += Vel[i];
  }

  // Step 4: Subtract mean boundary potential.
  // V_nuc decays as 1/r so it's still significant at grid edges, while the
  // Poisson solver forces V_el=0 there (underestimating electron screening).
  // Removing this baseline makes the potential ~0 at edges and prevents
  // isosurfaces from extending to the grid boundary for large molecules.
  let boundarySum = 0, boundaryCount = 0;
  for (let iz = 0; iz < N; iz++) {
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        if (ix === 0 || ix === N - 1 || iy === 0 || iy === N - 1 || iz === 0 || iz === N - 1) {
          boundarySum += potential[iz * N2 + iy * N + ix];
          boundaryCount++;
        }
      }
    }
  }
  const baseline = boundaryCount > 0 ? boundarySum / boundaryCount : 0;
  for (let i = 0; i < N3; i++) {
    potential[i] -= baseline;
  }

  return potential;
}

// ---- Charge density computation (Gaussian-smeared nuclear − electronic) ----

export async function computeChargeDensity(atomInfo, densityData, gridSize, halfExtent, onProgress) {
  const N = gridSize, N2 = N * N, N3 = N * N * N;
  const step = (2 * halfExtent) / (N - 1);

  let totalZ = 0;
  for (const atom of atomInfo) totalZ += atom.Z;

  // Normalize electron density: ∫ρ dV = totalZ
  let densitySum = 0;
  const voxelVol = step * step * step;
  for (let i = 0; i < N3; i++) {
    densitySum += densityData[i] * densityData[i] * voxelVol;
  }
  const elScale = densitySum > 0 ? totalZ / densitySum : 0;

  // Gaussian width for smearing nuclear point charges.
  // Larger σ spreads the nuclear charge over a wider volume, reducing the peak
  // so it's comparable to the diffuse electronic density (peak ∝ Z/σ³).
  const sigma = 0.8; // Bohr radii
  const sigma2 = sigma * sigma;
  const norm = 1 / (sigma * sigma * sigma * Math.pow(2 * Math.PI, 1.5));

  const chargeData = new Float32Array(N3);

  for (let iz = 0; iz < N; iz++) {
    const z = -halfExtent + iz * step;
    for (let iy = 0; iy < N; iy++) {
      const y = -halfExtent + iy * step;
      for (let ix = 0; ix < N; ix++) {
        const x = -halfExtent + ix * step;
        const idx = iz * N2 + iy * N + ix;

        // Nuclear charge density (Gaussian-smeared)
        let rhoNuc = 0;
        for (const atom of atomInfo) {
          const dx = x - atom.x, dy = y - atom.y, dz = z - atom.z;
          const r2 = dx * dx + dy * dy + dz * dz;
          rhoNuc += atom.Z * norm * Math.exp(-r2 / (2 * sigma2));
        }

        // Electronic charge density
        const rhoEl = densityData[idx] * densityData[idx] * elScale;

        // Net charge density: positive near nuclei, negative in electron cloud
        chargeData[idx] = rhoNuc - rhoEl;
      }
    }
    if (iz % 10 === 0 && onProgress) {
      onProgress(iz / N);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  return chargeData;
}

// ---- Build geometry from scalar grid ----

function buildPotentialGeometry(data, halfExtent, threshold, gridSize) {
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

// ---- Material creation ----

function makeEPMat(color, opacity) {
  return new THREE.MeshPhongMaterial({
    color, transparent: true, opacity,
    side: THREE.DoubleSide, shininess: 40, depthWrite: false,
  });
}

// Red ramp for positive isosurfaces (inner=deep red, outer=pale)
function redEPColor(t) {
  const c = new THREE.Color();
  c.setHSL(0 / 360, (80 - 30 * t) / 100, (35 + 40 * t) / 100);
  return c;
}

// Blue ramp for negative isosurfaces
function blueEPColor(t) {
  const c = new THREE.Color();
  c.setHSL(225 / 360, (75 - 30 * t) / 100, (35 + 40 * t) / 100);
  return c;
}

function epOpacity(t) {
  return 0.55 - 0.35 * t;
}

// ---- Render potential isosurfaces ----

export function renderPotentialIsosurfaces(potential, halfExtent, gridSize, parent, layers) {
  clearPotentialIsosurfaces();

  const numLayers = layers || 3;
  const N = potential.length;

  // Find positive and negative ranges
  let posMax = 0, negMax = 0;
  for (let i = 0; i < N; i++) {
    if (potential[i] > posMax) posMax = potential[i];
    if (potential[i] < negMax) negMax = potential[i]; // negMax is negative
  }
  const absNeg = Math.abs(negMax);

  // Thresholds: logarithmic spacing from 10% to 80% of max
  const posThresholds = [];
  const negThresholds = [];
  for (let i = 0; i < numLayers; i++) {
    const t = numLayers === 1 ? 0.3 : 0.1 + 0.7 * i / (numLayers - 1);
    posThresholds.push(posMax * t);
    negThresholds.push(absNeg * t);
  }

  // Negate potential for negative isosurfaces
  const negPotential = new Float32Array(N);
  for (let i = 0; i < N; i++) negPotential[i] = -potential[i];

  // Render positive layers (red) — outer to inner
  for (let i = 0; i < numLayers; i++) {
    const t = numLayers === 1 ? 0 : i / (numLayers - 1);
    const geo = buildPotentialGeometry(potential, halfExtent, posThresholds[i], gridSize);
    if (geo) {
      const mesh = new THREE.Mesh(geo, makeEPMat(redEPColor(1 - t), epOpacity(1 - t)));
      mesh.renderOrder = 100 + i;
      parent.add(mesh);
      potentialMeshes.push(mesh);
    }
  }

  // Render negative layers (blue) — outer to inner
  for (let i = 0; i < numLayers; i++) {
    const t = numLayers === 1 ? 0 : i / (numLayers - 1);
    const geo = buildPotentialGeometry(negPotential, halfExtent, negThresholds[i], gridSize);
    if (geo) {
      const mesh = new THREE.Mesh(geo, makeEPMat(blueEPColor(1 - t), epOpacity(1 - t)));
      mesh.renderOrder = 100 + i;
      parent.add(mesh);
      potentialMeshes.push(mesh);
    }
  }
}

// ---- Cleanup ----

export function clearPotentialIsosurfaces() {
  for (const m of potentialMeshes) {
    if (m.parent) m.parent.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  }
  potentialMeshes = [];
}

export function setPotentialVisible(visible) {
  for (const m of potentialMeshes) m.visible = visible;
}

// ---- Current potential grid access ----

export function setCurrentPotentialGrid(grid) { currentPotentialGrid = grid; }
export function getCurrentPotentialGrid() { return currentPotentialGrid; }

// ---- Atom info helper (exported for main.js) ----

export { ATOMIC_Z };
