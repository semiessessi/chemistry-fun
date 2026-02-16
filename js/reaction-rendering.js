// Reaction rendering: ball-and-stick visualization and auto-MO generation from bond topology.

import * as THREE from 'three';
import { buildRotationMatrix } from './utils/physics.js';

// ---- Element visual properties for inline ball-and-stick ----

export const ELEM_COLORS = {
  C: 0x333333, H: 0xffffff, O: 0xff2222, N: 0x3333ff,
  Cl: 0x22cc22, F: 0xaaff00, S: 0xffff33, Br: 0x882200,
};

export const ELEM_RADII = {
  C: 0.4, H: 0.25, O: 0.35, N: 0.35,
  Cl: 0.45, F: 0.3, S: 0.5, Br: 0.5,
};

// ---- Auto-generate σ-bond MOs from atom positions and bonds ----

export function generateMOs(atoms, bonds) {
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

export function interpolateKeyframes(reaction, t) {
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

export function buildBallAndStick(group, atoms, bonds) {
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
