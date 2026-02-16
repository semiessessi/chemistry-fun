// Unified N-body reaction physics: Morse dynamics with impact parameter & speed controls.
// All reactions use the same simulateReaction() → keyframes → buildFrameCache pipeline.

import * as THREE from 'three';
import { evaluateOrbital } from './math.js';
import { sampleGrid, computeMultiThresholds } from './grid.js';
import { getLayerMaterials } from './layer-materials.js';
import { marchingCubes } from './marching-cubes.js';
import { scene } from './scene.js';
import { BaseFrameController } from './controllers/base-frame-controller.js';

const NUM_FRAMES = 24;
const DEG = Math.PI / 180;

// ---- Simulation constants (matching dynamics.js) ----
const DT = 0.005;
const SUBSTEPS = 6;
const GAMMA_RADIAL = 0.8;
const GAMMA_TANGENTIAL = 0.4;
const LJ_EPSILON = 0.3;
const LJ_SIGMA = 2.5;
const MAX_STEPS = 6000;
const SETTLE_THRESHOLD = 0.02;
const SETTLE_FRAMES = 60;
const SNAPSHOT_INTERVAL = 6;
const TARGET_KEYFRAMES = 10;

// ---- Element visual properties for inline ball-and-stick ----
const ELEM_COLORS = {
  C: 0x333333, H: 0xffffff, O: 0xff2222, N: 0x3333ff,
  Cl: 0x22cc22, F: 0xaaff00, S: 0xffff33, Br: 0x882200,
};
const ELEM_RADII = {
  C: 0.4, H: 0.25, O: 0.35, N: 0.35,
  Cl: 0.45, F: 0.3, S: 0.5, Br: 0.5,
};

// ---- Rotation matrix: maps local z-axis → bond direction ----
function buildRotationMatrix(dx, dy, dz) {
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-10) return null;
  const zx = dx / len, zy = dy / len, zz = dz / len;
  let ux, uy, uz;
  if (Math.abs(zz) < 0.9) { ux = 0; uy = 0; uz = 1; }
  else { ux = 1; uy = 0; uz = 0; }
  const xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
  const xlen = Math.sqrt(xx * xx + xy * xy + xz * xz);
  const nx = xx / xlen, ny = xy / xlen, nz = xz / xlen;
  const yx = zy * nz - zz * ny, yy = zz * nx - zx * nz, yz = zx * ny - zy * nx;
  return [nx, ny, nz, yx, yy, yz, zx, zy, zz];
}

// ---- Auto-generate σ-bond MOs from atom positions and bonds ----
function generateMOs(atoms, bonds) {
  const mos = [];
  for (const [ai, aj, order] of bonds) {
    if (order < 0.05) continue;
    const [, ax, ay, az] = atoms[ai];
    const [, bx, by, bz] = atoms[aj];
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const rot = buildRotationMatrix(dx, dy, dz);
    if (!rot) continue;
    const c = Math.sqrt(Math.max(0.05, order)) * 0.5;
    mos.push({
      terms: [
        { n: 1, l: 0, m: 0, angType: 'real', center: [ax, ay, az], coeff: c },
        { n: 2, l: 1, m: 0, angType: 'real', center: [ax, ay, az], coeff: c * 0.6, rot },
        { n: 1, l: 0, m: 0, angType: 'real', center: [bx, by, bz], coeff: c },
        { n: 2, l: 1, m: 0, angType: 'real', center: [bx, by, bz], coeff: -c * 0.6, rot },
      ]
    });
  }
  return mos;
}

// ---- Interpolation ----
function lerp(a, b, t) { return a + (b - a) * t; }

function interpolateKeyframes(reaction, t) {
  const kfs = reaction.keyframes;
  const n = kfs.length - 1;
  const raw = Math.max(0, Math.min(1, t)) * n;
  const i = Math.min(Math.floor(raw), n - 1);
  const frac = raw - i;
  const kf0 = kfs[i], kf1 = kfs[i + 1];

  const atoms = kf0.atoms.map((a0, idx) => {
    const a1 = kf1.atoms[idx];
    return [a0[0], lerp(a0[1], a1[1], frac), lerp(a0[2], a1[2], frac), lerp(a0[3], a1[3], frac)];
  });

  const bonds = kf0.bonds.map((b0, idx) => {
    const b1 = kf1.bonds[idx];
    return [b0[0], b0[1], lerp(b0[2], b1[2], frac)];
  });

  const desc = frac < 0.5 ? kf0.description : kf1.description;
  return { atoms, bonds, description: desc };
}

// ---- Inline ball-and-stick builder ----
const _sphereGeo = new THREE.SphereGeometry(1, 16, 12);
const _cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
const _up = new THREE.Vector3(0, 1, 0);

