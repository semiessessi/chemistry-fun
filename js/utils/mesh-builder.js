// Shared mesh building utilities for marching cubes output.
// Used by VibrationController, TransitionController, and ReactionController.

import * as THREE from 'three';
import { marchingCubes } from '../marching-cubes.js';

/**
 * Build THREE.js meshes from marching cubes data.
 * @param {Object} config - Configuration object
 * @param {Float32Array} config.data - Grid data to isosurface
 * @param {number} config.halfExtent - Half-extent of grid in Bohr
 * @param {number} config.gridSize - Grid resolution (N×N×N)
 * @param {number[]} config.thresholds - Threshold values for each layer
 * @param {THREE.Material[]} config.materials - Materials for each layer
 * @param {THREE.Group} config.parent - Parent group to add meshes to
 * @param {number} config.layers - Number of isosurface layers
 */
export function buildMeshesFromData(config) {
  const { data, halfExtent, gridSize, thresholds, materials, parent, layers } = config;
  const step = (2 * halfExtent) / (gridSize - 1);

  for (let layerIdx = 0; layerIdx < layers; layerIdx++) {
    const result = marchingCubes(data, gridSize, thresholds[layerIdx]);
    if (result.indices.length === 0) continue;

    const verts = result.vertices;
    // Transform from grid coordinates to world coordinates
    for (let i = 0; i < verts.length; i += 3) {
      verts[i] = verts[i] * step - halfExtent;
      verts[i + 1] = verts[i + 1] * step - halfExtent;
      verts[i + 2] = verts[i + 2] * step - halfExtent;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex(new THREE.BufferAttribute(result.indices, 1));
    geo.computeVertexNormals();

    const matIdx = layers - 1 - layerIdx;
    const mesh = new THREE.Mesh(geo, materials[matIdx]);
    mesh.renderOrder = layerIdx;
    parent.add(mesh);
  }
}
