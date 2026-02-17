// 3D grid sampling and probability-based threshold computation

import { evaluateOrbital } from './math.js';
import { radixSortFloat32 } from './radix-sort.js';

export function sampleGrid(orbital, gridSize, halfExtent) {
  const data = new Float32Array(gridSize * gridSize * gridSize);
  const step = (2 * halfExtent) / (gridSize - 1);
  let idx = 0;
  for (let iz = 0; iz < gridSize; iz++) {
    const z = -halfExtent + iz * step;
    for (let iy = 0; iy < gridSize; iy++) {
      const y = -halfExtent + iy * step;
      for (let ix = 0; ix < gridSize; ix++) {
        const x = -halfExtent + ix * step;
        data[idx++] = orbital.customSample
          ? orbital.customSample(x, y, z)
          : evaluateOrbital(orbital, x, y, z);
      }
    }
  }
  return data;
}

// Given sampled psi data and a desired probability (0-1), compute the
// isosurface threshold |psi| value that encloses that fraction of
// total probability density.
export function computeThreshold(data, probability, halfExtent, gridSize) {
  const voxelVol = Math.pow(2 * halfExtent / (gridSize - 1), 3);
  const probs = new Float32Array(data.length);
  let totalProb = 0;
  for (let i = 0; i < data.length; i++) {
    const p = data[i] * data[i] * voxelVol;
    probs[i] = p;
    totalProb += p;
  }
  for (let i = 0; i < probs.length; i++) probs[i] /= totalProb;

  const sorted = Array.from(probs);
  sorted.sort((a, b) => b - a);

  let accum = 0;
  let cutoffProb = 0;
  for (let i = 0; i < sorted.length; i++) {
    accum += sorted[i];
    if (accum >= probability) {
      cutoffProb = sorted[i];
      break;
    }
  }

  const psi2Threshold = cutoffProb * totalProb / voxelVol;
  return Math.sqrt(Math.max(psi2Threshold, 1e-30));
}

// Compute multiple thresholds for multi-layer isosurface rendering.
// Returns array of |ψ| thresholds [outer(lowest), ..., inner(highest)].
// Each layer i encloses (i+1)/numLayers * maxProbability of total density.
export function computeMultiThresholds(data, maxProbability, numLayers, halfExtent, gridSize) {
  const voxelVol = Math.pow(2 * halfExtent / (gridSize - 1), 3);

  // Build array of { psi2: |ψ|²·voxelVol } and total
  const N = data.length;
  const probArr = new Float32Array(N);
  let totalProb = 0;
  for (let i = 0; i < N; i++) {
    const p = data[i] * data[i] * voxelVol;
    probArr[i] = p;
    totalProb += p;
  }

  // Normalize
  for (let i = 0; i < N; i++) probArr[i] /= totalProb;

  // Sort ascending in-place (iterate in reverse for descending walk)
  radixSortFloat32(probArr);

  // Walk sorted array (high → low), emit threshold each time accum crosses a layer boundary
  const thresholds = [];
  let accum = 0;
  let layerIdx = 0;
  const targets = [];
  for (let i = 0; i < numLayers; i++) {
    targets.push((i + 1) / numLayers * maxProbability);
  }

  for (let i = probArr.length - 1; i >= 0; i--) {
    accum += probArr[i];
    while (layerIdx < numLayers && accum >= targets[layerIdx]) {
      const psi2Threshold = probArr[i] * totalProb / voxelVol;
      thresholds.push(Math.sqrt(Math.max(psi2Threshold, 1e-30)));
      layerIdx++;
    }
    if (layerIdx >= numLayers) break;
  }

  // Fill any remaining layers with minimum threshold
  while (thresholds.length < numLayers) {
    thresholds.push(Math.sqrt(1e-30));
  }

  // thresholds emitted inner-first (high |ψ|), reverse to get [outer, ..., inner]
  thresholds.reverse();
  return thresholds;
}