function buildBallAndStick(group, atoms, bonds) {
  for (const [elem, x, y, z] of atoms) {
    const mat = new THREE.MeshPhongMaterial({ color: ELEM_COLORS[elem] || 0x888888 });
    const mesh = new THREE.Mesh(_sphereGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(ELEM_RADII[elem] || 0.3);
    group.add(mesh);
  }

  const dir = new THREE.Vector3();
  const mid = new THREE.Vector3();

  for (const [ai, aj, order] of bonds) {
    if (order < 0.1) continue;
    const [, ax, ay, az] = atoms[ai];
    const [, bx, by, bz] = atoms[aj];
    mid.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    dir.set(bx - ax, by - ay, bz - az);
    const len = dir.length();
    if (len < 0.01) continue;
    dir.normalize();

    const opacity = Math.min(1, order);
    const mat = new THREE.MeshPhongMaterial({
      color: 0x666666,
      transparent: opacity < 0.95,
      opacity,
    });
    const mesh = new THREE.Mesh(_cylGeo, mat);
    mesh.position.copy(mid);
    mesh.scale.set(0.08, len, 0.08);
    mesh.quaternion.setFromUnitVectors(_up, dir);
    group.add(mesh);
  }
}

// ================================================================
// N-Body Physics Simulator
// ================================================================

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ---- Bond order from distance (smooth fade for ball-and-stick display) ----
function bondOrderFromR(R, R_EQ) {
  if (R <= R_EQ * 1.2) return 1.0;
  if (R >= R_EQ * 3.5) return 0.0;
  return 1.0 - (R - R_EQ * 1.2) / (R_EQ * 3.5 - R_EQ * 1.2);
}

// ---- Reactive coupling: weaken breaking bonds as forming bonds strengthen ----
function reactiveCoupling(config, pos) {
  if (!config.reactivePairs) return;
  for (const pair of config.reactivePairs) {
    const formBond = config.bonds.find(b => b.i[0] === pair.forming[0] && b.i[1] === pair.forming[1]);
    const breakBond = config.bonds.find(b => b.i[0] === pair.breaking[0] && b.i[1] === pair.breaking[1]);
    if (!formBond || !breakBond) continue;

    const fi = pair.forming[0] * 3, fj = pair.forming[1] * 3;
    const dx = pos[fj] - pos[fi], dy = pos[fj + 1] - pos[fi + 1], dz = pos[fj + 2] - pos[fi + 2];
    const Rf = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const progress = 1 - clamp((Rf - formBond.R_EQ) / (3 * formBond.R_EQ), 0, 1);
    breakBond._De = breakBond.De * (1 - progress * 0.9);
  }
}

// ---- Compute all N-body forces ----
function computeNBodyForces(pos, vel, config, forces) {
  const N = config.numAtoms;
  // Zero forces
  for (let i = 0; i < N * 3; i++) forces[i] = 0;

  // Reset dynamic De
  for (const bond of config.bonds) bond._De = bond.De;

  // Reactive coupling adjustments
  reactiveCoupling(config, pos);

  // Morse pair forces for each bond
  for (const bond of config.bonds) {
    const ii = bond.i[0] * 3, jj = bond.i[1] * 3;
    const dx = pos[jj] - pos[ii], dy = pos[jj + 1] - pos[ii + 1], dz = pos[jj + 2] - pos[ii + 2];
    const R = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (R < 0.01) continue;

    const De = bond._De;
    const expTerm = Math.exp(-bond.a * (R - bond.R_EQ));
    const dVdR = 2 * De * bond.a * (1 - expTerm) * expTerm;
    const scale = dVdR / R;

    forces[ii] += dx * scale;     forces[ii + 1] += dy * scale;     forces[ii + 2] += dz * scale;
    forces[jj] -= dx * scale;     forces[jj + 1] -= dy * scale;     forces[jj + 2] -= dz * scale;
  }

  // Stillinger-Weber angle forces
  if (config.angles) {
    for (const ang of config.angles) {
      const ii = ang.i * 3, jj = ang.j * 3, kk = ang.k * 3;
      // v1 = pos[i] - pos[j], v2 = pos[k] - pos[j]
      const v1x = pos[ii] - pos[jj], v1y = pos[ii + 1] - pos[jj + 1], v1z = pos[ii + 2] - pos[jj + 2];
      const v2x = pos[kk] - pos[jj], v2y = pos[kk + 1] - pos[jj + 1], v2z = pos[kk + 2] - pos[jj + 2];
      const r1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z);
      const r2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z);
      if (r1 < 0.01 || r2 < 0.01) continue;
      const rCut = ang.rCut || 5.0;
      if (r1 >= rCut || r2 >= rCut) continue;

      const gamma = 1.5;
      const h1 = Math.exp(gamma / (r1 - rCut));
      const h2 = Math.exp(gamma / (r2 - rCut));
      const cosTheta = (v1x * v2x + v1y * v2y + v1z * v2z) / (r1 * r2);
      const cosThetaEq = Math.cos(ang.thetaEq);
      const dcos = cosTheta - cosThetaEq;
      const kA = ang.kAngle;
      const mainScale = -2 * kA * dcos * h1 * h2;

      const ir1sq = 1 / (r1 * r1), ir2sq = 1 / (r2 * r2), ir1r2 = 1 / (r1 * r2);

      const dfi_x = mainScale * (v2x * ir1r2 - cosTheta * v1x * ir1sq);
      const dfi_y = mainScale * (v2y * ir1r2 - cosTheta * v1y * ir1sq);
      const dfi_z = mainScale * (v2z * ir1r2 - cosTheta * v1z * ir1sq);
      forces[ii] += dfi_x; forces[ii + 1] += dfi_y; forces[ii + 2] += dfi_z;

      const dfk_x = mainScale * (v1x * ir1r2 - cosTheta * v2x * ir2sq);
      const dfk_y = mainScale * (v1y * ir1r2 - cosTheta * v2y * ir2sq);
      const dfk_z = mainScale * (v1z * ir1r2 - cosTheta * v2z * ir2sq);
      forces[kk] += dfk_x; forces[kk + 1] += dfk_y; forces[kk + 2] += dfk_z;

      forces[jj] -= (dfi_x + dfk_x); forces[jj + 1] -= (dfi_y + dfk_y); forces[jj + 2] -= (dfi_z + dfk_z);

      // Switching force from h'
      const dh1dr1 = h1 * (-gamma / ((r1 - rCut) * (r1 - rCut)));
      const hScale1 = kA * dcos * dcos * dh1dr1 * h2;
      const s1 = -hScale1 / r1;
      forces[ii] += s1 * v1x; forces[ii + 1] += s1 * v1y; forces[ii + 2] += s1 * v1z;
      forces[jj] -= s1 * v1x; forces[jj + 1] -= s1 * v1y; forces[jj + 2] -= s1 * v1z;

      const dh2dr2 = h2 * (-gamma / ((r2 - rCut) * (r2 - rCut)));
      const hScale2 = kA * dcos * dcos * h1 * dh2dr2;
      const s2 = -hScale2 / r2;
      forces[kk] += s2 * v2x; forces[kk + 1] += s2 * v2y; forces[kk + 2] += s2 * v2z;
      forces[jj] -= s2 * v2x; forces[jj + 1] -= s2 * v2y; forces[jj + 2] -= s2 * v2z;
    }
  }

  // Soft LJ repulsion between non-bonded atom pairs
  const bonded = config._bondedSet;
  for (let a = 0; a < N; a++) {
    for (let b = a + 1; b < N; b++) {
      if (bonded.has(a * N + b)) continue;
      const ai = a * 3, bi = b * 3;
      const dx = pos[bi] - pos[ai], dy = pos[bi + 1] - pos[ai + 1], dz = pos[bi + 2] - pos[ai + 2];
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 > 64) continue; // skip beyond 8 Bohr
      const r = Math.sqrt(r2);
      if (r < 0.5) continue;
      // Repulsive-only: F = epsilon * 12 * (sigma/r)^12 / r
      const sr = LJ_SIGMA / r;
      const sr6 = sr * sr * sr * sr * sr * sr;
      const sr12 = sr6 * sr6;
      const fMag = LJ_EPSILON * 12 * sr12 / r;
      const fx = fMag * dx / r, fy = fMag * dy / r, fz = fMag * dz / r;
      // Repulsion pushes them apart: force on a is -direction, on b is +direction
      forces[ai] -= fx; forces[ai + 1] -= fy; forces[ai + 2] -= fz;
      forces[bi] += fx; forces[bi + 1] += fy; forces[bi + 2] += fz;
    }
  }
}

