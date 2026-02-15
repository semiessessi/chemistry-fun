// Molecule infrastructure: shared data, helpers, rendering, and registration.

import * as THREE from 'three';
import { add } from '../orbitals.js';
import { evaluateOrbital } from '../math.js';
import { scene } from '../scene.js';

// ---- Element data (CPK colors, covalent radii for sphere display) ----

export const ELEMENTS = {
  H:  { color: 0xffffff, radius: 0.3 },
  C:  { color: 0x909090, radius: 0.4 },
  N:  { color: 0x3050f8, radius: 0.4 },
  O:  { color: 0xff2010, radius: 0.4 },
  F:  { color: 0x90e050, radius: 0.35 },
  Na: { color: 0xab5cf2, radius: 0.55 },
  Al: { color: 0xbfa6a6, radius: 0.50 },
  P:  { color: 0xff8000, radius: 0.42 },
  S:  { color: 0xffff30, radius: 0.45 },
  Cl: { color: 0x1ff01f, radius: 0.42 },
  Ca: { color: 0x3dff00, radius: 0.58 },
  Ti: { color: 0xbfc2c7, radius: 0.52 },
  Cu: { color: 0xc88033, radius: 0.48 },
  Fe: { color: 0xe06633, radius: 0.5 },
};

// ---- Shared geometries (created once) ----

const sphereGeo = new THREE.SphereGeometry(1, 16, 12);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
const torusGeo = new THREE.TorusGeometry(1, 0.025, 8, 48);

// ---- Cached materials per element ----

const materialCache = {};
function getElementMaterial(elem) {
  if (!materialCache[elem]) {
    const el = ELEMENTS[elem] || { color: 0xcccccc };
    materialCache[elem] = new THREE.MeshPhongMaterial({
      color: el.color, shininess: 60,
    });
  }
  return materialCache[elem];
}

const bondMaterial = new THREE.MeshPhongMaterial({ color: 0x666666, shininess: 30, side: THREE.DoubleSide });

// ---- Context mesh tracking ----

let contextMeshes = [];

// ---- Molecule registry (for context rendering) ----

const MOLECULES = {};

// ---- Display labels: maps internal name → "Formula (Name)" for dropdowns ----
export const MOLECULE_LABELS = {};

// ---- Category tracking ----
export const MOLECULE_CATEGORIES = {}; // name → category string

// ---- Atom data access (for electrostatic field computation) ----
export function getMoleculeAtoms(name) {
  const mol = MOLECULES[name];
  return mol ? mol.atoms : null; // [[element, x, y, z], ...]
}

// ---- Geometry helpers ----

export function hexPos(radius, i) {
  const angle = (i * Math.PI) / 3;
  return [radius * Math.cos(angle), 0, radius * Math.sin(angle)];
}

export function pentPos(radius, i) {
  const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
  return [radius * Math.cos(angle), 0, radius * Math.sin(angle)];
}

export function chairHexPos(radius, i, dz) {
  const angle = (i * Math.PI) / 3;
  const yOff = (i % 2 === 0) ? dz : -dz;
  return [radius * Math.cos(angle), yOff, radius * Math.sin(angle)];
}

// ---- addMol factory ----

export function addMol(mol) {
  MOLECULES[mol.name] = mol;
  if (mol.label) MOLECULE_LABELS[mol.name] = mol.label;
  if (mol.category) MOLECULE_CATEGORIES[mol.name] = mol.category;
  const moOrbitals = [];
  for (const mo of mol.mos) {
    const moName = mo[0];
    const termDefs = mo[1];
    const terms = termDefs.map(td => {
      const [atomIdx, n, l, m, angType, coeff] = td;
      const pos = mol.atoms[atomIdx];
      return { n, l, m, angType, center: [pos[1], pos[2], pos[3]], coeff };
    });
    const fullName = mol.name + ' ' + moName;
    add({
      name: fullName,
      terms,
      halfExtent: mol.he,
      d1: 'Molecules', d2: mol.name, d3: moName, d4: null,
      molecule: mol.name,
    });
    moOrbitals.push({ terms });
  }

  // Electron density: sum of 2|ψᵢ|² over all listed MOs
  const densitySampler = (x, y, z) => {
    let rho = 0;
    for (const mo of moOrbitals) {
      const psi = evaluateOrbital(mo, x, y, z);
      rho += 2 * psi * psi;
    }
    return Math.sqrt(rho);
  };
  add({
    name: mol.name + ' electron density',
    customSample: densitySampler,
    halfExtent: mol.he,
    d1: 'Molecules', d2: mol.name, d3: 'electron density', d4: null,
    molecule: mol.name,
  });
}

