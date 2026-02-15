// Bond formation dynamics: 2-body COM-frame and 3-body absolute-frame Morse simulations with trails.

import * as THREE from 'three';
import { BOND_FORMING_CONFIG } from './bond-forming.js';

// ---- Simulation configuration ----

export const SIM_CONFIG = {
  D_INIT: 10,          // initial separation (Bohr)
  IMPACT_PARAM: 1.0,   // impact parameter b (Bohr)
  V_APPROACH: 1.0,     // approach speed v₀ (sim units)
  GAMMA_RADIAL: 0.5,   // vibrational damping (only active in well)
  GAMMA_TANGENTIAL: 0.05, // rotational damping (only active in well)
  DT: 0.005,           // timestep per substep
  SUBSTEPS: 6,         // substeps per frame
};

// ============================================================
// 2-body simulation (existing)
// ============================================================

// ---- Angular dynamics parameters ----

const K_ALIGN_BASE = 0.5;   // alignment spring strength (scaled by De)
const GAMMA_ANGULAR = 0.3;  // angular damping coefficient
const OMEGA_INIT = 3.0;     // initial angular velocity magnitude (rad/unit)

export const SIM_STATE = {
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  R: 0,
  energy: 0,
  running: false,
  settled: false,
  settledFrames: 0,
  deltaRMax: 0,
  prevR: 0,
  frameCount: 0,
  // Angular momentum state
  atomQuats: [new THREE.Quaternion(), new THREE.Quaternion()],
  atomOmegas: [new THREE.Vector3(), new THREE.Vector3()],
  angularActive: false,  // false for H₂ (s-only)
};

function morseForceOnAtom1(pos, accel) {
  const { De, a, R_EQ } = BOND_FORMING_CONFIG;
  const r = pos.length();
  const R = 2 * r;

  if (r < 0.01) {
    accel.set(0, 0, 0);
    return;
  }

  const expTerm = Math.exp(-a * (R - R_EQ));
  const dVdR = 2 * De * a * (1 - expTerm) * expTerm;
  const scale = -dVdR * 2 / r;
  accel.set(pos.x * scale, pos.y * scale, pos.z * scale);
}

const _radialDir = new THREE.Vector3();
const _velRadial = new THREE.Vector3();
const _velTangential = new THREE.Vector3();

function applyDamping(vel, pos) {
  const r = pos.length();
  const R = 2 * r;
  if (r < 0.01) return;

  if (R > 5) return;
  const dampScale = R < 3 ? 1 : 1 - (R - 3) / 2;

  _radialDir.copy(pos).divideScalar(r);
  const vr = vel.dot(_radialDir);
  _velRadial.copy(_radialDir).multiplyScalar(vr);
  _velTangential.copy(vel).sub(_velRadial);

  const dt = SIM_CONFIG.DT;
  const radialFactor = Math.exp(-SIM_CONFIG.GAMMA_RADIAL * dampScale * dt);
  const tangentialFactor = Math.exp(-SIM_CONFIG.GAMMA_TANGENTIAL * dampScale * dt);

  vel.copy(_velRadial.multiplyScalar(radialFactor))
     .add(_velTangential.multiplyScalar(tangentialFactor));
}

// ---- Angular dynamics helpers ----

// Proximity function: full strength when R < 3, fades to 0 by R = 8
function angularDampScale(R) {
  if (R > 8) return 0;
  if (R < 3) return 1;
  return 1 - (R - 3) / 5;
}

// Generate a random unit quaternion
function randomQuaternion() {
  // Marsaglia method for uniform rotation
  let u1, u2, u3, s1, s2;
  do { u1 = Math.random() * 2 - 1; u2 = Math.random() * 2 - 1; s1 = u1*u1 + u2*u2; } while (s1 >= 1);
  do { u3 = Math.random() * 2 - 1; const u4 = Math.random() * 2 - 1; s2 = u3*u3 + u4*u4;
    if (s2 < 1) { const sq = Math.sqrt((1 - s1) / s2); return new THREE.Quaternion(u1, u2, u3 * sq, u4 * sq); }
  } while (true);
}

// Generate random angular velocity vector with given magnitude
function randomOmega(magnitude) {
  const theta = Math.acos(2 * Math.random() - 1);
  const phi = Math.random() * 2 * Math.PI;
  return new THREE.Vector3(
    magnitude * Math.sin(theta) * Math.cos(phi),
    magnitude * Math.sin(theta) * Math.sin(phi),
    magnitude * Math.cos(theta)
  );
}