// ---- Per-bond damping (momentum-conserving) ----
function applyNBodyDamping(pos, vel, config) {
  for (const bond of config.bonds) {
    const ii = bond.i[0] * 3, jj = bond.i[1] * 3;
    const dx = pos[jj] - pos[ii], dy = pos[jj + 1] - pos[ii + 1], dz = pos[jj + 2] - pos[ii + 2];
    const R = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (R > 8 || R < 0.01) continue;
    const rdx = dx / R, rdy = dy / R, rdz = dz / R;
    const dampScale = R < 3 ? 1 : Math.max(0, 1 - (R - 3) / 3);

    const vRelX = vel[jj] - vel[ii], vRelY = vel[jj + 1] - vel[ii + 1], vRelZ = vel[jj + 2] - vel[ii + 2];
    const vRadial = vRelX * rdx + vRelY * rdy + vRelZ * rdz;
    const vTanX = vRelX - vRadial * rdx, vTanY = vRelY - vRadial * rdy, vTanZ = vRelZ - vRadial * rdz;

    const radialDamp = (1 - Math.exp(-GAMMA_RADIAL * dampScale * DT)) * vRadial;
    const tanFrac = 1 - Math.exp(-GAMMA_TANGENTIAL * dampScale * DT);

    const ix = 0.5 * (radialDamp * rdx + tanFrac * vTanX);
    const iy = 0.5 * (radialDamp * rdy + tanFrac * vTanY);
    const iz = 0.5 * (radialDamp * rdz + tanFrac * vTanZ);

    vel[ii] += ix;     vel[ii + 1] += iy;     vel[ii + 2] += iz;
    vel[jj] -= ix;     vel[jj + 1] -= iy;     vel[jj + 2] -= iz;
  }
}

