// 3-body dynamics: triatomic bond formation simulation with angular momentum.

import * as THREE from 'three';
import { SIM_CONFIG } from './dynamics-2body.js';
import {
  randomQuaternion, randomOmega, integrateQuaternion, quatAlignmentTorque, computeMolQuat3
} from './dynamics-angular.js';

// ---- Angular dynamics parameters (shared with 2-body) ----

const K_ALIGN_BASE = 0.5;   // alignment spring strength (scaled by De)
const GAMMA_ANGULAR = 0.3;  // angular damping coefficient
const OMEGA_INIT = 3.0;     // initial angular velocity magnitude (rad/unit)

// ---- Simulation state ----

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

// Scratch vectors for force computation
const _f3 = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _a3 = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _a3new = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _diff3 = new THREE.Vector3();

// ---- Pairwise Morse force between atoms i and j ----

function morsePairForce(pos, f, i, j, morseParams) {
  const { De, a, R_EQ } = morseParams;
  _diff3.subVectors(pos[j], pos[i]);
  const R = _diff3.length();

  if (R < 0.01) return;

  const expTerm = Math.exp(-a * (R - R_EQ));
  const dVdR = 2 * De * a * (1 - expTerm) * expTerm;

  // Force on i: +dV/dR * (r_j - r_i)/|r_j - r_i|
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
  const dh1dr1 = h1 * (-gamma / ((r1 - rCut) * (r1 - rCut)));
  const hScale1 = kAngle * dcos * dcos * dh1dr1 * h2;
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

// ---- Angular dynamics ----

// Proximity function: full strength when R < 3, fades to 0 by R = 8
function angularDampScale(R) {
  if (R > 8) return 0;
  if (R < 3) return 1;
  return 1 - (R - 3) / 5;
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
  const qMol = computeMolQuat3(pos, config);

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

// ---- Velocity Verlet integration ----

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

// ---- Energy computation ----

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

// ---- Public API ----

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

export function get3AtomPositions() {
  return SIM3_STATE.pos.map(p => p.clone());
}

// ---- 3-atom trail system ----

const TRAIL_MAX = 300;
const TRAIL_RECORD_INTERVAL = 2;
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
