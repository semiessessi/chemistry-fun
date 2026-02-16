// 2-body dynamics: diatomic bond formation simulation with angular momentum.

import * as THREE from 'three';
import { BOND_FORMING_CONFIG } from './bond-forming.js';
import {
  randomQuaternion, randomOmega, integrateQuaternion, quatAlignmentTorque, computeMolQuat2
} from './dynamics-angular.js';

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

// ---- Angular dynamics parameters ----

const K_ALIGN_BASE = 0.5;   // alignment spring strength (scaled by De)
const GAMMA_ANGULAR = 0.3;  // angular damping coefficient
const OMEGA_INIT = 3.0;     // initial angular velocity magnitude (rad/unit)

// ---- Simulation state ----

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

// ---- Force computation ----

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

// ---- Damping ----

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

// ---- Angular dynamics ----

// Proximity function: full strength when R < 3, fades to 0 by R = 8
function angularDampScale(R) {
  if (R > 8) return 0;
  if (R < 3) return 1;
  return 1 - (R - 3) / 5;
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
  const qMol = computeMolQuat2(pos);

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

// ---- Velocity Verlet integration ----

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

// ---- Energy computation ----

function computeEnergy() {
  const { pos, vel } = SIM_STATE;
  const R = 2 * pos.length();
  const { De, a, R_EQ } = BOND_FORMING_CONFIG;
  const KE = vel.lengthSq();
  const x = 1 - Math.exp(-a * (R - R_EQ));
  const PE = De * x * x - De;
  return KE + PE;
}

// ---- Public API ----

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