// ---- Velocity Verlet substep ----
function nBodySubstep(pos, vel, config, forces, forcesNew) {
  const N3 = config.numAtoms * 3;

  // a(t)
  computeNBodyForces(pos, vel, config, forces);

  // x(t+dt) = x(t) + v(t)*dt + 0.5*a(t)*dt²
  for (let i = 0; i < N3; i++) {
    pos[i] += vel[i] * DT + 0.5 * forces[i] * DT * DT;
  }

  // a(t+dt)
  computeNBodyForces(pos, vel, config, forcesNew);

  // v(t+dt) = v(t) + 0.5*(a(t)+a(t+dt))*dt
  for (let i = 0; i < N3; i++) {
    vel[i] += 0.5 * (forces[i] + forcesNew[i]) * DT;
  }

  applyNBodyDamping(pos, vel, config);
}

// ---- Build snapshot (keyframe) from flat position array ----
function buildSnapshot(pos, config, description) {
  const atoms = [];
  for (let a = 0; a < config.numAtoms; a++) {
    atoms.push([config.elements[a], pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]]);
  }

  const bonds = [];
  for (const bond of config.bonds) {
    const ai = bond.i[0], aj = bond.i[1];
    const dx = pos[aj * 3] - pos[ai * 3], dy = pos[aj * 3 + 1] - pos[ai * 3 + 1], dz = pos[aj * 3 + 2] - pos[ai * 3 + 2];
    const R = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const order = bondOrderFromR(R, bond.R_EQ) * (bond.nominalOrder || 1);
    bonds.push([ai, aj, order]);
  }

  return { atoms, bonds, description };
}

