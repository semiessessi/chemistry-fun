// Arrow rendering: instanced arrow meshes with optional potential coloring.

import * as THREE from 'three';
import { trilinearInterpScalar, trilinearInterp } from './gradient-computation.js';

// ---- Potential color ramp: red (+) → white (0) → blue (−) ----

function potentialColor(t) {
  // t in [-1, +1], normalized potential
  if (t > 0) return new THREE.Color(1, 1 - 0.6 * t, 1 - 0.6 * t);  // white→red
  const a = -t;
  return new THREE.Color(1 - 0.7 * a, 1 - 0.7 * a, 1);  // white→blue
}

// ---- Arrow construction (InstancedMesh) with optional potential coloring ----

export function createArrowMeshes(arrows, maxMag, step, stride, parent, potentialGrid, gs, he) {
  if (arrows.length === 0) return;

  const upY = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();
  const shaftGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6, 1);
  shaftGeo.translate(0, 0.5, 0);
  const headGeo = new THREE.ConeGeometry(0.08, 0.25, 6);
  headGeo.translate(0, 0.125, 0);

  const usePotColor = potentialGrid && gs && he;

  const shaftMat = new THREE.MeshPhongMaterial({
    color: 0xffffff, transparent: true, opacity: 0.8,
    depthWrite: false, shininess: 30,
    vertexColors: usePotColor,
  });
  const headMat = new THREE.MeshPhongMaterial({
    color: 0xffffff, transparent: true, opacity: 0.8,
    depthWrite: false, shininess: 30,
    vertexColors: usePotColor,
  });

  const count = arrows.length;
  const shaftMesh = new THREE.InstancedMesh(shaftGeo, shaftMat, count);
  const headMesh = new THREE.InstancedMesh(headGeo, headMat, count);
  const dummy = new THREE.Object3D();
  const invMaxMag = maxMag > 0 ? 1 / maxMag : 1;

  // Precompute potential range for normalization
  let potMin = Infinity, potMax = -Infinity;
  if (usePotColor) {
    const potStep = (2 * he) / (gs - 1);
    for (let i = 0; i < count; i++) {
      const a = arrows[i];
      const v = trilinearInterpScalar(potentialGrid, gs, he, potStep, a.x, a.y, a.z);
      if (v < potMin) potMin = v;
      if (v > potMax) potMax = v;
    }
  }
  const potRange = Math.max(Math.abs(potMin), Math.abs(potMax)) || 1;

  if (usePotColor) {
    shaftMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    headMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  }

  const potStep = usePotColor ? (2 * he) / (gs - 1) : 0;

  for (let i = 0; i < count; i++) {
    const a = arrows[i];
    // Negate direction to point arrows along gradient flow
    const dir = new THREE.Vector3(-a.gx, -a.gy, -a.gz).normalize();
    const len = (a.mag * invMaxMag) * step * stride * 0.8;

    dummy.position.set(a.x, a.y, a.z);
    quat.setFromUnitVectors(upY, dir);
    dummy.quaternion.copy(quat);
    dummy.scale.set(1, len, 1);
    dummy.updateMatrix();
    shaftMesh.setMatrixAt(i, dummy.matrix);

    dummy.position.set(a.x + dir.x * len, a.y + dir.y * len, a.z + dir.z * len);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    headMesh.setMatrixAt(i, dummy.matrix);

    if (usePotColor) {
      const v = trilinearInterpScalar(potentialGrid, gs, he, potStep, a.x, a.y, a.z);
      const t = Math.max(-1, Math.min(1, v / potRange));
      const col = potentialColor(t);
      shaftMesh.instanceColor.setXYZ(i, col.r, col.g, col.b);
      headMesh.instanceColor.setXYZ(i, col.r, col.g, col.b);
    }
  }

  shaftMesh.instanceMatrix.needsUpdate = true;
  headMesh.instanceMatrix.needsUpdate = true;
  if (usePotColor) {
    shaftMesh.instanceColor.needsUpdate = true;
    headMesh.instanceColor.needsUpdate = true;
  }
  parent.add(shaftMesh);
  parent.add(headMesh);
  return [shaftMesh, headMesh];
}

// ---- Collect arrow candidates from a vector field ----

export function collectArrowCandidates(grad, data, gs, he, step, bounds, useMagnitudeBounds, magBounds) {
  const stride = Math.max(3, Math.round(gs / 25));
  const candidates = [];
  let maxMag = 0;

  for (let iz = stride; iz < gs - stride; iz += stride) {
    for (let iy = stride; iy < gs - stride; iy += stride) {
      for (let ix = stride; ix < gs - stride; ix += stride) {
        const idx = iz * gs * gs + iy * gs + ix;

        if (useMagnitudeBounds) {
          const mag = magBounds.mags[idx];
          if (mag < magBounds.lo || mag > magBounds.hi) continue;
        } else {
          const absVal = Math.abs(data[idx]);
          if (absVal < bounds.lo || absVal > bounds.hi) continue;
        }

        const oi = idx * 3;
        const gx = grad[oi], gy = grad[oi + 1], gz = grad[oi + 2];
        const mag = Math.sqrt(gx * gx + gy * gy + gz * gz);
        if (mag < 1e-8) continue;

        candidates.push({
          x: -he + ix * step, y: -he + iy * step, z: -he + iz * step,
          gx, gy, gz, mag,
        });
        if (mag > maxMag) maxMag = mag;
      }
    }
  }

  let arrows = candidates;
  if (arrows.length > 1500) {
    const skip = Math.ceil(arrows.length / 1500);
    arrows = arrows.filter((_, i) => i % skip === 0);
  }

  return { arrows, maxMag, stride };
}

// ---- Recompute arrow vectors at fixed positions from a new field ----

export function recomputeArrowVectors(positions, grad, gs, he, step) {
  const arrows = [];
  let maxMag = 0;
  for (const pos of positions) {
    const v = trilinearInterp(grad, gs, he, step, pos.x, pos.y, pos.z);
    if (!v) continue;
    const mag = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (mag < 1e-8) continue;
    arrows.push({ x: pos.x, y: pos.y, z: pos.z, gx: v[0], gy: v[1], gz: v[2], mag });
    if (mag > maxMag) maxMag = mag;
  }
  return { arrows, maxMag };
}
