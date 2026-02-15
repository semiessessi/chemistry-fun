// Web Worker for offloading grid sampling, threshold computation, and marching cubes.
// Runs as a module worker (type: 'module').

import { evaluateOrbital } from './math.js';
import { computeMultiThresholds, computeThreshold } from './grid.js';
import { marchingCubes } from './marching-cubes.js';

self.onmessage = function(e) {
  const { type, id } = e.data;

  if (type === 'sampleGridChunk') {
    const { terms, gridSize, halfExtent, zStart, zEnd } = e.data;
    const N = gridSize;
    const sliceSize = N * N;
    const numSlices = zEnd - zStart;
    const chunk = new Float32Array(numSlices * sliceSize);
    const step = (2 * halfExtent) / (N - 1);
    const orbital = { terms };
    let idx = 0;
    for (let iz = zStart; iz < zEnd; iz++) {
      const z = -halfExtent + iz * step;
      for (let iy = 0; iy < N; iy++) {
        const y = -halfExtent + iy * step;
        for (let ix = 0; ix < N; ix++) {
          const x = -halfExtent + ix * step;
          chunk[idx++] = evaluateOrbital(orbital, x, y, z);
        }
      }
    }
    self.postMessage({ type, id, chunk }, [chunk.buffer]);
  }

  else if (type === 'sampleDensityGridChunk') {
    const { moList, gridSize, halfExtent, zStart, zEnd } = e.data;
    const N = gridSize;
    const numSlices = zEnd - zStart;
    const chunk = new Float32Array(numSlices * N * N);
    const step = (2 * halfExtent) / (N - 1);
    let idx = 0;
    for (let iz = zStart; iz < zEnd; iz++) {
      const z = -halfExtent + iz * step;
      for (let iy = 0; iy < N; iy++) {
        const y = -halfExtent + iy * step;
        for (let ix = 0; ix < N; ix++) {
          const x = -halfExtent + ix * step;
          let rho = 0;
          for (const { terms, occ } of moList) {
            const psi = evaluateOrbital({ terms }, x, y, z);
            rho += occ * psi * psi;
          }
          chunk[idx++] = Math.sqrt(rho);
        }
      }
    }
    self.postMessage({ type, id, chunk }, [chunk.buffer]);
  }

  else if (type === 'computeThresholds') {
    const { data, probability, numLayers, halfExtent, gridSize } = e.data;
    let thresholds;
    if (numLayers === 1) {
      thresholds = [computeThreshold(data, probability, halfExtent, gridSize)];
    } else {
      thresholds = computeMultiThresholds(data, probability, numLayers, halfExtent, gridSize);
    }
    self.postMessage({ type, id, thresholds });
  }

  else if (type === 'marchingCubes') {
    const { data, gridSize, threshold } = e.data;
    const result = marchingCubes(data, gridSize, threshold);
    self.postMessage(
      { type, id, vertices: result.vertices, indices: result.indices },
      [result.vertices.buffer, result.indices.buffer]
    );
  }
};