// ---- Bond rendering helpers ----

function getPerpendicularVector(dir) {
  const ref = Math.abs(dir.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  return new THREE.Vector3().crossVectors(ref, dir).normalize();
}

function detectAromaticRings(mol) {
  const aroAdj = new Map();
  for (const bond of mol.bonds) {
    if ((bond[2] || 1) !== 1.5) continue;
    if (!aroAdj.has(bond[0])) aroAdj.set(bond[0], []);
    if (!aroAdj.has(bond[1])) aroAdj.set(bond[1], []);
    aroAdj.get(bond[0]).push(bond[1]);
    aroAdj.get(bond[1]).push(bond[0]);
  }
  if (aroAdj.size < 5) return [];
  const rings = [], seen = new Set();
  // Search for both 5- and 6-membered aromatic rings
  for (const targetSize of [5, 6]) {
    for (const start of aroAdj.keys()) {
      (function dfs(node, path) {
        if (path.length === targetSize) {
          if (aroAdj.get(node)?.includes(start)) {
            const key = [...path].sort((a, b) => a - b).join(',');
            if (!seen.has(key)) { seen.add(key); rings.push([...path]); }
          }
          return;
        }
        for (const next of (aroAdj.get(node) || [])) {
          if (!path.includes(next)) { path.push(next); dfs(next, path); path.pop(); }
        }
      })(start, [start]);
    }
  }
  return rings;
}

function makeAtomLabel(elem, x, y, z) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(elem, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(x, y + 0.6, z);
  sprite.scale.set(1.2, 1.2, 1);
  return sprite;
}

// ---- Context rendering ----

export function showMoleculeContext(orbitalName) {
  clearMoleculeContext();
  // Find molecule name from orbital name (format: "MolName MOName")
  let molName = null;
  for (const name of Object.keys(MOLECULES)) {
    if (orbitalName.startsWith(name + ' ')) { molName = name; break; }
  }
  if (!molName) return;
  const mol = MOLECULES[molName];

  // Detect aromatic rings before bond rendering
  const aroRings = detectAromaticRings(mol);
  const aroRingBonds = new Set();
  for (const ring of aroRings) {
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k], b = ring[(k + 1) % ring.length];
      aroRingBonds.add(Math.min(a, b) + ',' + Math.max(a, b));
    }
  }

  // Nuclei + atom labels
  for (const atom of mol.atoms) {
    const [elem, x, y, z] = atom;
    const el = ELEMENTS[elem] || { radius: 0.4 };
    const mesh = new THREE.Mesh(sphereGeo, getElementMaterial(elem));
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(el.radius);
    scene.add(mesh);
    contextMeshes.push(mesh);

    const label = makeAtomLabel(elem, x, y, z);
    scene.add(label);
    contextMeshes.push(label);
  }

  // Helper: add a bond cylinder
  const addCyl = (pos, quat, radius, length) => {
    const m = new THREE.Mesh(cylGeo, bondMaterial);
    m.position.copy(pos);
    m.scale.set(radius, length, radius);
    m.quaternion.copy(quat);
    scene.add(m);
    contextMeshes.push(m);
  };

  // Bonds
  for (const bond of mol.bonds) {
    const i = bond[0], j = bond[1], order = bond[2] || 1;
    const a = mol.atoms[i], b = mol.atoms[j];
    const ax = a[1], ay = a[2], az = a[3];
    const bx = b[1], by = b[2], bz = b[3];
    const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) continue;

    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
    const mid = new THREE.Vector3(mx, my, mz);
    const perp = getPerpendicularVector(dir);

    if (order === 1) {
      addCyl(mid, quat, 0.08, len);
    } else if (order === 2) {
      const off = perp.clone().multiplyScalar(0.12);
      addCyl(mid.clone().add(off), quat, 0.06, len);
      addCyl(mid.clone().sub(off), quat, 0.06, len);
    } else if (order === 3) {
      const perp2 = new THREE.Vector3().crossVectors(dir, perp).normalize();
      for (let k = 0; k < 3; k++) {
        const angle = (k * 2 * Math.PI) / 3;
        const off = perp.clone().multiplyScalar(Math.cos(angle) * 0.14)
          .add(perp2.clone().multiplyScalar(Math.sin(angle) * 0.14));
        addCyl(mid.clone().add(off), quat, 0.05, len);
      }
    } else if (order === 1.5) {
      const bondKey = Math.min(i, j) + ',' + Math.max(i, j);
      if (aroRingBonds.has(bondKey)) {
        // Part of aromatic ring: single cylinder, torus shows aromaticity
        addCyl(mid, quat, 0.06, len);
      } else {
        // Non-ring resonance (e.g. O₃, CaCO₃): full + offset partial
        addCyl(mid, quat, 0.06, len);
        const off = perp.clone().multiplyScalar(0.12);
        addCyl(mid.clone().add(off), quat, 0.04, len * 0.45);
      }
    } else if (order === 0.5) {
      const segCount = 5;
      const segFrac = 0.15;
      const gapFrac = (1 - segCount * segFrac) / (segCount - 1);
      const startA = new THREE.Vector3(ax, ay, az);
      const bondVec = new THREE.Vector3(dx, dy, dz);
      for (let k = 0; k < segCount; k++) {
        const t = k * (segFrac + gapFrac) + segFrac / 2;
        const segMid = startA.clone().add(bondVec.clone().multiplyScalar(t));
        addCyl(segMid, quat, 0.08, len * segFrac);
      }
    }
  }

  // Detect fused ring pairs (rings sharing 2+ atoms)
  const fusedInfo = new Map(); // ringIdx → array of shared-atom midpoints
  for (let ri = 0; ri < aroRings.length; ri++) {
    for (let rj = ri + 1; rj < aroRings.length; rj++) {
      const shared = aroRings[ri].filter(a => aroRings[rj].includes(a));
      if (shared.length >= 2) {
        const mid = new THREE.Vector3(0, 0, 0);
        for (const si of shared) {
          const at = mol.atoms[si];
          mid.add(new THREE.Vector3(at[1], at[2], at[3]));
        }
        mid.divideScalar(shared.length);
        if (!fusedInfo.has(ri)) fusedInfo.set(ri, []);
        if (!fusedInfo.has(rj)) fusedInfo.set(rj, []);
        fusedInfo.get(ri).push(mid.clone());
        fusedInfo.get(rj).push(mid.clone());
      }
    }
  }

  // Aromatic ring torus
  for (let ri = 0; ri < aroRings.length; ri++) {
    const ring = aroRings[ri];
    const center = new THREE.Vector3(0, 0, 0);
    for (const idx of ring) {
      const at = mol.atoms[idx];
      center.add(new THREE.Vector3(at[1], at[2], at[3]));
    }
    center.divideScalar(ring.length);

    const r0 = mol.atoms[ring[0]], r1 = mol.atoms[ring[1]], r2 = mol.atoms[ring[2]];
    const e1 = new THREE.Vector3(r1[1] - r0[1], r1[2] - r0[2], r1[3] - r0[3]);
    const e2 = new THREE.Vector3(r2[1] - r1[1], r2[2] - r1[2], r2[3] - r1[3]);
    const normal = new THREE.Vector3().crossVectors(e1, e2).normalize();

    let ringR = 0;
    for (const idx of ring) {
      const at = mol.atoms[idx];
      ringR += center.distanceTo(new THREE.Vector3(at[1], at[2], at[3]));
    }
    ringR /= ring.length;

    const torus = new THREE.Mesh(torusGeo, bondMaterial);
    torus.position.copy(center);
    torus.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const torusScale = ring.length === 5 ? 0.60 : 0.72;
    const baseScale = ringR * torusScale;

    if (fusedInfo.has(ri)) {
      // Squash torus 80% along direction toward shared edge
      const sharedMid = fusedInfo.get(ri)[0];
      const squashDir = sharedMid.clone().sub(center);
      squashDir.sub(normal.clone().multiplyScalar(squashDir.dot(normal)));
      squashDir.normalize();
      const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(torus.quaternion);
      const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(torus.quaternion);
      if (Math.abs(squashDir.dot(localX)) > Math.abs(squashDir.dot(localY))) {
        torus.scale.set(baseScale * 0.8, baseScale, baseScale);
      } else {
        torus.scale.set(baseScale, baseScale * 0.8, baseScale);
      }
    } else {
      torus.scale.setScalar(baseScale);
    }
    scene.add(torus);
    contextMeshes.push(torus);
  }
}

export function clearMoleculeContext() {
  for (const m of contextMeshes) {
    scene.remove(m);
    // Don't dispose shared geometries/materials; just remove from scene
  }
  contextMeshes = [];
}

export function setMoleculeContextVisible(visible) {
  for (const m of contextMeshes) m.visible = visible;
}