// ---- Main simulation entry point ----
function simulateReaction(config, impactParam, speed, angle) {
  const N = config.numAtoms;
  const N3 = N * 3;

  // Build bonded set for LJ exclusion
  config._bondedSet = new Set();
  for (const bond of config.bonds) {
    const a = bond.i[0], b = bond.i[1];
    config._bondedSet.add(Math.min(a, b) * N + Math.max(a, b));
  }

  // Flatten fragment atoms into world positions
  const pos = new Float64Array(N3);
  const vel = new Float64Array(N3);

  // Compute fragment centers
  let offset = 0;
  const fragCenters = [];
  for (const frag of config.fragments) {
    let cx = 0, cy = 0, cz = 0;
    for (const atom of frag.atoms) {
      cx += atom[1]; cy += atom[2]; cz += atom[3];
    }
    const n = frag.atoms.length;
    fragCenters.push([cx / n, cy / n, cz / n]);
    offset += n;
  }

  // Place fragments symmetrically along x-axis, offset by impact parameter in z
  const sep = config.separation || 12;
  const bScaled = impactParam * 2.0; // impact parameter in Bohr
  const angleRad = (angle || 0) * DEG; // approach angle in xz-plane

  offset = 0;
  for (let f = 0; f < config.fragments.length; f++) {
    const frag = config.fragments[f];
    const fc = fragCenters[f];
    const sign = f === 0 ? -1 : 1;
    const shiftX = sign * sep / 2;
    const shiftZ = sign * bScaled / 2; // symmetric impact offset
    for (const atom of frag.atoms) {
      pos[offset * 3] = atom[1] - fc[0] + shiftX;
      pos[offset * 3 + 1] = atom[2] - fc[1];
      pos[offset * 3 + 2] = atom[3] - fc[2] + shiftZ;
      offset++;
    }
  }

  // Set initial velocities: both fragments move toward each other symmetrically
  // Angle rotates velocity direction in the xz-plane
  const vx = speed * Math.cos(angleRad);
  const vz = speed * Math.sin(angleRad);
  offset = 0;
  for (let f = 0; f < config.fragments.length; f++) {
    const frag = config.fragments[f];
    const sign = f === 0 ? 1 : -1; // frag 0 moves +x, frag 1 moves -x
    for (let a = 0; a < frag.atoms.length; a++) {
      vel[offset * 3] = sign * vx;
      vel[offset * 3 + 2] = sign * vz;
      offset++;
    }
  }

  // Run simulation
  const forces = new Float64Array(N3);
  const forcesNew = new Float64Array(N3);
  const snapshots = [];
  let deltaRMax = 1;
  const prevBondR = config.bonds.map(() => 0);
  const curBondR = config.bonds.map(() => 0);
  let settledFrames = 0;
  let settled = false;
  let step = 0;

  // Initial bond distances
  for (let b = 0; b < config.bonds.length; b++) {
    const bond = config.bonds[b];
    const ai = bond.i[0] * 3, aj = bond.i[1] * 3;
    const dx = pos[aj] - pos[ai], dy = pos[aj + 1] - pos[ai + 1], dz = pos[aj + 2] - pos[ai + 2];
    curBondR[b] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    prevBondR[b] = curBondR[b];
  }

  // Capture initial snapshot
  snapshots.push(buildSnapshot(pos, config, config.descriptions ? config.descriptions[0] : 'Reactants approaching'));

  for (step = 0; step < MAX_STEPS && !settled; step++) {
    for (let s = 0; s < SUBSTEPS; s++) {
      nBodySubstep(pos, vel, config, forces, forcesNew);
    }

    // Track bond distances for settling
    let maxDelta = 0;
    for (let b = 0; b < config.bonds.length; b++) {
      const bond = config.bonds[b];
      const ai = bond.i[0] * 3, aj = bond.i[1] * 3;
      const dx = pos[aj] - pos[ai], dy = pos[aj + 1] - pos[ai + 1], dz = pos[aj + 2] - pos[ai + 2];
      const newR = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const delta = Math.abs(newR - prevBondR[b]);
      if (delta > maxDelta) maxDelta = delta;
      prevBondR[b] = curBondR[b];
      curBondR[b] = newR;
    }
    deltaRMax = Math.max(deltaRMax * 0.98, maxDelta);

    // Check settling
    const allNear = config.bonds.every((bond, b) => curBondR[b] < bond.R_EQ * 2.5);
    if (allNear && deltaRMax < SETTLE_THRESHOLD) {
      settledFrames++;
      if (settledFrames >= SETTLE_FRAMES) settled = true;
    } else {
      settledFrames = 0;
    }

    // Capture snapshot periodically
    if (step % SNAPSHOT_INTERVAL === 0) {
      let desc = 'Simulation in progress';
      if (settled) desc = config.descriptions ? config.descriptions[config.descriptions.length - 1] : 'Products settled';
      snapshots.push(buildSnapshot(pos, config, desc));
    }
  }

  // Always capture final state
  snapshots.push(buildSnapshot(pos, config, config.descriptions ? config.descriptions[config.descriptions.length - 1] : (settled ? 'Products' : 'End of simulation')));

  // Label first and last snapshots with proper descriptions
  if (config.descriptions && config.descriptions.length >= 2) {
    snapshots[0].description = config.descriptions[0];
    snapshots[snapshots.length - 1].description = config.descriptions[config.descriptions.length - 1];
    // Try to label midpoint
    if (config.descriptions.length >= 3) {
      const midIdx = Math.floor(snapshots.length / 2);
      snapshots[midIdx].description = config.descriptions[1];
    }
  }

  // Downsample to ~TARGET_KEYFRAMES evenly spaced snapshots
  if (snapshots.length > TARGET_KEYFRAMES) {
    const stride = (snapshots.length - 1) / (TARGET_KEYFRAMES - 1);
    const selected = [];
    for (let i = 0; i < TARGET_KEYFRAMES; i++) {
      selected.push(snapshots[Math.round(i * stride)]);
    }
    return selected;
  }

  return snapshots;
}

// ================================================================
// Reaction Configurations
// ================================================================

// ---- Diatomic bond formation configs ----
const DIATOMIC_CONFIGS = {
  'H\u2082':  { R_EQ: 1.401, De: 4.747, a: 1.028, elements: ['H', 'H'], bondOrder: 1, label: 'H\u2082 Formation' },
  'N\u2082':  { R_EQ: 2.074, De: 9.759, a: 2.689, elements: ['N', 'N'], bondOrder: 3, label: 'N\u2082 Formation' },
  'O\u2082':  { R_EQ: 2.282, De: 5.116, a: 2.667, elements: ['O', 'O'], bondOrder: 2, label: 'O\u2082 Formation' },
  'CO':       { R_EQ: 2.132, De: 11.09, a: 2.294, elements: ['C', 'O'], bondOrder: 3, label: 'CO Formation' },
};

