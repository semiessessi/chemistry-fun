// N-body simulator: Morse potential + angular forces + Lennard-Jones repulsion for reaction dynamics.

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
const DEG = Math.PI / 180;

// ---- Utility functions ----

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

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

export function nBodySubstep(pos, vel, config, forces, forcesNew) {
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

export function buildSnapshot(pos, config, description) {
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

export function simulateReaction(config, impactParam, speed, angle) {
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