// Quaternion rotation matrix to flat 9-element array (row-major)
const _quatMatrix = new THREE.Matrix4();
function quatToRotMatrix9(quat) {
  _quatMatrix.makeRotationFromQuaternion(quat);
  const e = _quatMatrix.elements;
  // THREE.Matrix4 is column-major, convert to row-major 3x3
  return [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]];
}

// Apply small rotation delta to quaternion: q' = q * deltaQ(omega * dt)
function integrateQuaternion(q, omega, dt) {
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
function quatAlignmentTorque(qAtom, qTarget, k, proximity) {
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

// Update angular state for 2-body simulation
function updateAngular2(dt) {
  if (!SIM_STATE.angularActive) return;
  const { atomQuats, atomOmegas, pos } = SIM_STATE;
  const R = 2 * pos.length();
  const proximity = angularDampScale(R);
  const De = BOND_FORMING_CONFIG.De;
  const kAlign = K_ALIGN_BASE * De;

  if (pos.length() < 0.01) return;

  // Target: molecular frame quaternion (canonical z → bond direction)
  const qMol = computeMolQuat2();

  for (let i = 0; i < 2; i++) {
    // Full-quaternion alignment torque toward molecular frame
    const torque = quatAlignmentTorque(atomQuats[i], qMol, kAlign, proximity);

    // Update angular velocity
    atomOmegas[i].add(torque.multiplyScalar(dt));

    // Angular damping
    const dampFactor = Math.exp(-GAMMA_ANGULAR * proximity * dt);
    atomOmegas[i].multiplyScalar(dampFactor);

    // Integrate quaternion
    integrateQuaternion(atomQuats[i], atomOmegas[i], dt);
  }
}

// Update angular state for 3-body simulation
function updateAngular3(dt) {
  if (!SIM3_STATE.angularActive) return;
  const { atomQuats, atomOmegas, pos, config } = SIM3_STATE;
  if (!config) return;

  // Compute De_max for scaling
  let DeMax = 0;
  for (const m of config.morse) { if (m.De > DeMax) DeMax = m.De; }
  const kAlign = K_ALIGN_BASE * DeMax;

  // Target: molecular frame quaternion (all atoms align to this)
  const qMol = computeMolQuat3();

  // For each atom, compute full-quaternion alignment torque weighted by bond proximity
  for (let i = 0; i < 3; i++) {
    // Compute max proximity across all bonds this atom participates in
    let maxProximity = 0;
    for (let b = 0; b < config.bonds.length; b++) {
      const [bi, bj] = config.bonds[b];
      if (bi === i || bj === i) {
        const R = pos[bi].distanceTo(pos[bj]);
        maxProximity = Math.max(maxProximity, angularDampScale(R));
      }
    }

    if (maxProximity > 1e-6) {
      const torque = quatAlignmentTorque(atomQuats[i], qMol, kAlign, maxProximity);
      atomOmegas[i].add(torque.multiplyScalar(dt));
    }

    const dampFactor = Math.exp(-GAMMA_ANGULAR * maxProximity * dt);
    atomOmegas[i].multiplyScalar(dampFactor);
    integrateQuaternion(atomQuats[i], atomOmegas[i], dt);
  }
}

const _accel = new THREE.Vector3();
const _accelNew = new THREE.Vector3();

function substep() {
  const { pos, vel } = SIM_STATE;
  const dt = SIM_CONFIG.DT;

  morseForceOnAtom1(pos, _accel);
  pos.x += vel.x * dt + 0.5 * _accel.x * dt * dt;
  pos.y += vel.y * dt + 0.5 * _accel.y * dt * dt;
  pos.z += vel.z * dt + 0.5 * _accel.z * dt * dt;

  morseForceOnAtom1(pos, _accelNew);
  vel.x += 0.5 * (_accel.x + _accelNew.x) * dt;
  vel.y += 0.5 * (_accel.y + _accelNew.y) * dt;
  vel.z += 0.5 * (_accel.z + _accelNew.z) * dt;

  applyDamping(vel, pos);
  updateAngular2(dt);
}

function computeEnergy() {
  const { pos, vel } = SIM_STATE;
  const R = 2 * pos.length();
  const { De, a, R_EQ } = BOND_FORMING_CONFIG;
  const KE = vel.lengthSq();
  const x = 1 - Math.exp(-a * (R - R_EQ));
  const PE = De * x * x - De;
  return KE + PE;
}

export function stepSimulation() {
  if (!SIM_STATE.running) return;

  for (let i = 0; i < SIM_CONFIG.SUBSTEPS; i++) {
    substep();
  }

  const newR = 2 * SIM_STATE.pos.length();
  const deltaR = Math.abs(newR - SIM_STATE.prevR);
  SIM_STATE.deltaRMax = Math.max(SIM_STATE.deltaRMax * 0.98, deltaR);
  SIM_STATE.prevR = SIM_STATE.R;
  SIM_STATE.R = newR;
  SIM_STATE.energy = computeEnergy();
  SIM_STATE.frameCount++;

  const angularSettled = !SIM_STATE.angularActive ||
    SIM_STATE.atomOmegas.every(w => w.length() < 0.02);
  if (SIM_STATE.R < 5 && SIM_STATE.deltaRMax < 0.02 && angularSettled) {
    SIM_STATE.settledFrames++;
    if (SIM_STATE.settledFrames >= 60) {
      SIM_STATE.settled = true;
    }
  } else {
    SIM_STATE.settledFrames = 0;
  }
}

export function resetSimulation(impactParam, speed) {
  const b = impactParam !== undefined ? impactParam : SIM_CONFIG.IMPACT_PARAM;
  const v0 = speed !== undefined ? speed : SIM_CONFIG.V_APPROACH;
  const D = SIM_CONFIG.D_INIT;

  // Scale impact parameter by bond length so heavier molecules tumble at similar angular velocity
  const bScaled = b * BOND_FORMING_CONFIG.R_EQ / 1.4;
  SIM_STATE.pos.set(-D / 2, 0, bScaled / 2);
  SIM_STATE.vel.set(v0, 0, 0);
  SIM_STATE.R = 2 * SIM_STATE.pos.length();
  SIM_STATE.prevR = SIM_STATE.R;
  SIM_STATE.energy = computeEnergy();
  SIM_STATE.running = false;
  SIM_STATE.settled = false;
  SIM_STATE.settledFrames = 0;
  SIM_STATE.deltaRMax = 1;
  SIM_STATE.frameCount = 0;

  // Angular state: check if molecule has p-orbital character
  const hasP = BOND_FORMING_CONFIG.element !== 'H';
  SIM_STATE.angularActive = hasP;
  if (hasP) {
    for (let i = 0; i < 2; i++) {
      SIM_STATE.atomQuats[i].copy(randomQuaternion());
      SIM_STATE.atomOmegas[i].copy(randomOmega(OMEGA_INIT));
    }
  } else {
    for (let i = 0; i < 2; i++) {
      SIM_STATE.atomQuats[i].identity();
      SIM_STATE.atomOmegas[i].set(0, 0, 0);
    }
  }
}

export function getAtomPositions() {
  const p = SIM_STATE.pos;
  return {
    a: new THREE.Vector3(p.x, p.y, p.z),
    b: new THREE.Vector3(-p.x, -p.y, -p.z),
  };
}

// ---- 2-body trail system ----

const TRAIL_MAX = 300;
const TRAIL_RECORD_INTERVAL = 2;

let trailLineA = null;
let trailLineB = null;
let trailBufA = null;
let trailBufB = null;
let trailCount = 0;

export function initTrails(scene) {
  if (trailLineA) return;

  trailBufA = new Float32Array(TRAIL_MAX * 3);
  trailBufB = new Float32Array(TRAIL_MAX * 3);

  const geoA = new THREE.BufferGeometry();
  geoA.setAttribute('position', new THREE.BufferAttribute(trailBufA, 3));
  geoA.setDrawRange(0, 0);
  trailLineA = new THREE.Line(geoA, new THREE.LineBasicMaterial({ color: 0x6688ff, transparent: true, opacity: 0.6 }));
  scene.add(trailLineA);

  const geoB = new THREE.BufferGeometry();
  geoB.setAttribute('position', new THREE.BufferAttribute(trailBufB, 3));
  geoB.setDrawRange(0, 0);
  trailLineB = new THREE.Line(geoB, new THREE.LineBasicMaterial({ color: 0xff6644, transparent: true, opacity: 0.6 }));
  scene.add(trailLineB);

  trailCount = 0;
}

export function recordTrailPoint() {
  if (!trailLineA || SIM_STATE.frameCount % TRAIL_RECORD_INTERVAL !== 0) return;
  if (trailCount >= TRAIL_MAX) return;

  const { pos } = SIM_STATE;
  const i = trailCount * 3;

  trailBufA[i]     = pos.x;
  trailBufA[i + 1] = pos.y;
  trailBufA[i + 2] = pos.z;

  trailBufB[i]     = -pos.x;
  trailBufB[i + 1] = -pos.y;
  trailBufB[i + 2] = -pos.z;

  trailCount++;

  trailLineA.geometry.attributes.position.needsUpdate = true;
  trailLineA.geometry.setDrawRange(0, trailCount);

  trailLineB.geometry.attributes.position.needsUpdate = true;
  trailLineB.geometry.setDrawRange(0, trailCount);
}

export function clearTrails(scene) {
  if (trailLineA) {
    scene.remove(trailLineA);
    trailLineA.geometry.dispose();
    trailLineA.material.dispose();
    trailLineA = null;
  }
  if (trailLineB) {
    scene.remove(trailLineB);
    trailLineB.geometry.dispose();
    trailLineB.material.dispose();
    trailLineB = null;
  }
  trailBufA = null;
  trailBufB = null;
  trailCount = 0;
}

// Initialize with defaults
resetSimulation();

// ============================================================
// 3-body simulation (triatomic bond formation)
// ============================================================

export const SIM3_STATE = {
  pos: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
  vel: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
  config: null,       // triatomic config: { bonds, angle }
  R: [0, 0],          // bond distances
  energy: 0,
  running: false,
  settled: false,
  settledFrames: 0,
  deltaRMax: 0,
  prevR: [0, 0],
  frameCount: 0,
  // Angular momentum state
  atomQuats: [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()],
  atomOmegas: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
  angularActive: true,
};

// Scratch vectors for 3-body force computation
const _f3 = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _a3 = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _a3new = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _diff3 = new THREE.Vector3();

// ---- Pairwise Morse force between atoms i and j ----
// Adds force contributions to f[i] and f[j]

function morsePairForce(pos, f, i, j, morseParams) {
  const { De, a, R_EQ } = morseParams;
  _diff3.subVectors(pos[j], pos[i]);
  const R = _diff3.length();

  if (R < 0.01) return;

  const expTerm = Math.exp(-a * (R - R_EQ));
  const dVdR = 2 * De * a * (1 - expTerm) * expTerm;

  // Force on i: +dV/dR * (r_j - r_i)/|r_j - r_i|
  // Derivation: F_i = -∂V/∂r_i = -dV/dR * ∂R/∂r_i = -dV/dR * (-(r_j-r_i)/R) = +dV/dR * (r_j-r_i)/R
  const scale = dVdR / R;
  const fx = _diff3.x * scale;
  const fy = _diff3.y * scale;
  const fz = _diff3.z * scale;

  f[i].x += fx;  f[i].y += fy;  f[i].z += fz;
  f[j].x -= fx;  f[j].y -= fy;  f[j].z -= fz;
}

// ---- Stillinger-Weber-inspired angular force ----
// V₃ = k_angle · [cos(θ) - cos(θ₀)]² · h(r₁) · h(r₂)
// where h(r) is a smooth switching function that activates when bond is short
// θ is angle at atom j between bonds i-j and j-k

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function angleForceSW(pos, f, i, j, k, angleParams) {
  if (!angleParams) return;
  const { thetaEq, kAngle, rCut } = angleParams;

  _v1.subVectors(pos[i], pos[j]); // bond j→i
  _v2.subVectors(pos[k], pos[j]); // bond j→k
  const r1 = _v1.length();
  const r2 = _v2.length();

  if (r1 < 0.01 || r2 < 0.01) return;
  if (r1 >= rCut || r2 >= rCut) return;

  // Switching functions h(r) = exp(gamma / (r - rCut))
  const gamma = 1.5;
  const h1 = Math.exp(gamma / (r1 - rCut));
  const h2 = Math.exp(gamma / (r2 - rCut));

  // cos(theta)
  const cosTheta = _v1.dot(_v2) / (r1 * r2);
  const cosThetaEq = Math.cos(thetaEq);
  const dcos = cosTheta - cosThetaEq;

  // V = kAngle * dcos² * h1 * h2
  // Force contributions from d(cosTheta)/dr_i and d(cosTheta)/dr_k:
  // d(cosTheta)/dr_i = v2/(r1*r2) - cosTheta * v1/r1²
  // d(cosTheta)/dr_k = v1/(r1*r2) - cosTheta * v2/r2²
  const mainScale = -2 * kAngle * dcos * h1 * h2;

  // Force on atom i (from angle derivative)
  const ir1sq = 1 / (r1 * r1);
  const ir1r2 = 1 / (r1 * r2);
  const dfi_x = mainScale * (_v2.x * ir1r2 - cosTheta * _v1.x * ir1sq);
  const dfi_y = mainScale * (_v2.y * ir1r2 - cosTheta * _v1.y * ir1sq);
  const dfi_z = mainScale * (_v2.z * ir1r2 - cosTheta * _v1.z * ir1sq);
  f[i].x += dfi_x;  f[i].y += dfi_y;  f[i].z += dfi_z;

  // Force on atom k (from angle derivative)
  const ir2sq = 1 / (r2 * r2);
  const dfk_x = mainScale * (_v1.x * ir1r2 - cosTheta * _v2.x * ir2sq);
  const dfk_y = mainScale * (_v1.y * ir1r2 - cosTheta * _v2.y * ir2sq);
  const dfk_z = mainScale * (_v1.z * ir1r2 - cosTheta * _v2.z * ir2sq);
  f[k].x += dfk_x;  f[k].y += dfk_y;  f[k].z += dfk_z;

  // Force on central atom j (Newton's 3rd law — only angle increments)
  f[j].x -= (dfi_x + dfk_x);
  f[j].y -= (dfi_y + dfk_y);
  f[j].z -= (dfi_z + dfk_z);

  // Distance-dependent switching force contributions
  // dV/dr1 from h1' = h1 * (-gamma/(r1-rCut)²)
  const dh1dr1 = h1 * (-gamma / ((r1 - rCut) * (r1 - rCut)));
  const hScale1 = kAngle * dcos * dcos * dh1dr1 * h2;
  // This force acts along the r1 direction (v1 = pos_i - pos_j)
  const s1 = -hScale1 / r1;
  f[i].x += s1 * _v1.x;  f[i].y += s1 * _v1.y;  f[i].z += s1 * _v1.z;
  f[j].x -= s1 * _v1.x;  f[j].y -= s1 * _v1.y;  f[j].z -= s1 * _v1.z;

  const dh2dr2 = h2 * (-gamma / ((r2 - rCut) * (r2 - rCut)));
  const hScale2 = kAngle * dcos * dcos * h1 * dh2dr2;
  const s2 = -hScale2 / r2;
  f[k].x += s2 * _v2.x;  f[k].y += s2 * _v2.y;  f[k].z += s2 * _v2.z;
  f[j].x -= s2 * _v2.x;  f[j].y -= s2 * _v2.y;  f[j].z -= s2 * _v2.z;
}

// ---- Compute all forces for 3-body ----

function compute3Forces(pos, f) {
  f[0].set(0, 0, 0);
  f[1].set(0, 0, 0);
  f[2].set(0, 0, 0);

  const cfg = SIM3_STATE.config;
  if (!cfg) return;

  // Morse forces for each bonded pair
  for (let b = 0; b < cfg.bonds.length; b++) {
    const [bi, bj] = cfg.bonds[b];
    morsePairForce(pos, f, bi, bj, cfg.morse[b]);
  }

  // Angular force (if specified)
  if (cfg.angle) {
    // Angle at atom cfg.angle.center between bonds
    angleForceSW(pos, f, cfg.angle.i, cfg.angle.center, cfg.angle.k, cfg.angle);
  }
}

// ---- 3-body damping (momentum-conserving, relative to bond partners) ----

const _rd3 = new THREE.Vector3();

function applyDamping3(vel, pos) {
  const cfg = SIM3_STATE.config;
  if (!cfg) return;
  const dt = SIM_CONFIG.DT;
  // 3-body needs stronger damping than 2-body COM frame to capture fly-by trajectories
  const GAMMA3_RAD = 0.8;
  const GAMMA3_TAN = 0.4;

  // Iterate over bonded pairs, damp relative velocity along each bond
  for (let b = 0; b < cfg.bonds.length; b++) {
    const [bi, bj] = cfg.bonds[b];
    _rd3.subVectors(pos[bj], pos[bi]);
    const R = _rd3.length();
    if (R > 8 || R < 0.01) continue;
    _rd3.divideScalar(R);

    const dampScale = R < 3 ? 1 : Math.max(0, 1 - (R - 3) / 3);

    // Relative velocity: v_bj - v_bi
    const vRelX = vel[bj].x - vel[bi].x;
    const vRelY = vel[bj].y - vel[bi].y;
    const vRelZ = vel[bj].z - vel[bi].z;

    // Radial component of relative velocity (along bond)
    const vRadial = vRelX * _rd3.x + vRelY * _rd3.y + vRelZ * _rd3.z;

    // Tangential component (perpendicular to bond)
    const vTanX = vRelX - vRadial * _rd3.x;
    const vTanY = vRelY - vRadial * _rd3.y;
    const vTanZ = vRelZ - vRadial * _rd3.z;

    // Damping: fraction of relative velocity to remove
    const radialDamp = (1 - Math.exp(-GAMMA3_RAD * dampScale * dt)) * vRadial;
    const tanFrac = 1 - Math.exp(-GAMMA3_TAN * dampScale * dt);

    // Impulse applied equally to both atoms (conserves total momentum)
    const ix = 0.5 * (radialDamp * _rd3.x + tanFrac * vTanX);
    const iy = 0.5 * (radialDamp * _rd3.y + tanFrac * vTanY);
    const iz = 0.5 * (radialDamp * _rd3.z + tanFrac * vTanZ);

    vel[bi].x += ix;  vel[bi].y += iy;  vel[bi].z += iz;
    vel[bj].x -= ix;  vel[bj].y -= iy;  vel[bj].z -= iz;
  }
}

// ---- 3-body velocity Verlet ----

function substep3() {
  const { pos, vel } = SIM3_STATE;
  const dt = SIM_CONFIG.DT;

  // a(t)
  compute3Forces(pos, _a3);

  // x(t+dt)
  for (let i = 0; i < 3; i++) {
    pos[i].x += vel[i].x * dt + 0.5 * _a3[i].x * dt * dt;
    pos[i].y += vel[i].y * dt + 0.5 * _a3[i].y * dt * dt;
    pos[i].z += vel[i].z * dt + 0.5 * _a3[i].z * dt * dt;
  }

  // a(t+dt)
  compute3Forces(pos, _a3new);

  // v(t+dt)
  for (let i = 0; i < 3; i++) {
    vel[i].x += 0.5 * (_a3[i].x + _a3new[i].x) * dt;
    vel[i].y += 0.5 * (_a3[i].y + _a3new[i].y) * dt;
    vel[i].z += 0.5 * (_a3[i].z + _a3new[i].z) * dt;
  }

  applyDamping3(vel, pos);
  updateAngular3(dt);
}

// ---- 3-body energy ----

function compute3Energy() {
  const { pos, vel, config: cfg } = SIM3_STATE;

  // Kinetic
  let KE = 0;
  for (let i = 0; i < 3; i++) KE += 0.5 * vel[i].lengthSq();

  // Morse potential per bond
  let PE = 0;
  for (let b = 0; b < cfg.bonds.length; b++) {
    const [bi, bj] = cfg.bonds[b];
    const R = pos[bi].distanceTo(pos[bj]);
    const { De, a, R_EQ } = cfg.morse[b];
    const x = 1 - Math.exp(-a * (R - R_EQ));
    PE += De * x * x - De;
  }

  // Angle potential
  if (cfg.angle) {
    _v1.subVectors(pos[cfg.angle.i], pos[cfg.angle.center]);
    _v2.subVectors(pos[cfg.angle.k], pos[cfg.angle.center]);
    const r1 = _v1.length();
    const r2 = _v2.length();
    if (r1 > 0.01 && r2 > 0.01 && r1 < cfg.angle.rCut && r2 < cfg.angle.rCut) {
      const cosTheta = _v1.dot(_v2) / (r1 * r2);
      const dcos = cosTheta - Math.cos(cfg.angle.thetaEq);
      const h1 = Math.exp(1.5 / (r1 - cfg.angle.rCut));
      const h2 = Math.exp(1.5 / (r2 - cfg.angle.rCut));
      PE += cfg.angle.kAngle * dcos * dcos * h1 * h2;
    }
  }

  return KE + PE;
}

// ---- Step 3-body simulation ----

export function step3Simulation() {
  if (!SIM3_STATE.running) return;

  for (let i = 0; i < SIM_CONFIG.SUBSTEPS; i++) {
    substep3();
  }

  const cfg = SIM3_STATE.config;
  let maxDeltaR = 0;
  for (let b = 0; b < cfg.bonds.length; b++) {
    const [bi, bj] = cfg.bonds[b];
    const newR = SIM3_STATE.pos[bi].distanceTo(SIM3_STATE.pos[bj]);
    const deltaR = Math.abs(newR - SIM3_STATE.prevR[b]);
    if (deltaR > maxDeltaR) maxDeltaR = deltaR;
    SIM3_STATE.prevR[b] = SIM3_STATE.R[b];
    SIM3_STATE.R[b] = newR;
  }

  SIM3_STATE.deltaRMax = Math.max(SIM3_STATE.deltaRMax * 0.98, maxDeltaR);
  SIM3_STATE.energy = compute3Energy();
  SIM3_STATE.frameCount++;

  // Settling: all bonds near equilibrium, oscillation small, and angular velocity small
  const allNear = SIM3_STATE.R.every((r, b) => r < cfg.morse[b].R_EQ * 2);
  const angularSettled3 = !SIM3_STATE.angularActive ||
    SIM3_STATE.atomOmegas.every(w => w.length() < 0.02);
  if (allNear && SIM3_STATE.deltaRMax < 0.02 && angularSettled3) {
    SIM3_STATE.settledFrames++;
    if (SIM3_STATE.settledFrames >= 60) {
      SIM3_STATE.settled = true;
    }
  } else {
    SIM3_STATE.settledFrames = 0;
  }
}

// ---- Reset 3-body simulation ----

export function reset3Simulation(triConfig, impactParam, speed) {
  const b = impactParam !== undefined ? impactParam : SIM_CONFIG.IMPACT_PARAM;
  const v0 = speed !== undefined ? speed : SIM_CONFIG.V_APPROACH;

  SIM3_STATE.config = triConfig;
  const init = triConfig.initial;

  for (let i = 0; i < 3; i++) {
    const ip = init.positions[i];
    SIM3_STATE.pos[i].set(ip[0], ip[1] + (i === 0 ? b * 0.5 : i === 2 ? -b * 0.5 : 0), ip[2]);
    const iv = init.velocities[i];
    SIM3_STATE.vel[i].set(iv[0] * v0, iv[1] * v0, iv[2] * v0);
  }

  for (let bn = 0; bn < triConfig.bonds.length; bn++) {
    const [bi, bj] = triConfig.bonds[bn];
    SIM3_STATE.R[bn] = SIM3_STATE.pos[bi].distanceTo(SIM3_STATE.pos[bj]);
    SIM3_STATE.prevR[bn] = SIM3_STATE.R[bn];
  }

  SIM3_STATE.energy = compute3Energy();
  SIM3_STATE.running = false;
  SIM3_STATE.settled = false;
  SIM3_STATE.settledFrames = 0;
  SIM3_STATE.deltaRMax = 1;
  SIM3_STATE.frameCount = 0;

  // Angular state: pre-bonded atoms get identity (already aligned), free atom gets random
  SIM3_STATE.angularActive = true;
  // In the initial config, the free atom is the one that approaches from far away.
  // For CO₂: atom 0 (O) approaches, atoms 1,2 (C,O) are pre-bonded
  // For O₃: atom 2 (O) approaches, atoms 0,1 (O,O) are pre-bonded
  // Determine free atom by finding which one is farthest from the others
  let freeIdx = -1;
  let maxMinDist = 0;
  for (let i = 0; i < 3; i++) {
    let minDist = Infinity;
    for (let j = 0; j < 3; j++) {
      if (i === j) continue;
      const d = SIM3_STATE.pos[i].distanceTo(SIM3_STATE.pos[j]);
      if (d < minDist) minDist = d;
    }
    if (minDist > maxMinDist) { maxMinDist = minDist; freeIdx = i; }
  }
  for (let i = 0; i < 3; i++) {
    if (i === freeIdx) {
      SIM3_STATE.atomQuats[i].copy(randomQuaternion());
      SIM3_STATE.atomOmegas[i].copy(randomOmega(OMEGA_INIT));
    } else {
      SIM3_STATE.atomQuats[i].identity();
      SIM3_STATE.atomOmegas[i].set(0, 0, 0);
    }
  }
}

// ---- Get 3-atom positions ----

export function get3AtomPositions() {
  return SIM3_STATE.pos.map(p => p.clone());
}

// ---- Molecular frame quaternion helpers ----

// Compute qMol for 2-body: canonical frame has bond along z-axis.
// qMol transforms canonical z to the actual bond direction in world frame.
const _molQuat = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);

function computeMolQuat2() {
  const { pos } = SIM_STATE;
  // Bond direction: from atom a (+pos) to atom b (-pos) = -2*pos
  const bondDir = new THREE.Vector3(-pos.x, -pos.y, -pos.z).normalize();
  _molQuat.setFromUnitVectors(_zAxis, bondDir);
  return _molQuat;
}

// Compute qMol for 3-body: must match orientTriatomicDynGroup in main.js exactly.
// Linear: axis from pos[0] to pos[2] mapped to canonical z.
// Bent: center=pos[1], canonical x→side, y→normal, z→bisector.
function computeMolQuat3() {
  const { pos, config } = SIM3_STATE;
  if (!config) return new THREE.Quaternion();

  if (config.angle) {
    // Bent molecule: center is always atom 1 (matches orientTriatomicDynGroup)
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
    // Ensure side points toward atom 0 (matches orientTriatomicDynGroup convention)
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

// ---- Orientation exports ----

// Returns array of 9-element flat rotation matrices (one per atom) for 2-body.
// Each matrix = R(qAtom⁻¹ * qMol): transforms canonical-frame displacement to atom-local frame.
// At equilibrium (qAtom = qMol), this is identity → no rotation → matches non-angular behavior.
export function getAtomOrientations() {
  if (!SIM_STATE.angularActive) return null;
  const qMol = computeMolQuat2();
  return SIM_STATE.atomQuats.map(q => {
    const qForRot = q.clone().conjugate().multiply(qMol);  // qAtom⁻¹ * qMol
    return quatToRotMatrix9(qForRot);
  });
}

// Returns array of 9-element flat rotation matrices (one per atom) for 3-body
export function get3AtomOrientations() {
  if (!SIM3_STATE.angularActive) return null;
  const qMol = computeMolQuat3();
  return SIM3_STATE.atomQuats.map(q => {
    const qForRot = q.clone().conjugate().multiply(qMol);  // qAtom⁻¹ * qMol
    return quatToRotMatrix9(qForRot);
  });
}

// ---- 3-atom trail system ----

const TRAIL3_COLORS = [0x6688ff, 0x44dd66, 0xff6644];
let trail3Lines = [null, null, null];
let trail3Bufs = [null, null, null];
let trail3Count = 0;

export function init3Trails(scene) {
  if (trail3Lines[0]) return;

  for (let i = 0; i < 3; i++) {
    trail3Bufs[i] = new Float32Array(TRAIL_MAX * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(trail3Bufs[i], 3));
    geo.setDrawRange(0, 0);
    trail3Lines[i] = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: TRAIL3_COLORS[i], transparent: true, opacity: 0.6,
    }));
    scene.add(trail3Lines[i]);
  }
  trail3Count = 0;
}

export function record3TrailPoint() {
  if (!trail3Lines[0] || SIM3_STATE.frameCount % TRAIL_RECORD_INTERVAL !== 0) return;
  if (trail3Count >= TRAIL_MAX) return;

  const idx = trail3Count * 3;
  for (let a = 0; a < 3; a++) {
    const p = SIM3_STATE.pos[a];
    trail3Bufs[a][idx]     = p.x;
    trail3Bufs[a][idx + 1] = p.y;
    trail3Bufs[a][idx + 2] = p.z;
  }
  trail3Count++;

  for (let a = 0; a < 3; a++) {
    trail3Lines[a].geometry.attributes.position.needsUpdate = true;
    trail3Lines[a].geometry.setDrawRange(0, trail3Count);
  }
}

export function clear3Trails(scene) {
  for (let i = 0; i < 3; i++) {
    if (trail3Lines[i]) {
      scene.remove(trail3Lines[i]);
      trail3Lines[i].geometry.dispose();
      trail3Lines[i].material.dispose();
      trail3Lines[i] = null;
    }
    trail3Bufs[i] = null;
  }
  trail3Count = 0;
}