function makeDiatomicReaction(key) {
  const cfg = DIATOMIC_CONFIGS[key];
  return {
    name: `Rxn:${key}`,
    label: cfg.label,
    halfExtent: 10,
    defaultImpact: key === 'CO' ? 0.8 : key === 'N\u2082' ? 1.2 : 1.0,
    defaultSpeed: key === 'CO' ? 1.2 : 1.0,
    fragments: [
      { atoms: [[cfg.elements[0], 0, 0, 0]] },
      { atoms: [[cfg.elements[1], 0, 0, 0]] },
    ],
    separation: 10,
    bonds: [
      { i: [0, 1], R_EQ: cfg.R_EQ, De: cfg.De, a: cfg.a, nominalOrder: cfg.bondOrder },
    ],
    angles: null,
    reactivePairs: null,
    numAtoms: 2,
    elements: cfg.elements,
    descriptions: ['Atoms approaching', 'Bond forming', `${key} molecule formed`],
  };
}

// ---- Triatomic bond formation configs ----
const O3_THETA = 116.8 * DEG;

function makeTriatomicReaction(key) {
  if (key === 'CO\u2082') {
    return {
      name: 'Rxn:CO\u2082',
      label: 'CO\u2082 Formation',
      halfExtent: 14,
      defaultImpact: 0.5,
      defaultSpeed: 0.8,
      fragments: [
        { atoms: [['C', 0, 0, 0], ['O', 0, 0, -2.197]] },  // pre-bonded CO
        { atoms: [['O', 0, 0, 0]] },                          // approaching O
      ],
      separation: 12,
      bonds: [
        { i: [0, 1], R_EQ: 2.197, De: 8.0, a: 2.3, nominalOrder: 2 },   // existing C-O
        { i: [0, 2], R_EQ: 2.197, De: 8.0, a: 2.3, forming: true, nominalOrder: 2 }, // forming C-O
      ],
      angles: null,  // linear — no angle potential needed
      reactivePairs: null,
      numAtoms: 3,
      elements: ['C', 'O', 'O'],
      descriptions: ['O approaching CO', 'Bond forming', 'CO\u2082 molecule formed'],
    };
  }
  if (key === 'O\u2083') {
    return {
      name: 'Rxn:O\u2083',
      label: 'O\u2083 Formation',
      halfExtent: 14,
      defaultImpact: 1.0,
      defaultSpeed: 0.8,
      fragments: [
        { atoms: [['O', 0, 0, -1.2], ['O', 0, 0, 1.2]] },  // pre-bonded O₂
        { atoms: [['O', 0, 0, 0]] },                          // approaching O
      ],
      separation: 12,
      bonds: [
        { i: [0, 1], R_EQ: 2.41, De: 3.0, a: 2.0, nominalOrder: 1.5 },  // existing O-O
        { i: [1, 2], R_EQ: 2.41, De: 3.0, a: 2.0, forming: true, nominalOrder: 1.5 }, // forming O-O
      ],
      angles: [
        { i: 0, j: 1, k: 2, thetaEq: O3_THETA, kAngle: 3.0, rCut: 5.0 },
      ],
      reactivePairs: null,
      numAtoms: 3,
      elements: ['O', 'O', 'O'],
      descriptions: ['O approaching O\u2082', 'Bond forming', 'O\u2083 molecule formed'],
    };
  }
  return null;
}

