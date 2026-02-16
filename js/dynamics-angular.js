// Angular dynamics: quaternion utilities, molecular frame computation, and orientation export.

import * as THREE from 'three';

// ---- Random quaternion and angular velocity generation ----

// Generate a random unit quaternion (Marsaglia method for uniform rotation)
export function randomQuaternion() {
  let u1, u2, u3, s1, s2;
  do { u1 = Math.random() * 2 - 1; u2 = Math.random() * 2 - 1; s1 = u1*u1 + u2*u2; } while (s1 >= 1);
  do { u3 = Math.random() * 2 - 1; const u4 = Math.random() * 2 - 1; s2 = u3*u3 + u4*u4;
    if (s2 < 1) { const sq = Math.sqrt((1 - s1) / s2); return new THREE.Quaternion(u1, u2, u3 * sq, u4 * sq); }
  } while (true);
}

// Generate random angular velocity vector with given magnitude
export function randomOmega(magnitude) {
  const theta = Math.acos(2 * Math.random() - 1);
  const phi = Math.random() * 2 * Math.PI;
  return new THREE.Vector3(
    magnitude * Math.sin(theta) * Math.cos(phi),
    magnitude * Math.sin(theta) * Math.sin(phi),
    magnitude * Math.cos(theta)
  );
}

// ---- Quaternion utilities ----

// Quaternion rotation matrix to flat 9-element array (row-major)
const _quatMatrix = new THREE.Matrix4();
export function quatToRotMatrix9(quat) {
  _quatMatrix.makeRotationFromQuaternion(quat);
  const e = _quatMatrix.elements;
  // THREE.Matrix4 is column-major, convert to row-major 3x3
  return [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]];
}

// Apply small rotation delta to quaternion: q' = q * deltaQ(omega * dt)
export function integrateQuaternion(q, omega, dt) {
  const angle = omega.length() * dt;
  if (angle < 1e-12) return;
  const axis = omega.clone().normalize();
  const dq = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  q.premultiply(dq);  // premultiply for world-frame angular velocity
  q.normalize();
}

// Full-quaternion alignment torque for a single atom.
// Computes shortest-path rotation from qAtom to qTarget,
// returns torque = k * angle * axis * proximity (world frame).
// Constrains all 3 rotational DOF, not just z-axis.
export function quatAlignmentTorque(qAtom, qTarget, k, proximity) {
  // qError = qTarget * qAtom⁻¹ (world-frame error rotation)
  const qError = qTarget.clone().multiply(qAtom.clone().conjugate());
  // Ensure shortest path (angle ≤ π)
  if (qError.w < 0) { qError.x = -qError.x; qError.y = -qError.y; qError.z = -qError.z; qError.w = -qError.w; }
  // Extract axis-angle: angle = 2 * acos(w), axis = (x,y,z) / sin(angle/2)
  const sinHalf = Math.sqrt(qError.x * qError.x + qError.y * qError.y + qError.z * qError.z);
  if (sinHalf < 1e-8) return new THREE.Vector3(0, 0, 0);  // already aligned
  const angle = 2 * Math.atan2(sinHalf, qError.w);
  const scale = k * proximity * angle / sinHalf;
  return new THREE.Vector3(qError.x * scale, qError.y * scale, qError.z * scale);
}

// ---- Molecular frame quaternion computation ----

const _molQuat = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);

// Compute molecular frame quaternion for 2-body simulation
export function computeMolQuat2(pos) {
  // Bond direction: from atom a (+pos) to atom b (-pos) = -2*pos
  const bondDir = new THREE.Vector3(-pos.x, -pos.y, -pos.z).normalize();
  _molQuat.setFromUnitVectors(_zAxis, bondDir);
  return _molQuat;
}

// Compute molecular frame quaternion for 3-body simulation
// Linear: axis from pos[0] to pos[2] mapped to canonical z.
// Bent: center=pos[1], canonical x→side, y→normal, z→bisector.
export function computeMolQuat3(pos, config) {
  if (!config) return new THREE.Quaternion();

  if (config.angle) {
    // Bent molecule: center is always atom 1
    const u1 = new THREE.Vector3().subVectors(pos[0], pos[1]).normalize();
    const u2 = new THREE.Vector3().subVectors(pos[2], pos[1]).normalize();
    const bisector = new THREE.Vector3().addVectors(u1, u2);

    if (bisector.length() < 0.01) {
      // Degenerate: essentially linear
      const axis = new THREE.Vector3().subVectors(pos[2], pos[0]).normalize();
      return new THREE.Quaternion().setFromUnitVectors(_zAxis, axis);
    }

    bisector.normalize();
    const normal = new THREE.Vector3().crossVectors(u1, u2).normalize();
    const side = new THREE.Vector3().crossVectors(normal, bisector).normalize();
    // Ensure side points toward atom 0
    if (side.dot(u1) < 0) { side.negate(); normal.negate(); }
    // Canonical: x→side, y→normal, z→bisector
    const m = new THREE.Matrix4().makeBasis(side, normal, bisector);
    return new THREE.Quaternion().setFromRotationMatrix(m);
  } else {
    // Linear molecule: axis from atom 0 to atom 2
    const axis = new THREE.Vector3().subVectors(pos[2], pos[0]).normalize();
    return new THREE.Quaternion().setFromUnitVectors(_zAxis, axis);
  }
}

// ---- Orientation export helpers ----

// Returns array of 9-element flat rotation matrices (one per atom) for 2-body.
// Each matrix = R(qAtom⁻¹ * qMol): transforms canonical-frame displacement to atom-local frame.
// At equilibrium (qAtom = qMol), this is identity → no rotation → matches non-angular behavior.
export function getAtomOrientations(atomQuats, pos) {
  const qMol = computeMolQuat2(pos);
  return atomQuats.map(q => {
    const qForRot = q.clone().conjugate().multiply(qMol);  // qAtom⁻¹ * qMol
    return quatToRotMatrix9(qForRot);
  });
}

// Returns array of 9-element flat rotation matrices (one per atom) for 3-body
export function get3AtomOrientations(atomQuats, pos, config) {
  const qMol = computeMolQuat3(pos, config);
  return atomQuats.map(q => {
    const qForRot = q.clone().conjugate().multiply(qMol);  // qAtom⁻¹ * qMol
    return quatToRotMatrix9(qForRot);
  });
}