// ---- SN2 Reaction ----
const SN2_CONFIG = {
  name: 'SN2',
  label: 'S\u2099\u2082: OH\u207B + CH\u2083Cl',
  halfExtent: 14,
  defaultImpact: 0.5,
  defaultSpeed: 0.8,
  fragments: [
    { atoms: [
      ['C',  0,    0,     0],
      ['Cl', 0,    0,     3.4],
      ['H',  1.94, 0,    -0.69],
      ['H', -0.97, 1.68, -0.69],
      ['H', -0.97,-1.68, -0.69],
    ]},
    { atoms: [
      ['O', 0, 0, 0],
      ['H', 0, 1.5, -1.8],
    ]},
  ],
  separation: 14,
  bonds: [
    // C-H stable bonds
    { i: [0, 2], R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    { i: [0, 3], R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    { i: [0, 4], R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    // O-H bond
    { i: [5, 6], R_EQ: 1.83, De: 4.8, a: 2.2, nominalOrder: 1 },
    // C-Cl (breaking)
    { i: [0, 1], R_EQ: 3.4, De: 4.0, a: 1.5, breaking: true, nominalOrder: 1 },
    // C-O (forming)
    { i: [0, 5], R_EQ: 2.7, De: 5.0, a: 1.8, forming: true, nominalOrder: 1 },
  ],
  reactivePairs: [{ forming: [0, 5], breaking: [0, 1] }],
  angles: [
    // H-C-H angles for tetrahedral geometry
    { i: 2, j: 0, k: 3, thetaEq: 109.5 * DEG, kAngle: 2.0, rCut: 5.0 },
    { i: 2, j: 0, k: 4, thetaEq: 109.5 * DEG, kAngle: 2.0, rCut: 5.0 },
    { i: 3, j: 0, k: 4, thetaEq: 109.5 * DEG, kAngle: 2.0, rCut: 5.0 },
  ],
  numAtoms: 7,
  elements: ['C', 'Cl', 'H', 'H', 'H', 'O', 'H'],
  descriptions: [
    'OH\u207B approaching CH\u2083Cl',
    'Transition state (pentacoordinate)',
    'Products: CH\u2083OH + Cl\u207B',
  ],
};

// ---- Diels-Alder Reaction ----
const DA_CONFIG = {
  name: 'Diels-Alder',
  label: 'Diels\u2013Alder: butadiene + ethylene',
  halfExtent: 14,
  defaultImpact: 0.3,
  defaultSpeed: 0.6,
  fragments: [
    { atoms: [
      // Butadiene (s-cis)
      ['C', -1.3, 0,  2.5],   // C0
      ['C',  0,   0,  1.3],   // C1
      ['C',  0,   0, -1.3],   // C2
      ['C', -1.3, 0, -2.5],   // C3
      // H on butadiene
      ['H', -2.3,  1.0,  3.2],  // H4 on C0
      ['H', -2.3, -1.0,  3.2],  // H5 on C0
      ['H',  1.0,  1.0,  2.0],  // H6 on C1
      ['H',  1.0, -1.0, -2.0],  // H7 on C2
      ['H', -2.3,  1.0, -3.2],  // H8 on C3
      ['H', -2.3, -1.0, -3.2],  // H9 on C3
    ]},
    { atoms: [
      // Ethylene
      ['C', 0, 0, -1.3],  // C10
      ['C', 0, 0,  1.3],  // C11
      // H on ethylene
      ['H', 1.0,  1.0, -2.0],  // H12 on C10
      ['H', 1.0, -1.0, -2.0],  // H13 on C10
      ['H', 1.0,  1.0,  2.0],  // H14 on C11
      ['H', 1.0, -1.0,  2.0],  // H15 on C11
    ]},
  ],
  separation: 12,
  bonds: [
    // Butadiene conjugated bonds
    { i: [0, 1], R_EQ: 2.55, De: 6.0, a: 1.8, nominalOrder: 2 },   // C0-C1 double
    { i: [1, 2], R_EQ: 2.76, De: 4.0, a: 1.5, nominalOrder: 1 },   // C1-C2 single
    { i: [2, 3], R_EQ: 2.55, De: 6.0, a: 1.8, nominalOrder: 2 },   // C2-C3 double
    // Ethylene double bond
    { i: [10, 11], R_EQ: 2.52, De: 6.5, a: 1.9, nominalOrder: 2 }, // C10-C11 double
    // New σ bonds (forming)
    { i: [0, 11], R_EQ: 2.9, De: 4.0, a: 1.5, forming: true, nominalOrder: 1 },  // C0-C11
    { i: [3, 10], R_EQ: 2.9, De: 4.0, a: 1.5, forming: true, nominalOrder: 1 },  // C3-C10
    // C-H bonds (butadiene)
    { i: [0, 4],  R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    { i: [0, 5],  R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    { i: [1, 6],  R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    { i: [2, 7],  R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    { i: [3, 8],  R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    { i: [3, 9],  R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    // C-H bonds (ethylene)
    { i: [10, 12], R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    { i: [10, 13], R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    { i: [11, 14], R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
    { i: [11, 15], R_EQ: 2.06, De: 4.5, a: 1.8, nominalOrder: 1 },
  ],
  reactivePairs: null,  // concerted — both bonds form simultaneously, no breaking
  angles: [
    // Butadiene C-C-C angles
    { i: 0, j: 1, k: 2, thetaEq: 124 * DEG, kAngle: 1.5, rCut: 6.0 },
    { i: 1, j: 2, k: 3, thetaEq: 124 * DEG, kAngle: 1.5, rCut: 6.0 },
  ],
  numAtoms: 16,
  elements: ['C','C','C','C','H','H','H','H','H','H','C','C','H','H','H','H'],
  descriptions: [
    'Butadiene + ethylene approaching',
    'Transition state: concerted [4+2]',
    'Cyclohexene product formed',
  ],
};

// ---- Build REACTIONS array ----
export const REACTIONS = [
  SN2_CONFIG,
  DA_CONFIG,
  makeDiatomicReaction('H\u2082'),
  makeDiatomicReaction('N\u2082'),
  makeDiatomicReaction('O\u2082'),
  makeDiatomicReaction('CO'),
  makeTriatomicReaction('CO\u2082'),
  makeTriatomicReaction('O\u2083'),
];

// ================================================================
// ReactionController (frame-cache pattern)
// ================================================================

export class ReactionController extends BaseFrameController {
  constructor() {
    super();  // Call base constructor
    // Reaction-specific properties
    this.speed = 0.3;  // Override base speed
    this.reaction = null;
  }

  scrubTo(t) {
    if (this.frames.length < NUM_FRAMES) return '';
    const frameIdx = Math.min(Math.floor(t * NUM_FRAMES), NUM_FRAMES - 1);

    if (this.lastFrameIdx >= 0 && this.frames[this.lastFrameIdx]) {
      this.frames[this.lastFrameIdx].group.visible = false;
    }
    if (this.frames[frameIdx]) {
      this.frames[frameIdx].group.visible = true;
    }
    this.lastFrameIdx = frameIdx;

    return this.frames[frameIdx] ? this.frames[frameIdx].description : '';
  }

  async buildFrameCache(settings, onFrameReady, onComplete) {
    const gen = ++this.generation;
    const stale = () => gen !== this.generation;

    this.disposeCache();
    this.state = 'building';
    this.reaction = settings.reaction;

    const { reaction, probability, layers, gridSize, halfExtent, colorMode } = settings;

    // Generate physics trajectory
    const impactParam = settings.impactParam ?? reaction.defaultImpact ?? 1.0;
    const speed = settings.speed ?? reaction.defaultSpeed ?? 1.0;
    const angle = settings.angle ?? 0;
    const trajectory = simulateReaction(reaction, impactParam, speed, angle);

    // Use trajectory keyframes for interpolation
    const effectiveReaction = { ...reaction, keyframes: trajectory };

    for (let i = 0; i < NUM_FRAMES; i++) {
      if (stale()) return;

      const t = i / (NUM_FRAMES - 1);
      const frame = interpolateKeyframes(effectiveReaction, t);

      // Build density sampler from interpolated geometry
      const mos = generateMOs(frame.atoms, frame.bonds);
      const sampler = {
        customSample: (x, y, z) => {
          let rho = 0;
          for (const mo of mos) {
            const psi = evaluateOrbital(mo, x, y, z);
            rho += 2 * psi * psi;
          }
          return Math.sqrt(Math.max(0, rho));
        }
      };

      const gs = gridSize;
      const he = halfExtent;
      const data = sampleGrid(sampler, gs, he);
      if (!data || stale()) return;

      // Build meshes (same pattern as TransitionController)
      const group = new THREE.Group();
      const mats = getLayerMaterials(layers, colorMode);
      const step = (2 * he) / (gs - 1);

      const isDensityLike = colorMode === 'density';
      const thresholds = computeMultiThresholds(data, isDensityLike ? 0.95 : 0.9, layers, he, gs);

      const addMeshes = (sideData, thresh, matArr) => {
        for (let li = 0; li < layers; li++) {
          const result = marchingCubes(sideData, gs, thresh[li]);
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
            const mesh = new THREE.Mesh(geo, matArr[matIdx]);
            mesh.renderOrder = li;
            group.add(mesh);
          }
        }
      };

      addMeshes(data, thresholds, mats.pos);
      if (!isDensityLike) {
        const negData = new Float32Array(data.length);
        for (let j = 0; j < data.length; j++) negData[j] = -data[j];
        addMeshes(negData, thresholds, mats.neg);
      }

      // Add ball-and-stick model to each frame
      buildBallAndStick(group, frame.atoms, frame.bonds);

      if (stale()) {
        group.traverse(child => { if (child.geometry) child.geometry.dispose(); });
        return;
      }

      scene.add(group);
      group.visible = false;

      this.frames[i] = { group, description: frame.description };
      this.framesReady = i + 1;

      if (onFrameReady) onFrameReady(i + 1, NUM_FRAMES);
      await new Promise(r => setTimeout(r, 0));
    }

    if (!stale()) {
      this.state = 'ready';
      if (onComplete) onComplete();
    }
  }

  tick(dt) {
    if (this.state !== 'playing' || this.frames.length < NUM_FRAMES) return false;

    this.phase += this.speed * dt;
    // Bounce between 0 and 1
    if (this.phase > 1) { this.phase = 2 - this.phase; this.speed = -Math.abs(this.speed); }
    if (this.phase < 0) { this.phase = -this.phase; this.speed = Math.abs(this.speed); }

    const frameIdx = Math.min(Math.floor(this.phase * NUM_FRAMES), NUM_FRAMES - 1);

    if (frameIdx !== this.lastFrameIdx) {
      if (this.lastFrameIdx >= 0 && this.frames[this.lastFrameIdx]) {
        this.frames[this.lastFrameIdx].group.visible = false;
      }
      if (this.frames[frameIdx]) {
        this.frames[frameIdx].group.visible = true;
      }
      this.lastFrameIdx = frameIdx;
      return true;
    }
    return false;
  }
}
