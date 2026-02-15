// Molecule definitions: specific real molecules with LCAO MOs and nuclear/bond context.

import * as THREE from 'three';
import { add } from './orbitals.js';
import { evaluateOrbital } from './math.js';
import { scene } from './scene.js';

// ---- Element data (CPK colors, covalent radii for sphere display) ----

const ELEMENTS = {
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
export const MOLECULE_LABELS = {
  'H\u2082': 'H\u2082 (Hydrogen)',
  'N\u2082': 'N\u2082 (Nitrogen)',
  'O\u2082': 'O\u2082 (Oxygen)',
  'CO': 'CO (Carbon Monoxide)',
  'HF': 'HF (Hydrogen Fluoride)',
  'CO\u2082': 'CO\u2082 (Carbon Dioxide)',
  'H\u2082O': 'H\u2082O (Water)',
  'H\u2082S': 'H\u2082S (Hydrogen Sulfide)',
  'O\u2083': 'O\u2083 (Ozone)',
  'SO\u2082': 'SO\u2082 (Sulfur Dioxide)',
  'NH\u2083': 'NH\u2083 (Ammonia)',
  'CH\u2084': 'CH\u2084 (Methane)',
  'FeO': 'FeO (Iron Oxide)',
  'C\u2082H\u2082': 'C\u2082H\u2082 (Acetylene)',
  'C\u2082H\u2084': 'C\u2082H\u2084 (Ethylene)',
  'C\u2086H\u2086': 'C\u2086H\u2086 (Benzene)',
  'CuO': 'CuO (Copper Oxide)',
  'TiO\u2082': 'TiO\u2082 (Titanium Dioxide)',
  'NaOH': 'NaOH (Sodium Hydroxide)',
  'Al\u2082O\u2083': 'Al\u2082O\u2083 (Alumina)',
  'HNO\u2083': 'HNO\u2083 (Nitric Acid)',
  'H\u2082SO\u2084': 'H\u2082SO\u2084 (Sulfuric Acid)',
  'CH\u2083OH': 'CH\u2083OH (Methanol)',
  'C\u2082H\u2085OH': 'C\u2082H\u2085OH (Ethanol)',
  'CaCO\u2083': 'CaCO\u2083 (Calcite)',
  'Fe\u2083O\u2084': 'Fe\u2083O\u2084 (Magnetite)',
  'Fe(OH)\u2083': 'Fe(OH)\u2083 (Iron Hydroxide)',
  '\u03B1-Fe\u2082O\u2083': '\u03B1-Fe\u2082O\u2083 (Hematite)',
  '\u03B3-Fe\u2082O\u2083': '\u03B3-Fe\u2082O\u2083 (Maghemite)',
  'N\u2082H\u2084': 'N\u2082H\u2084 (Hydrazine)',
  'C\u2085H\u2085N': 'C\u2085H\u2085N (Pyridine)',
  'C\u2083H\u2083N\u2083': 'C\u2083H\u2083N\u2083 (Triazine)',
  'Uracil': 'C\u2084H\u2084N\u2082O\u2082 (Uracil)',
  'C\u2085H\u2086': 'C\u2085H\u2086 (Cyclopentadiene)',
  'Phenol': 'C\u2086H\u2085OH (Phenol)',
  'Aniline': 'C\u2086H\u2085NH\u2082 (Aniline)',
  'Toluene': 'C\u2087H\u2088 (Toluene)',
  'Purine': 'C\u2085H\u2084N\u2084 (Purine)',
  'Naphthalene': 'C\u2081\u2080H\u2088 (Naphthalene)',
  'Cyclohexane': 'C\u2086H\u2081\u2082 (Cyclohexane)',
  'Norbornene': 'C\u2087H\u2081\u2080 (Norbornene)',
  'Glucose': 'C\u2086H\u2081\u2082O\u2086 (Glucose)',
  'Decalin': 'C\u2081\u2080H\u2081\u2088 (Decalin)',
  'Sucrose': 'C\u2081\u2082H\u2082\u2082O\u2081\u2081 (Sucrose)',
  'CH\u2083NH\u2082': 'CH\u2083NH\u2082 (Methylamine)',
};

// ---- Category tracking ----
export const MOLECULE_CATEGORIES = {}; // name → category string

// ---- addMol factory ----

function addMol(mol) {
  MOLECULES[mol.name] = mol;
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

// ============================================================
// Molecule definitions
// ============================================================
// Compact format:
//   atoms: [[element, x, y, z], ...]  (positions in Bohr radii)
//   bonds: [[atomIdx, atomIdx], ...]
//   he: halfExtent
//   mos: [[moName, [[atomIdx, n, l, m, angType, coeff], ...]], ...]

// ---- 1. H₂ ----
addMol({
  name: 'H\u2082',
  atoms: [['H', 0, 0, -0.7], ['H', 0, 0, 0.7]],
  bonds: [[0, 1]],
  he: 10,
  mos: [
    ['\u03C3 bond', [[0, 1, 0, 0, 'real', 1], [1, 1, 0, 0, 'real', 1]]],
    ['\u03C3* anti', [[0, 1, 0, 0, 'real', 1], [1, 1, 0, 0, 'real', -1]]],
  ]
});

// ---- 2. N₂ ----
addMol({
  name: 'N\u2082',
  atoms: [['N', 0, 0, -1.04], ['N', 0, 0, 1.04]],
  bonds: [[0, 1, 3]],
  he: 16,
  mos: [
    ['\u03C3(2s)', [[0, 2, 0, 0, 'real', 1], [1, 2, 0, 0, 'real', 1]]],
    ['\u03C3*(2s)', [[0, 2, 0, 0, 'real', 1], [1, 2, 0, 0, 'real', -1]]],
    ['\u03C0(2p)', [[0, 2, 1, 1, 'cos', 1], [1, 2, 1, 1, 'cos', 1]]],
    ['\u03C3(2p)', [[0, 2, 1, 0, 'real', 1], [1, 2, 1, 0, 'real', -1]]],
    ['\u03C0*(2p)', [[0, 2, 1, 1, 'cos', 1], [1, 2, 1, 1, 'cos', -1]]],
  ]
});

// ---- 3. O₂ ----
addMol({
  name: 'O\u2082',
  atoms: [['O', 0, 0, -1.14], ['O', 0, 0, 1.14]],
  bonds: [[0, 1, 2]],
  he: 16,
  mos: [
    ['\u03C3(2s)', [[0, 2, 0, 0, 'real', 1], [1, 2, 0, 0, 'real', 1]]],
    ['\u03C3(2p)', [[0, 2, 1, 0, 'real', 1], [1, 2, 1, 0, 'real', -1]]],
    ['\u03C0(2p)', [[0, 2, 1, 1, 'cos', 1], [1, 2, 1, 1, 'cos', 1]]],
    ['\u03C0*(2px)', [[0, 2, 1, 1, 'cos', 1], [1, 2, 1, 1, 'cos', -1]]],
    ['\u03C0*(2py)', [[0, 2, 1, 1, 'sin', 1], [1, 2, 1, 1, 'sin', -1]]],
  ]
});

// ---- 4. CO ----
addMol({
  name: 'CO',
  atoms: [['C', 0, 0, -1.066], ['O', 0, 0, 1.066]],
  bonds: [[0, 1, 3]],
  he: 16,
  mos: [
    ['\u03C3(2s)', [[0, 2, 0, 0, 'real', 0.55], [1, 2, 0, 0, 'real', 0.85]]],
    ['\u03C3*(2s)', [[0, 2, 0, 0, 'real', 0.85], [1, 2, 0, 0, 'real', -0.55]]],
    ['\u03C0(2p)', [[0, 2, 1, 1, 'cos', 0.6], [1, 2, 1, 1, 'cos', 0.8]]],
    ['\u03C3(2p)', [[0, 2, 1, 0, 'real', 0.6], [1, 2, 1, 0, 'real', -0.8]]],
    ['5\u03C3 HOMO', [[0, 2, 0, 0, 'real', 0.7], [0, 2, 1, 0, 'real', 0.5], [1, 2, 0, 0, 'real', -0.3]]],
  ]
});

// ---- 5. HF ----
addMol({
  name: 'HF',
  atoms: [['H', 0, 0, -0.87], ['F', 0, 0, 0.87]],
  bonds: [[0, 1]],
  he: 14,
  mos: [
    ['\u03C3 bond', [[0, 1, 0, 0, 'real', 0.8], [1, 2, 1, 0, 'real', -0.7]]],
    ['\u03C3* anti', [[0, 1, 0, 0, 'real', 0.7], [1, 2, 1, 0, 'real', 0.8]]],
    ['lone pair (px)', [[1, 2, 1, 1, 'cos', 1.0]]],
    ['lone pair (py)', [[1, 2, 1, 1, 'sin', 1.0]]],
  ]
});

// ---- 5. CO₂ ----
addMol({
  name: 'CO\u2082',
  atoms: [['C', 0, 0, 0], ['O', 0, 0, -2.20], ['O', 0, 0, 2.20]],
  bonds: [[0, 1, 2], [0, 2, 2]],
  he: 18,
  mos: [
    ['\u03C3g bond', [[0, 2, 1, 0, 'real', 1], [1, 2, 1, 0, 'real', 0.7], [2, 2, 1, 0, 'real', -0.7]]],
    ['\u03C0u(px)', [[0, 2, 1, 1, 'cos', 1], [1, 2, 1, 1, 'cos', 0.6], [2, 2, 1, 1, 'cos', 0.6]]],
    ['\u03C0u(py)', [[0, 2, 1, 1, 'sin', 1], [1, 2, 1, 1, 'sin', 0.6], [2, 2, 1, 1, 'sin', 0.6]]],
    ['lone pair', [[1, 2, 0, 0, 'real', 0.7], [2, 2, 0, 0, 'real', 0.7]]],
  ]
});

// ---- 6. H₂O ----
// Bent: O at origin, H atoms in xz plane, bond angle ~104.5°
addMol({
  name: 'H\u2082O',
  atoms: [['O', 0, 0, 0], ['H', 1.43, 0, 1.11], ['H', -1.43, 0, 1.11]],
  bonds: [[0, 1], [0, 2]],
  he: 12,
  mos: [
    ['2a\u2081 \u03C3', [[0, 2, 0, 0, 'real', 0.8], [1, 1, 0, 0, 'real', 0.4], [2, 1, 0, 0, 'real', 0.4]]],
    ['1b\u2082 \u03C3', [[0, 2, 1, 1, 'cos', 0.7], [1, 1, 0, 0, 'real', 0.5], [2, 1, 0, 0, 'real', -0.5]]],
    ['3a\u2081 lone pair', [[0, 2, 1, 0, 'real', 0.85], [1, 1, 0, 0, 'real', -0.2], [2, 1, 0, 0, 'real', -0.2]]],
    ['1b\u2081 lone pair', [[0, 2, 1, 1, 'sin', 1.0]]],
  ]
});

// ---- 7. H₂S ----
// Bent: S at origin, H atoms in xz plane, bond angle ~92°
addMol({
  name: 'H\u2082S',
  atoms: [['S', 0, 0, 0], ['H', 1.87, 0, 0.54], ['H', -1.87, 0, 0.54]],
  bonds: [[0, 1], [0, 2]],
  he: 16,
  mos: [
    ['\u03C3 bond', [[0, 3, 1, 1, 'cos', 0.7], [1, 1, 0, 0, 'real', 0.5], [2, 1, 0, 0, 'real', 0.5]]],
    ["\u03C3' bond", [[0, 3, 1, 1, 'cos', 0.7], [1, 1, 0, 0, 'real', 0.5], [2, 1, 0, 0, 'real', -0.5]]],
    ['lone pair (pz)', [[0, 3, 1, 0, 'real', 1.0]]],
    ['lone pair (py)', [[0, 3, 1, 1, 'sin', 1.0]]],
  ]
});

// ---- 8. O₃ ----
// Bent: central O at origin, two O in xz plane, bond angle ~117°
addMol({
  name: 'O\u2083',
  atoms: [['O', 0, 0, 0], ['O', 2.14, 0, 1.08], ['O', -2.14, 0, 1.08]],
  bonds: [[0, 1, 1.5], [0, 2, 1.5]],
  he: 16,
  mos: [
    ['\u03C3 sym', [[0, 2, 1, 1, 'cos', 0.8], [1, 2, 0, 0, 'real', 0.45], [2, 2, 0, 0, 'real', 0.45]]],
    ['\u03C0 deloc', [[0, 2, 1, 1, 'sin', 0.7], [1, 2, 1, 1, 'sin', 0.5], [2, 2, 1, 1, 'sin', 0.5]]],
    ['\u03C0* anti', [[0, 2, 1, 1, 'sin', 0.0], [1, 2, 1, 1, 'sin', 0.7], [2, 2, 1, 1, 'sin', -0.7]]],
    ['lone pair', [[0, 2, 1, 0, 'real', 1.0]]],
  ]
});

// ---- 9. SO₂ ----
// Bent: S at origin, two O in xz plane, bond angle ~119°
addMol({
  name: 'SO\u2082',
  atoms: [['S', 0, 0, 0], ['O', 2.30, 0, 1.17], ['O', -2.30, 0, 1.17]],
  bonds: [[0, 1, 2], [0, 2, 2]],
  he: 18,
  mos: [
    ['\u03C3 sym', [[0, 3, 1, 1, 'cos', 0.7], [1, 2, 0, 0, 'real', 0.5], [2, 2, 0, 0, 'real', 0.5]]],
    ['\u03C3 anti', [[0, 3, 1, 1, 'cos', 0.7], [1, 2, 0, 0, 'real', 0.5], [2, 2, 0, 0, 'real', -0.5]]],
    ['\u03C0 deloc', [[0, 3, 1, 1, 'sin', 0.6], [1, 2, 1, 1, 'sin', 0.55], [2, 2, 1, 1, 'sin', 0.55]]],
    ['lone pair', [[0, 3, 1, 0, 'real', 1.0]]],
  ]
});

// ---- 10. NH₃ ----
// Pyramidal: N at origin, 3 H below in trigonal arrangement
const NH3_R = 1.91; // N-H distance in Bohr
const NH3_ANGLE = (107.8 * Math.PI) / 180;
const NH3_HZ = -NH3_R * Math.cos(Math.PI - NH3_ANGLE);
const NH3_HR = NH3_R * Math.sin(Math.PI - NH3_ANGLE);
addMol({
  name: 'NH\u2083',
  atoms: [
    ['N', 0, 0, 0],
    ['H', NH3_HR, 0, NH3_HZ],
    ['H', -NH3_HR / 2, NH3_HR * Math.sqrt(3) / 2, NH3_HZ],
    ['H', -NH3_HR / 2, -NH3_HR * Math.sqrt(3) / 2, NH3_HZ],
  ],
  bonds: [[0, 1], [0, 2], [0, 3]],
  he: 12,
  mos: [
    ['2a\u2081 \u03C3 sym', [[0, 2, 0, 0, 'real', 0.7], [1, 1, 0, 0, 'real', 0.4], [2, 1, 0, 0, 'real', 0.4], [3, 1, 0, 0, 'real', 0.4]]],
    ['1e bond(x)', [[0, 2, 1, 1, 'cos', 0.7], [1, 1, 0, 0, 'real', 0.6], [2, 1, 0, 0, 'real', -0.3], [3, 1, 0, 0, 'real', -0.3]]],
    ['1e bond(y)', [[0, 2, 1, 1, 'sin', 0.7], [2, 1, 0, 0, 'real', 0.5], [3, 1, 0, 0, 'real', -0.5]]],
    ['lone pair', [[0, 2, 1, 0, 'real', 1.0]]],
  ]
});

// ---- 11. CH₄ ----
// Tetrahedral: C at origin, H at (±d, ±d, ±d)
const CH4_D = 1.19;
addMol({
  name: 'CH\u2084',
  atoms: [
    ['C', 0, 0, 0],
    ['H', CH4_D, CH4_D, CH4_D],
    ['H', CH4_D, -CH4_D, -CH4_D],
    ['H', -CH4_D, CH4_D, -CH4_D],
    ['H', -CH4_D, -CH4_D, CH4_D],
  ],
  bonds: [[0, 1], [0, 2], [0, 3], [0, 4]],
  he: 12,
  mos: [
    ['1a\u2081 \u03C3 sym', [[0, 2, 0, 0, 'real', 0.7], [1, 1, 0, 0, 'real', 0.35], [2, 1, 0, 0, 'real', 0.35], [3, 1, 0, 0, 'real', 0.35], [4, 1, 0, 0, 'real', 0.35]]],
    ['1t\u2082(x)', [[0, 2, 1, 1, 'cos', 0.7], [1, 1, 0, 0, 'real', 0.35], [2, 1, 0, 0, 'real', 0.35], [3, 1, 0, 0, 'real', -0.35], [4, 1, 0, 0, 'real', -0.35]]],
    ['1t\u2082(y)', [[0, 2, 1, 1, 'sin', 0.7], [1, 1, 0, 0, 'real', 0.35], [2, 1, 0, 0, 'real', -0.35], [3, 1, 0, 0, 'real', 0.35], [4, 1, 0, 0, 'real', -0.35]]],
    ['1t\u2082(z)', [[0, 2, 1, 0, 'real', 0.7], [1, 1, 0, 0, 'real', 0.35], [2, 1, 0, 0, 'real', -0.35], [3, 1, 0, 0, 'real', -0.35], [4, 1, 0, 0, 'real', 0.35]]],
  ]
});

// ---- 12. FeO ----
addMol({
  name: 'FeO',
  atoms: [['Fe', 0, 0, -1.58], ['O', 0, 0, 1.58]],
  bonds: [[0, 1, 2]],
  he: 18,
  mos: [
    ['\u03C3(4s-2p)', [[0, 4, 0, 0, 'real', 0.7], [1, 2, 1, 0, 'real', -0.6]]],
    ['\u03C0(dxz-px)', [[0, 3, 2, 1, 'cos', 0.75], [1, 2, 1, 1, 'cos', 0.55]]],
    ['\u03C0(dyz-py)', [[0, 3, 2, 1, 'sin', 0.75], [1, 2, 1, 1, 'sin', 0.55]]],
    ['\u03B4(dxy)', [[0, 3, 2, 2, 'sin', 1.0]]],
    ['\u03C3(dz\u00B2)', [[0, 3, 2, 0, 'real', 0.85], [1, 2, 1, 0, 'real', -0.35]]],
  ]
});

// ---- 13. C₂H₂ (acetylene) ----
// Linear along z
addMol({
  name: 'C\u2082H\u2082',
  atoms: [['C', 0, 0, -1.13], ['C', 0, 0, 1.13], ['H', 0, 0, -3.14], ['H', 0, 0, 3.14]],
  bonds: [[0, 1, 3], [0, 2], [1, 3]],
  he: 18,
  mos: [
    ['\u03C3g C-C', [[0, 2, 1, 0, 'real', 0.7], [1, 2, 1, 0, 'real', -0.7]]],
    ['\u03C0u(px)', [[0, 2, 1, 1, 'cos', 0.7], [1, 2, 1, 1, 'cos', 0.7]]],
    ['\u03C0u(py)', [[0, 2, 1, 1, 'sin', 0.7], [1, 2, 1, 1, 'sin', 0.7]]],
    ['\u03C3 C-H', [[0, 2, 0, 0, 'real', 0.5], [1, 2, 0, 0, 'real', 0.5], [2, 1, 0, 0, 'real', 0.4], [3, 1, 0, 0, 'real', 0.4]]],
  ]
});

// ---- 14. C₂H₄ (ethylene) ----
// Planar in xz plane, π uses py (perpendicular)
const C2H4_CC = 1.26;  // half C=C distance
const C2H4_CH = 2.04;  // C-H distance
const C2H4_ANG = (121.3 * Math.PI) / 180;
const C2H4_HX_OFF = C2H4_CH * Math.sin(C2H4_ANG - Math.PI / 2);
const C2H4_HZ_OFF = C2H4_CH * Math.cos(C2H4_ANG - Math.PI / 2);
addMol({
  name: 'C\u2082H\u2084',
  atoms: [
    ['C', 0, 0, -C2H4_CC],
    ['C', 0, 0, C2H4_CC],
    ['H', C2H4_HX_OFF, 0, -C2H4_CC - C2H4_HZ_OFF],
    ['H', -C2H4_HX_OFF, 0, -C2H4_CC - C2H4_HZ_OFF],
    ['H', C2H4_HX_OFF, 0, C2H4_CC + C2H4_HZ_OFF],
    ['H', -C2H4_HX_OFF, 0, C2H4_CC + C2H4_HZ_OFF],
  ],
  bonds: [[0, 1, 2], [0, 2], [0, 3], [1, 4], [1, 5]],
  he: 16,
  mos: [
    ['\u03C3 C-C', [[0, 2, 1, 0, 'real', 0.7], [1, 2, 1, 0, 'real', -0.7]]],
    ['\u03C0 C=C', [[0, 2, 1, 1, 'sin', 0.7], [1, 2, 1, 1, 'sin', 0.7]]],
    ['\u03C0* C=C', [[0, 2, 1, 1, 'sin', 0.7], [1, 2, 1, 1, 'sin', -0.7]]],
    ['\u03C3 C-H', [[0, 2, 0, 0, 'real', 0.45], [1, 2, 0, 0, 'real', 0.45], [2, 1, 0, 0, 'real', 0.25], [3, 1, 0, 0, 'real', 0.25], [4, 1, 0, 0, 'real', 0.25], [5, 1, 0, 0, 'real', 0.25]]],
  ]
});

// ---- 15. C₆H₆ (benzene) ----
// Hexagonal ring in xz plane, π uses py (perpendicular)
const BENZ_R = 2.64;   // C-C ring radius in Bohr
const BENZ_HR = 4.58;  // C-H distance from center

function hexPos(radius, i) {
  const angle = (i * Math.PI) / 3;
  return [radius * Math.cos(angle), 0, radius * Math.sin(angle)];
}

function pentPos(radius, i) {
  const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
  return [radius * Math.cos(angle), 0, radius * Math.sin(angle)];
}

function chairHexPos(radius, i, dz) {
  const angle = (i * Math.PI) / 3;
  const yOff = (i % 2 === 0) ? dz : -dz;
  return [radius * Math.cos(angle), yOff, radius * Math.sin(angle)];
}

const benzAtoms = [];
const benzBonds = [];
for (let i = 0; i < 6; i++) {
  const [cx, cy, cz] = hexPos(BENZ_R, i);
  benzAtoms.push(['C', cx, cy, cz]);
}
for (let i = 0; i < 6; i++) {
  const [hx, hy, hz] = hexPos(BENZ_HR, i);
  benzAtoms.push(['H', hx, hy, hz]);
}
// C-C bonds (ring)
for (let i = 0; i < 6; i++) benzBonds.push([i, (i + 1) % 6, 1.5]);
// C-H bonds
for (let i = 0; i < 6; i++) benzBonds.push([i, i + 6]);

addMol({
  name: 'C\u2086H\u2086',
  atoms: benzAtoms,
  bonds: benzBonds,
  he: 20,
  mos: [
    // π₁: all-bonding, same sign on all C py orbitals
    ['\u03C0\u2081 all bond', [
      [0, 2, 1, 1, 'sin', 0.41], [1, 2, 1, 1, 'sin', 0.41],
      [2, 2, 1, 1, 'sin', 0.41], [3, 2, 1, 1, 'sin', 0.41],
      [4, 2, 1, 1, 'sin', 0.41], [5, 2, 1, 1, 'sin', 0.41],
    ]],
    // π₂: one nodal plane (e1g, x-pattern)
    ['\u03C0\u2082 (1 node x)', [
      [0, 2, 1, 1, 'sin', 0.5], [1, 2, 1, 1, 'sin', 0.29],
      [2, 2, 1, 1, 'sin', -0.29], [3, 2, 1, 1, 'sin', -0.5],
      [4, 2, 1, 1, 'sin', -0.29], [5, 2, 1, 1, 'sin', 0.29],
    ]],
    // π₃: one nodal plane (e1g, z-pattern)
    ['\u03C0\u2083 (1 node z)', [
      [0, 2, 1, 1, 'sin', 0.0], [1, 2, 1, 1, 'sin', 0.5],
      [2, 2, 1, 1, 'sin', 0.5], [3, 2, 1, 1, 'sin', 0.0],
      [4, 2, 1, 1, 'sin', -0.5], [5, 2, 1, 1, 'sin', -0.5],
    ]],
    // σ frame: symmetric s-overlap on all C
    ['\u03C3 frame', [
      [0, 2, 0, 0, 'real', 0.35], [1, 2, 0, 0, 'real', 0.35],
      [2, 2, 0, 0, 'real', 0.35], [3, 2, 0, 0, 'real', 0.35],
      [4, 2, 0, 0, 'real', 0.35], [5, 2, 0, 0, 'real', 0.35],
      [6, 1, 0, 0, 'real', 0.2], [7, 1, 0, 0, 'real', 0.2],
      [8, 1, 0, 0, 'real', 0.2], [9, 1, 0, 0, 'real', 0.2],
      [10, 1, 0, 0, 'real', 0.2], [11, 1, 0, 0, 'real', 0.2],
    ]],
  ]
});

// ---- 16. CuO ----
addMol({
  name: 'CuO',
  atoms: [['Cu', 0, 0, -1.63], ['O', 0, 0, 1.63]],
  bonds: [[0, 1, 2]],
  he: 20,
  mos: [
    ['\u03C3(4s-2p)', [[0, 4, 0, 0, 'real', 0.65], [1, 2, 1, 0, 'real', -0.6]]],
    ['\u03C0(dxz-px)', [[0, 3, 2, 1, 'cos', 0.75], [1, 2, 1, 1, 'cos', 0.55]]],
    ['\u03C0(dyz-py)', [[0, 3, 2, 1, 'sin', 0.75], [1, 2, 1, 1, 'sin', 0.55]]],
    ['\u03B4(dxy)', [[0, 3, 2, 2, 'sin', 1.0]]],
    ['\u03C3(dz\u00B2)', [[0, 3, 2, 0, 'real', 0.85], [1, 2, 1, 0, 'real', -0.35]]],
  ]
});

// ---- 17. TiO₂ ----
// Bent gas-phase molecule, angle ~110°
addMol({
  name: 'TiO\u2082',
  atoms: [['Ti', 0, 0, 0], ['O', 2.51, 0, 1.76], ['O', -2.51, 0, 1.76]],
  bonds: [[0, 1, 2], [0, 2, 2]],
  he: 18,
  mos: [
    ['\u03C3 sym', [[0, 3, 2, 0, 'real', 0.7], [1, 2, 0, 0, 'real', 0.5], [2, 2, 0, 0, 'real', 0.5]]],
    ['\u03C3 anti', [[0, 3, 2, 1, 'cos', 0.7], [1, 2, 0, 0, 'real', 0.5], [2, 2, 0, 0, 'real', -0.5]]],
    ['\u03C0 deloc', [[0, 3, 2, 1, 'sin', 0.6], [1, 2, 1, 1, 'sin', 0.55], [2, 2, 1, 1, 'sin', 0.55]]],
    ['lone pair', [[1, 2, 1, 0, 'real', 0.7], [2, 2, 1, 0, 'real', 0.7]]],
  ]
});

// ---- 18. NaOH ----
addMol({
  name: 'NaOH',
  atoms: [['Na', 0, 0, -3.69], ['O', 0, 0, 0], ['H', 0, 0, 1.83]],
  bonds: [[0, 1], [1, 2]],
  he: 18,
  mos: [
    ['\u03C3(Na-O)', [[0, 3, 0, 0, 'real', 0.6], [1, 2, 1, 0, 'real', 0.7]]],
    ['\u03C3(O-H)', [[1, 2, 1, 0, 'real', -0.7], [2, 1, 0, 0, 'real', 0.65]]],
    ['lone pair (px)', [[1, 2, 1, 1, 'cos', 1.0]]],
    ['lone pair (py)', [[1, 2, 1, 1, 'sin', 1.0]]],
  ]
});

// ---- 19. Al₂O₃ ----
// Simplified O-Al-O-Al-O chain
addMol({
  name: 'Al\u2082O\u2083',
  atoms: [
    ['O', 0, 0, 0],
    ['Al', -3.33, 0, 0],
    ['Al', 3.33, 0, 0],
    ['O', -5.0, 0, 2.88],
    ['O', 5.0, 0, 2.88],
  ],
  bonds: [[0, 1], [0, 2], [1, 3], [2, 4]],
  he: 22,
  mos: [
    ['\u03C3 sym', [[0, 2, 0, 0, 'real', 0.5], [1, 3, 0, 0, 'real', 0.4], [2, 3, 0, 0, 'real', 0.4], [3, 2, 0, 0, 'real', 0.3], [4, 2, 0, 0, 'real', 0.3]]],
    ['\u03C3 bridge', [[0, 2, 1, 1, 'cos', 0.7], [1, 3, 0, 0, 'real', 0.5], [2, 3, 0, 0, 'real', -0.5]]],
    ['\u03C0 deloc', [[0, 2, 1, 1, 'sin', 0.6], [3, 2, 1, 1, 'sin', 0.45], [4, 2, 1, 1, 'sin', 0.45]]],
    ['lone pair', [[0, 2, 1, 0, 'real', 1.0]]],
  ]
});

// ---- 20. HNO₃ ----
// Trigonal planar N, one N-OH + two N=O
addMol({
  name: 'HNO\u2083',
  atoms: [
    ['N', 0, 0, 0],
    ['O', 0, 0, 2.29],
    ['O', 1.74, 0, -1.48],
    ['O', -2.43, 0, -1.08],
    ['H', -4.10, 0, -1.81],
  ],
  bonds: [[0, 1, 2], [0, 2, 2], [0, 3], [3, 4]],
  he: 18,
  mos: [
    ['\u03C3(N-O) sym', [[0, 2, 0, 0, 'real', 0.6], [1, 2, 0, 0, 'real', 0.4], [2, 2, 0, 0, 'real', 0.4], [3, 2, 0, 0, 'real', 0.35]]],
    ['\u03C0 deloc', [[0, 2, 1, 1, 'sin', 0.7], [1, 2, 1, 1, 'sin', 0.4], [2, 2, 1, 1, 'sin', 0.4], [3, 2, 1, 1, 'sin', 0.3]]],
    ['\u03C3(O-H)', [[3, 2, 1, 1, 'cos', -0.7], [4, 1, 0, 0, 'real', 0.65]]],
    ['lone pair', [[1, 2, 1, 0, 'real', 0.7], [2, 2, 1, 0, 'real', 0.7]]],
  ]
});

// ---- 21. H₂SO₄ ----
// Tetrahedral S: two =O + two -OH
addMol({
  name: 'H\u2082SO\u2084',
  atoms: [
    ['S', 0, 0, 0],
    ['O', 1.55, 1.55, 1.55],
    ['O', 1.55, -1.55, -1.55],
    ['O', -1.71, 1.71, -1.71],
    ['O', -1.71, -1.71, 1.71],
    ['H', -2.77, 2.77, -2.77],
    ['H', -2.77, -2.77, 2.77],
  ],
  bonds: [[0, 1, 2], [0, 2, 2], [0, 3], [0, 4], [3, 5], [4, 6]],
  he: 18,
  mos: [
    ['\u03C3(S-O) sym', [[0, 3, 0, 0, 'real', 0.5], [1, 2, 0, 0, 'real', 0.35], [2, 2, 0, 0, 'real', 0.35], [3, 2, 0, 0, 'real', 0.35], [4, 2, 0, 0, 'real', 0.35]]],
    ['\u03C0(S=O)', [[0, 3, 2, 1, 'cos', 0.6], [1, 2, 1, 1, 'cos', 0.5], [2, 2, 1, 1, 'cos', 0.5]]],
    ['\u03C3(O-H)', [[3, 2, 0, 0, 'real', 0.5], [4, 2, 0, 0, 'real', 0.5], [5, 1, 0, 0, 'real', 0.4], [6, 1, 0, 0, 'real', 0.4]]],
    ['lone pair', [[1, 2, 1, 0, 'real', 0.7], [2, 2, 1, 0, 'real', 0.7]]],
  ]
});

// ---- 22. CH₃OH (methanol) ----
addMol({
  name: 'CH\u2083OH',
  atoms: [
    ['C', 0, 0, 0],
    ['O', 0, 0, 2.70],
    ['H', 1.74, 0, 3.28],
    ['H', 1.94, 0, -0.69],
    ['H', -0.97, 1.68, -0.69],
    ['H', -0.97, -1.68, -0.69],
  ],
  bonds: [[0, 1], [1, 2], [0, 3], [0, 4], [0, 5]],
  he: 14,
  mos: [
    ['\u03C3(C-O)', [[0, 2, 1, 0, 'real', 0.7], [1, 2, 1, 0, 'real', -0.65]]],
    ['\u03C3(O-H)', [[1, 2, 1, 1, 'cos', 0.7], [2, 1, 0, 0, 'real', 0.65]]],
    ['\u03C3(C-H) sym', [[0, 2, 0, 0, 'real', 0.6], [3, 1, 0, 0, 'real', 0.35], [4, 1, 0, 0, 'real', 0.35], [5, 1, 0, 0, 'real', 0.35]]],
    ['lone pair', [[1, 2, 1, 1, 'sin', 1.0]]],
  ]
});

// ---- 23. C₂H₅OH (ethanol) ----
addMol({
  name: 'C\u2082H\u2085OH',
  atoms: [
    ['C', 0, 0, -1.46],
    ['C', 0, 0, 1.46],
    ['O', 2.55, 0, 2.36],
    ['H', 3.46, 0.95, 1.80],
    ['H', 0.97, 1.68, -2.14],
    ['H', -1.94, 0, -2.14],
    ['H', 0.97, -1.68, -2.14],
    ['H', -0.97, 1.68, 2.14],
    ['H', -0.97, -1.68, 2.14],
  ],
  bonds: [[0, 1], [1, 2], [2, 3], [0, 4], [0, 5], [0, 6], [1, 7], [1, 8]],
  he: 16,
  mos: [
    ['\u03C3(C-C)', [[0, 2, 1, 0, 'real', 0.7], [1, 2, 1, 0, 'real', -0.7]]],
    ['\u03C3(C-O)', [[1, 2, 1, 1, 'cos', 0.65], [2, 2, 1, 1, 'cos', 0.65]]],
    ['\u03C3(C-H) sym', [[0, 2, 0, 0, 'real', 0.45], [1, 2, 0, 0, 'real', 0.45], [4, 1, 0, 0, 'real', 0.2], [5, 1, 0, 0, 'real', 0.2], [6, 1, 0, 0, 'real', 0.2], [7, 1, 0, 0, 'real', 0.2], [8, 1, 0, 0, 'real', 0.2]]],
    ['lone pair', [[2, 2, 1, 1, 'sin', 1.0]]],
  ]
});

// ---- 24. CaCO₃ ----
// Trigonal planar CO₃²⁻ in xz plane + Ca²⁺ above
addMol({
  name: 'CaCO\u2083',
  atoms: [
    ['C', 0, 0, 0],
    ['O', 0, 0, 2.45],
    ['O', 2.12, 0, -1.23],
    ['O', -2.12, 0, -1.23],
    ['Ca', 0, 4.54, 0],
  ],
  bonds: [[0, 1, 1.5], [0, 2, 1.5], [0, 3, 1.5]],
  he: 22,
  mos: [
    ['\u03C3(C-O) sym', [[0, 2, 0, 0, 'real', 0.65], [1, 2, 0, 0, 'real', 0.43], [2, 2, 0, 0, 'real', 0.43], [3, 2, 0, 0, 'real', 0.43]]],
    ['\u03C0 deloc', [[0, 2, 1, 1, 'sin', 0.65], [1, 2, 1, 1, 'sin', 0.43], [2, 2, 1, 1, 'sin', 0.43], [3, 2, 1, 1, 'sin', 0.43]]],
    ['Ca-O ionic', [[4, 4, 0, 0, 'real', 0.5], [1, 2, 1, 1, 'sin', 0.3], [2, 2, 1, 1, 'sin', 0.3], [3, 2, 1, 1, 'sin', 0.3]]],
    ['lone pair', [[1, 2, 1, 0, 'real', 0.55], [2, 2, 1, 0, 'real', 0.55], [3, 2, 1, 0, 'real', 0.55]]],
  ]
});

// ---- 25. Fe₃O₄ (magnetite) ----
// Simplified cluster: 3 Fe + 4 O
addMol({
  name: 'Fe\u2083O\u2084',
  atoms: [
    ['Fe', 0, 0, 0],
    ['Fe', 3.5, 3.5, 0],
    ['Fe', -3.5, 3.5, 0],
    ['O', 1.8, 1.8, 0],
    ['O', -1.8, 1.8, 0],
    ['O', 0, 0, 3.0],
    ['O', 0, -3.0, 0],
  ],
  bonds: [[0, 3], [1, 3], [0, 4], [2, 4], [0, 5], [0, 6]],
  he: 22,
  mos: [
    ['\u03C3(Fe-O)', [[0, 3, 2, 0, 'real', 0.6], [3, 2, 0, 0, 'real', 0.4], [4, 2, 0, 0, 'real', 0.4], [5, 2, 0, 0, 'real', 0.3], [6, 2, 0, 0, 'real', 0.3]]],
    ['d(xy) band', [[0, 3, 2, 2, 'sin', 0.6], [1, 3, 2, 2, 'sin', 0.5], [2, 3, 2, 2, 'sin', 0.5]]],
    ['\u03C0(Fe-O)', [[0, 3, 2, 1, 'cos', 0.6], [3, 2, 1, 1, 'cos', 0.45], [4, 2, 1, 1, 'cos', 0.45]]],
    ['lone pair', [[5, 2, 1, 0, 'real', 0.7], [6, 2, 1, 0, 'real', 0.7]]],
  ]
});

// ---- 26. Fe(OH)₃ ----
// Trigonal: Fe at center, 3 OH groups at 120°
addMol({
  name: 'Fe(OH)\u2083',
  atoms: [
    ['Fe', 0, 0, 0],
    ['O', 0, 0, 3.60],
    ['O', 3.12, 0, -1.80],
    ['O', -3.12, 0, -1.80],
    ['H', 0, 0, 5.43],
    ['H', 4.70, 0, -2.72],
    ['H', -4.70, 0, -2.72],
  ],
  bonds: [[0, 1], [0, 2], [0, 3], [1, 4], [2, 5], [3, 6]],
  he: 20,
  mos: [
    ['\u03C3(Fe-O) sym', [[0, 3, 2, 0, 'real', 0.6], [1, 2, 0, 0, 'real', 0.4], [2, 2, 0, 0, 'real', 0.4], [3, 2, 0, 0, 'real', 0.4]]],
    ['\u03C3(O-H)', [[1, 2, 1, 0, 'real', 0.55], [2, 2, 1, 0, 'real', 0.55], [3, 2, 1, 0, 'real', 0.55], [4, 1, 0, 0, 'real', 0.3], [5, 1, 0, 0, 'real', 0.3], [6, 1, 0, 0, 'real', 0.3]]],
    ['d(xz)', [[0, 3, 2, 1, 'cos', 1.0]]],
    ['d(yz)', [[0, 3, 2, 1, 'sin', 1.0]]],
  ]
});

// ---- 27. Fe₂(OH)₃ ----
// Two Fe bridged by 3 OH groups
addMol({
  name: 'Fe\u2082(OH)\u2083',
  atoms: [
    ['Fe', 0, 0, -2.0],
    ['Fe', 0, 0, 2.0],
    ['O', 2.8, 0, 0],
    ['O', -1.4, 2.42, 0],
    ['O', -1.4, -2.42, 0],
    ['H', 4.5, 0, 0],
    ['H', -2.25, 3.90, 0],
    ['H', -2.25, -3.90, 0],
  ],
  bonds: [[0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4], [2, 5], [3, 6], [4, 7]],
  he: 20,
  mos: [
    ['\u03C3(Fe-O) sym', [[0, 3, 2, 0, 'real', 0.5], [1, 3, 2, 0, 'real', 0.5], [2, 2, 0, 0, 'real', 0.35], [3, 2, 0, 0, 'real', 0.35], [4, 2, 0, 0, 'real', 0.35]]],
    ['d-d \u03C3', [[0, 3, 2, 0, 'real', 0.7], [1, 3, 2, 0, 'real', -0.7]]],
    ['\u03C0(Fe-O)', [[0, 3, 2, 1, 'cos', 0.6], [1, 3, 2, 1, 'cos', 0.6], [2, 2, 1, 1, 'cos', 0.4]]],
    ['\u03B4(dxy)', [[0, 3, 2, 2, 'sin', 0.7], [1, 3, 2, 2, 'sin', 0.7]]],
  ]
});

// ---- 28. \u03B1-Fe₂O₃ (hematite) ----
// Corundum structure: Fe in distorted octahedral sites, Fe-O ~3.80 Bohr
addMol({
  name: '\u03B1-Fe\u2082O\u2083',
  atoms: [
    ['Fe', -2.71, 0, 0],
    ['Fe', 2.71, 0, 0],
    ['O', 0, 0, 0],
    ['O', -4.40, 0, 2.70],
    ['O', 4.40, 0, 2.70],
  ],
  bonds: [[0, 2], [1, 2], [0, 3], [1, 4]],
  he: 22,
  mos: [
    ['\u03C3(Fe-O)', [[0, 3, 2, 0, 'real', 0.55], [1, 3, 2, 0, 'real', 0.55], [2, 2, 0, 0, 'real', 0.5], [3, 2, 0, 0, 'real', 0.3], [4, 2, 0, 0, 'real', 0.3]]],
    ['\u03C0(Fe-O)', [[0, 3, 2, 1, 'cos', 0.6], [1, 3, 2, 1, 'cos', 0.6], [2, 2, 1, 1, 'cos', 0.5]]],
    ['d(xy) AF', [[0, 3, 2, 2, 'sin', 0.7], [1, 3, 2, 2, 'sin', -0.7]]],
    ['d(xz) band', [[0, 3, 2, 1, 'cos', 0.7], [1, 3, 2, 1, 'cos', 0.7]]],
  ]
});

// ---- 29. \u03B2-Fe₂O₃ ----
// Body-centered cubic: more compact Fe-O ~3.68 Bohr
addMol({
  name: '\u03B2-Fe\u2082O\u2083',
  atoms: [
    ['Fe', -2.50, 0, 0],
    ['Fe', 2.50, 0, 0],
    ['O', 0, 0, 0],
    ['O', -4.00, 0, 2.50],
    ['O', 4.00, 0, 2.50],
  ],
  bonds: [[0, 2], [1, 2], [0, 3], [1, 4]],
  he: 22,
  mos: [
    ['\u03C3(Fe-O)', [[0, 3, 2, 0, 'real', 0.55], [1, 3, 2, 0, 'real', 0.55], [2, 2, 0, 0, 'real', 0.5], [3, 2, 0, 0, 'real', 0.3], [4, 2, 0, 0, 'real', 0.3]]],
    ['\u03C0(Fe-O)', [[0, 3, 2, 1, 'sin', 0.6], [1, 3, 2, 1, 'sin', 0.6], [2, 2, 1, 1, 'sin', 0.5]]],
    ['d(x\u00B2-y\u00B2)', [[0, 3, 2, 2, 'cos', 0.7], [1, 3, 2, 2, 'cos', 0.7]]],
    ['d(yz) band', [[0, 3, 2, 1, 'sin', 0.7], [1, 3, 2, 1, 'sin', 0.7]]],
  ]
});

// ---- 30. \u03B3-Fe₂O₃ (maghemite) ----
// Inverse spinel: Fe in tetrahedral + octahedral sites, Fe-O ~3.72 Bohr
addMol({
  name: '\u03B3-Fe\u2082O\u2083',
  atoms: [
    ['Fe', -2.0, 0, 0],
    ['Fe', 2.0, 0, 0],
    ['O', 0, 0, 1.80],
    ['O', -3.20, 0, 2.80],
    ['O', 3.20, 0, 2.80],
  ],
  bonds: [[0, 2], [1, 2], [0, 3], [1, 4]],
  he: 22,
  mos: [
    ['\u03C3(Fe-O) tet', [[0, 3, 2, 0, 'real', 0.6], [2, 2, 0, 0, 'real', 0.45], [3, 2, 0, 0, 'real', 0.4]]],
    ['\u03C3(Fe-O) oct', [[1, 3, 2, 0, 'real', 0.6], [2, 2, 0, 0, 'real', 0.45], [4, 2, 0, 0, 'real', 0.4]]],
    ['d(xy) FM', [[0, 3, 2, 2, 'sin', 0.7], [1, 3, 2, 2, 'sin', 0.7]]],
    ['\u03C0(Fe-O)', [[0, 3, 2, 1, 'cos', 0.55], [1, 3, 2, 1, 'cos', 0.55], [2, 2, 1, 1, 'cos', 0.5]]],
  ]
});

// ---- 31. \u03B5-Fe₂O₃ ----
// Orthorhombic distorted: Fe-O ~3.90 Bohr, asymmetric
addMol({
  name: '\u03B5-Fe\u2082O\u2083',
  atoms: [
    ['Fe', -2.80, 0, 0],
    ['Fe', 2.80, 0, 0.50],
    ['O', 0, 0, 0],
    ['O', -4.60, 0, 2.80],
    ['O', 4.60, 0, 3.30],
  ],
  bonds: [[0, 2], [1, 2], [0, 3], [1, 4]],
  he: 22,
  mos: [
    ['\u03C3(Fe-O)', [[0, 3, 2, 0, 'real', 0.55], [1, 3, 2, 0, 'real', 0.50], [2, 2, 0, 0, 'real', 0.5], [3, 2, 0, 0, 'real', 0.3], [4, 2, 0, 0, 'real', 0.3]]],
    ['\u03C0(Fe-O)', [[0, 3, 2, 1, 'cos', 0.6], [1, 3, 2, 1, 'cos', 0.55], [2, 2, 1, 1, 'cos', 0.5]]],
    ['d(z\u00B2) asym', [[0, 3, 2, 0, 'real', 0.7], [1, 3, 2, 0, 'real', -0.6]]],
    ['d(xy)', [[0, 3, 2, 2, 'sin', 0.7], [1, 3, 2, 2, 'sin', -0.7]]],
  ]
});

// ---- 32. N₂H₄ (hydrazine) ----
// Gauche conformation: N-N along z, H₂ groups rotated ~90°
{
  const NN = 1.37; // half N-N in Bohr
  const NH = 1.91;
  const ang = (112 * Math.PI) / 180;
  const hR = NH * Math.sin(ang / 2);
  const hZ = NH * Math.cos(ang / 2);
  addMol({
    name: 'N\u2082H\u2084',
    atoms: [
      ['N', 0, 0, -NN],
      ['N', 0, 0, NN],
      ['H', hR, 0, -NN - hZ],
      ['H', 0, hR, -NN - hZ],
      ['H', -hR, 0, NN + hZ],
      ['H', 0, -hR, NN + hZ],
    ],
    bonds: [[0, 1], [0, 2], [0, 3], [1, 4], [1, 5]],
    he: 14,
    mos: [
      ['\u03C3(N-N)', [[0, 2, 1, 0, 'real', 0.7], [1, 2, 1, 0, 'real', -0.7]]],
      ['\u03C3(N-H) sym', [[0, 2, 0, 0, 'real', 0.5], [1, 2, 0, 0, 'real', 0.5], [2, 1, 0, 0, 'real', 0.3], [3, 1, 0, 0, 'real', 0.3], [4, 1, 0, 0, 'real', 0.3], [5, 1, 0, 0, 'real', 0.3]]],
      ['lone pair (N1)', [[0, 2, 1, 1, 'sin', 1.0]]],
      ['lone pair (N2)', [[1, 2, 1, 1, 'cos', 1.0]]],
    ]
  });
}

// ---- 33. Pyridine (C₅H₅N) ----
// 6-membered ring in xz plane: replace C at position 0 with N (no H on N)
{
  const R = 2.64;
  const HR = 4.58;
  const atoms = [];
  const bonds = [];
  // Position 0 = N, positions 1-5 = C
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = hexPos(R, i);
    atoms.push([i === 0 ? 'N' : 'C', x, y, z]);
  }
  // H on C atoms only (positions 1-5)
  for (let i = 1; i < 6; i++) {
    const [hx, hy, hz] = hexPos(HR, i);
    atoms.push(['H', hx, hy, hz]);
  }
  // Ring bonds (aromatic)
  for (let i = 0; i < 6; i++) bonds.push([i, (i + 1) % 6, 1.5]);
  // C-H bonds (atoms 6-10 to ring atoms 1-5)
  for (let i = 1; i < 6; i++) bonds.push([i, i + 5]);
  addMol({
    name: 'C\u2085H\u2085N',
    atoms,
    bonds,
    he: 20,
    mos: [
      ['\u03C0\u2081 all bond', [
        [0, 2, 1, 1, 'sin', 0.45], [1, 2, 1, 1, 'sin', 0.40],
        [2, 2, 1, 1, 'sin', 0.40], [3, 2, 1, 1, 'sin', 0.40],
        [4, 2, 1, 1, 'sin', 0.40], [5, 2, 1, 1, 'sin', 0.40],
      ]],
      ['\u03C0\u2082 (1 node)', [
        [0, 2, 1, 1, 'sin', 0.50], [1, 2, 1, 1, 'sin', 0.29],
        [2, 2, 1, 1, 'sin', -0.29], [3, 2, 1, 1, 'sin', -0.50],
        [4, 2, 1, 1, 'sin', -0.29], [5, 2, 1, 1, 'sin', 0.29],
      ]],
      ['\u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.35], [1, 2, 0, 0, 'real', 0.35],
        [2, 2, 0, 0, 'real', 0.35], [3, 2, 0, 0, 'real', 0.35],
        [4, 2, 0, 0, 'real', 0.35], [5, 2, 0, 0, 'real', 0.35],
        [6, 1, 0, 0, 'real', 0.2], [7, 1, 0, 0, 'real', 0.2],
        [8, 1, 0, 0, 'real', 0.2], [9, 1, 0, 0, 'real', 0.2],
        [10, 1, 0, 0, 'real', 0.2],
      ]],
      ['N lone pair', [[0, 2, 1, 0, 'real', 1.0]]],
    ]
  });
}

// ---- 34. 1,3,5-Triazine (C₃H₃N₃) ----
// Alternating C and N in 6-ring, H on carbons
{
  const R = 2.64;
  const HR = 4.58;
  const atoms = [];
  const bonds = [];
  // Positions 0,2,4 = N; 1,3,5 = C
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = hexPos(R, i);
    atoms.push([i % 2 === 0 ? 'N' : 'C', x, y, z]);
  }
  // H on C atoms only (positions 1,3,5)
  for (let i = 0; i < 3; i++) {
    const ci = i * 2 + 1;
    const [hx, hy, hz] = hexPos(HR, ci);
    atoms.push(['H', hx, hy, hz]);
  }
  for (let i = 0; i < 6; i++) bonds.push([i, (i + 1) % 6, 1.5]);
  bonds.push([1, 6]); bonds.push([3, 7]); bonds.push([5, 8]);
  addMol({
    name: 'C\u2083H\u2083N\u2083',
    atoms,
    bonds,
    he: 20,
    mos: [
      ['\u03C0\u2081 all bond', [
        [0, 2, 1, 1, 'sin', 0.45], [1, 2, 1, 1, 'sin', 0.38],
        [2, 2, 1, 1, 'sin', 0.45], [3, 2, 1, 1, 'sin', 0.38],
        [4, 2, 1, 1, 'sin', 0.45], [5, 2, 1, 1, 'sin', 0.38],
      ]],
      ['\u03C0\u2082 (1 node)', [
        [0, 2, 1, 1, 'sin', 0.50], [1, 2, 1, 1, 'sin', 0.25],
        [2, 2, 1, 1, 'sin', -0.25], [3, 2, 1, 1, 'sin', -0.50],
        [4, 2, 1, 1, 'sin', -0.25], [5, 2, 1, 1, 'sin', 0.25],
      ]],
      ['\u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.35], [1, 2, 0, 0, 'real', 0.35],
        [2, 2, 0, 0, 'real', 0.35], [3, 2, 0, 0, 'real', 0.35],
        [4, 2, 0, 0, 'real', 0.35], [5, 2, 0, 0, 'real', 0.35],
        [6, 1, 0, 0, 'real', 0.22], [7, 1, 0, 0, 'real', 0.22],
        [8, 1, 0, 0, 'real', 0.22],
      ]],
      ['N lone pairs', [[0, 2, 1, 0, 'real', 0.58], [2, 2, 1, 0, 'real', 0.58], [4, 2, 1, 0, 'real', 0.58]]],
    ]
  });
}

// ---- 35. Uracil (C₄H₄N₂O₂) ----
// 6-membered ring: N1-C2-N3-C4-C5-C6, C=O on C2 and C4
{
  const R = 2.64;
  const [n1x, n1y, n1z] = hexPos(R, 0); // N1
  const [c2x, c2y, c2z] = hexPos(R, 1); // C2
  const [n3x, n3y, n3z] = hexPos(R, 2); // N3
  const [c4x, c4y, c4z] = hexPos(R, 3); // C4
  const [c5x, c5y, c5z] = hexPos(R, 4); // C5
  const [c6x, c6y, c6z] = hexPos(R, 5); // C6
  const OR = R + 2.27; // C=O distance from center
  addMol({
    name: 'Uracil',
    atoms: [
      ['N', n1x, n1y, n1z],   // 0: N1
      ['C', c2x, c2y, c2z],   // 1: C2
      ['N', n3x, n3y, n3z],   // 2: N3
      ['C', c4x, c4y, c4z],   // 3: C4
      ['C', c5x, c5y, c5z],   // 4: C5
      ['C', c6x, c6y, c6z],   // 5: C6
      ['O', ...hexPos(OR, 1)], // 6: O on C2
      ['O', ...hexPos(OR, 3)], // 7: O on C4
      ['H', ...hexPos(R + 1.91, 0)], // 8: H on N1
      ['H', ...hexPos(R + 1.91, 2)], // 9: H on N3
      ['H', ...hexPos(R + 2.06, 4)], // 10: H on C5
      ['H', ...hexPos(R + 2.06, 5)], // 11: H on C6
    ],
    bonds: [
      [0, 1], [1, 2], [2, 3], [3, 4, 2], [4, 5, 2], [5, 0],
      [1, 6, 2], [3, 7, 2],
      [0, 8], [2, 9], [4, 10], [5, 11],
    ],
    he: 20,
    mos: [
      ['\u03C0 system', [
        [0, 2, 1, 1, 'sin', 0.35], [1, 2, 1, 1, 'sin', 0.35],
        [2, 2, 1, 1, 'sin', 0.35], [3, 2, 1, 1, 'sin', 0.35],
        [4, 2, 1, 1, 'sin', 0.40], [5, 2, 1, 1, 'sin', 0.40],
      ]],
      ['\u03C3(C=O)', [[1, 2, 1, 0, 'real', 0.6], [6, 2, 1, 0, 'real', -0.5], [3, 2, 1, 0, 'real', 0.4], [7, 2, 1, 0, 'real', -0.4]]],
      ['N lone pair', [[0, 2, 1, 0, 'real', 0.7], [2, 2, 1, 0, 'real', 0.7]]],
      ['\u03C0* anti', [
        [0, 2, 1, 1, 'sin', 0.35], [1, 2, 1, 1, 'sin', -0.35],
        [2, 2, 1, 1, 'sin', 0.35], [3, 2, 1, 1, 'sin', -0.35],
        [4, 2, 1, 1, 'sin', 0.40], [5, 2, 1, 1, 'sin', -0.40],
      ]],
    ]
  });
}

// ---- 36. Cyclopentadiene (C₅H₆) ----
// 5C in planar ring; C1 sp3 (2H), C2-C5 have 1H each
{
  const R = 2.20; // pentagon C-C ring radius
  const HR = R + 2.06;
  const atoms = [];
  const bonds = [];
  for (let i = 0; i < 5; i++) {
    const [x, y, z] = pentPos(R, i);
    atoms.push(['C', x, y, z]);
  }
  // C1 (index 0, top) is sp3 with 2H above/below
  atoms.push(['H', pentPos(R, 0)[0], 1.0, pentPos(R, 0)[2]]);  // 5: H above
  atoms.push(['H', pentPos(R, 0)[0], -1.0, pentPos(R, 0)[2]]); // 6: H below
  // C2-C5 (indices 1-4) each have 1H in-plane
  for (let i = 1; i < 5; i++) {
    const [hx, hy, hz] = pentPos(HR, i);
    atoms.push(['H', hx, hy, hz]);
  }
  // Bonds: C2=C3, C4=C5 double; rest single
  bonds.push([0, 1]); bonds.push([1, 2, 2]); bonds.push([2, 3]);
  bonds.push([3, 4, 2]); bonds.push([4, 0]);
  bonds.push([0, 5]); bonds.push([0, 6]);
  for (let i = 1; i < 5; i++) bonds.push([i, i + 6]);
  addMol({
    name: 'C\u2085H\u2086',
    atoms,
    bonds,
    he: 18,
    mos: [
      ['\u03C0\u2081 bonding', [
        [1, 2, 1, 1, 'sin', 0.50], [2, 2, 1, 1, 'sin', 0.50],
        [3, 2, 1, 1, 'sin', 0.50], [4, 2, 1, 1, 'sin', 0.50],
      ]],
      ['\u03C0\u2082 bonding', [
        [1, 2, 1, 1, 'sin', 0.50], [2, 2, 1, 1, 'sin', -0.50],
        [3, 2, 1, 1, 'sin', -0.50], [4, 2, 1, 1, 'sin', 0.50],
      ]],
      ['\u03C3(C-H) sym', [
        [0, 2, 0, 0, 'real', 0.4], [1, 2, 0, 0, 'real', 0.4],
        [2, 2, 0, 0, 'real', 0.4], [3, 2, 0, 0, 'real', 0.4],
        [4, 2, 0, 0, 'real', 0.4],
        [5, 1, 0, 0, 'real', 0.18], [6, 1, 0, 0, 'real', 0.18],
        [7, 1, 0, 0, 'real', 0.18], [8, 1, 0, 0, 'real', 0.18],
        [9, 1, 0, 0, 'real', 0.18], [10, 1, 0, 0, 'real', 0.18],
      ]],
      ['HOMO lone pair', [[0, 2, 1, 1, 'sin', 0.9]]],
    ]
  });
}

// ---- 37. Phenol (C₆H₅OH) ----
// Benzene ring + OH on C at position 0
{
  const R = 2.64;
  const HR = 4.58;
  const atoms = [];
  const bonds = [];
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = hexPos(R, i);
    atoms.push(['C', x, y, z]);
  }
  // OH on C0 (outward along hexPos direction)
  const [ox, oy, oz] = hexPos(R + 2.70, 0);
  atoms.push(['O', ox, oy, oz]); // 6
  const [ohx, ohy, ohz] = hexPos(R + 2.70 + 1.83, 0);
  atoms.push(['H', ohx, ohy, ohz]); // 7
  // H on C1-C5
  for (let i = 1; i < 6; i++) {
    const [hx, hy, hz] = hexPos(HR, i);
    atoms.push(['H', hx, hy, hz]); // 8-12
  }
  for (let i = 0; i < 6; i++) bonds.push([i, (i + 1) % 6, 1.5]);
  bonds.push([0, 6]); bonds.push([6, 7]);
  for (let i = 1; i < 6; i++) bonds.push([i, i + 7]);
  addMol({
    name: 'Phenol',
    atoms,
    bonds,
    he: 22,
    mos: [
      ['\u03C0 system', [
        [0, 2, 1, 1, 'sin', 0.40], [1, 2, 1, 1, 'sin', 0.40],
        [2, 2, 1, 1, 'sin', 0.40], [3, 2, 1, 1, 'sin', 0.40],
        [4, 2, 1, 1, 'sin', 0.40], [5, 2, 1, 1, 'sin', 0.40],
      ]],
      ['O lone pair', [[6, 2, 1, 1, 'sin', 1.0]]],
      ['\u03C3(O-H)', [[6, 2, 1, 0, 'real', 0.7], [7, 1, 0, 0, 'real', 0.65]]],
      ['\u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.33], [1, 2, 0, 0, 'real', 0.33],
        [2, 2, 0, 0, 'real', 0.33], [3, 2, 0, 0, 'real', 0.33],
        [4, 2, 0, 0, 'real', 0.33], [5, 2, 0, 0, 'real', 0.33],
        [6, 2, 0, 0, 'real', 0.25],
        [8, 1, 0, 0, 'real', 0.18], [9, 1, 0, 0, 'real', 0.18],
        [10, 1, 0, 0, 'real', 0.18], [11, 1, 0, 0, 'real', 0.18],
        [12, 1, 0, 0, 'real', 0.18],
      ]],
    ]
  });
}

// ---- 38. Aniline (C₆H₅NH₂) ----
// Benzene ring + NH₂ on C at position 0
{
  const R = 2.64;
  const HR = 4.58;
  const atoms = [];
  const bonds = [];
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = hexPos(R, i);
    atoms.push(['C', x, y, z]);
  }
  // NH₂ on C0
  const [nx, ny, nz] = hexPos(R + 2.76, 0);
  atoms.push(['N', nx, ny, nz]); // 6
  atoms.push(['H', nx + 0.93, 1.60, nz]); // 7
  atoms.push(['H', nx + 0.93, -1.60, nz]); // 8
  // H on C1-C5
  for (let i = 1; i < 6; i++) {
    const [hx, hy, hz] = hexPos(HR, i);
    atoms.push(['H', hx, hy, hz]); // 9-13
  }
  for (let i = 0; i < 6; i++) bonds.push([i, (i + 1) % 6, 1.5]);
  bonds.push([0, 6]); bonds.push([6, 7]); bonds.push([6, 8]);
  for (let i = 1; i < 6; i++) bonds.push([i, i + 8]);
  addMol({
    name: 'Aniline',
    atoms,
    bonds,
    he: 22,
    mos: [
      ['\u03C0 system', [
        [0, 2, 1, 1, 'sin', 0.40], [1, 2, 1, 1, 'sin', 0.40],
        [2, 2, 1, 1, 'sin', 0.40], [3, 2, 1, 1, 'sin', 0.40],
        [4, 2, 1, 1, 'sin', 0.40], [5, 2, 1, 1, 'sin', 0.40],
      ]],
      ['N lone pair', [[6, 2, 1, 1, 'sin', 0.9]]],
      ['\u03C3(N-H)', [[6, 2, 0, 0, 'real', 0.5], [7, 1, 0, 0, 'real', 0.4], [8, 1, 0, 0, 'real', 0.4]]],
      ['\u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.33], [1, 2, 0, 0, 'real', 0.33],
        [2, 2, 0, 0, 'real', 0.33], [3, 2, 0, 0, 'real', 0.33],
        [4, 2, 0, 0, 'real', 0.33], [5, 2, 0, 0, 'real', 0.33],
        [9, 1, 0, 0, 'real', 0.18], [10, 1, 0, 0, 'real', 0.18],
        [11, 1, 0, 0, 'real', 0.18], [12, 1, 0, 0, 'real', 0.18],
        [13, 1, 0, 0, 'real', 0.18],
      ]],
    ]
  });
}

// ---- 39. Toluene (C₆H₅CH₃) ----
// Benzene ring + CH₃ on C at position 0
{
  const R = 2.64;
  const HR = 4.58;
  const atoms = [];
  const bonds = [];
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = hexPos(R, i);
    atoms.push(['C', x, y, z]);
  }
  // CH₃ on C0
  const [mx, my, mz] = hexPos(R + 2.88, 0);
  atoms.push(['C', mx, my, mz]); // 6: methyl C
  atoms.push(['H', mx + 1.94, my, mz - 0.69]); // 7
  atoms.push(['H', mx - 0.97, my + 1.68, mz - 0.69]); // 8
  atoms.push(['H', mx - 0.97, my - 1.68, mz - 0.69]); // 9
  // H on C1-C5
  for (let i = 1; i < 6; i++) {
    const [hx, hy, hz] = hexPos(HR, i);
    atoms.push(['H', hx, hy, hz]); // 10-14
  }
  for (let i = 0; i < 6; i++) bonds.push([i, (i + 1) % 6, 1.5]);
  bonds.push([0, 6]); bonds.push([6, 7]); bonds.push([6, 8]); bonds.push([6, 9]);
  for (let i = 1; i < 6; i++) bonds.push([i, i + 9]);
  addMol({
    name: 'Toluene',
    atoms,
    bonds,
    he: 22,
    mos: [
      ['\u03C0 system', [
        [0, 2, 1, 1, 'sin', 0.40], [1, 2, 1, 1, 'sin', 0.40],
        [2, 2, 1, 1, 'sin', 0.40], [3, 2, 1, 1, 'sin', 0.40],
        [4, 2, 1, 1, 'sin', 0.40], [5, 2, 1, 1, 'sin', 0.40],
      ]],
      ['\u03C3(C-CH\u2083)', [[0, 2, 1, 0, 'real', 0.65], [6, 2, 1, 0, 'real', -0.65]]],
      ['\u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.33], [1, 2, 0, 0, 'real', 0.33],
        [2, 2, 0, 0, 'real', 0.33], [3, 2, 0, 0, 'real', 0.33],
        [4, 2, 0, 0, 'real', 0.33], [5, 2, 0, 0, 'real', 0.33],
        [6, 2, 0, 0, 'real', 0.30],
        [7, 1, 0, 0, 'real', 0.16], [8, 1, 0, 0, 'real', 0.16], [9, 1, 0, 0, 'real', 0.16],
        [10, 1, 0, 0, 'real', 0.18], [11, 1, 0, 0, 'real', 0.18],
        [12, 1, 0, 0, 'real', 0.18], [13, 1, 0, 0, 'real', 0.18],
        [14, 1, 0, 0, 'real', 0.18],
      ]],
      ['hyperconjugation', [[6, 2, 1, 1, 'sin', 0.5], [0, 2, 1, 1, 'sin', 0.3], [1, 2, 1, 1, 'sin', 0.15], [5, 2, 1, 1, 'sin', 0.15]]],
    ]
  });
}

// ---- 40. Purine (C₅H₄N₄) ----
// Fused 6-ring (pyrimidine) + 5-ring (imidazole) sharing edge
{
  const R6 = 2.64;
  const R5 = 2.20;
  // 6-ring: positions 0-5; atoms: N1 C2 N3 C4 C5 C6
  const r6 = [];
  for (let i = 0; i < 6; i++) r6.push(hexPos(R6, i));
  // 5-ring fused at C4-C5 edge (indices 3,4 in 6-ring)
  // Need to build 5-ring sharing atoms 3 and 4, extending outward
  const c4 = r6[3], c5 = r6[4];
  const midx = (c4[0] + c5[0]) / 2, midz = (c4[2] + c5[2]) / 2;
  // Direction outward from ring center
  const cx6 = 0, cz6 = 0; // center of 6-ring
  const outx = midx - cx6, outz = midz - cz6;
  const outLen = Math.sqrt(outx * outx + outz * outz);
  const nx = outx / outLen, nz = outz / outLen;
  // 5-ring extra atoms: N7, C8, N9
  const ext = R5 * 0.95;
  const perpx = -(c5[2] - c4[2]), perpz = c5[0] - c4[0];
  const pLen = Math.sqrt(perpx * perpx + perpz * perpz);
  const px = perpx / pLen, pz = perpz / pLen;
  const n7 = [c5[0] + nx * ext * 0.85 + px * ext * 0.35, 0, c5[2] + nz * ext * 0.85 + pz * ext * 0.35];
  const c8 = [midx + nx * ext * 1.5, 0, midz + nz * ext * 1.5];
  const n9 = [c4[0] + nx * ext * 0.85 - px * ext * 0.35, 0, c4[2] + nz * ext * 0.85 - pz * ext * 0.35];
  addMol({
    name: 'Purine',
    atoms: [
      ['N', ...r6[0]], // 0: N1
      ['C', ...r6[1]], // 1: C2
      ['N', ...r6[2]], // 2: N3
      ['C', ...r6[3]], // 3: C4
      ['C', ...r6[4]], // 4: C5
      ['C', ...r6[5]], // 5: C6
      ['N', ...n7],    // 6: N7
      ['C', ...c8],    // 7: C8
      ['N', ...n9],    // 8: N9
      ['H', r6[1][0] + (r6[1][0] / R6) * 2.06, 0, r6[1][2] + (r6[1][2] / R6) * 2.06], // 9: H on C2
      ['H', r6[5][0] + (r6[5][0] / R6) * 2.06, 0, r6[5][2] + (r6[5][2] / R6) * 2.06], // 10: H on C6
      ['H', c8[0] + nx * 2.06, 0, c8[2] + nz * 2.06], // 11: H on C8
      ['H', n9[0] + nx * 1.2 - px * 1.5, 0, n9[2] + nz * 1.2 - pz * 1.5], // 12: H on N9
    ],
    bonds: [
      // 6-ring
      [0, 1, 1.5], [1, 2, 1.5], [2, 3, 1.5], [3, 4, 1.5], [4, 5, 1.5], [5, 0, 1.5],
      // 5-ring
      [4, 6, 1.5], [6, 7, 1.5], [7, 8, 1.5], [8, 3, 1.5],
      // C-H and N-H
      [1, 9], [5, 10], [7, 11], [8, 12],
    ],
    he: 22,
    mos: [
      ['\u03C0\u2081 all bond', [
        [0, 2, 1, 1, 'sin', 0.33], [1, 2, 1, 1, 'sin', 0.33],
        [2, 2, 1, 1, 'sin', 0.33], [3, 2, 1, 1, 'sin', 0.38],
        [4, 2, 1, 1, 'sin', 0.38], [5, 2, 1, 1, 'sin', 0.33],
        [6, 2, 1, 1, 'sin', 0.33], [7, 2, 1, 1, 'sin', 0.33],
        [8, 2, 1, 1, 'sin', 0.33],
      ]],
      ['\u03C0\u2082 (1 node)', [
        [0, 2, 1, 1, 'sin', 0.40], [1, 2, 1, 1, 'sin', 0.20],
        [2, 2, 1, 1, 'sin', -0.20], [3, 2, 1, 1, 'sin', -0.35],
        [4, 2, 1, 1, 'sin', 0.35], [5, 2, 1, 1, 'sin', 0.40],
        [6, 2, 1, 1, 'sin', 0.25], [7, 2, 1, 1, 'sin', -0.25],
        [8, 2, 1, 1, 'sin', -0.35],
      ]],
      ['N lone pair', [[0, 2, 1, 0, 'real', 0.5], [2, 2, 1, 0, 'real', 0.5], [6, 2, 1, 0, 'real', 0.35]]],
      ['\u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.28], [1, 2, 0, 0, 'real', 0.28],
        [2, 2, 0, 0, 'real', 0.28], [3, 2, 0, 0, 'real', 0.28],
        [4, 2, 0, 0, 'real', 0.28], [5, 2, 0, 0, 'real', 0.28],
        [6, 2, 0, 0, 'real', 0.28], [7, 2, 0, 0, 'real', 0.28],
        [8, 2, 0, 0, 'real', 0.28],
        [9, 1, 0, 0, 'real', 0.16], [10, 1, 0, 0, 'real', 0.16],
        [11, 1, 0, 0, 'real', 0.16], [12, 1, 0, 0, 'real', 0.16],
      ]],
    ]
  });
}

// ---- 41. Naphthalene (C₁₀H₈) ----
// Two fused 6-rings sharing one edge, in xz plane
{
  const R = 2.64;
  const HR = 2.06; // C-H distance
  // Left ring centered at (-R*cos(30°), 0, 0), right ring at (+R*cos(30°), 0, 0)
  const dx = R * Math.cos(Math.PI / 6); // ~2.29, offset between ring centers
  const atoms = [];
  const bonds = [];
  // Left ring: positions 0-5
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = hexPos(R, i);
    atoms.push(['C', x - dx, y, z]);
  }
  // Right ring: positions 6-11 (shares edge with left ring at atoms 2,3)
  // But we need shared atoms. Atoms 2 and 3 of left ring = atoms at positions 2,3.
  // Right ring shares these two, plus 4 new atoms.
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = hexPos(R, i);
    atoms.push(['C', x + dx, y, z]);
  }
  // Now atoms 2 (left) and 6 (right at pos 0) nearly overlap; same for 3 and 11.
  // Actually let's build it more carefully: naphthalene has 10 unique C atoms.
  // Let me rebuild properly.
  atoms.length = 0;
  // Naphthalene: 10 carbons in two fused hexagons
  // Atom layout (xz plane, z up):
  //   Shared edge is vertical. Left ring: 0,1,2,3,4,5. Right ring: 2,3,6,7,8,9
  const a = 2.64; // C-C aromatic distance
  const s30 = Math.sin(Math.PI / 6) * a; // a/2
  const c30 = Math.cos(Math.PI / 6) * a; // a*sqrt(3)/2
  atoms.push(['C', 0, 0, a]);       // 0: top of shared edge
  atoms.push(['C', 0, 0, -a]);      // 1: bottom of shared edge
  atoms.push(['C', -c30, 0, a + s30]);  // 2
  atoms.push(['C', -c30, 0, -a - s30]); // 3
  atoms.push(['C', -2 * c30, 0, a]);    // 4
  atoms.push(['C', -2 * c30, 0, -a]);   // 5
  atoms.push(['C', c30, 0, a + s30]);   // 6
  atoms.push(['C', c30, 0, -a - s30]);  // 7
  atoms.push(['C', 2 * c30, 0, a]);     // 8
  atoms.push(['C', 2 * c30, 0, -a]);    // 9
  // H atoms on outer carbons (2,3,4,5,6,7,8,9)
  const addH = (ci, dirx, dirz) => {
    const at = atoms[ci];
    atoms.push(['H', at[1] + dirx * HR, 0, at[3] + dirz * HR]);
  };
  addH(2, -0.5, 0.87);  // 10
  addH(3, -0.5, -0.87); // 11
  addH(4, -1.0, 0);     // 12
  addH(5, -1.0, 0);     // 13
  addH(6, 0.5, 0.87);   // 14
  addH(7, 0.5, -0.87);  // 15
  addH(8, 1.0, 0);      // 16
  addH(9, 1.0, 0);      // 17
  // Left ring bonds: 0-2, 2-4, 4-5, 5-3, 3-1, 1-0
  bonds.push([0, 2, 1.5], [2, 4, 1.5], [4, 5, 1.5], [5, 3, 1.5], [3, 1, 1.5], [1, 0, 1.5]);
  // Right ring bonds: 0-6, 6-8, 8-9, 9-7, 7-1, (1-0 shared)
  bonds.push([0, 6, 1.5], [6, 8, 1.5], [8, 9, 1.5], [9, 7, 1.5], [7, 1, 1.5]);
  // C-H bonds
  for (let i = 10; i <= 17; i++) bonds.push([i - 8, i]);
  // Fix: C-H bonds map: 10→2, 11→3, 12→4, 13→5, 14→6, 15→7, 16→8, 17→9
  bonds.length -= 8; // remove wrong ones
  bonds.push([2, 10], [3, 11], [4, 12], [5, 13], [6, 14], [7, 15], [8, 16], [9, 17]);
  addMol({
    name: 'Naphthalene',
    atoms,
    bonds,
    he: 24,
    mos: [
      ['\u03C0\u2081 all bond', [
        [0, 2, 1, 1, 'sin', 0.35], [1, 2, 1, 1, 'sin', 0.35],
        [2, 2, 1, 1, 'sin', 0.32], [3, 2, 1, 1, 'sin', 0.32],
        [4, 2, 1, 1, 'sin', 0.30], [5, 2, 1, 1, 'sin', 0.30],
        [6, 2, 1, 1, 'sin', 0.32], [7, 2, 1, 1, 'sin', 0.32],
        [8, 2, 1, 1, 'sin', 0.30], [9, 2, 1, 1, 'sin', 0.30],
      ]],
      ['\u03C0\u2082 (1 node)', [
        [0, 2, 1, 1, 'sin', 0.40], [1, 2, 1, 1, 'sin', -0.40],
        [2, 2, 1, 1, 'sin', 0.30], [3, 2, 1, 1, 'sin', -0.30],
        [4, 2, 1, 1, 'sin', 0.0], [5, 2, 1, 1, 'sin', 0.0],
        [6, 2, 1, 1, 'sin', 0.30], [7, 2, 1, 1, 'sin', -0.30],
        [8, 2, 1, 1, 'sin', 0.0], [9, 2, 1, 1, 'sin', 0.0],
      ]],
      ['\u03C0\u2083 (2 nodes)', [
        [0, 2, 1, 1, 'sin', 0.0], [1, 2, 1, 1, 'sin', 0.0],
        [2, 2, 1, 1, 'sin', 0.35], [3, 2, 1, 1, 'sin', 0.35],
        [4, 2, 1, 1, 'sin', -0.35], [5, 2, 1, 1, 'sin', -0.35],
        [6, 2, 1, 1, 'sin', -0.35], [7, 2, 1, 1, 'sin', -0.35],
        [8, 2, 1, 1, 'sin', 0.35], [9, 2, 1, 1, 'sin', 0.35],
      ]],
      ['\u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.28], [1, 2, 0, 0, 'real', 0.28],
        [2, 2, 0, 0, 'real', 0.28], [3, 2, 0, 0, 'real', 0.28],
        [4, 2, 0, 0, 'real', 0.28], [5, 2, 0, 0, 'real', 0.28],
        [6, 2, 0, 0, 'real', 0.28], [7, 2, 0, 0, 'real', 0.28],
        [8, 2, 0, 0, 'real', 0.28], [9, 2, 0, 0, 'real', 0.28],
        [10, 1, 0, 0, 'real', 0.15], [11, 1, 0, 0, 'real', 0.15],
        [12, 1, 0, 0, 'real', 0.15], [13, 1, 0, 0, 'real', 0.15],
        [14, 1, 0, 0, 'real', 0.15], [15, 1, 0, 0, 'real', 0.15],
        [16, 1, 0, 0, 'real', 0.15], [17, 1, 0, 0, 'real', 0.15],
      ]],
    ]
  });
}

// ---- 42. Cyclohexane (C₆H₁₂) ----
// Chair conformation: 6C alternating above/below plane, 12H (ax + eq)
{
  const R = 2.88; // C-C distance ≈ ring radius for chair
  const dz = 0.47; // chair puckering amplitude
  const atoms = [];
  const bonds = [];
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = chairHexPos(R, i, dz);
    atoms.push(['C', x, y, z]);
  }
  // Each C has 2H: one axial, one equatorial
  for (let i = 0; i < 6; i++) {
    const [cx, cy, cz] = [atoms[i][1], atoms[i][2], atoms[i][3]];
    const axY = (i % 2 === 0) ? dz + 1.8 : -dz - 1.8;
    atoms.push(['H', cx, axY, cz]); // axial
    const angle = (i * Math.PI) / 3;
    const eqX = cx + Math.cos(angle) * 1.5;
    const eqZ = cz + Math.sin(angle) * 1.5;
    atoms.push(['H', eqX, cy, eqZ]); // equatorial
  }
  // C-C ring bonds
  for (let i = 0; i < 6; i++) bonds.push([i, (i + 1) % 6]);
  // C-H bonds
  for (let i = 0; i < 6; i++) {
    bonds.push([i, 6 + i * 2]);     // axial H
    bonds.push([i, 6 + i * 2 + 1]); // equatorial H
  }
  addMol({
    name: 'Cyclohexane',
    atoms,
    bonds,
    he: 22,
    mos: [
      ['\u03C3(C-C) sym', [
        [0, 2, 0, 0, 'real', 0.38], [1, 2, 0, 0, 'real', 0.38],
        [2, 2, 0, 0, 'real', 0.38], [3, 2, 0, 0, 'real', 0.38],
        [4, 2, 0, 0, 'real', 0.38], [5, 2, 0, 0, 'real', 0.38],
      ]],
      ['\u03C3(C-H) sym', [
        [6, 1, 0, 0, 'real', 0.18], [7, 1, 0, 0, 'real', 0.18],
        [8, 1, 0, 0, 'real', 0.18], [9, 1, 0, 0, 'real', 0.18],
        [10, 1, 0, 0, 'real', 0.18], [11, 1, 0, 0, 'real', 0.18],
        [12, 1, 0, 0, 'real', 0.18], [13, 1, 0, 0, 'real', 0.18],
        [14, 1, 0, 0, 'real', 0.18], [15, 1, 0, 0, 'real', 0.18],
        [16, 1, 0, 0, 'real', 0.18], [17, 1, 0, 0, 'real', 0.18],
      ]],
      ['\u03C3(C-C) anti', [
        [0, 2, 1, 0, 'real', 0.45], [1, 2, 1, 0, 'real', -0.45],
        [2, 2, 1, 0, 'real', 0.45], [3, 2, 1, 0, 'real', -0.45],
        [4, 2, 1, 0, 'real', 0.45], [5, 2, 1, 0, 'real', -0.45],
      ]],
      ['\u03C3(C-H) anti', [
        [0, 2, 1, 1, 'sin', 0.45], [1, 2, 1, 1, 'sin', -0.45],
        [2, 2, 1, 1, 'sin', 0.45], [3, 2, 1, 1, 'sin', -0.45],
        [4, 2, 1, 1, 'sin', 0.45], [5, 2, 1, 1, 'sin', -0.45],
      ]],
    ]
  });
}

// ---- 43. Norbornene (C₇H₁₀) ----
// Bicyclo[2.2.1]hept-2-ene: bridged ring system with one C=C
{
  // Canonical norbornane geometry (approximate, Bohr)
  const atoms = [
    ['C', 0, 1.40, 0],       // 0: bridgehead C7 (bridge top)
    ['C', -2.20, -0.70, 0.80], // 1: C1
    ['C', 2.20, -0.70, 0.80],  // 2: C4
    ['C', -1.30, -0.70, -1.60], // 3: C2 (part of C=C)
    ['C', 1.30, -0.70, -1.60],  // 4: C3 (part of C=C)
    ['C', -2.20, 0.70, 1.70],  // 5: C6
    ['C', 2.20, 0.70, 1.70],   // 6: C5
    // Hydrogens
    ['H', 0, 2.80, 0.90],     // 7: H on bridge (C7)
    ['H', 0, 2.80, -0.90],    // 8: H on bridge (C7)
    ['H', -3.80, -1.60, 0.80], // 9: H on C1
    ['H', 3.80, -1.60, 0.80],  // 10: H on C4
    ['H', -1.80, -1.60, -3.20], // 11: H on C2
    ['H', 1.80, -1.60, -3.20],  // 12: H on C3
    ['H', -3.80, 0.70, 2.60],  // 13: H on C6
    ['H', -1.40, 1.60, 2.60],  // 14: H on C6
    ['H', 3.80, 0.70, 2.60],   // 15: H on C5
    ['H', 1.40, 1.60, 2.60],   // 16: H on C5
  ];
  addMol({
    name: 'Norbornene',
    atoms,
    bonds: [
      [1, 3], [3, 4, 2], [4, 2], // ring with C=C
      [1, 5], [5, 6], [6, 2],    // bottom ring
      [1, 0], [0, 2],            // bridge
      [0, 7], [0, 8], [1, 9], [2, 10], [3, 11], [4, 12],
      [5, 13], [5, 14], [6, 15], [6, 16],
    ],
    he: 22,
    mos: [
      ['\u03C0(C=C)', [[3, 2, 1, 1, 'sin', 0.7], [4, 2, 1, 1, 'sin', 0.7]]],
      ['\u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.30], [1, 2, 0, 0, 'real', 0.30],
        [2, 2, 0, 0, 'real', 0.30], [3, 2, 0, 0, 'real', 0.30],
        [4, 2, 0, 0, 'real', 0.30], [5, 2, 0, 0, 'real', 0.30],
        [6, 2, 0, 0, 'real', 0.30],
        [7, 1, 0, 0, 'real', 0.14], [8, 1, 0, 0, 'real', 0.14],
        [9, 1, 0, 0, 'real', 0.14], [10, 1, 0, 0, 'real', 0.14],
      ]],
      ['ring strain', [
        [0, 2, 1, 0, 'real', 0.6], [1, 2, 1, 1, 'cos', 0.4], [2, 2, 1, 1, 'cos', -0.4],
      ]],
      ['\u03C3(C-H) sym', [
        [7, 1, 0, 0, 'real', 0.22], [8, 1, 0, 0, 'real', 0.22],
        [9, 1, 0, 0, 'real', 0.22], [10, 1, 0, 0, 'real', 0.22],
        [11, 1, 0, 0, 'real', 0.22], [12, 1, 0, 0, 'real', 0.22],
        [13, 1, 0, 0, 'real', 0.22], [14, 1, 0, 0, 'real', 0.22],
        [15, 1, 0, 0, 'real', 0.22], [16, 1, 0, 0, 'real', 0.22],
      ]],
    ]
  });
}

// ---- 44. Glucose (C₆H₁₂O₆) ----
// Pyranose ring (5C + 1O) in chair conformation with OH groups
{
  const R = 2.88;
  const dz = 0.47;
  const atoms = [];
  const bonds = [];
  // Ring: C1(0) C2(1) C3(2) C4(3) C5(4) O(5) in chair
  for (let i = 0; i < 5; i++) {
    const [x, y, z] = chairHexPos(R, i, dz);
    atoms.push(['C', x, y, z]);
  }
  {
    const [x, y, z] = chairHexPos(R, 5, dz);
    atoms.push(['O', x, y, z]); // 5: ring O
  }
  // OH groups on C1-C4 (equatorial)
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 3;
    const cx = atoms[i][1], cy = atoms[i][2], cz = atoms[i][3];
    const ox = cx + Math.cos(angle) * 2.70;
    const oz = cz + Math.sin(angle) * 2.70;
    atoms.push(['O', ox, cy, oz]); // 6,8,10,12
    atoms.push(['H', ox + Math.cos(angle) * 1.83, cy, oz + Math.sin(angle) * 1.83]); // 7,9,11,13
  }
  // CH₂OH on C5
  {
    const cx = atoms[4][1], cy = atoms[4][2], cz = atoms[4][3];
    const angle = (4 * Math.PI) / 3;
    atoms.push(['C', cx + Math.cos(angle) * 2.88, cy, cz + Math.sin(angle) * 2.88]); // 14: CH₂OH carbon
    const c2x = atoms[14][1], c2z = atoms[14][3];
    atoms.push(['O', c2x + 2.70, cy, c2z]); // 15: OH oxygen
    atoms.push(['H', c2x + 2.70 + 1.83, cy, c2z]); // 16: OH hydrogen
    atoms.push(['H', c2x, cy + 1.80, c2z - 1.20]); // 17: CH₂ H
    atoms.push(['H', c2x, cy - 1.80, c2z - 1.20]); // 18: CH₂ H
  }
  // H on ring carbons (axial)
  for (let i = 0; i < 5; i++) {
    const cx = atoms[i][1], cy = atoms[i][2];
    const axY = (i % 2 === 0) ? dz + 1.80 : -dz - 1.80;
    atoms.push(['H', cx, axY, atoms[i][3]]); // 19-23
  }
  // Ring bonds
  for (let i = 0; i < 5; i++) bonds.push([i, i + 1]);
  bonds.push([5, 0]); // close ring O-C1
  // C-OH bonds
  for (let i = 0; i < 4; i++) {
    bonds.push([i, 6 + i * 2]);       // C-O
    bonds.push([6 + i * 2, 7 + i * 2]); // O-H
  }
  // C5-CH₂OH
  bonds.push([4, 14]); bonds.push([14, 15]); bonds.push([15, 16]);
  bonds.push([14, 17]); bonds.push([14, 18]);
  // Ring C-H
  for (let i = 0; i < 5; i++) bonds.push([i, 19 + i]);
  addMol({
    name: 'Glucose',
    atoms,
    bonds,
    he: 28,
    mos: [
      ['\u03C3(C-O) sym', [
        [0, 2, 0, 0, 'real', 0.30], [1, 2, 0, 0, 'real', 0.30],
        [2, 2, 0, 0, 'real', 0.30], [3, 2, 0, 0, 'real', 0.30],
        [4, 2, 0, 0, 'real', 0.30], [5, 2, 0, 0, 'real', 0.35],
        [6, 2, 0, 0, 'real', 0.22], [8, 2, 0, 0, 'real', 0.22],
        [10, 2, 0, 0, 'real', 0.22], [12, 2, 0, 0, 'real', 0.22],
      ]],
      ['O lone pairs', [
        [5, 2, 1, 1, 'sin', 0.45], [6, 2, 1, 1, 'sin', 0.35],
        [8, 2, 1, 1, 'sin', 0.35], [10, 2, 1, 1, 'sin', 0.35],
        [12, 2, 1, 1, 'sin', 0.35], [15, 2, 1, 1, 'sin', 0.30],
      ]],
      ['ring \u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.38], [1, 2, 0, 0, 'real', 0.38],
        [2, 2, 0, 0, 'real', 0.38], [3, 2, 0, 0, 'real', 0.38],
        [4, 2, 0, 0, 'real', 0.38],
      ]],
      ['\u03C3(O-H)', [
        [7, 1, 0, 0, 'real', 0.35], [9, 1, 0, 0, 'real', 0.35],
        [11, 1, 0, 0, 'real', 0.35], [13, 1, 0, 0, 'real', 0.35],
        [16, 1, 0, 0, 'real', 0.35],
      ]],
    ]
  });
}

// ---- 45. Decalin (C₁₀H₁₈) ----
// Trans-decalin: two fused cyclohexane chairs sharing an edge
{
  // Build like naphthalene but with chair conformations
  // 10 unique C atoms in xz plane with y offsets for chair
  const a = 2.88, s30 = a*0.5, c30 = a*Math.sqrt(3)/2;
  const dz = 0.47; // chair puckering
  // Shared edge: atoms 0 and 1 (vertical, like naphthalene)
  const atoms = [
    ['C', 0, dz, a],        // 0: top shared
    ['C', 0, -dz, -a],      // 1: bottom shared
    ['C', -c30, -dz, a+s30],// 2
    ['C', -c30, dz, -a-s30],// 3
    ['C', -2*c30, dz, a],   // 4
    ['C', -2*c30, -dz, -a], // 5
    ['C', c30, -dz, a+s30], // 6
    ['C', c30, dz, -a-s30], // 7
    ['C', 2*c30, dz, a],    // 8
    ['C', 2*c30, -dz, -a],  // 9
  ];
  const bonds = [];
  // Left ring: 0-2-4-5-3-1
  bonds.push([0,2],[2,4],[4,5],[5,3],[3,1],[1,0]);
  // Right ring: 0-6-8-9-7-1
  bonds.push([0,6],[6,8],[8,9],[9,7],[7,1]);
  // H atoms: 1H per bridge C (0,1 — trans junction), 2H per outer C (2-9)
  let hIdx = 10;
  for (let i = 0; i < 10; i++) {
    const cx = atoms[i][1], cy = atoms[i][2], cz = atoms[i][3];
    const isBridge = (i <= 1);
    if (isBridge) {
      // 1 axial H (trans: opposite side)
      atoms.push(['H', cx, cy + (i===0 ? -2.06 : 2.06), cz]);
      bonds.push([i, hIdx++]);
    } else {
      // Axial H
      atoms.push(['H', cx, cy + ((i%2===0)?2.06:-2.06), cz]);
      bonds.push([i, hIdx++]);
      // Equatorial H (outward in xz plane)
      const r = Math.sqrt(cx*cx+cz*cz)||1;
      atoms.push(['H', cx + cx/r*1.8, cy, cz + cz/r*1.8]);
      bonds.push([i, hIdx++]);
    }
  }
  addMol({
    name: 'Decalin',
    atoms,
    bonds,
    he: 28,
    mos: [
      ['\u03C3(C-C) sym', [
        [0, 2, 0, 0, 'real', 0.30], [1, 2, 0, 0, 'real', 0.30],
        [2, 2, 0, 0, 'real', 0.32], [3, 2, 0, 0, 'real', 0.32],
        [4, 2, 0, 0, 'real', 0.30], [5, 2, 0, 0, 'real', 0.30],
        [6, 2, 0, 0, 'real', 0.30], [7, 2, 0, 0, 'real', 0.30],
        [8, 2, 0, 0, 'real', 0.30], [9, 2, 0, 0, 'real', 0.30],
      ]],
      ['\u03C3(C-C) anti', [
        [0, 2, 1, 0, 'real', 0.40], [1, 2, 1, 0, 'real', -0.40],
        [2, 2, 1, 0, 'real', 0.40], [3, 2, 1, 0, 'real', -0.40],
        [4, 2, 1, 0, 'real', 0.40], [5, 2, 1, 0, 'real', -0.40],
      ]],
      ['\u03C3(C-H) sym', [
        [10, 1, 0, 0, 'real', 0.20], [11, 1, 0, 0, 'real', 0.20],
        [12, 1, 0, 0, 'real', 0.20], [13, 1, 0, 0, 'real', 0.20],
        [14, 1, 0, 0, 'real', 0.20], [15, 1, 0, 0, 'real', 0.20],
        [16, 1, 0, 0, 'real', 0.20], [17, 1, 0, 0, 'real', 0.20],
      ]],
      ['ring junction', [
        [2, 2, 1, 0, 'real', 0.65], [3, 2, 1, 0, 'real', -0.65],
      ]],
    ]
  });
}

// ---- 46. Sucrose (C₁₂H₂₂O₁₁) ----
// Glucose + fructose linked by glycosidic bond (simplified)
{
  const atoms = [];
  const bonds = [];
  const R = 2.88;
  const dz = 0.47;
  // Glucose ring (pyranose, 6-ring): C0-C4, O5
  for (let i = 0; i < 5; i++) {
    const [x, y, z] = chairHexPos(R, i, dz);
    atoms.push(['C', x - 5.5, y, z]); // offset left
  }
  {
    const [x, y, z] = chairHexPos(R, 5, dz);
    atoms.push(['O', x - 5.5, y, z]); // 5: glucose ring O
  }
  // Fructose ring (furanose, 5-ring): C6-C9, O10
  const R5 = 2.20;
  for (let i = 0; i < 4; i++) {
    const [x, y, z] = pentPos(R5, i);
    atoms.push(['C', x + 5.5, y, z]); // 6-9
  }
  {
    const [x, y, z] = pentPos(R5, 4);
    atoms.push(['O', x + 5.5, y, z]); // 10: fructose ring O
  }
  // Extra carbon on fructose (C11 = CH₂OH)
  atoms.push(['C', 5.5 + R5 + 2.88, 0, 0]); // 11
  // Glycosidic bridge O
  atoms.push(['O', 0, 0, 0]); // 12: bridge O
  // OH groups (simplified - 4 on glucose side, 3 on fructose side)
  const ohPositions = [
    [-5.5 - 3.0, 0, 2.5],  // 13: O on glucose
    [-5.5 - 3.0, 0, -2.5], // 15: O on glucose
    [-5.5, 2.5, -3.0],     // 17: O on glucose
    [-5.5 + 3.0, 0, 2.5],  // 19: O on glucose
    [5.5, 2.5, 2.5],       // 21: O on fructose
    [5.5 + 3.0, 0, -2.5],  // 23: O on fructose
    [5.5 + R5 + 2.88 + 2.70, 0, 0], // 25: O on CH₂OH
  ];
  for (const [ox, oy, oz] of ohPositions) {
    atoms.push(['O', ox, oy, oz]);
    const dx2 = ox > 0 ? 1.83 : -1.83;
    atoms.push(['H', ox + dx2, oy, oz]);
  }
  // H atoms on ring carbons (1 each, simplified)
  for (let i = 0; i < 5; i++) {
    const cx = atoms[i][1], cz = atoms[i][3];
    const axY = (i % 2 === 0) ? dz + 1.80 : -dz - 1.80;
    atoms.push(['H', cx, axY, cz]); // 27-31
  }
  for (let i = 6; i < 10; i++) {
    const cx = atoms[i][1], cz = atoms[i][3];
    atoms.push(['H', cx, 1.80, cz]); // 32-35
  }
  // CH₂ H on C11
  atoms.push(['H', atoms[11][1], 1.80, atoms[11][3] - 1.2]); // 36
  atoms.push(['H', atoms[11][1], -1.80, atoms[11][3] - 1.2]); // 37
  // Glucose ring bonds
  for (let i = 0; i < 5; i++) bonds.push([i, i + 1]);
  bonds.push([5, 0]);
  // Fructose ring bonds
  for (let i = 6; i < 9; i++) bonds.push([i, i + 1]);
  bonds.push([9, 10]); bonds.push([10, 6]);
  // Glycosidic bridge
  bonds.push([0, 12]); bonds.push([12, 6]);
  // Fructose-CH₂OH
  bonds.push([9, 11]);
  // OH bonds
  let oIdx = 13;
  const ohAttach = [1, 2, 3, 4, 7, 8, 11];
  for (let i = 0; i < 7; i++) {
    bonds.push([ohAttach[i], oIdx]);
    bonds.push([oIdx, oIdx + 1]);
    oIdx += 2;
  }
  // Ring C-H
  for (let i = 0; i < 5; i++) bonds.push([i, 27 + i]);
  for (let i = 0; i < 4; i++) bonds.push([i + 6, 32 + i]);
  bonds.push([11, 36]); bonds.push([11, 37]);
  addMol({
    name: 'Sucrose',
    atoms,
    bonds,
    he: 35,
    mos: [
      ['\u03C3(C-O) glycosidic', [
        [0, 2, 0, 0, 'real', 0.45], [12, 2, 0, 0, 'real', 0.55], [6, 2, 0, 0, 'real', 0.45],
      ]],
      ['O lone pairs', [
        [5, 2, 1, 1, 'sin', 0.40], [10, 2, 1, 1, 'sin', 0.40],
        [12, 2, 1, 1, 'sin', 0.45],
        [13, 2, 1, 1, 'sin', 0.30], [15, 2, 1, 1, 'sin', 0.30],
        [17, 2, 1, 1, 'sin', 0.30],
      ]],
      ['\u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.25], [1, 2, 0, 0, 'real', 0.25],
        [2, 2, 0, 0, 'real', 0.25], [3, 2, 0, 0, 'real', 0.25],
        [4, 2, 0, 0, 'real', 0.25],
        [6, 2, 0, 0, 'real', 0.25], [7, 2, 0, 0, 'real', 0.25],
        [8, 2, 0, 0, 'real', 0.25], [9, 2, 0, 0, 'real', 0.25],
        [11, 2, 0, 0, 'real', 0.22],
      ]],
      ['\u03C3(O-H)', [
        [14, 1, 0, 0, 'real', 0.35], [16, 1, 0, 0, 'real', 0.35],
        [18, 1, 0, 0, 'real', 0.35], [20, 1, 0, 0, 'real', 0.35],
        [22, 1, 0, 0, 'real', 0.35], [24, 1, 0, 0, 'real', 0.35],
        [26, 1, 0, 0, 'real', 0.35],
      ]],
    ]
  });
}

// ---- 47. Adenine-Thymine base pair (A-T) ----
// Adenine + Thymine connected by 2 H-bonds, planar in xz plane
{
  const R6 = 2.64;
  const R5 = 2.20;
  // Adenine: purine (6-ring fused with 5-ring) offset to the left
  const aOff = -8.0;
  const aAtoms = [];
  // 6-ring
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = hexPos(R6, i);
    aAtoms.push([i === 0 || i === 2 ? 'N' : 'C', x + aOff, 0, z]);
  }
  // 5-ring fused at atoms 3,4 (extending right toward thymine)
  const c4 = aAtoms[3], c5 = aAtoms[4];
  const mid5x = (c4[1] + c5[1]) / 2, mid5z = (c4[3] + c5[3]) / 2;
  const outx = mid5x - aOff, outz = mid5z;
  const outL = Math.sqrt(outx * outx + outz * outz) || 1;
  const onx = outx / outL, onz = outz / outL;
  const ext5 = R5 * 0.95;
  const perpx5 = -(c5[3] - c4[3]), perpz5 = c5[1] - c4[1];
  const pL5 = Math.sqrt(perpx5 * perpx5 + perpz5 * perpz5) || 1;
  const px5 = perpx5 / pL5, pz5 = perpz5 / pL5;
  aAtoms.push(['N', c5[1] + onx * ext5 * 0.85 + px5 * ext5 * 0.35, 0, c5[3] + onz * ext5 * 0.85 + pz5 * ext5 * 0.35]); // 6: N7
  aAtoms.push(['C', mid5x + onx * ext5 * 1.5, 0, mid5z + onz * ext5 * 1.5]); // 7: C8
  aAtoms.push(['N', c4[1] + onx * ext5 * 0.85 - px5 * ext5 * 0.35, 0, c4[3] + onz * ext5 * 0.85 - pz5 * ext5 * 0.35]); // 8: N9
  // NH₂ on C6 (atom 5)
  aAtoms.push(['N', aAtoms[5][1] + (aAtoms[5][1] - aOff) / R6 * 2.49, 0, aAtoms[5][3] + (aAtoms[5][3]) / R6 * 2.49]); // 9: NH₂ N
  aAtoms.push(['H', aAtoms[9][1] - 0.5, 0, aAtoms[9][3] + 1.60]); // 10
  aAtoms.push(['H', aAtoms[9][1] - 0.5, 0, aAtoms[9][3] - 1.60]); // 11
  // H on C2, C8, N9
  aAtoms.push(['H', aAtoms[1][1] - 2.06, 0, aAtoms[1][3]]); // 12: H-C2
  aAtoms.push(['H', aAtoms[7][1] + onx * 2.06, 0, aAtoms[7][3] + onz * 2.06]); // 13: H-C8
  aAtoms.push(['H', aAtoms[8][1] + onx * 1.0 - px5 * 1.5, 0, aAtoms[8][3] + onz * 1.0 - pz5 * 1.5]); // 14: H-N9

  // Thymine: 6-membered ring offset to the right
  const tOff = 8.0;
  const tAtoms = [];
  // N1-C2-N3-C4-C5-C6
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = hexPos(R6, i);
    const elem = (i === 0 || i === 2) ? 'N' : 'C';
    tAtoms.push([elem, x + tOff, 0, z]);
  }
  // C=O on C2 and C4
  const tOR = R6 + 2.27;
  tAtoms.push(['O', ...hexPos(tOR, 1).map((v, j) => j === 0 ? v + tOff : v)]); // 6: O on C2
  tAtoms.push(['O', ...hexPos(tOR, 3).map((v, j) => j === 0 ? v + tOff : v)]); // 7: O on C4
  // CH₃ on C5
  const [c5tx, , c5tz] = hexPos(R6 + 2.88, 4);
  tAtoms.push(['C', c5tx + tOff, 0, c5tz]); // 8: methyl C
  tAtoms.push(['H', c5tx + tOff + 1.0, 1.68, c5tz - 0.5]); // 9
  tAtoms.push(['H', c5tx + tOff + 1.0, -1.68, c5tz - 0.5]); // 10
  tAtoms.push(['H', c5tx + tOff - 0.5, 0, c5tz - 1.90]); // 11
  // H on N1, N3, C6
  tAtoms.push(['H', ...hexPos(R6 + 1.91, 0).map((v, j) => j === 0 ? v + tOff : v)]); // 12: H-N1
  tAtoms.push(['H', ...hexPos(R6 + 1.91, 2).map((v, j) => j === 0 ? v + tOff : v)]); // 13: H-N3
  tAtoms.push(['H', ...hexPos(R6 + 2.06, 5).map((v, j) => j === 0 ? v + tOff : v)]); // 14: H-C6

  // Combine atoms: adenine (0-14), thymine (15-29)
  const allAtoms = [...aAtoms, ...tAtoms];
  const tBase = aAtoms.length; // 15

  // Bonds
  const allBonds = [];
  // Adenine 6-ring
  for (let i = 0; i < 6; i++) allBonds.push([i, (i + 1) % 6, 1.5]);
  // Adenine 5-ring
  allBonds.push([4, 6, 1.5], [6, 7, 1.5], [7, 8, 1.5], [8, 3, 1.5]);
  // Adenine substituent bonds
  allBonds.push([5, 9]); allBonds.push([9, 10]); allBonds.push([9, 11]);
  allBonds.push([1, 12]); allBonds.push([7, 13]); allBonds.push([8, 14]);
  // Thymine 6-ring
  for (let i = 0; i < 6; i++) allBonds.push([tBase + i, tBase + (i + 1) % 6, 1.5]);
  // Thymine substituents
  allBonds.push([tBase + 1, tBase + 6, 2]); // C2=O
  allBonds.push([tBase + 3, tBase + 7, 2]); // C4=O
  allBonds.push([tBase + 4, tBase + 8]);    // C5-CH₃
  allBonds.push([tBase + 8, tBase + 9]); allBonds.push([tBase + 8, tBase + 10]); allBonds.push([tBase + 8, tBase + 11]);
  allBonds.push([tBase + 0, tBase + 12]); allBonds.push([tBase + 2, tBase + 13]); allBonds.push([tBase + 5, tBase + 14]);
  // H-bonds (between adenine and thymine)
  allBonds.push([9, tBase + 7, 0.5]);   // A-NH₂ ... O=C4(T)
  allBonds.push([0, tBase + 12, 0.5]);  // A-N1 ... H-N1(T)

  addMol({
    name: 'A-T base pair',
    atoms: allAtoms,
    bonds: allBonds,
    he: 32,
    mos: [
      ['\u03C0 system', [
        [0, 2, 1, 1, 'sin', 0.25], [1, 2, 1, 1, 'sin', 0.25],
        [2, 2, 1, 1, 'sin', 0.25], [3, 2, 1, 1, 'sin', 0.28],
        [4, 2, 1, 1, 'sin', 0.28], [5, 2, 1, 1, 'sin', 0.25],
        [6, 2, 1, 1, 'sin', 0.25], [7, 2, 1, 1, 'sin', 0.25],
        [8, 2, 1, 1, 'sin', 0.25],
        [tBase, 2, 1, 1, 'sin', 0.25], [tBase + 1, 2, 1, 1, 'sin', 0.25],
        [tBase + 2, 2, 1, 1, 'sin', 0.25], [tBase + 3, 2, 1, 1, 'sin', 0.25],
        [tBase + 4, 2, 1, 1, 'sin', 0.28], [tBase + 5, 2, 1, 1, 'sin', 0.28],
      ]],
      ['H-bond \u03C3', [
        [9, 2, 1, 0, 'real', 0.5], [tBase + 7, 2, 1, 0, 'real', -0.4],
        [0, 2, 1, 0, 'real', 0.4], [tBase, 2, 1, 0, 'real', -0.3],
      ]],
      ['lone pairs', [
        [0, 2, 1, 0, 'real', 0.45], [2, 2, 1, 0, 'real', 0.45],
        [tBase + 6, 2, 1, 0, 'real', 0.40], [tBase + 7, 2, 1, 0, 'real', 0.40],
      ]],
      ['\u03C3 frame', [
        [0, 2, 0, 0, 'real', 0.22], [1, 2, 0, 0, 'real', 0.22],
        [2, 2, 0, 0, 'real', 0.22], [3, 2, 0, 0, 'real', 0.22],
        [4, 2, 0, 0, 'real', 0.22], [5, 2, 0, 0, 'real', 0.22],
        [tBase, 2, 0, 0, 'real', 0.22], [tBase + 1, 2, 0, 0, 'real', 0.22],
        [tBase + 2, 2, 0, 0, 'real', 0.22], [tBase + 3, 2, 0, 0, 'real', 0.22],
        [tBase + 4, 2, 0, 0, 'real', 0.22], [tBase + 5, 2, 0, 0, 'real', 0.22],
      ]],
    ]
  });
}

// ---- 48. Guanine-Cytosine base pair (G-C) ----
// Guanine + Cytosine connected by 3 H-bonds, planar in xz plane
{
  const R6 = 2.64;
  const R5 = 2.20;
  // Guanine: purine base (6-ring + 5-ring) on the left
  const gOff = -8.0;
  const gAtoms = [];
  // 6-ring: N1 C2 N3 C4 C5 C6
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = hexPos(R6, i);
    gAtoms.push([(i === 0 || i === 2) ? 'N' : 'C', x + gOff, 0, z]);
  }
  // 5-ring fused at C4,C5 (atoms 3,4)
  const gc4 = gAtoms[3], gc5 = gAtoms[4];
  const gmidx = (gc4[1] + gc5[1]) / 2, gmidz = (gc4[3] + gc5[3]) / 2;
  const goutx = gmidx - gOff, goutz = gmidz;
  const goutL = Math.sqrt(goutx * goutx + goutz * goutz) || 1;
  const gonx = goutx / goutL, gonz = goutz / goutL;
  const gext = R5 * 0.95;
  const gperpx = -(gc5[3] - gc4[3]), gperpz = gc5[1] - gc4[1];
  const gpL = Math.sqrt(gperpx * gperpx + gperpz * gperpz) || 1;
  const gpx = gperpx / gpL, gpz = gperpz / gpL;
  gAtoms.push(['N', gc5[1] + gonx * gext * 0.85 + gpx * gext * 0.35, 0, gc5[3] + gonz * gext * 0.85 + gpz * gext * 0.35]); // 6: N7
  gAtoms.push(['C', gmidx + gonx * gext * 1.5, 0, gmidz + gonz * gext * 1.5]); // 7: C8
  gAtoms.push(['N', gc4[1] + gonx * gext * 0.85 - gpx * gext * 0.35, 0, gc4[3] + gonz * gext * 0.85 - gpz * gext * 0.35]); // 8: N9
  // C=O on C6 (atom 5)
  const goDir = [(gAtoms[5][1] - gOff), gAtoms[5][3]];
  const goDL = Math.sqrt(goDir[0] ** 2 + goDir[1] ** 2) || 1;
  gAtoms.push(['O', gAtoms[5][1] + goDir[0] / goDL * 2.27, 0, gAtoms[5][3] + goDir[1] / goDL * 2.27]); // 9: O on C6
  // NH₂ on C2 (atom 1), outward from ring center
  const gc2out = hexPos(1.0, 1); // unit outward direction for C2
  gAtoms.push(['N', gAtoms[1][1] + gc2out[0] * 2.49, 0, gAtoms[1][3] + gc2out[2] * 2.49]); // 10: NH₂
  gAtoms.push(['H', gAtoms[10][1] + gc2out[0] * 0.5 - gc2out[2] * 1.60, 0, gAtoms[10][3] + gc2out[2] * 0.5 + gc2out[0] * 1.60]); // 11
  gAtoms.push(['H', gAtoms[10][1] + gc2out[0] * 0.5 + gc2out[2] * 1.60, 0, gAtoms[10][3] + gc2out[2] * 0.5 - gc2out[0] * 1.60]); // 12
  // H on N1, C8, N9
  gAtoms.push(['H', gAtoms[0][1] - 1.91, 0, gAtoms[0][3]]); // 13: H-N1
  gAtoms.push(['H', gAtoms[7][1] + gonx * 2.06, 0, gAtoms[7][3] + gonz * 2.06]); // 14: H-C8
  gAtoms.push(['H', gAtoms[8][1] + gonx * 1.0 - gpx * 1.5, 0, gAtoms[8][3] + gonz * 1.0 - gpz * 1.5]); // 15: H-N9

  // Cytosine: 6-membered ring on the right
  const cOff = 8.0;
  const cAtoms = [];
  // N1 C2 N3 C4 C5 C6
  for (let i = 0; i < 6; i++) {
    const [x, y, z] = hexPos(R6, i);
    cAtoms.push([(i === 0 || i === 2) ? 'N' : 'C', x + cOff, 0, z]);
  }
  // C=O on C2 (atom 1)
  const coDir = [(cAtoms[1][1] - cOff), cAtoms[1][3]];
  const coDL = Math.sqrt(coDir[0] ** 2 + coDir[1] ** 2) || 1;
  cAtoms.push(['O', cAtoms[1][1] + coDir[0] / coDL * 2.27, 0, cAtoms[1][3] + coDir[1] / coDL * 2.27]); // 6: O on C2
  // NH₂ on C4 (atom 3)
  const cnDir = [(cAtoms[3][1] - cOff), cAtoms[3][3]];
  const cnDL = Math.sqrt(cnDir[0] ** 2 + cnDir[1] ** 2) || 1;
  cAtoms.push(['N', cAtoms[3][1] + cnDir[0] / cnDL * 2.49, 0, cAtoms[3][3] + cnDir[1] / cnDL * 2.49]); // 7: NH₂
  cAtoms.push(['H', cAtoms[7][1] + 0.5, 0, cAtoms[7][3] + 1.60]); // 8
  cAtoms.push(['H', cAtoms[7][1] + 0.5, 0, cAtoms[7][3] - 1.60]); // 9
  // H on N1, C5, C6
  cAtoms.push(['H', ...hexPos(R6 + 1.91, 0).map((v, j) => j === 0 ? v + cOff : v)]); // 10: H-N1
  cAtoms.push(['H', ...hexPos(R6 + 2.06, 4).map((v, j) => j === 0 ? v + cOff : v)]); // 11: H-C5
  cAtoms.push(['H', ...hexPos(R6 + 2.06, 5).map((v, j) => j === 0 ? v + cOff : v)]); // 12: H-C6

  const gBase = 0;
  const cBase = gAtoms.length; // 16
  const allAtoms = [...gAtoms, ...cAtoms];
  const allBonds = [];
  // Guanine 6-ring
  for (let i = 0; i < 6; i++) allBonds.push([i, (i + 1) % 6, 1.5]);
  // Guanine 5-ring
  allBonds.push([4, 6, 1.5], [6, 7, 1.5], [7, 8, 1.5], [8, 3, 1.5]);
  // Guanine substituents
  allBonds.push([5, 9, 2]); // C6=O
  allBonds.push([1, 10]); allBonds.push([10, 11]); allBonds.push([10, 12]); // C2-NH₂
  allBonds.push([0, 13]); allBonds.push([7, 14]); allBonds.push([8, 15]);
  // Cytosine 6-ring
  for (let i = 0; i < 6; i++) allBonds.push([cBase + i, cBase + (i + 1) % 6, 1.5]);
  // Cytosine substituents
  allBonds.push([cBase + 1, cBase + 6, 2]); // C2=O
  allBonds.push([cBase + 3, cBase + 7]); allBonds.push([cBase + 7, cBase + 8]); allBonds.push([cBase + 7, cBase + 9]);
  allBonds.push([cBase + 0, cBase + 10]); allBonds.push([cBase + 4, cBase + 11]); allBonds.push([cBase + 5, cBase + 12]);
  // 3 H-bonds
  allBonds.push([9, cBase + 7, 0.5]);   // G-O6 ... H₂N-C4(C)
  allBonds.push([13, cBase + 6, 0.5]);  // G-H-N1 ... O=C2(C)
  allBonds.push([10, cBase + 10, 0.5]); // G-NH₂ ... H-N1(C)

  addMol({
    name: 'G-C base pair',
    atoms: allAtoms,
    bonds: allBonds,
    he: 32,
    mos: [
      ['\u03C0 system', [
        [0, 2, 1, 1, 'sin', 0.25], [1, 2, 1, 1, 'sin', 0.25],
        [2, 2, 1, 1, 'sin', 0.25], [3, 2, 1, 1, 'sin', 0.28],
        [4, 2, 1, 1, 'sin', 0.28], [5, 2, 1, 1, 'sin', 0.25],
        [6, 2, 1, 1, 'sin', 0.25], [7, 2, 1, 1, 'sin', 0.25],
        [8, 2, 1, 1, 'sin', 0.25],
        [cBase, 2, 1, 1, 'sin', 0.28], [cBase + 1, 2, 1, 1, 'sin', 0.28],
        [cBase + 2, 2, 1, 1, 'sin', 0.28], [cBase + 3, 2, 1, 1, 'sin', 0.28],
        [cBase + 4, 2, 1, 1, 'sin', 0.30], [cBase + 5, 2, 1, 1, 'sin', 0.30],
      ]],
      ['H-bond \u03C3', [
        [9, 2, 1, 0, 'real', 0.45], [cBase + 7, 2, 1, 0, 'real', -0.35],
        [0, 2, 1, 0, 'real', 0.40], [cBase + 6, 2, 1, 0, 'real', -0.35],
        [10, 2, 1, 0, 'real', 0.35], [cBase, 2, 1, 0, 'real', -0.30],
      ]],
      ['C=O \u03C0', [
        [5, 2, 1, 1, 'sin', 0.55], [9, 2, 1, 1, 'sin', 0.55],
        [cBase + 1, 2, 1, 1, 'sin', 0.55], [cBase + 6, 2, 1, 1, 'sin', 0.55],
      ]],
      ['lone pairs', [
        [9, 2, 1, 0, 'real', 0.45], [cBase + 6, 2, 1, 0, 'real', 0.45],
        [2, 2, 1, 0, 'real', 0.35], [cBase + 2, 2, 1, 0, 'real', 0.35],
      ]],
    ]
  });
}

// ---- 49. Methylamine (CH₃NH₂) ----
addMol({
  name: 'CH\u2083NH\u2082',
  atoms: [
    ['C', 0, 0, -1.38],
    ['N', 0, 0, 1.38],
    ['H', 1.94, 0, -2.07],
    ['H', -0.97, 1.68, -2.07],
    ['H', -0.97, -1.68, -2.07],
    ['H', 0.93, 1.60, 2.07],
    ['H', 0.93, -1.60, 2.07],
  ],
  bonds: [[0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [1, 6]],
  he: 14,
  mos: [
    ['\u03C3(C-N)', [[0, 2, 1, 0, 'real', 0.7], [1, 2, 1, 0, 'real', -0.7]]],
    ['N lone pair', [[1, 2, 1, 1, 'sin', 1.0]]],
    ['\u03C3(C-H) sym', [[0, 2, 0, 0, 'real', 0.6], [2, 1, 0, 0, 'real', 0.33], [3, 1, 0, 0, 'real', 0.33], [4, 1, 0, 0, 'real', 0.33]]],
    ['\u03C3(N-H)', [[1, 2, 0, 0, 'real', 0.5], [5, 1, 0, 0, 'real', 0.45], [6, 1, 0, 0, 'real', 0.45]]],
  ]
});

// ============================================================
// Retroactive category assignments for all molecules above
// ============================================================
{
  const cats = {
    'H\u2082': 'Diatomic', 'N\u2082': 'Diatomic', 'O\u2082': 'Diatomic',
    'CO': 'Diatomic', 'HF': 'Diatomic', 'FeO': 'Metal Oxide', 'CuO': 'Metal Oxide',
    'CO\u2082': 'Triatomic', 'H\u2082O': 'Triatomic', 'H\u2082S': 'Triatomic',
    'O\u2083': 'Triatomic', 'SO\u2082': 'Triatomic',
    'NH\u2083': 'Small Organic', 'CH\u2084': 'Small Organic',
    'C\u2082H\u2082': 'Small Organic', 'C\u2082H\u2084': 'Small Organic',
    'C\u2086H\u2086': 'Aromatic', 'C\u2085H\u2085N': 'Aromatic',
    'C\u2083H\u2083N\u2083': 'Aromatic', 'Purine': 'Aromatic',
    'Naphthalene': 'Aromatic', 'Phenol': 'Aromatic', 'Aniline': 'Aromatic',
    'Toluene': 'Aromatic', 'C\u2085H\u2086': 'Aromatic',
    'TiO\u2082': 'Metal Oxide', 'NaOH': 'Inorganic',
    'Al\u2082O\u2083': 'Metal Oxide', 'CaCO\u2083': 'Inorganic',
    'Fe\u2083O\u2084': 'Metal Oxide', 'Fe(OH)\u2083': 'Metal Oxide',
    'Fe\u2082(OH)\u2083': 'Metal Oxide',
    '\u03B1-Fe\u2082O\u2083': 'Metal Oxide', '\u03B2-Fe\u2082O\u2083': 'Metal Oxide',
    '\u03B3-Fe\u2082O\u2083': 'Metal Oxide', '\u03B5-Fe\u2082O\u2083': 'Metal Oxide',
    'HNO\u2083': 'Acid', 'H\u2082SO\u2084': 'Acid',
    'CH\u2083OH': 'Alcohol', 'C\u2082H\u2085OH': 'Alcohol',
    'N\u2082H\u2084': 'Small Organic', 'Uracil': 'DNA/RNA Base',
    'Cyclohexane': 'Cyclic', 'Norbornene': 'Cyclic', 'Decalin': 'Cyclic',
    'Glucose': 'Sugar', 'Sucrose': 'Sugar',
    'A-T base pair': 'DNA/RNA Base', 'G-C base pair': 'DNA/RNA Base',
    'CH\u2083NH\u2082': 'Small Organic',
  };
  for (const [name, cat] of Object.entries(cats)) {
    MOLECULE_CATEGORIES[name] = cat;
  }
}

// ============================================================
// Individual DNA/RNA bases
// ============================================================

// ---- Adenine ----
{
  const R6 = 2.64, R5 = 2.20;
  const r6 = []; for (let i = 0; i < 6; i++) r6.push(hexPos(R6, i));
  // 6-ring: N0 C1 N2 C3 C4 C5, fused 5-ring at C3-C4
  const c3 = r6[3], c4 = r6[4];
  const mx = (c3[0]+c4[0])/2, mz = (c3[2]+c4[2])/2;
  const ol = Math.sqrt(mx*mx+mz*mz)||1, nx=mx/ol, nz=mz/ol;
  const ext = R5*0.95;
  const px = -(c4[2]-c3[2]), pz = c4[0]-c3[0];
  const pl = Math.sqrt(px*px+pz*pz)||1;
  const ppx=px/pl, ppz=pz/pl;
  const n7=[c4[0]+nx*ext*0.85+ppx*ext*0.35, 0, c4[2]+nz*ext*0.85+ppz*ext*0.35];
  const c8=[mx+nx*ext*1.5, 0, mz+nz*ext*1.5];
  const n9=[c3[0]+nx*ext*0.85-ppx*ext*0.35, 0, c3[2]+nz*ext*0.85-ppz*ext*0.35];
  // NH₂ on C5 (atom 5)
  const nh2x = r6[5][0]+(r6[5][0]/R6)*2.49, nh2z = r6[5][2]+(r6[5][2]/R6)*2.49;
  addMol({
    name: 'Adenine', category: 'DNA/RNA Base',
    atoms: [
      ['N', ...r6[0]], ['C', ...r6[1]], ['N', ...r6[2]], ['C', ...r6[3]],
      ['C', ...r6[4]], ['C', ...r6[5]],
      ['N', ...n7], ['C', ...c8], ['N', ...n9],
      ['N', nh2x, 0, nh2z],
      ['H', nh2x-0.5, 0, nh2z+1.6], ['H', nh2x-0.5, 0, nh2z-1.6],
      ['H', r6[1][0]+(r6[1][0]/R6)*2.06, 0, r6[1][2]+(r6[1][2]/R6)*2.06],
      ['H', c8[0]+nx*2.06, 0, c8[2]+nz*2.06],
      ['H', n9[0]+nx*1.2-ppx*1.5, 0, n9[2]+nz*1.2-ppz*1.5],
    ],
    bonds: [
      [0,1,1.5],[1,2,1.5],[2,3,1.5],[3,4,1.5],[4,5,1.5],[5,0,1.5],
      [4,6,1.5],[6,7,1.5],[7,8,1.5],[8,3,1.5],
      [5,9],[9,10],[9,11],[1,12],[7,13],[8,14],
    ],
    he: 22,
    mos: [
      ['\u03C0\u2081 all bond', [[0,2,1,1,'sin',0.33],[1,2,1,1,'sin',0.33],[2,2,1,1,'sin',0.33],[3,2,1,1,'sin',0.38],[4,2,1,1,'sin',0.38],[5,2,1,1,'sin',0.33],[6,2,1,1,'sin',0.33],[7,2,1,1,'sin',0.33],[8,2,1,1,'sin',0.33]]],
      ['\u03C0\u2082 (1 node)', [[0,2,1,1,'sin',0.40],[1,2,1,1,'sin',0.20],[2,2,1,1,'sin',-0.20],[3,2,1,1,'sin',-0.35],[4,2,1,1,'sin',0.35],[5,2,1,1,'sin',0.40],[6,2,1,1,'sin',0.25],[7,2,1,1,'sin',-0.25],[8,2,1,1,'sin',-0.35]]],
      ['N lone pair', [[0,2,1,0,'real',0.5],[2,2,1,0,'real',0.5],[6,2,1,0,'real',0.35]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.28],[1,2,0,0,'real',0.28],[2,2,0,0,'real',0.28],[3,2,0,0,'real',0.28],[4,2,0,0,'real',0.28],[5,2,0,0,'real',0.28],[6,2,0,0,'real',0.28],[7,2,0,0,'real',0.28],[8,2,0,0,'real',0.28]]],
    ]
  });
  MOLECULE_LABELS['Adenine'] = 'C\u2085H\u2085N\u2085 (Adenine)';
}

// ---- Guanine ----
{
  const R6 = 2.64, R5 = 2.20;
  const r6 = []; for (let i = 0; i < 6; i++) r6.push(hexPos(R6, i));
  const c3 = r6[3], c4 = r6[4];
  const mx=(c3[0]+c4[0])/2, mz=(c3[2]+c4[2])/2;
  const ol=Math.sqrt(mx*mx+mz*mz)||1, nx=mx/ol, nz=mz/ol;
  const ext=R5*0.95;
  const px=-(c4[2]-c3[2]), pz=c4[0]-c3[0];
  const pl=Math.sqrt(px*px+pz*pz)||1, ppx=px/pl, ppz=pz/pl;
  const n7=[c4[0]+nx*ext*0.85+ppx*ext*0.35,0,c4[2]+nz*ext*0.85+ppz*ext*0.35];
  const c8=[mx+nx*ext*1.5,0,mz+nz*ext*1.5];
  const n9=[c3[0]+nx*ext*0.85-ppx*ext*0.35,0,c3[2]+nz*ext*0.85-ppz*ext*0.35];
  // C=O on C5 (atom 5), NH₂ on C1 (atom 1)
  const od=[r6[5][0]/R6, r6[5][2]/R6];
  const nd=[r6[1][0]/R6, r6[1][2]/R6];
  addMol({
    name: 'Guanine', category: 'DNA/RNA Base',
    atoms: [
      ['N',...r6[0]],['C',...r6[1]],['N',...r6[2]],['C',...r6[3]],
      ['C',...r6[4]],['C',...r6[5]],
      ['N',...n7],['C',...c8],['N',...n9],
      ['O',r6[5][0]+od[0]*2.27,0,r6[5][2]+od[1]*2.27],
      ['N',r6[1][0]+nd[0]*2.49,0,r6[1][2]+nd[1]*2.49],
      ['H',r6[1][0]+nd[0]*2.49-0.5,0,r6[1][2]+nd[1]*2.49+1.6],
      ['H',r6[1][0]+nd[0]*2.49-0.5,0,r6[1][2]+nd[1]*2.49-1.6],
      ['H',r6[0][0]-1.91,0,r6[0][2]],
      ['H',c8[0]+nx*2.06,0,c8[2]+nz*2.06],
      ['H',n9[0]+nx*1.0-ppx*1.5,0,n9[2]+nz*1.0-ppz*1.5],
    ],
    bonds: [
      [0,1,1.5],[1,2,1.5],[2,3,1.5],[3,4,1.5],[4,5,1.5],[5,0,1.5],
      [4,6,1.5],[6,7,1.5],[7,8,1.5],[8,3,1.5],
      [5,9,2],[1,10],[10,11],[10,12],[0,13],[7,14],[8,15],
    ],
    he: 22,
    mos: [
      ['\u03C0\u2081 all bond', [[0,2,1,1,'sin',0.33],[1,2,1,1,'sin',0.33],[2,2,1,1,'sin',0.33],[3,2,1,1,'sin',0.38],[4,2,1,1,'sin',0.38],[5,2,1,1,'sin',0.33],[6,2,1,1,'sin',0.33],[7,2,1,1,'sin',0.33],[8,2,1,1,'sin',0.33]]],
      ['C=O \u03C0', [[5,2,1,1,'sin',0.6],[9,2,1,1,'sin',0.6]]],
      ['N lone pair', [[0,2,1,0,'real',0.5],[2,2,1,0,'real',0.5],[6,2,1,0,'real',0.35]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.28],[1,2,0,0,'real',0.28],[2,2,0,0,'real',0.28],[3,2,0,0,'real',0.28],[4,2,0,0,'real',0.28],[5,2,0,0,'real',0.28],[6,2,0,0,'real',0.28],[7,2,0,0,'real',0.28],[8,2,0,0,'real',0.28]]],
    ]
  });
  MOLECULE_LABELS['Guanine'] = 'C\u2085H\u2085N\u2085O (Guanine)';
}

// ---- Cytosine ----
{
  const R = 2.64;
  const r6 = []; for (let i = 0; i < 6; i++) r6.push(hexPos(R, i));
  // N0 C1 N2 C3 C4 C5; C=O on C1, NH₂ on C3
  const d1 = [r6[1][0]/R, r6[1][2]/R];
  const d3 = [r6[3][0]/R, r6[3][2]/R];
  addMol({
    name: 'Cytosine', category: 'DNA/RNA Base',
    atoms: [
      ['N',...r6[0]],['C',...r6[1]],['N',...r6[2]],['C',...r6[3]],
      ['C',...r6[4]],['C',...r6[5]],
      ['O',r6[1][0]+d1[0]*2.27,0,r6[1][2]+d1[1]*2.27],
      ['N',r6[3][0]+d3[0]*2.49,0,r6[3][2]+d3[1]*2.49],
      ['H',r6[3][0]+d3[0]*2.49+0.5,0,r6[3][2]+d3[1]*2.49+1.6],
      ['H',r6[3][0]+d3[0]*2.49+0.5,0,r6[3][2]+d3[1]*2.49-1.6],
      ['H',...hexPos(R+1.91,0)],
      ['H',...hexPos(R+2.06,4)],
      ['H',...hexPos(R+2.06,5)],
    ],
    bonds: [
      [0,1,1.5],[1,2,1.5],[2,3,1.5],[3,4,1.5],[4,5,1.5],[5,0,1.5],
      [1,6,2],[3,7],[7,8],[7,9],[0,10],[4,11],[5,12],
    ],
    he: 20,
    mos: [
      ['\u03C0 system', [[0,2,1,1,'sin',0.38],[1,2,1,1,'sin',0.38],[2,2,1,1,'sin',0.38],[3,2,1,1,'sin',0.38],[4,2,1,1,'sin',0.42],[5,2,1,1,'sin',0.42]]],
      ['C=O \u03C0', [[1,2,1,1,'sin',0.6],[6,2,1,1,'sin',0.6]]],
      ['N lone pair', [[0,2,1,0,'real',0.6],[2,2,1,0,'real',0.6]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.32],[1,2,0,0,'real',0.32],[2,2,0,0,'real',0.32],[3,2,0,0,'real',0.32],[4,2,0,0,'real',0.32],[5,2,0,0,'real',0.32]]],
    ]
  });
  MOLECULE_LABELS['Cytosine'] = 'C\u2084H\u2085N\u2083O (Cytosine)';
}

// ---- Thymine ----
{
  const R = 2.64;
  const r6 = []; for (let i = 0; i < 6; i++) r6.push(hexPos(R, i));
  // N0 C1 N2 C3 C4 C5; C=O on C1,C3; CH₃ on C4
  const d1 = [r6[1][0]/R, r6[1][2]/R];
  const d3 = [r6[3][0]/R, r6[3][2]/R];
  const d4 = [r6[4][0]/R, r6[4][2]/R];
  addMol({
    name: 'Thymine', category: 'DNA/RNA Base',
    atoms: [
      ['N',...r6[0]],['C',...r6[1]],['N',...r6[2]],['C',...r6[3]],
      ['C',...r6[4]],['C',...r6[5]],
      ['O',r6[1][0]+d1[0]*2.27,0,r6[1][2]+d1[1]*2.27],
      ['O',r6[3][0]+d3[0]*2.27,0,r6[3][2]+d3[1]*2.27],
      ['C',r6[4][0]+d4[0]*2.88,0,r6[4][2]+d4[1]*2.88],
      ['H',r6[4][0]+d4[0]*2.88+1.0,1.68,r6[4][2]+d4[1]*2.88-0.5],
      ['H',r6[4][0]+d4[0]*2.88+1.0,-1.68,r6[4][2]+d4[1]*2.88-0.5],
      ['H',r6[4][0]+d4[0]*2.88-0.5,0,r6[4][2]+d4[1]*2.88-1.9],
      ['H',...hexPos(R+1.91,0)],['H',...hexPos(R+1.91,2)],['H',...hexPos(R+2.06,5)],
    ],
    bonds: [
      [0,1,1.5],[1,2,1.5],[2,3,1.5],[3,4,1.5],[4,5,1.5],[5,0,1.5],
      [1,6,2],[3,7,2],[4,8],[8,9],[8,10],[8,11],[0,12],[2,13],[5,14],
    ],
    he: 22,
    mos: [
      ['\u03C0 system', [[0,2,1,1,'sin',0.35],[1,2,1,1,'sin',0.35],[2,2,1,1,'sin',0.35],[3,2,1,1,'sin',0.35],[4,2,1,1,'sin',0.40],[5,2,1,1,'sin',0.40]]],
      ['\u03C3(C=O)', [[1,2,1,0,'real',0.5],[6,2,1,0,'real',-0.45],[3,2,1,0,'real',0.4],[7,2,1,0,'real',-0.4]]],
      ['N lone pair', [[0,2,1,0,'real',0.65],[2,2,1,0,'real',0.65]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.32],[1,2,0,0,'real',0.32],[2,2,0,0,'real',0.32],[3,2,0,0,'real',0.32],[4,2,0,0,'real',0.32],[5,2,0,0,'real',0.32],[8,2,0,0,'real',0.28]]],
    ]
  });
  MOLECULE_LABELS['Thymine'] = 'C\u2085H\u2086N\u2082O\u2082 (Thymine)';
}

// ============================================================
// Amino Acids (backbone: H₂N-Cα(R)-COOH)
// ============================================================
// Backbone atoms 0-8: N, Cα, C, O(=O), O(-H), H(OH), H(N), H(N), H(Cα)
// Side chain starts at index 9

// ---- Glycine ----
addMol({
  name: 'Glycine', category: 'Amino Acid',
  atoms: [
    ['N',-1.50,0,-2.20],['C',0,0,0],['C',1.50,0,2.20],
    ['O',3.20,0,3.20],['O',2.20,0,0.00],['H',3.60,0,-0.80],
    ['H',-2.30,1.50,-2.20],['H',-2.30,-1.50,-2.20],
    ['H',0,1.80,-0.70],['H',0,-1.80,-0.70],
  ],
  bonds: [[0,1],[1,2],[2,3,2],[2,4],[4,5],[0,6],[0,7],[1,8],[1,9]],
  he: 16,
  mos: [
    ['\u03C3(N-C\u03B1)', [[0,2,1,0,'real',0.65],[1,2,1,0,'real',-0.65]]],
    ['\u03C3(C\u03B1-C)', [[1,2,1,0,'real',0.65],[2,2,1,0,'real',-0.65]]],
    ['N lone pair', [[0,2,1,1,'sin',1.0]]],
    ['\u03C0(C=O)', [[2,2,1,1,'sin',0.65],[3,2,1,1,'sin',0.65]]],
  ]
});
MOLECULE_LABELS['Glycine'] = 'C\u2082H\u2085NO\u2082 (Glycine)';

// ---- Alanine ----
addMol({
  name: 'Alanine', category: 'Amino Acid',
  atoms: [
    ['N',-1.50,0,-2.20],['C',0,0,0],['C',1.50,0,2.20],
    ['O',3.20,0,3.20],['O',2.20,0,0.00],['H',3.60,0,-0.80],
    ['H',-2.30,1.50,-2.20],['H',-2.30,-1.50,-2.20],['H',0,1.80,-0.70],
    ['C',-2.50,0,1.00],['H',-3.50,1.68,1.00],['H',-3.50,-1.68,1.00],['H',-2.50,0,3.06],
  ],
  bonds: [[0,1],[1,2],[2,3,2],[2,4],[4,5],[0,6],[0,7],[1,8],[1,9],[9,10],[9,11],[9,12]],
  he: 18,
  mos: [
    ['\u03C3(N-C\u03B1)', [[0,2,1,0,'real',0.65],[1,2,1,0,'real',-0.65]]],
    ['\u03C3(C\u03B1-C)', [[1,2,1,0,'real',0.65],[2,2,1,0,'real',-0.65]]],
    ['N lone pair', [[0,2,1,1,'sin',1.0]]],
    ['\u03C0(C=O)', [[2,2,1,1,'sin',0.65],[3,2,1,1,'sin',0.65]]],
  ]
});
MOLECULE_LABELS['Alanine'] = 'C\u2083H\u2087NO\u2082 (Alanine)';

// ---- Serine ----
addMol({
  name: 'Serine', category: 'Amino Acid',
  atoms: [
    ['N',-1.50,0,-2.20],['C',0,0,0],['C',1.50,0,2.20],
    ['O',3.20,0,3.20],['O',2.20,0,0.00],['H',3.60,0,-0.80],
    ['H',-2.30,1.50,-2.20],['H',-2.30,-1.50,-2.20],['H',0,1.80,-0.70],
    ['C',-2.50,0,1.00],['O',-4.80,0,1.60],['H',-5.80,0,0.80],
    ['H',-2.50,1.80,1.70],['H',-2.50,-1.80,1.70],
  ],
  bonds: [[0,1],[1,2],[2,3,2],[2,4],[4,5],[0,6],[0,7],[1,8],[1,9],[9,10],[10,11],[9,12],[9,13]],
  he: 20,
  mos: [
    ['\u03C3(N-C\u03B1)', [[0,2,1,0,'real',0.65],[1,2,1,0,'real',-0.65]]],
    ['\u03C3(C-O)', [[9,2,1,0,'real',0.65],[10,2,1,0,'real',-0.6]]],
    ['N lone pair', [[0,2,1,1,'sin',1.0]]],
    ['\u03C0(C=O)', [[2,2,1,1,'sin',0.65],[3,2,1,1,'sin',0.65]]],
  ]
});
MOLECULE_LABELS['Serine'] = 'C\u2083H\u2087NO\u2083 (Serine)';

// ---- Cysteine ----
addMol({
  name: 'Cysteine', category: 'Amino Acid',
  atoms: [
    ['N',-1.50,0,-2.20],['C',0,0,0],['C',1.50,0,2.20],
    ['O',3.20,0,3.20],['O',2.20,0,0.00],['H',3.60,0,-0.80],
    ['H',-2.30,1.50,-2.20],['H',-2.30,-1.50,-2.20],['H',0,1.80,-0.70],
    ['C',-2.50,0,1.00],['S',-5.10,0,1.60],['H',-6.40,0,0.30],
    ['H',-2.50,1.80,1.70],['H',-2.50,-1.80,1.70],
  ],
  bonds: [[0,1],[1,2],[2,3,2],[2,4],[4,5],[0,6],[0,7],[1,8],[1,9],[9,10],[10,11],[9,12],[9,13]],
  he: 20,
  mos: [
    ['\u03C3(N-C\u03B1)', [[0,2,1,0,'real',0.65],[1,2,1,0,'real',-0.65]]],
    ['\u03C3(C-S)', [[9,2,1,0,'real',0.6],[10,3,1,0,'real',-0.55]]],
    ['N lone pair', [[0,2,1,1,'sin',1.0]]],
    ['\u03C0(C=O)', [[2,2,1,1,'sin',0.65],[3,2,1,1,'sin',0.65]]],
  ]
});
MOLECULE_LABELS['Cysteine'] = 'C\u2083H\u2087NO\u2082S (Cysteine)';

// ---- Phenylalanine ----
{
  const R = 2.64, HR = 4.58;
  const sideOff = -4.50; // benzene ring center x-offset
  const atoms = [
    ['N',-1.50,0,-2.20],['C',0,0,0],['C',1.50,0,2.20],
    ['O',3.20,0,3.20],['O',2.20,0,0.00],['H',3.60,0,-0.80],
    ['H',-2.30,1.50,-2.20],['H',-2.30,-1.50,-2.20],['H',0,1.80,-0.70],
    ['C',-2.20,0,1.40], // 9: CH₂
    ['H',-2.20,1.80,2.10],['H',-2.20,-1.80,2.10],
  ];
  const ringBase = atoms.length; // 12
  // Benzene ring centered at (sideOff, 0, 3.0)
  for (let i = 0; i < 6; i++) {
    const [x,y,z] = hexPos(R, i);
    atoms.push(['C', x+sideOff, y, z+3.0]);
  }
  for (let i = 0; i < 6; i++) {
    const [x,y,z] = hexPos(HR, i);
    atoms.push(['H', x+sideOff, y, z+3.0]);
  }
  const bonds = [[0,1],[1,2],[2,3,2],[2,4],[4,5],[0,6],[0,7],[1,8],[1,9],[9,10],[9,11],[9,ringBase]];
  for (let i = 0; i < 6; i++) bonds.push([ringBase+i, ringBase+(i+1)%6, 1.5]);
  for (let i = 0; i < 6; i++) bonds.push([ringBase+i, ringBase+6+i]);
  addMol({
    name: 'Phenylalanine', category: 'Amino Acid',
    atoms, bonds, he: 24,
    mos: [
      ['\u03C0 ring', [[12,2,1,1,'sin',0.41],[13,2,1,1,'sin',0.41],[14,2,1,1,'sin',0.41],[15,2,1,1,'sin',0.41],[16,2,1,1,'sin',0.41],[17,2,1,1,'sin',0.41]]],
      ['\u03C3(N-C\u03B1)', [[0,2,1,0,'real',0.65],[1,2,1,0,'real',-0.65]]],
      ['N lone pair', [[0,2,1,1,'sin',1.0]]],
      ['\u03C0(C=O)', [[2,2,1,1,'sin',0.65],[3,2,1,1,'sin',0.65]]],
    ]
  });
  MOLECULE_LABELS['Phenylalanine'] = 'C\u2089H\u2081\u2081NO\u2082 (Phenylalanine)';
}

// ---- Glutamic Acid ----
addMol({
  name: 'Glutamic Acid', category: 'Amino Acid',
  atoms: [
    ['N',-1.50,0,-2.20],['C',0,0,0],['C',1.50,0,2.20],
    ['O',3.20,0,3.20],['O',2.20,0,0.00],['H',3.60,0,-0.80],
    ['H',-2.30,1.50,-2.20],['H',-2.30,-1.50,-2.20],['H',0,1.80,-0.70],
    ['C',-2.50,0,1.00],['C',-4.80,0,1.80],['C',-7.10,0,2.60],
    ['O',-8.80,0,3.60],['O',-7.80,0,0.80],['H',-9.30,0,0.20],
    ['H',-2.50,1.80,1.70],['H',-2.50,-1.80,1.70],
    ['H',-4.80,1.80,2.50],['H',-4.80,-1.80,2.50],
  ],
  bonds: [
    [0,1],[1,2],[2,3,2],[2,4],[4,5],[0,6],[0,7],[1,8],[1,9],
    [9,10],[10,11],[11,12,2],[11,13],[13,14],[9,15],[9,16],[10,17],[10,18],
  ],
  he: 24,
  mos: [
    ['\u03C3(N-C\u03B1)', [[0,2,1,0,'real',0.65],[1,2,1,0,'real',-0.65]]],
    ['\u03C0(C=O)', [[2,2,1,1,'sin',0.5],[3,2,1,1,'sin',0.5],[11,2,1,1,'sin',0.4],[12,2,1,1,'sin',0.4]]],
    ['N lone pair', [[0,2,1,1,'sin',1.0]]],
    ['\u03C3 frame', [[0,2,0,0,'real',0.3],[1,2,0,0,'real',0.3],[2,2,0,0,'real',0.3],[9,2,0,0,'real',0.3],[10,2,0,0,'real',0.3],[11,2,0,0,'real',0.3]]],
  ]
});
MOLECULE_LABELS['Glutamic Acid'] = 'C\u2085H\u2089NO\u2084 (Glutamic Acid)';

// ============================================================
// Neurotransmitters
// ============================================================

// ---- Dopamine ----
{
  const R = 2.64, HR = 4.58;
  const atoms = [];
  // Catechol ring (benzene with 2 OH) in xz plane
  for (let i = 0; i < 6; i++) { const [x,y,z] = hexPos(R,i); atoms.push(['C',x,y,z]); }
  // OH on C3 and C4 (indices 3,4)
  const d3 = [hexPos(R,3)[0]/R, hexPos(R,3)[2]/R];
  const d4 = [hexPos(R,4)[0]/R, hexPos(R,4)[2]/R];
  atoms.push(['O', hexPos(R,3)[0]+d3[0]*2.70, 0, hexPos(R,3)[2]+d3[1]*2.70]); // 6
  atoms.push(['H', hexPos(R,3)[0]+d3[0]*4.53, 0, hexPos(R,3)[2]+d3[1]*4.53]); // 7
  atoms.push(['O', hexPos(R,4)[0]+d4[0]*2.70, 0, hexPos(R,4)[2]+d4[1]*2.70]); // 8
  atoms.push(['H', hexPos(R,4)[0]+d4[0]*4.53, 0, hexPos(R,4)[2]+d4[1]*4.53]); // 9
  // H on C0,C1,C2,C5
  for (const i of [0,1,2,5]) { const [x,y,z] = hexPos(HR,i); atoms.push(['H',x,y,z]); } // 10-13
  // Ethylamine chain off C0: CH₂-CH₂-NH₂
  const d0 = [hexPos(R,0)[0]/R, hexPos(R,0)[2]/R];
  atoms.push(['C', hexPos(R,0)[0]+d0[0]*2.88, 0, hexPos(R,0)[2]+d0[1]*2.88]); // 14
  atoms.push(['C', hexPos(R,0)[0]+d0[0]*5.76, 0, hexPos(R,0)[2]+d0[1]*5.76]); // 15
  atoms.push(['N', hexPos(R,0)[0]+d0[0]*8.52, 0, hexPos(R,0)[2]+d0[1]*8.52]); // 16
  atoms.push(['H', atoms[14][1],1.80, atoms[14][3]]); // 17
  atoms.push(['H', atoms[14][1],-1.80, atoms[14][3]]); // 18
  atoms.push(['H', atoms[15][1],1.80, atoms[15][3]]); // 19
  atoms.push(['H', atoms[15][1],-1.80, atoms[15][3]]); // 20
  atoms.push(['H', atoms[16][1]+0.93,1.60, atoms[16][3]]); // 21
  atoms.push(['H', atoms[16][1]+0.93,-1.60, atoms[16][3]]); // 22
  const bonds = [];
  for (let i = 0; i < 6; i++) bonds.push([i,(i+1)%6,1.5]);
  bonds.push([3,6],[6,7],[4,8],[8,9]);
  bonds.push([0,10],[1,11],[2,12],[5,13]);
  bonds.push([0,14],[14,15],[15,16],[14,17],[14,18],[15,19],[15,20],[16,21],[16,22]);
  addMol({
    name: 'Dopamine', category: 'Neurotransmitter',
    atoms, bonds, he: 26,
    mos: [
      ['\u03C0 ring', [[0,2,1,1,'sin',0.41],[1,2,1,1,'sin',0.41],[2,2,1,1,'sin',0.41],[3,2,1,1,'sin',0.41],[4,2,1,1,'sin',0.41],[5,2,1,1,'sin',0.41]]],
      ['O lone pair', [[6,2,1,1,'sin',0.7],[8,2,1,1,'sin',0.7]]],
      ['N lone pair', [[16,2,1,1,'sin',1.0]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.28],[1,2,0,0,'real',0.28],[2,2,0,0,'real',0.28],[3,2,0,0,'real',0.28],[4,2,0,0,'real',0.28],[5,2,0,0,'real',0.28],[14,2,0,0,'real',0.28],[15,2,0,0,'real',0.28]]],
    ]
  });
  MOLECULE_LABELS['Dopamine'] = 'C\u2088H\u2081\u2081NO\u2082 (Dopamine)';
}

// ---- Serotonin ----
{
  const R6 = 2.64, R5 = 2.20;
  const r6 = []; for (let i = 0; i < 6; i++) r6.push(hexPos(R6, i));
  const c3=r6[3],c4=r6[4];
  const mx2=(c3[0]+c4[0])/2, mz2=(c3[2]+c4[2])/2;
  const ol2=Math.sqrt(mx2*mx2+mz2*mz2)||1, nx2=mx2/ol2, nz2=mz2/ol2;
  const ext2=R5*0.95;
  const px2=-(c4[2]-c3[2]),pz2=c4[0]-c3[0];
  const pl2=Math.sqrt(px2*px2+pz2*pz2)||1;
  const ppx2=px2/pl2, ppz2=pz2/pl2;
  // Indole: 6-ring fused with 5-ring (pyrrole) at C3-C4
  const n7=[c4[0]+nx2*ext2*0.85+ppx2*ext2*0.35,0,c4[2]+nz2*ext2*0.85+ppz2*ext2*0.35];
  const c8=[mx2+nx2*ext2*1.5,0,mz2+nz2*ext2*1.5];
  const c9=[c3[0]+nx2*ext2*0.85-ppx2*ext2*0.35,0,c3[2]+nz2*ext2*0.85-ppz2*ext2*0.35];
  const atoms = [
    ['C',...r6[0]],['C',...r6[1]],['C',...r6[2]],['C',...r6[3]],
    ['C',...r6[4]],['C',...r6[5]],
    ['N',...n7],['C',...c8],['C',...c9], // indole 5-ring: 4-6-7-8-3
  ];
  // OH on C4 (index 5 in our numbering → actually on ring pos 5)
  const d5=[r6[5][0]/R6,r6[5][2]/R6];
  atoms.push(['O',r6[5][0]+d5[0]*2.70,0,r6[5][2]+d5[1]*2.70]); // 9: OH
  atoms.push(['H',r6[5][0]+d5[0]*4.53,0,r6[5][2]+d5[1]*4.53]); // 10: OH-H
  // H on ring atoms 0,1,2
  for (const i of [0,1,2]) atoms.push(['H',...hexPos(R6+2.06,i)]); // 11-13
  atoms.push(['H',n7[0]+ppx2*1.91,0,n7[2]+ppz2*1.91]); // 14: H on NH
  atoms.push(['H',c8[0]+nx2*2.06,0,c8[2]+nz2*2.06]); // 15: H on C8
  // Ethylamine chain off C8 (index 7)
  atoms.push(['C',c8[0]+nx2*2.88,0,c8[2]+nz2*2.88]); // 16: CH₂
  atoms.push(['C',c8[0]+nx2*5.76,0,c8[2]+nz2*5.76]); // 17: CH₂
  atoms.push(['N',c8[0]+nx2*8.52,0,c8[2]+nz2*8.52]); // 18: NH₂
  atoms.push(['H',atoms[16][1],1.80,atoms[16][3]]); // 19
  atoms.push(['H',atoms[16][1],-1.80,atoms[16][3]]); // 20
  atoms.push(['H',atoms[17][1],1.80,atoms[17][3]]); // 21
  atoms.push(['H',atoms[17][1],-1.80,atoms[17][3]]); // 22
  atoms.push(['H',atoms[18][1]+0.93,1.60,atoms[18][3]]); // 23
  atoms.push(['H',atoms[18][1]+0.93,-1.60,atoms[18][3]]); // 24
  const bonds = [];
  for (let i = 0; i < 6; i++) bonds.push([i,(i+1)%6,1.5]);
  bonds.push([4,6,1.5],[6,7,1.5],[7,8,1.5],[8,3,1.5]);
  bonds.push([5,9],[9,10]);
  bonds.push([0,11],[1,12],[2,13],[6,14],[7,15]);
  bonds.push([7,16],[16,17],[17,18],[16,19],[16,20],[17,21],[17,22],[18,23],[18,24]);
  addMol({
    name: 'Serotonin', category: 'Neurotransmitter',
    atoms, bonds, he: 28,
    mos: [
      ['\u03C0 indole', [[0,2,1,1,'sin',0.30],[1,2,1,1,'sin',0.30],[2,2,1,1,'sin',0.30],[3,2,1,1,'sin',0.33],[4,2,1,1,'sin',0.33],[5,2,1,1,'sin',0.30],[6,2,1,1,'sin',0.30],[7,2,1,1,'sin',0.30],[8,2,1,1,'sin',0.30]]],
      ['N lone pair (NH\u2082)', [[18,2,1,1,'sin',1.0]]],
      ['O lone pair', [[9,2,1,1,'sin',0.85]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.25],[1,2,0,0,'real',0.25],[2,2,0,0,'real',0.25],[3,2,0,0,'real',0.25],[4,2,0,0,'real',0.25],[5,2,0,0,'real',0.25],[16,2,0,0,'real',0.25],[17,2,0,0,'real',0.25]]],
    ]
  });
  MOLECULE_LABELS['Serotonin'] = 'C\u2081\u2080H\u2081\u2082N\u2082O (Serotonin)';
}

// ---- Histamine ----
{
  const R5 = 2.20;
  const atoms = [];
  // Imidazole ring (5-membered, aromatic)
  for (let i = 0; i < 5; i++) {
    const [x,y,z] = pentPos(R5, i);
    atoms.push([(i===0||i===2)?'N':'C', x, y, z]);
  }
  // H on NH (atom 0), H on C atoms 1,3,4
  atoms.push(['H',...pentPos(R5+1.91,0)]); // 5
  atoms.push(['H',...pentPos(R5+2.06,1)]); // 6
  atoms.push(['H',...pentPos(R5+2.06,3)]); // 7
  // Ethylamine chain off C4 (index 4)
  const d4=[pentPos(R5,4)[0]/R5, pentPos(R5,4)[2]/R5];
  atoms.push(['C',pentPos(R5,4)[0]+d4[0]*2.88,0,pentPos(R5,4)[2]+d4[1]*2.88]); // 8
  atoms.push(['C',pentPos(R5,4)[0]+d4[0]*5.76,0,pentPos(R5,4)[2]+d4[1]*5.76]); // 9
  atoms.push(['N',pentPos(R5,4)[0]+d4[0]*8.52,0,pentPos(R5,4)[2]+d4[1]*8.52]); // 10
  atoms.push(['H',atoms[8][1],1.80,atoms[8][3]]); // 11
  atoms.push(['H',atoms[8][1],-1.80,atoms[8][3]]); // 12
  atoms.push(['H',atoms[9][1],1.80,atoms[9][3]]); // 13
  atoms.push(['H',atoms[9][1],-1.80,atoms[9][3]]); // 14
  atoms.push(['H',atoms[10][1]+0.93,1.60,atoms[10][3]]); // 15
  atoms.push(['H',atoms[10][1]+0.93,-1.60,atoms[10][3]]); // 16
  const bonds = [];
  for (let i = 0; i < 5; i++) bonds.push([i,(i+1)%5,1.5]);
  bonds.push([0,5],[1,6],[3,7],[4,8],[8,9],[9,10],[8,11],[8,12],[9,13],[9,14],[10,15],[10,16]);
  addMol({
    name: 'Histamine', category: 'Neurotransmitter',
    atoms, bonds, he: 22,
    mos: [
      ['\u03C0 imidazole', [[0,2,1,1,'sin',0.45],[1,2,1,1,'sin',0.42],[2,2,1,1,'sin',0.45],[3,2,1,1,'sin',0.42],[4,2,1,1,'sin',0.42]]],
      ['N lone pair (ring)', [[2,2,1,0,'real',0.85]]],
      ['N lone pair (NH\u2082)', [[10,2,1,1,'sin',1.0]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.3],[1,2,0,0,'real',0.3],[2,2,0,0,'real',0.3],[3,2,0,0,'real',0.3],[4,2,0,0,'real',0.3],[8,2,0,0,'real',0.3],[9,2,0,0,'real',0.3]]],
    ]
  });
  MOLECULE_LABELS['Histamine'] = 'C\u2085H\u2089N\u2083 (Histamine)';
}

// ============================================================
// Drugs & Pharmaceuticals
// ============================================================

// ---- Paracetamol (Acetaminophen) ----
{
  const R = 2.64, HR = 4.58;
  const atoms = [];
  for (let i = 0; i < 6; i++) { const [x,y,z] = hexPos(R,i); atoms.push(['C',x,y,z]); }
  // OH on C3 (para position)
  const d3=[hexPos(R,3)[0]/R,hexPos(R,3)[2]/R];
  atoms.push(['O',hexPos(R,3)[0]+d3[0]*2.70,0,hexPos(R,3)[2]+d3[1]*2.70]); // 6
  atoms.push(['H',hexPos(R,3)[0]+d3[0]*4.53,0,hexPos(R,3)[2]+d3[1]*4.53]); // 7
  // NH-COCH₃ on C0 (amino-acetyl)
  const d0=[hexPos(R,0)[0]/R,hexPos(R,0)[2]/R];
  atoms.push(['N',hexPos(R,0)[0]+d0[0]*2.76,0,hexPos(R,0)[2]+d0[1]*2.76]); // 8
  atoms.push(['H',atoms[8][1]+0.93,1.60,atoms[8][3]]); // 9: NH
  atoms.push(['C',atoms[8][1]+d0[0]*2.49,0,atoms[8][3]+d0[1]*2.49]); // 10: C=O
  atoms.push(['O',atoms[10][1],1.80,atoms[10][3]+1.20]); // 11: =O
  atoms.push(['C',atoms[10][1]+d0[0]*2.88,0,atoms[10][3]+d0[1]*2.88]); // 12: CH₃
  atoms.push(['H',atoms[12][1]+1.94,0,atoms[12][3]-0.69]); // 13
  atoms.push(['H',atoms[12][1]-0.97,1.68,atoms[12][3]-0.69]); // 14
  atoms.push(['H',atoms[12][1]-0.97,-1.68,atoms[12][3]-0.69]); // 15
  // H on C1,C2,C4,C5
  for (const i of [1,2,4,5]) atoms.push(['H',...hexPos(HR,i)]); // 16-19
  const bonds = [];
  for (let i = 0; i < 6; i++) bonds.push([i,(i+1)%6,1.5]);
  bonds.push([3,6],[6,7],[0,8],[8,9],[8,10],[10,11,2],[10,12],[12,13],[12,14],[12,15]);
  bonds.push([1,16],[2,17],[4,18],[5,19]);
  addMol({
    name: 'Paracetamol', category: 'Drug',
    atoms, bonds, he: 24,
    mos: [
      ['\u03C0 ring', [[0,2,1,1,'sin',0.41],[1,2,1,1,'sin',0.41],[2,2,1,1,'sin',0.41],[3,2,1,1,'sin',0.41],[4,2,1,1,'sin',0.41],[5,2,1,1,'sin',0.41]]],
      ['\u03C0(C=O)', [[10,2,1,1,'sin',0.65],[11,2,1,1,'sin',0.65]]],
      ['N lone pair', [[8,2,1,1,'sin',0.85]]],
      ['O lone pair', [[6,2,1,1,'sin',0.85]]],
    ]
  });
  MOLECULE_LABELS['Paracetamol'] = 'C\u2088H\u2089NO\u2082 (Paracetamol)';
}

// ---- Aspirin ----
{
  const R = 2.64, HR = 4.58;
  const atoms = [];
  for (let i = 0; i < 6; i++) { const [x,y,z] = hexPos(R,i); atoms.push(['C',x,y,z]); }
  // COOH on C0
  const d0=[hexPos(R,0)[0]/R,hexPos(R,0)[2]/R];
  atoms.push(['C',hexPos(R,0)[0]+d0[0]*2.88,0,hexPos(R,0)[2]+d0[1]*2.88]); // 6: COOH-C
  atoms.push(['O',atoms[6][1]+1.80,0,atoms[6][3]+1.30]); // 7: C=O
  atoms.push(['O',atoms[6][1]+1.00,0,atoms[6][3]-2.20]); // 8: C-OH
  atoms.push(['H',atoms[8][1]+1.83,0,atoms[8][3]]); // 9: OH-H
  // O-COCH₃ on C1 (ortho acetyl)
  const d1=[hexPos(R,1)[0]/R,hexPos(R,1)[2]/R];
  atoms.push(['O',hexPos(R,1)[0]+d1[0]*2.70,0,hexPos(R,1)[2]+d1[1]*2.70]); // 10: ester O
  atoms.push(['C',atoms[10][1]+d1[0]*2.55,0,atoms[10][3]+d1[1]*2.55]); // 11: C=O
  atoms.push(['O',atoms[11][1],1.80,atoms[11][3]+1.20]); // 12: =O
  atoms.push(['C',atoms[11][1]+d1[0]*2.88,0,atoms[11][3]+d1[1]*2.88]); // 13: CH₃
  atoms.push(['H',atoms[13][1]+1.94,0,atoms[13][3]-0.69]); // 14
  atoms.push(['H',atoms[13][1]-0.97,1.68,atoms[13][3]-0.69]); // 15
  atoms.push(['H',atoms[13][1]-0.97,-1.68,atoms[13][3]-0.69]); // 16
  // H on C2-C5
  for (const i of [2,3,4,5]) atoms.push(['H',...hexPos(HR,i)]); // 17-20
  const bonds = [];
  for (let i = 0; i < 6; i++) bonds.push([i,(i+1)%6,1.5]);
  bonds.push([0,6],[6,7,2],[6,8],[8,9],[1,10],[10,11],[11,12,2],[11,13],[13,14],[13,15],[13,16]);
  bonds.push([2,17],[3,18],[4,19],[5,20]);
  addMol({
    name: 'Aspirin', category: 'Drug',
    atoms, bonds, he: 24,
    mos: [
      ['\u03C0 ring', [[0,2,1,1,'sin',0.41],[1,2,1,1,'sin',0.41],[2,2,1,1,'sin',0.41],[3,2,1,1,'sin',0.41],[4,2,1,1,'sin',0.41],[5,2,1,1,'sin',0.41]]],
      ['\u03C0(C=O)', [[6,2,1,1,'sin',0.5],[7,2,1,1,'sin',0.5],[11,2,1,1,'sin',0.4],[12,2,1,1,'sin',0.4]]],
      ['O lone pair', [[10,2,1,1,'sin',0.7]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.28],[1,2,0,0,'real',0.28],[2,2,0,0,'real',0.28],[3,2,0,0,'real',0.28],[4,2,0,0,'real',0.28],[5,2,0,0,'real',0.28],[6,2,0,0,'real',0.25],[11,2,0,0,'real',0.25]]],
    ]
  });
  MOLECULE_LABELS['Aspirin'] = 'C\u2089H\u2088O\u2084 (Aspirin)';
}

// ---- Methamphetamine ----
{
  const R = 2.64, HR = 4.58;
  const atoms = [];
  for (let i = 0; i < 6; i++) { const [x,y,z] = hexPos(R,i); atoms.push(['C',x,y,z]); }
  for (let i = 0; i < 6; i++) { const [x,y,z] = hexPos(HR,i); atoms.push(['H',x,y,z]); } // 6-11: ring H (we'll skip one)
  // Propylamine chain off C0: CH₂-CH(CH₃)-NH(CH₃)
  const d0=[hexPos(R,0)[0]/R,hexPos(R,0)[2]/R];
  const c12 = [hexPos(R,0)[0]+d0[0]*2.88, 0, hexPos(R,0)[2]+d0[1]*2.88];
  const c13 = [c12[0]+d0[0]*2.88, 0, c12[2]+d0[1]*2.88];
  const n14 = [c13[0]+d0[0]*2.76, 0, c13[2]+d0[1]*2.76];
  atoms.push(['C',...c12]); // 12: CH₂
  atoms.push(['C',...c13]); // 13: CH(CH₃)
  atoms.push(['N',...n14]); // 14: N(CH₃)H
  atoms.push(['C',c13[0],2.50,c13[2]]); // 15: CH₃ on C13
  atoms.push(['C',n14[0]+d0[0]*2.88,0,n14[2]+d0[1]*2.88]); // 16: N-CH₃
  atoms.push(['H',c12[0],1.80,c12[2]]); atoms.push(['H',c12[0],-1.80,c12[2]]); // 17,18
  atoms.push(['H',c13[0],-1.80,c13[2]]); // 19
  atoms.push(['H',n14[0]+0.93,1.60,n14[2]]); // 20: NH
  atoms.push(['H',atoms[15][1]+1.94,atoms[15][2],atoms[15][3]-0.69]); // 21
  atoms.push(['H',atoms[15][1]-0.97,atoms[15][2]+1.68,atoms[15][3]-0.69]); // 22
  atoms.push(['H',atoms[15][1]-0.97,atoms[15][2]-1.68,atoms[15][3]-0.69]); // 23
  atoms.push(['H',atoms[16][1]+1.94,0,atoms[16][3]-0.69]); // 24
  atoms.push(['H',atoms[16][1]-0.97,1.68,atoms[16][3]-0.69]); // 25
  atoms.push(['H',atoms[16][1]-0.97,-1.68,atoms[16][3]-0.69]); // 26
  // Remove ring H at pos 0 (replaced by chain) - overwrite atom 6
  atoms[6] = atoms[6]; // keep it, just don't bond it — actually, let's skip H at pos0
  const bonds = [];
  for (let i = 0; i < 6; i++) bonds.push([i,(i+1)%6,1.5]);
  for (let i = 1; i < 6; i++) bonds.push([i,i+6]); // ring H (skip C0's H)
  bonds.push([0,12],[12,13],[13,14],[13,15],[14,16]);
  bonds.push([12,17],[12,18],[13,19],[14,20]);
  bonds.push([15,21],[15,22],[15,23],[16,24],[16,25],[16,26]);
  // Remove C0-H bond (atom 6) — replace atom 6 with nothing
  atoms.splice(6,1); // remove the H that was on C0
  // Need to re-index: everything after index 6 shifts down by 1
  // This is getting messy... let me redo without the C0 ring H
  addMol({
    name: 'Methamphetamine', category: 'Drug',
    atoms: (() => {
      const a = [];
      for (let i = 0; i < 6; i++) { const [x,y,z] = hexPos(R,i); a.push(['C',x,y,z]); }
      for (let i = 1; i < 6; i++) { const [x,y,z] = hexPos(HR,i); a.push(['H',x,y,z]); } // 6-10
      const dd=[hexPos(R,0)[0]/R,hexPos(R,0)[2]/R];
      const ch2=[hexPos(R,0)[0]+dd[0]*2.88,0,hexPos(R,0)[2]+dd[1]*2.88];
      const chm=[ch2[0]+dd[0]*2.88,0,ch2[2]+dd[1]*2.88];
      const nm=[chm[0]+dd[0]*2.76,0,chm[2]+dd[1]*2.76];
      a.push(['C',...ch2]); // 11
      a.push(['C',...chm]); // 12
      a.push(['N',...nm]); // 13
      a.push(['C',chm[0],2.50,chm[2]]); // 14: side CH₃
      a.push(['C',nm[0]+dd[0]*2.88,0,nm[2]+dd[1]*2.88]); // 15: N-CH₃
      a.push(['H',ch2[0],1.80,ch2[2]]); a.push(['H',ch2[0],-1.80,ch2[2]]); // 16,17
      a.push(['H',chm[0],-1.80,chm[2]]); // 18
      a.push(['H',nm[0]+0.93,1.60,nm[2]]); // 19
      a.push(['H',a[14][1]+1.0,a[14][2]+1.5,a[14][3]]); // 20
      a.push(['H',a[14][1]-1.0,a[14][2]+1.5,a[14][3]]); // 21
      a.push(['H',a[14][1],a[14][2]+1.5,a[14][3]+1.5]); // 22
      a.push(['H',a[15][1]+1.0,1.5,a[15][3]]); // 23
      a.push(['H',a[15][1]-1.0,1.5,a[15][3]]); // 24
      a.push(['H',a[15][1],0,a[15][3]+1.8]); // 25
      return a;
    })(),
    bonds: (() => {
      const b = [];
      for (let i = 0; i < 6; i++) b.push([i,(i+1)%6,1.5]);
      for (let i = 1; i < 6; i++) b.push([i,i+5]);
      b.push([0,11],[11,12],[12,13],[12,14],[13,15]);
      b.push([11,16],[11,17],[12,18],[13,19]);
      b.push([14,20],[14,21],[14,22],[15,23],[15,24],[15,25]);
      return b;
    })(),
    he: 26,
    mos: [
      ['\u03C0 ring', [[0,2,1,1,'sin',0.41],[1,2,1,1,'sin',0.41],[2,2,1,1,'sin',0.41],[3,2,1,1,'sin',0.41],[4,2,1,1,'sin',0.41],[5,2,1,1,'sin',0.41]]],
      ['N lone pair', [[13,2,1,1,'sin',1.0]]],
      ['\u03C3(C-N)', [[12,2,1,0,'real',0.6],[13,2,1,0,'real',-0.6]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.28],[1,2,0,0,'real',0.28],[2,2,0,0,'real',0.28],[3,2,0,0,'real',0.28],[4,2,0,0,'real',0.28],[5,2,0,0,'real',0.28],[11,2,0,0,'real',0.28],[12,2,0,0,'real',0.28]]],
    ]
  });
  MOLECULE_LABELS['Methamphetamine'] = 'C\u2081\u2080H\u2081\u2085N (Methamphetamine)';
}

// ============================================================
// Small Molecules
// ============================================================

// ---- Isopropyl Alcohol ----
addMol({
  name: 'Isopropanol', category: 'Alcohol',
  atoms: [
    ['C',0,0,0],['C',-2.50,0,1.20],['C',2.50,0,1.20],
    ['O',0,0,-2.70],['H',0,0,-4.53],
    ['H',0,1.80,0.70],
    ['H',-2.50,1.80,1.90],['H',-2.50,-1.80,1.90],['H',-4.00,0,0.20],
    ['H',2.50,1.80,1.90],['H',2.50,-1.80,1.90],['H',4.00,0,0.20],
  ],
  bonds: [[0,1],[0,2],[0,3],[3,4],[0,5],[1,6],[1,7],[1,8],[2,9],[2,10],[2,11]],
  he: 16,
  mos: [
    ['\u03C3(C-O)', [[0,2,1,0,'real',0.7],[3,2,1,0,'real',-0.65]]],
    ['\u03C3(O-H)', [[3,2,1,0,'real',-0.7],[4,1,0,0,'real',0.65]]],
    ['O lone pair', [[3,2,1,1,'sin',1.0]]],
    ['\u03C3(C-C)', [[0,2,0,0,'real',0.5],[1,2,0,0,'real',0.35],[2,2,0,0,'real',0.35]]],
  ]
});
MOLECULE_LABELS['Isopropanol'] = 'C\u2083H\u2088O (Isopropanol)';

// ---- Citric Acid ----
addMol({
  name: 'Citric Acid', category: 'Acid',
  atoms: [
    ['C',0,0,0],['C',-2.88,0,0],['C',2.88,0,0],
    ['C',-5.10,0,1.40],['C',5.10,0,1.40],
    ['O',-6.80,0,2.40],['O',-5.10,0,-0.80],['H',-6.50,0,-1.40],
    ['O',6.80,0,2.40],['O',5.10,0,-0.80],['H',6.50,0,-1.40],
    ['O',0,2.40,0.80],['H',0,3.80,0.20],
    ['C',0,-2.40,0.80],['O',0,-4.10,1.80],['O',1.50,-2.40,-0.80],['H',2.80,-2.40,-1.40],
    ['H',-2.88,1.80,0.70],['H',-2.88,-1.80,0.70],
    ['H',2.88,1.80,0.70],['H',2.88,-1.80,0.70],
  ],
  bonds: [
    [0,1],[0,2],[0,11],[11,12],[0,13],[13,14,2],[13,15],[15,16],
    [1,3],[3,5,2],[3,6],[6,7],[2,4],[4,8,2],[4,9],[9,10],
    [1,17],[1,18],[2,19],[2,20],
  ],
  he: 24,
  mos: [
    ['\u03C3 frame', [[0,2,0,0,'real',0.35],[1,2,0,0,'real',0.35],[2,2,0,0,'real',0.35],[3,2,0,0,'real',0.3],[4,2,0,0,'real',0.3],[13,2,0,0,'real',0.3]]],
    ['\u03C0(C=O)', [[3,2,1,1,'sin',0.45],[5,2,1,1,'sin',0.45],[4,2,1,1,'sin',0.40],[8,2,1,1,'sin',0.40],[13,2,1,1,'sin',0.40],[14,2,1,1,'sin',0.40]]],
    ['O lone pairs', [[6,2,1,1,'sin',0.4],[9,2,1,1,'sin',0.4],[11,2,1,1,'sin',0.4],[15,2,1,1,'sin',0.4]]],
    ['O-H \u03C3', [[7,1,0,0,'real',0.4],[10,1,0,0,'real',0.4],[12,1,0,0,'real',0.4],[16,1,0,0,'real',0.4]]],
  ]
});
MOLECULE_LABELS['Citric Acid'] = 'C\u2086H\u2088O\u2087 (Citric Acid)';

// ---- Vitamin C (Ascorbic Acid) ----
{
  // 5-membered lactone ring + enediol
  const R5 = 2.20;
  const atoms = [];
  for (let i = 0; i < 5; i++) {
    const [x,y,z] = pentPos(R5, i);
    atoms.push([i===3?'O':'C', x, y, z]); // ring: C0 C1 C2 O3 C4
  }
  // C=O on C4 (lactone)
  atoms.push(['O',pentPos(R5,4)[0]-1.80,0,pentPos(R5,4)[2]-1.20]); // 5: C4=O
  // OH on C0 and C1 (enediol)
  atoms.push(['O',pentPos(R5+2.70,0)[0],0,pentPos(R5+2.70,0)[2]]); // 6
  atoms.push(['H',pentPos(R5+4.53,0)[0],0,pentPos(R5+4.53,0)[2]]); // 7
  atoms.push(['O',pentPos(R5+2.70,1)[0],0,pentPos(R5+2.70,1)[2]]); // 8
  atoms.push(['H',pentPos(R5+4.53,1)[0],0,pentPos(R5+4.53,1)[2]]); // 9
  // Side chain: CHOH-CH₂OH on C2
  atoms.push(['C',pentPos(R5+2.88,2)[0],0,pentPos(R5+2.88,2)[2]]); // 10: CHOH
  atoms.push(['O',atoms[10][1]+2.70,0,atoms[10][3]]); // 11: OH
  atoms.push(['H',atoms[10][1]+4.53,0,atoms[10][3]]); // 12
  atoms.push(['C',atoms[10][1],0,atoms[10][3]-2.88]); // 13: CH₂OH
  atoms.push(['O',atoms[13][1]+2.70,0,atoms[13][3]]); // 14
  atoms.push(['H',atoms[13][1]+4.53,0,atoms[13][3]]); // 15
  atoms.push(['H',atoms[10][1],1.80,atoms[10][3]+0.70]); // 16
  atoms.push(['H',atoms[13][1]-1.80,0,atoms[13][3]-0.70]); // 17
  atoms.push(['H',atoms[13][1],1.80,atoms[13][3]+0.70]); // 18
  atoms.push(['H',pentPos(R5,2)[0],1.80,pentPos(R5,2)[2]+0.70]); // 19: H on C2
  addMol({
    name: 'Vitamin C', category: 'Vitamin',
    atoms,
    bonds: [
      [0,1,2],[1,2],[2,3],[3,4],[4,0],[4,5,2],
      [0,6],[6,7],[1,8],[8,9],[2,10],[10,11],[11,12],
      [10,13],[13,14],[14,15],[10,16],[13,17],[13,18],[2,19],
    ],
    he: 24,
    mos: [
      ['\u03C0(C=C)', [[0,2,1,1,'sin',0.65],[1,2,1,1,'sin',0.65]]],
      ['\u03C0(C=O)', [[4,2,1,1,'sin',0.65],[5,2,1,1,'sin',0.65]]],
      ['O lone pairs', [[3,2,1,1,'sin',0.5],[6,2,1,1,'sin',0.4],[8,2,1,1,'sin',0.4],[11,2,1,1,'sin',0.35],[14,2,1,1,'sin',0.35]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.3],[1,2,0,0,'real',0.3],[2,2,0,0,'real',0.3],[4,2,0,0,'real',0.3],[10,2,0,0,'real',0.3],[13,2,0,0,'real',0.3]]],
    ]
  });
  MOLECULE_LABELS['Vitamin C'] = 'C\u2086H\u2088O\u2086 (Ascorbic Acid)';
}

// ---- Adamantane (C₁₀H₁₆) ----
{
  // Diamond subcell: 4 bridgehead C at ±(1,1,1) even-parity,
  // 6 bridge C at midpoints of each bridgehead pair.
  // Scale so C-C = 2.88 Bohr (bridgehead-to-bridge distance).
  // Bridgeheads at (±1,±1,±1) with even parity, scaled by d/√2 where d=2.88
  const d = 2.88, sc = d / Math.sqrt(2); // ≈ 2.036
  const bh = [[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]]; // 4 bridgeheads
  // 6 bridges: midpoints of each pair of bridgeheads
  const brPairs = [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
  const atoms = [];
  const bonds = [];
  for (const b of bh) atoms.push(['C', b[0]*sc, b[1]*sc, b[2]*sc]); // 0-3
  for (const [i,j] of brPairs) {
    const mx = (bh[i][0]+bh[j][0])*sc/2;
    const my = (bh[i][1]+bh[j][1])*sc/2;
    const mz = (bh[i][2]+bh[j][2])*sc/2;
    atoms.push(['C', mx, my, mz]); // 4-9
  }
  // C-C bonds: each bridge connects to its 2 parent bridgeheads
  for (let k = 0; k < brPairs.length; k++) {
    bonds.push([brPairs[k][0], 4+k]);
    bonds.push([brPairs[k][1], 4+k]);
  }
  // 1 H per bridgehead (outward from cage center)
  for (let i = 0; i < 4; i++) {
    const [bx,by,bz] = bh[i];
    const r3 = Math.sqrt(3);
    atoms.push(['H', bx*sc + bx/r3*2.06, by*sc + by/r3*2.06, bz*sc + bz/r3*2.06]);
    bonds.push([i, 10+i]);
  }
  // 2 H per bridge (perpendicular to bond axis, pointing outward)
  for (let k = 0; k < brPairs.length; k++) {
    const ba = atoms[4+k];
    const a1 = atoms[brPairs[k][0]];
    // Bond axis direction
    const ax = a1[1]-ba[1], ay = a1[2]-ba[2], az = a1[3]-ba[3];
    const al = Math.sqrt(ax*ax+ay*ay+az*az)||1;
    const ux=ax/al, uy=ay/al, uz=az/al;
    // Reference vector not parallel to axis
    let rx=0, ry=1, rz=0;
    if (Math.abs(uy) > 0.9) { rx=1; ry=0; }
    // First perpendicular: cross(axis, ref)
    let p1x=uy*rz-uz*ry, p1y=uz*rx-ux*rz, p1z=ux*ry-uy*rx;
    const p1l = Math.sqrt(p1x*p1x+p1y*p1y+p1z*p1z)||1;
    p1x/=p1l; p1y/=p1l; p1z/=p1l;
    // Second perpendicular: cross(axis, p1)
    let p2x=uy*p1z-uz*p1y, p2y=uz*p1x-ux*p1z, p2z=ux*p1y-uy*p1x;
    const p2l = Math.sqrt(p2x*p2x+p2y*p2y+p2z*p2z)||1;
    p2x/=p2l; p2y/=p2l; p2z/=p2l;
    const h = 2.06;
    atoms.push(['H', ba[1]+h*p1x, ba[2]+h*p1y, ba[3]+h*p1z]);
    atoms.push(['H', ba[1]-h*p1x, ba[2]-h*p1y, ba[3]-h*p1z]);
    bonds.push([4+k, 14+k*2]);
    bonds.push([4+k, 15+k*2]);
  }
  addMol({
    name: 'Adamantane', category: 'Cage',
    atoms, bonds, he: 22,
    mos: [
      ['\u03C3(C-C) sym', [[0,2,0,0,'real',0.3],[1,2,0,0,'real',0.3],[2,2,0,0,'real',0.3],[3,2,0,0,'real',0.3],[4,2,0,0,'real',0.3],[5,2,0,0,'real',0.3],[6,2,0,0,'real',0.3],[7,2,0,0,'real',0.3],[8,2,0,0,'real',0.3],[9,2,0,0,'real',0.3]]],
      ['\u03C3(C-C) anti', [[0,2,1,0,'real',0.45],[1,2,1,0,'real',-0.45],[2,2,1,0,'real',0.45],[3,2,1,0,'real',-0.45]]],
      ['\u03C3(C-H) sym', [[10,1,0,0,'real',0.25],[11,1,0,0,'real',0.25],[12,1,0,0,'real',0.25],[13,1,0,0,'real',0.25]]],
      ['cage breathing', [[0,2,0,0,'real',0.4],[1,2,0,0,'real',0.4],[2,2,0,0,'real',0.4],[3,2,0,0,'real',0.4],[4,2,0,0,'real',-0.25],[5,2,0,0,'real',-0.25],[6,2,0,0,'real',-0.25],[7,2,0,0,'real',-0.25],[8,2,0,0,'real',-0.25],[9,2,0,0,'real',-0.25]]],
    ]
  });
  MOLECULE_LABELS['Adamantane'] = 'C\u2081\u2080H\u2081\u2086 (Adamantane)';
}

// ---- Buckminsterfullerene (C₆₀) ----
{
  const phi = (1 + Math.sqrt(5)) / 2;
  const rawVerts = [];
  // Generate truncated icosahedron vertices via even permutations
  const triples = [[0, 1, 3*phi], [2, 1+2*phi, phi], [1, 2+phi, 2*phi]];
  for (const [a,b,c] of triples) {
    // 3 cyclic permutations × all sign combos
    const perms = [[a,b,c],[c,a,b],[b,c,a]];
    for (const [p,q,r] of perms) {
      for (let si = 0; si < 8; si++) {
        const sx = (si&1)?-1:1, sy = (si&2)?-1:1, sz = (si&4)?-1:1;
        const v = [p*sx, q*sy, r*sz];
        // Check for duplicates (a=0 means some signs are redundant)
        const dup = rawVerts.some(u => Math.abs(u[0]-v[0])<0.01 && Math.abs(u[1]-v[1])<0.01 && Math.abs(u[2]-v[2])<0.01);
        if (!dup) rawVerts.push(v);
      }
    }
  }
  // Scale to C₆₀ radius (~6.7 Bohr)
  const dist0 = Math.sqrt(rawVerts[0][0]**2+rawVerts[0][1]**2+rawVerts[0][2]**2);
  const scale = 6.7 / dist0;
  const atoms = rawVerts.slice(0,60).map(v => ['C', v[0]*scale, v[1]*scale, v[2]*scale]);
  // Find bonds: adjacent vertices (distance ≈ edge length)
  const edgeLen = 2 * scale; // ideal edge = 2 in raw coordinates
  const bonds = [];
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i+1; j < atoms.length; j++) {
      const dx=atoms[i][1]-atoms[j][1], dy=atoms[i][2]-atoms[j][2], dz=atoms[i][3]-atoms[j][3];
      const d = Math.sqrt(dx*dx+dy*dy+dz*dz);
      if (d < edgeLen * 1.15) bonds.push([i,j]);
    }
  }
  addMol({
    name: 'C\u2086\u2080', category: 'Cage',
    atoms, bonds, he: 38,
    mos: [
      ['\u03C3 cage sym', atoms.slice(0,20).map((_,i) => [i,2,0,0,'real',0.22])],
      ['\u03C0 HOMO', atoms.slice(0,20).map((_,i) => [i,2,1,1,'sin', (i%2===0?0.22:-0.22)])],
      ['\u03C0 LUMO', atoms.slice(0,20).map((_,i) => [i,2,1,1,'cos', (i%3===0?0.25:-0.15)])],
    ]
  });
  MOLECULE_LABELS['C\u2086\u2080'] = 'C\u2086\u2080 (Buckminsterfullerene)';
}

// ============================================================
// Epinephrine (Adrenaline) — C₉H₁₃NO₃ — 26 atoms
// ============================================================
{
  const R = 2.64;
  const r = []; for (let i = 0; i < 6; i++) r.push(hexPos(R, i));
  // Catechol ring: C0-C5, OH on C2 and C3
  // Side chain extends outward from C0 in +x direction
  // OH groups point outward from ring center
  const atoms = [
    ['C', ...r[0]], ['C', ...r[1]], ['C', ...r[2]], ['C', ...r[3]],
    ['C', ...r[4]], ['C', ...r[5]],
    // H on ring: C1, C4, C5 (outward from center)
    ['H', r[1][0]/R*(R+2.06), 0, r[1][2]/R*(R+2.06)],  // 6
    ['H', r[4][0]/R*(R+2.06), 0, r[4][2]/R*(R+2.06)],  // 7
    ['H', r[5][0]/R*(R+2.06), 0, r[5][2]/R*(R+2.06)],  // 8
    // OH on C2 (outward: direction [-0.5, 0, 0.866])
    ['O', r[2][0]-1.35, 0, r[2][2]+2.34],  // 9
    ['H', r[2][0]-1.35, 0, r[2][2]+4.17],  // 10
    // OH on C3 (outward: direction [-1, 0, 0])
    ['O', r[3][0]-2.70, 0, r[3][2]],       // 11
    ['H', r[3][0]-4.53, 0, r[3][2]],       // 12
    // Side chain from C0 outward (+x): CH(OH)-CH₂-NH-CH₃
    ['C', r[0][0]+2.88, 0.5, r[0][2]],     // 13: C6
    ['H', r[0][0]+2.88, 2.56, r[0][2]],    // 14
    ['O', r[0][0]+3.50, -0.3, r[0][2]+2.70], // 15: OH on C6
    ['H', r[0][0]+3.50, -0.3, r[0][2]+4.53], // 16
    ['C', r[0][0]+5.76, 0, r[0][2]],       // 17: C7
    ['H', r[0][0]+5.76, 2.06, r[0][2]],    // 18
    ['H', r[0][0]+5.76, -2.06, r[0][2]],   // 19
    ['N', r[0][0]+8.52, 0, r[0][2]],       // 20: NH
    ['H', r[0][0]+8.52, 1.91, r[0][2]],    // 21
    ['C', r[0][0]+11.28, 0, r[0][2]],      // 22: CH₃
    ['H', r[0][0]+11.28, 0, r[0][2]+2.06], // 23
    ['H', r[0][0]+12.31, 1.03, r[0][2]-1.03], // 24
    ['H', r[0][0]+12.31, -1.03, r[0][2]-1.03], // 25
  ];
  const bonds = [
    [0,1,1.5],[1,2,1.5],[2,3,1.5],[3,4,1.5],[4,5,1.5],[5,0,1.5],
    [1,6],[4,7],[5,8],
    [2,9],[9,10],[3,11],[11,12],
    [0,13],[13,14],[13,15],[15,16],
    [13,17],[17,18],[17,19],
    [17,20],[20,21],
    [20,22],[22,23],[22,24],[22,25],
  ];
  addMol({
    name: 'Epinephrine', category: 'Neurotransmitter',
    atoms, bonds, he: 28,
    mos: [
      ['\u03C0 ring', [[0,2,1,1,'sin',0.33],[1,2,1,1,'sin',0.33],[2,2,1,1,'sin',0.33],[3,2,1,1,'sin',0.33],[4,2,1,1,'sin',0.33],[5,2,1,1,'sin',0.33]]],
      ['O lone pair (catechol)', [[9,2,1,1,'cos',0.8],[11,2,1,1,'cos',0.8]]],
      ['\u03C3(C-N)', [[17,2,1,0,'real',0.6],[20,2,1,0,'real',-0.6]]],
      ['N lone pair', [[20,2,1,1,'sin',1.0]]],
    ]
  });
  MOLECULE_LABELS['Epinephrine'] = 'C\u2089H\u2081\u2083NO\u2083 (Epinephrine)';
}

// ============================================================
// Norepinephrine — C₈H₁₁NO₃ — 23 atoms
// ============================================================
{
  const R = 2.64;
  const r = []; for (let i = 0; i < 6; i++) r.push(hexPos(R, i));
  const atoms = [
    ['C', ...r[0]], ['C', ...r[1]], ['C', ...r[2]], ['C', ...r[3]],
    ['C', ...r[4]], ['C', ...r[5]],
    ['H', r[1][0]/R*(R+2.06), 0, r[1][2]/R*(R+2.06)],
    ['H', r[4][0]/R*(R+2.06), 0, r[4][2]/R*(R+2.06)],
    ['H', r[5][0]/R*(R+2.06), 0, r[5][2]/R*(R+2.06)],
    ['O', r[2][0]-1.35, 0, r[2][2]+2.34],
    ['H', r[2][0]-1.35, 0, r[2][2]+4.17],
    ['O', r[3][0]-2.70, 0, r[3][2]],
    ['H', r[3][0]-4.53, 0, r[3][2]],
    ['C', r[0][0]+2.88, 0.5, r[0][2]],    // C6
    ['H', r[0][0]+2.88, 2.56, r[0][2]],
    ['O', r[0][0]+3.50, -0.3, r[0][2]+2.70],
    ['H', r[0][0]+3.50, -0.3, r[0][2]+4.53],
    ['C', r[0][0]+5.76, 0, r[0][2]],       // C7
    ['H', r[0][0]+5.76, 2.06, r[0][2]],
    ['H', r[0][0]+5.76, -2.06, r[0][2]],
    ['N', r[0][0]+8.52, 0, r[0][2]],       // NH₂
    ['H', r[0][0]+8.52, 1.91, r[0][2]],
    ['H', r[0][0]+9.46, -0.95, r[0][2]],
  ];
  const bonds = [
    [0,1,1.5],[1,2,1.5],[2,3,1.5],[3,4,1.5],[4,5,1.5],[5,0,1.5],
    [1,6],[4,7],[5,8],
    [2,9],[9,10],[3,11],[11,12],
    [0,13],[13,14],[13,15],[15,16],
    [13,17],[17,18],[17,19],
    [17,20],[20,21],[20,22],
  ];
  addMol({
    name: 'Norepinephrine', category: 'Neurotransmitter',
    atoms, bonds, he: 26,
    mos: [
      ['\u03C0 ring', [[0,2,1,1,'sin',0.33],[1,2,1,1,'sin',0.33],[2,2,1,1,'sin',0.33],[3,2,1,1,'sin',0.33],[4,2,1,1,'sin',0.33],[5,2,1,1,'sin',0.33]]],
      ['O lone pair (catechol)', [[9,2,1,1,'cos',0.8],[11,2,1,1,'cos',0.8]]],
      ['\u03C3(C-N)', [[17,2,1,0,'real',0.6],[20,2,1,0,'real',-0.6]]],
      ['N lone pair', [[20,2,1,1,'sin',1.0]]],
    ]
  });
  MOLECULE_LABELS['Norepinephrine'] = 'C\u2088H\u2081\u2081NO\u2083 (Norepinephrine)';
}

// ============================================================
// MDMA (Ecstasy) — C₁₁H₁₅NO₂ — 29 atoms
// ============================================================
{
  const R = 2.64;
  const r = []; for (let i = 0; i < 6; i++) r.push(hexPos(R, i));
  // Outward unit vectors for each ring atom
  const ou = r.map(p => [p[0]/R, 0, p[2]/R]);
  // Methylenedioxy on C2-C3: O-CH₂-O bridge (outward from center)
  const midx = (r[2][0]+r[3][0])/2, midz = (r[2][2]+r[3][2])/2;
  const ml = Math.sqrt(midx*midx+midz*midz)||1;
  const mnx = midx/ml, mnz = midz/ml;
  const atoms = [
    ['C', ...r[0]], ['C', ...r[1]], ['C', ...r[2]], ['C', ...r[3]],
    ['C', ...r[4]], ['C', ...r[5]],
    // H on C0, C1, C4 (outward)
    ['H', r[0][0]+ou[0][0]*2.06, 0, r[0][2]+ou[0][2]*2.06], // 6
    ['H', r[1][0]+ou[1][0]*2.06, 0, r[1][2]+ou[1][2]*2.06], // 7
    ['H', r[4][0]+ou[4][0]*2.06, 0, r[4][2]+ou[4][2]*2.06], // 8
    // Methylenedioxy bridge: O on C2, CH₂, O on C3
    ['O', r[2][0]+ou[2][0]*2.35, 0, r[2][2]+ou[2][2]*2.35],  // 9
    ['C', midx+mnx*4.50, 0, midz+mnz*4.50],                   // 10: CH₂
    ['O', r[3][0]+ou[3][0]*2.35, 0, r[3][2]+ou[3][2]*2.35],  // 11
    ['H', midx+mnx*4.50, 2.06, midz+mnz*4.50],                // 12
    ['H', midx+mnx*4.50, -2.06, midz+mnz*4.50],               // 13
    // Side chain from C5 outward: extend in ou[5] direction
    ['C', r[5][0]+ou[5][0]*2.88, 0, r[5][2]+ou[5][2]*2.88],  // 14: CH₂
    ['H', r[5][0]+ou[5][0]*2.88, 2.06, r[5][2]+ou[5][2]*2.88], // 15
    ['H', r[5][0]+ou[5][0]*2.88, -2.06, r[5][2]+ou[5][2]*2.88], // 16
    ['C', r[5][0]+ou[5][0]*5.76, 0, r[5][2]+ou[5][2]*5.76],  // 17: CH
    ['H', r[5][0]+ou[5][0]*5.76, 2.06, r[5][2]+ou[5][2]*5.76], // 18
    ['C', r[5][0]+ou[5][0]*5.76, 0, r[5][2]+ou[5][2]*5.76+2.88], // 19: CH₃ branch
    ['H', r[5][0]+ou[5][0]*5.76, 0, r[5][2]+ou[5][2]*5.76+4.94], // 20
    ['H', r[5][0]+ou[5][0]*5.76+1.03, 1.03, r[5][2]+ou[5][2]*5.76+3.41], // 21
    ['H', r[5][0]+ou[5][0]*5.76-1.03, -1.03, r[5][2]+ou[5][2]*5.76+3.41], // 22
    ['N', r[5][0]+ou[5][0]*8.52, 0, r[5][2]+ou[5][2]*8.52],  // 23: NH
    ['H', r[5][0]+ou[5][0]*8.52, 1.91, r[5][2]+ou[5][2]*8.52], // 24
    ['C', r[5][0]+ou[5][0]*11.28, 0, r[5][2]+ou[5][2]*11.28], // 25: N-CH₃
    ['H', r[5][0]+ou[5][0]*11.28, 0, r[5][2]+ou[5][2]*11.28+2.06], // 26
    ['H', r[5][0]+ou[5][0]*12.31, 1.03, r[5][2]+ou[5][2]*12.31-1.03], // 27
    ['H', r[5][0]+ou[5][0]*12.31, -1.03, r[5][2]+ou[5][2]*12.31-1.03], // 28
  ];
  const bonds = [
    [0,1,1.5],[1,2,1.5],[2,3,1.5],[3,4,1.5],[4,5,1.5],[5,0,1.5],
    [0,6],[1,7],[4,8],
    [2,9],[9,10],[10,11],[11,3],[10,12],[10,13], // methylenedioxy
    [5,14],[14,15],[14,16],[14,17],[17,18],
    [17,19],[19,20],[19,21],[19,22],
    [17,23],[23,24],
    [23,25],[25,26],[25,27],[25,28],
  ];
  addMol({
    name: 'MDMA', category: 'Drug',
    atoms, bonds, he: 28,
    mos: [
      ['\u03C0 ring', [[0,2,1,1,'sin',0.33],[1,2,1,1,'sin',0.33],[2,2,1,1,'sin',0.33],[3,2,1,1,'sin',0.33],[4,2,1,1,'sin',0.33],[5,2,1,1,'sin',0.33]]],
      ['O lone pair', [[9,2,1,1,'cos',0.8],[11,2,1,1,'cos',0.8]]],
      ['\u03C3(C-N)', [[17,2,1,0,'real',0.6],[23,2,1,0,'real',-0.6]]],
      ['N lone pair', [[23,2,1,1,'sin',1.0]]],
    ]
  });
  MOLECULE_LABELS['MDMA'] = 'C\u2081\u2081H\u2081\u2085NO\u2082 (MDMA)';
}

// ============================================================
// Cocaine — C₁₇H₂₁NO₄ — 43 atoms (simplified tropane skeleton)
// ============================================================
{
  // Tropane: bicyclo[2.2.1] ring with N bridge + benzoyl ester
  // Simplified: use tropane core + ester groups
  const atoms = [
    // Tropane core (7 atoms: N + 6C, bridged bicycle)
    ['N', 0, 1.5, 0],              // N0 bridge nitrogen
    ['C', -1.44, 0, 1.44],         // C1
    ['C', -1.44, 0, -1.44],        // C2
    ['C', 1.44, 0, 1.44],          // C3
    ['C', 1.44, 0, -1.44],         // C4
    ['C', 0, -1.5, 2.20],          // C5
    ['C', 0, -1.5, -2.20],         // C6
    // N-CH₃
    ['C', 0, 3.38, 0],             // C7 (N-methyl)
    ['H', 0, 5.44, 0], ['H', 1.78, 3.38, 0.85], ['H', -1.78, 3.38, 0.85],
    // H on ring carbons C1-C6
    ['H', -3.50, 0, 1.44], ['H', -3.50, 0, -1.44],
    ['H', 3.50, 0, 1.44], ['H', 3.50, 0, -1.44],
    ['H', 0, -3.56, 2.20], ['H', 0, -3.56, -2.20],
    // Carbomethoxy on C1: -COOCH₃
    ['C', -1.44, 0, 4.08],         // C8 (C=O)
    ['O', -2.71, 0, 5.30],         // O (=O)
    ['O', -0.17, 0, 5.50],         // O (ester)
    ['C', -0.17, 0, 8.20],         // C9 (OCH₃)
    ['H', -0.17, 2.06, 8.20], ['H', 1.61, -1.03, 8.20], ['H', -1.95, -1.03, 8.20],
    // Benzoyloxy on C2: -OCOC₆H₅
    ['O', -1.44, 0, -4.14],        // O10 (ester O)
    ['C', -1.44, 0, -6.41],        // C11 (C=O)
    ['O', -2.90, 0, -7.60],        // O12 (=O)
    // Phenyl ring on C11
    ['C', 0, 0, -8.05],            // C12 (ipso)
    ['C', 1.32, 0, -6.73],         // C13
    ['C', 2.64, 0, -8.05],         // C14
    ['C', 2.64, 0, -10.01],        // C15
    ['C', 1.32, 0, -11.33],        // C16
    ['C', 0, 0, -10.01],           // C17
    // H on phenyl
    ['H', 1.32, 0, -4.67], ['H', 4.70, 0, -8.05],
    ['H', 4.70, 0, -10.01], ['H', 1.32, 0, -13.39], ['H', -2.06, 0, -10.01],
  ];
  const bonds = [
    [0,1],[0,2],[0,7], // N connections
    [1,3],[2,4],[3,5],[4,6],[5,6], // tropane ring
    [7,8],[7,9],[7,10], // N-CH₃
    [1,11],[2,12],[3,13],[4,14],[5,15],[6,16], // ring H
    [1,17],[17,18,2],[17,19],[19,20],[20,21],[20,22],[20,23], // carbomethoxy
    [2,24],[24,25],[25,26,2], // benzoyloxy
    [25,27], // C=O to phenyl
    [27,28,1.5],[28,29,1.5],[29,30,1.5],[30,31,1.5],[31,32,1.5],[32,27,1.5], // phenyl
    [28,33],[29,34],[30,35],[31,36],[32,37], // phenyl H
  ];
  addMol({
    name: 'Cocaine', category: 'Drug',
    atoms, bonds, he: 30,
    mos: [
      ['\u03C0 phenyl', [[27,2,1,1,'sin',0.33],[28,2,1,1,'sin',0.33],[29,2,1,1,'sin',0.33],[30,2,1,1,'sin',0.33],[31,2,1,1,'sin',0.33],[32,2,1,1,'sin',0.33]]],
      ['\u03C3(C=O) ester', [[17,2,1,0,'real',0.6],[18,2,1,0,'real',-0.6]]],
      ['\u03C3(C=O) benzoyl', [[25,2,1,0,'real',0.6],[26,2,1,0,'real',-0.6]]],
      ['N lone pair', [[0,2,1,1,'sin',1.0]]],
    ]
  });
  MOLECULE_LABELS['Cocaine'] = 'C\u2081\u2087H\u2082\u2081NO\u2084 (Cocaine)';
}

// ============================================================
// Morphine — C₁₇H₁₉NO₃ — simplified 2-ring + substituents
// ============================================================
{
  // Two fused aromatic rings (naphthalene-like) + OH, O bridge, N-CH₃
  const a = 2.64, s30 = a*0.5, c30 = a*Math.sqrt(3)/2;
  // Ring A (left): atoms 0-5, ring B (right): shares 0,1 with A, adds 6-9
  const atoms = [
    ['C', 0, 0, a],        // 0: top shared
    ['C', 0, 0, -a],       // 1: bottom shared
    ['C', -c30, 0, a+s30], // 2
    ['C', -c30, 0, -a-s30],// 3
    ['C', -2*c30, 0, a],   // 4
    ['C', -2*c30, 0, -a],  // 5
    ['C', c30, 0, a+s30],  // 6
    ['C', c30, 0, -a-s30], // 7
    ['C', 2*c30, 0, a],    // 8
    ['C', 2*c30, 0, -a],   // 9
    // OH on C4 (phenol)
    ['O', -2*c30-2.70, 0, a],   // 10
    ['H', -2*c30-4.53, 0, a],   // 11
    // OH on C5
    ['O', -2*c30-2.70, 0, -a],  // 12
    ['H', -2*c30-4.53, 0, -a],  // 13
    // Ether O bridge above ring B
    ['O', 2*c30+1.35, 1.5, 0],  // 14
    // N-CH₃ on ring B
    ['N', 2*c30, 2.76, -a],     // 15
    ['C', 2*c30, 5.52, -a],     // 16 (CH₃)
    ['H', 2*c30+2.06, 5.52, -a],// 17
    ['H', 2*c30-1.03, 6.55, -a+1.78], // 18
    ['H', 2*c30-1.03, 6.55, -a-1.78], // 19
    // Ring H: on 2,3,6,7
    ['H', -c30-1.03, 0, a+s30+1.78],  // 20
    ['H', -c30-1.03, 0, -a-s30-1.78], // 21
    ['H', c30+1.03, 0, a+s30+1.78],   // 22
    ['H', c30+1.03, 0, -a-s30-1.78],  // 23
    // H on ring B outer: 8, 9
    ['H', 2*c30+2.06, 0, a],   // 24
    ['H', 2*c30+2.06, 0, -a],  // 25
    // H on N
    ['H', 2*c30, 2.76, -a-1.91],// 26
  ];
  const bonds = [
    [0,2,1.5],[2,4,1.5],[4,5,1.5],[5,3,1.5],[3,1,1.5],[1,0,1.5], // ring A
    [0,6,1.5],[6,8,1.5],[8,9,1.5],[9,7,1.5],[7,1,1.5], // ring B
    [4,10],[10,11], // phenol OH
    [5,12],[12,13], // OH
    [8,14],[9,14], // ether bridge
    [9,15],[15,16],[16,17],[16,18],[16,19], // N-CH₃
    [2,20],[3,21],[6,22],[7,23],[8,24],[9,25], // ring H
    [15,26], // N-H
  ];
  addMol({
    name: 'Morphine', category: 'Drug',
    atoms, bonds, he: 26,
    mos: [
      ['\u03C0 ring A', [[0,2,1,1,'sin',0.33],[1,2,1,1,'sin',0.33],[2,2,1,1,'sin',0.33],[3,2,1,1,'sin',0.33],[4,2,1,1,'sin',0.33],[5,2,1,1,'sin',0.33]]],
      ['\u03C0 ring B', [[0,2,1,1,'sin',0.2],[1,2,1,1,'sin',0.2],[6,2,1,1,'sin',0.33],[7,2,1,1,'sin',0.33],[8,2,1,1,'sin',0.33],[9,2,1,1,'sin',0.33]]],
      ['O lone pair', [[10,2,1,1,'cos',0.8],[12,2,1,1,'cos',0.8],[14,2,1,1,'cos',0.8]]],
      ['N lone pair', [[15,2,1,1,'sin',1.0]]],
    ]
  });
  MOLECULE_LABELS['Morphine'] = 'C\u2081\u2087H\u2081\u2089NO\u2083 (Morphine)';
}

// ============================================================
// THC (Δ⁹-Tetrahydrocannabinol) — C₂₁H₃₀O₂ — simplified
// ============================================================
{
  // 3 fused 6-rings (A aromatic, B cyclohexene, C pyran) + pentyl + methyls
  const a = 2.64, s30 = a*0.5, c30 = a*Math.sqrt(3)/2;
  // Ring A aromatic: 0-5 (center at origin)
  // Ring B fused at 4-5 edge of A (right side)
  // Ring C pyran fused at 0-5 edge of A (left side)
  // Shared atoms: A shares edge 4-5 with B, and 0-5 with C
  // For 3-ring linear fusion like anthracene:
  //   Left ring A: center at (-2*c30, 0)
  //   Middle ring shares atoms, center at origin
  //   Right ring B: center at (2*c30, 0)
  // But THC has rings A,B,C sharing atom 5 (index 5 at bottom of A)
  // Simpler: build all atoms explicitly
  const atoms = [
    // Ring A (aromatic): planar in xz
    ['C', 0, 0, a],        // 0: top
    ['C', 0, 0, -a],       // 1: bottom
    ['C', -c30, 0, a+s30], // 2
    ['C', -c30, 0, -a-s30],// 3
    ['C', -2*c30, 0, a],   // 4: shared with C
    ['C', -2*c30, 0, -a],  // 5: shared with B and C
    // Ring B fused at 1-5: 4 new atoms (6-9)
    ['C', -2*c30-c30, 0, -a-s30], // 6
    ['C', -2*c30-c30, 0, -a-s30-a], // 7
    ['C', -2*c30-2*c30, 0, -a-s30-a+s30], // 8
    ['C', -2*c30-2*c30, 0, -a], // 9: fused back to 5
    // Ring C (pyran) fused at 4-5: atom 4 and 5 shared, 4 new + O
    ['O', -2*c30-c30, 0, a+s30], // 10: O
    ['C', -2*c30-2*c30, 0, a],   // 11
    ['C', -2*c30-2*c30, 0, -a+2*s30], // 12 (simplified)
    // OH on C2
    ['O', -c30-1.35, 0, a+s30+2.34], // 13
    ['H', -c30-1.35, 0, a+s30+4.17], // 14
    // H on ring A: C0, C3
    ['H', 2.06, 0, a],     // 15
    ['H', -c30-1.03, 0, -a-s30-1.78], // 16
    // Pentyl chain on C0
    ['C', 2.88, 0, a],     // 17
    ['C', 5.76, 0, a],     // 18
    ['C', 8.64, 0, a],     // 19
    ['C', 11.52, 0, a],    // 20
    ['C', 14.40, 0, a],    // 21
    // Gem-dimethyl on C8
    ['C', -2*c30-2*c30, 2.88, -a-s30-a+s30], // 22
    ['C', -2*c30-2*c30, -2.88, -a-s30-a+s30], // 23
  ];
  const bonds = [
    [0,2,1.5],[2,4,1.5],[4,5,1.5],[5,1,1.5],[1,3,1.5],[3,0,1.5], // ring A (reversed to standard order is fine)
    [1,6],[6,7],[7,8],[8,9],[9,5], // ring B
    [4,10],[10,11],[11,12],[12,5], // ring C pyran
    [2,13],[13,14], // OH
    [0,15],[3,16], // ring H
    [0,17],[17,18],[18,19],[19,20],[20,21], // pentyl
    [8,22],[8,23], // gem-dimethyl
  ];
  addMol({
    name: 'THC', category: 'Drug',
    atoms, bonds, he: 30,
    mos: [
      ['\u03C0 ring A', [[0,2,1,1,'sin',0.33],[1,2,1,1,'sin',0.33],[2,2,1,1,'sin',0.33],[3,2,1,1,'sin',0.33],[4,2,1,1,'sin',0.33],[5,2,1,1,'sin',0.33]]],
      ['O lone pair (phenol)', [[13,2,1,1,'cos',0.8]]],
      ['O lone pair (pyran)', [[10,2,1,1,'cos',0.8]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.2],[1,2,0,0,'real',0.2],[2,2,0,0,'real',0.2],[3,2,0,0,'real',0.2],[4,2,0,0,'real',0.2],[5,2,0,0,'real',0.2],[6,2,0,0,'real',0.2],[7,2,0,0,'real',0.2],[8,2,0,0,'real',0.2],[9,2,0,0,'real',0.2]]],
    ]
  });
  MOLECULE_LABELS['THC'] = 'C\u2082\u2081H\u2083\u2080O\u2082 (THC)';
}

// ============================================================
// CBD (Cannabidiol) — C₂₁H₃₀O₂ — simplified
// ============================================================
{
  // Aromatic ring + separate cyclohexenyl ring connected by single bond + pentyl
  const R = 2.64;
  const rA = []; for (let i = 0; i < 6; i++) rA.push(hexPos(R, i));
  // Ring B: separate cyclohexene ring, centered 2*2.88 away from ring A in x direction
  const bCx = rA[4][0] - 2*2.88;
  const rB = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    rB.push([bCx + 2.88*Math.cos(angle), 0, 2.88*Math.sin(angle)]);
  }
  const atoms = [
    // Ring A: aromatic resorcinol (C0-C5)
    ['C', ...rA[0]], ['C', ...rA[1]], ['C', ...rA[2]], ['C', ...rA[3]],
    ['C', ...rA[4]], ['C', ...rA[5]],
    // OH on C0
    ['O', rA[0][0]+2.70, 0, rA[0][2]], // 6
    ['H', rA[0][0]+4.53, 0, rA[0][2]], // 7
    // OH on C4 (pointing up to avoid ring B)
    ['O', rA[4][0], 2.70, rA[4][2]], // 8
    ['H', rA[4][0], 4.53, rA[4][2]], // 9
    // H on C1, C3 (up to avoid ring B), C5
    ['H', rA[1][0]/R*(R+2.06), 0, rA[1][2]/R*(R+2.06)], // 10
    ['H', rA[3][0], -2.06, rA[3][2]], // 11: point down to avoid ring B
    ['H', rA[5][0]/R*(R+2.06), 0, rA[5][2]/R*(R+2.06)], // 12
    // Ring B: cyclohexene (C13-C18)
    ['C', ...rB[0]], ['C', ...rB[1]], ['C', ...rB[2]], ['C', ...rB[3]],
    ['C', ...rB[4]], ['C', ...rB[5]], // 13-18
    // Pentyl on C2 (extending along z)
    ['C', rA[2][0], 0, rA[2][2]+2.88],  // 19
    ['C', rA[2][0], 0, rA[2][2]+5.76],  // 20
    ['C', rA[2][0], 0, rA[2][2]+8.64],  // 21
    ['C', rA[2][0], 0, rA[2][2]+11.52], // 22
    ['C', rA[2][0], 0, rA[2][2]+14.40], // 23
    // Methyl on ring B C15
    ['C', rB[2][0], 2.88, rB[2][2]], // 24
    // Isopropenyl on ring B C18
    ['C', rB[5][0], 0, rB[5][2]-2.88],  // 25
    ['C', rB[5][0]-1.27, 0, rB[5][2]-5.13], // 26
    ['C', rB[5][0]+1.27, 0, rB[5][2]-5.13], // 27
  ];
  const bonds = [
    [0,1,1.5],[1,2,1.5],[2,3,1.5],[3,4,1.5],[4,5,1.5],[5,0,1.5],
    [0,6],[6,7],[4,8],[8,9],
    [1,10],[3,11],[5,12],
    [4,13], // single bond connecting A to B
    [13,14],[14,15,2],[15,16],[16,17],[17,18],[18,13], // ring B
    [2,19],[19,20],[20,21],[21,22],[22,23], // pentyl
    [15,24], // methyl
    [18,25],[25,26,2],[25,27], // isopropenyl
  ];
  addMol({
    name: 'CBD', category: 'Drug',
    atoms, bonds, he: 32,
    mos: [
      ['\u03C0 ring A', [[0,2,1,1,'sin',0.33],[1,2,1,1,'sin',0.33],[2,2,1,1,'sin',0.33],[3,2,1,1,'sin',0.33],[4,2,1,1,'sin',0.33],[5,2,1,1,'sin',0.33]]],
      ['O lone pair', [[6,2,1,1,'cos',0.8],[8,2,1,1,'cos',0.8]]],
      ['\u03C0(C=C) ring B', [[14,2,1,1,'sin',0.5],[15,2,1,1,'sin',-0.5]]],
      ['\u03C0(C=C) isopropenyl', [[25,2,1,1,'sin',0.5],[26,2,1,1,'sin',-0.5]]],
    ]
  });
  MOLECULE_LABELS['CBD'] = 'C\u2082\u2081H\u2083\u2080O\u2082 (CBD)';
}

// ============================================================
// Monosodium Glutamate (MSG) — C₅H₈NNaO₄ — 19 atoms
// ============================================================
addMol({
  name: 'MSG', category: 'Amino Acid',
  atoms: [
    // Glutamate backbone: NH₂-CH-CH₂-CH₂-COO⁻ with COO-Na
    ['N', -5.76, 0, 0],      // 0: NH₂
    ['H', -6.73, 1.03, 0.85],
    ['H', -6.73, -1.03, 0.85],
    ['C', -2.88, 0, 0],      // 3: alpha C
    ['H', -2.88, 2.06, 0],
    ['C', -2.88, 0, -2.88],  // 5: COO⁻ (alpha)
    ['O', -4.49, 0, -4.49],  // 6: =O (d=2.27)
    ['O', -1.27, 0, -4.49],  // 7: O⁻
    ['C', 0, 0, 0],          // 8: beta CH₂
    ['H', 0, 2.06, 0],
    ['H', 0, -2.06, 0],
    ['C', 2.88, 0, 0],       // 11: gamma CH₂
    ['H', 2.88, 2.06, 0],
    ['H', 2.88, -2.06, 0],
    ['C', 5.76, 0, 0],       // 14: delta COO⁻ Na⁺
    ['O', 7.37, 0, 1.60],    // 15: =O (d=2.27)
    ['O', 7.37, 0, -1.60],   // 16: O⁻
    ['Na', 9.50, 0, -1.60],
    ['H', -2.88, -2.06, 0],  // 18: extra H on alpha
  ],
  bonds: [
    [0,3],[0,1],[0,2],
    [3,4],[3,5],[3,8],
    [5,6,2],[5,7],
    [8,9],[8,10],[8,11],
    [11,12],[11,13],[11,14],
    [14,15,2],[14,16],
  ],
  he: 24,
  mos: [
    ['\u03C3(C-N)', [[3,2,1,0,'real',0.6],[0,2,1,0,'real',-0.6]]],
    ['N lone pair', [[0,2,1,1,'sin',1.0]]],
    ['\u03C3(C=O) \u03B1', [[5,2,1,0,'real',0.6],[6,2,1,0,'real',-0.6]]],
    ['\u03C3(C=O) \u03B4', [[14,2,1,0,'real',0.6],[15,2,1,0,'real',-0.6]]],
  ]
});
MOLECULE_LABELS['MSG'] = 'C\u2085H\u2088NNaO\u2084 (MSG)';

// ============================================================
// Sorbitol — C₆H₁₄O₆ — 26 atoms
// ============================================================
{
  // Linear sugar alcohol: HOCH₂-(CHOH)₄-CH₂OH
  // Zigzag chain along z-axis
  const atoms = [];
  const bonds = [];
  const cz = [-7.20, -4.32, -1.44, 1.44, 4.32, 7.20]; // 6 carbons spaced 2.88 apart
  for (let i = 0; i < 6; i++) {
    const cx = (i % 2 === 0) ? 0.5 : -0.5;
    atoms.push(['C', cx, 0, cz[i]]);
  }
  // C-C bonds
  for (let i = 0; i < 5; i++) bonds.push([i, i+1]);
  let ai = 6;
  // OH and H on each carbon
  for (let i = 0; i < 6; i++) {
    const cx = atoms[i][1];
    if (i === 0 || i === 5) {
      // terminal: CH₂OH (2H + OH)
      atoms.push(['H', cx+2.06, 0, cz[i]]);
      atoms.push(['H', cx-2.06, 0, cz[i]]);
      atoms.push(['O', cx, 1.83, cz[i]+(i===0?-1.5:1.5)]);
      atoms.push(['H', cx, 3.66, cz[i]+(i===0?-1.5:1.5)]);
      bonds.push([i, ai], [i, ai+1], [i, ai+2], [ai+2, ai+3]);
      ai += 4;
    } else {
      // interior: CHOH (1H + OH)
      atoms.push(['H', cx+(i%2===0?2.06:-2.06), 0, cz[i]]);
      atoms.push(['O', cx+(i%2===0?-2.70:2.70), 0, cz[i]]);
      atoms.push(['H', cx+(i%2===0?-4.53:4.53), 0, cz[i]]);
      bonds.push([i, ai], [i, ai+1], [ai+1, ai+2]);
      ai += 3;
    }
  }
  addMol({
    name: 'Sorbitol', category: 'Sugar',
    atoms, bonds, he: 24,
    mos: [
      ['\u03C3(C-C) chain', [[0,2,0,0,'real',0.25],[1,2,0,0,'real',0.25],[2,2,0,0,'real',0.25],[3,2,0,0,'real',0.25],[4,2,0,0,'real',0.25],[5,2,0,0,'real',0.25]]],
      ['O lone pair', atoms.filter(a=>a[0]==='O').slice(0,4).map((_,i) => [6+i*3+(i<1?2:1),2,1,1,'cos',0.7])],
      ['\u03C3(O-H)', atoms.filter(a=>a[0]==='O').slice(0,3).map((_,i) => [6+i*3+(i<1?2:1),2,0,0,'real',0.5])],
    ]
  });
  MOLECULE_LABELS['Sorbitol'] = 'C\u2086H\u2081\u2084O\u2086 (Sorbitol)';
}

// ============================================================
// Malic Acid — C₄H₆O₅ — 15 atoms
// ============================================================
addMol({
  name: 'Malic Acid', category: 'Acid',
  atoms: [
    ['C', -4.32, 0, 0],      // 0: C0 (COOH)
    ['O', -5.93, 0, 1.60],   // 1: =O (d=2.27)
    ['O', -5.93, 0, -1.60],  // 2: OH
    ['H', -5.93, 0, -3.43],
    ['C', -1.44, 0, 0],      // 4: C1 (CH₂)
    ['H', -1.44, 2.06, 0],
    ['H', -1.44, -2.06, 0],
    ['C', 1.44, 0, 0],       // 7: C2 (CHOH)
    ['H', 1.44, 2.06, 0],
    ['O', 1.44, 0, 2.70],    // 9: OH
    ['H', 1.44, 0, 4.53],
    ['C', 4.32, 0, 0],       // 11: C3 (COOH)
    ['O', 5.93, 0, 1.60],    // 12: =O (d=2.27)
    ['O', 5.93, 0, -1.60],   // 13: OH
    ['H', 5.93, 0, -3.43],
  ],
  bonds: [
    [0,1,2],[0,2],[2,3],
    [0,4],[4,5],[4,6],
    [4,7],[7,8],[7,9],[9,10],
    [7,11],[11,12,2],[11,13],[13,14],
  ],
  he: 18,
  mos: [
    ['\u03C3(C=O) sym', [[0,2,1,0,'real',0.6],[1,2,1,0,'real',-0.5],[11,2,1,0,'real',0.6],[12,2,1,0,'real',-0.5]]],
    ['O lone pair', [[9,2,1,1,'cos',0.9]]],
    ['\u03C3(C-C) chain', [[0,2,0,0,'real',0.3],[4,2,0,0,'real',0.3],[7,2,0,0,'real',0.3],[11,2,0,0,'real',0.3]]],
  ]
});
MOLECULE_LABELS['Malic Acid'] = 'C\u2084H\u2086O\u2085 (Malic Acid)';

// ============================================================
// Vitamin A (Retinol) — C₂₀H₃₀O — 51 atoms (simplified)
// ============================================================
{
  // Beta-ionone ring + polyene chain + OH
  const R = 2.88; // cyclohexene ring (not aromatic)
  const ring = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    ring.push([R * Math.cos(angle), 0, R * Math.sin(angle)]);
  }
  const atoms = [
    // Ring: C0-C5 (cyclohexene with gem-dimethyl at C0)
    ['C', ...ring[0]], ['C', ...ring[1]], ['C', ...ring[2]], ['C', ...ring[3]],
    ['C', ...ring[4]], ['C', ...ring[5]],
    // Gem-dimethyl on C0
    ['C', ring[0][0]+2.88, 1.44, ring[0][2]],
    ['C', ring[0][0]+2.88, -1.44, ring[0][2]],
    // Methyl on C1
    ['C', ring[1][0], 2.88, ring[1][2]],
    // Polyene chain from C5: alternating C=C-C=C... (11 carbons)
    ['C', ring[5][0]-2.53, 0, ring[5][2]+1.27],     // C9
    ['C', ring[5][0]-5.06, 0, ring[5][2]+1.27],     // C10
    ['C', ring[5][0]-7.59, 0, ring[5][2]+2.54],     // C11
    ['C', ring[5][0]-10.12, 0, ring[5][2]+2.54],    // C12
    ['C', ring[5][0]-12.65, 0, ring[5][2]+3.81],    // C13
    ['C', ring[5][0]-15.18, 0, ring[5][2]+3.81],    // C14 (end)
    // OH at terminal
    ['O', ring[5][0]-17.88, 0, ring[5][2]+3.81],
    ['H', ring[5][0]-19.71, 0, ring[5][2]+3.81],
    // Methyl branches on chain
    ['C', ring[5][0]-7.59, 2.88, ring[5][2]+2.54],  // CH₃ on C11
    ['C', ring[5][0]-12.65, 2.88, ring[5][2]+3.81], // CH₃ on C13
  ];
  const bonds = [
    [0,1],[1,2,2],[2,3],[3,4],[4,5],[5,0], // ring
    [0,6],[0,7], // gem-dimethyl
    [1,8], // methyl on C1
    [5,9,2],[9,10],[10,11,2],[11,12],[12,13,2],[13,14], // polyene
    [14,15],[15,16], // OH
    [11,17],[13,18], // methyl branches
  ];
  addMol({
    name: 'Vitamin A', category: 'Vitamin',
    atoms, bonds, he: 34,
    mos: [
      ['\u03C0 polyene', [[9,2,1,1,'sin',0.3],[10,2,1,1,'sin',-0.3],[11,2,1,1,'sin',0.3],[12,2,1,1,'sin',-0.3],[13,2,1,1,'sin',0.3],[14,2,1,1,'sin',-0.3]]],
      ['\u03C0(C=C) ring', [[1,2,1,1,'sin',0.5],[2,2,1,1,'sin',-0.5]]],
      ['O lone pair', [[15,2,1,1,'cos',0.9]]],
      ['\u03C3 frame', [[0,2,0,0,'real',0.2],[1,2,0,0,'real',0.2],[2,2,0,0,'real',0.2],[3,2,0,0,'real',0.2],[4,2,0,0,'real',0.2],[5,2,0,0,'real',0.2]]],
    ]
  });
  MOLECULE_LABELS['Vitamin A'] = 'C\u2082\u2080H\u2083\u2080O (Retinol)';
}

// ============================================================
// Vitamin D₃ (Cholecalciferol) — C₂₇H₄₄O — simplified
// ============================================================
{
  // Secosteroid: ring C (cyclohexane) fused to ring D (cyclopentane),
  // triene from ring C, ring A fragment with OH, side chain from ring D.
  // All coordinates explicit in xz plane.
  const b = 2.88; // C-C single bond
  const r6 = []; for (let i = 0; i < 6; i++) r6.push(hexPos(b, i));
  // Ring C using hexPos: C0-C5
  // Ring D: cyclopentane fused at C1-C2 edge of ring C
  // Midpoint of C1-C2 shared edge
  const mx12 = (r6[1][0]+r6[2][0])/2, mz12 = (r6[1][2]+r6[2][2])/2;
  // Outward direction from ring C center toward midpoint
  const ol = Math.sqrt(mx12*mx12+mz12*mz12)||1;
  const onx = mx12/ol, onz = mz12/ol;
  // 3 extra atoms for ring D, placed outward from shared edge
  const d5r = 2.40; // pentane ring radius
  // Edge direction of C1-C2
  const edx = r6[2][0]-r6[1][0], edz = r6[2][2]-r6[1][2];
  const el = Math.sqrt(edx*edx+edz*edz)||1;
  const epx = -edz/el, epz = edx/el; // perpendicular outward
  // Check which direction is outward (same as onx,onz)
  const dot = epx*onx + epz*onz;
  const opx = dot > 0 ? epx : -epx, opz = dot > 0 ? epz : -epz;
  // Ring D apex and two side atoms
  const d6x = r6[1][0] + opx*b*0.7, d6z = r6[1][2] + opz*b*0.7;
  const d8x = r6[2][0] + opx*b*0.7, d8z = r6[2][2] + opz*b*0.7;
  const d7x = mx12 + opx*b*1.3, d7z = mz12 + opz*b*1.3;

  const atoms = [
    // Ring C: C0-C5
    ['C', ...r6[0]], ['C', ...r6[1]], ['C', ...r6[2]], ['C', ...r6[3]],
    ['C', ...r6[4]], ['C', ...r6[5]],
    // Ring D: C6, C7 (apex), C8 — fused at C1,C2
    ['C', d6x, 0, d6z],  // 6
    ['C', d7x, 0, d7z],  // 7
    ['C', d8x, 0, d8z],  // 8
    // Triene from C5 (broken B-ring): C=C-C=C extending outward
    ['C', r6[5][0]/b*(b+2.53)*0.87, 0, r6[5][2]/b*(b+2.53)*0.87 - 1.27], // 9
    ['C', r6[5][0]/b*(b+5.06)*0.80, 0, r6[5][2]/b*(b+5.06)*0.80 - 2.54], // 10
    // Ring A fragment: 2 carbons + OH at end of triene
    ['C', r6[5][0]/b*(b+7.59)*0.75, 0, r6[5][2]/b*(b+7.59)*0.75 - 3.81], // 11
    ['O', r6[5][0]/b*(b+7.59)*0.75 - 2.70, 0, r6[5][2]/b*(b+7.59)*0.75 - 3.81], // 12: OH
    ['H', r6[5][0]/b*(b+7.59)*0.75 - 4.53, 0, r6[5][2]/b*(b+7.59)*0.75 - 3.81], // 13
    // Side chain from ring D atom 7: 3 carbons extending outward
    ['C', d7x + opx*2.88, 0, d7z + opz*2.88], // 14
    ['C', d7x + opx*5.76, 0, d7z + opz*5.76], // 15
    ['C', d7x + opx*8.64, 0, d7z + opz*8.64], // 16
    // Methyl groups
    ['C', r6[0][0], 2.88, r6[0][2]], // 17: CH₃ on C0
    ['C', d6x, 2.88, d6z],           // 18: CH₃ on C6
  ];
  const bonds = [
    [0,1],[1,2],[2,3],[3,4],[4,5],[5,0], // ring C
    [1,6],[6,7],[7,8],[8,2], // ring D
    [5,9,2],[9,10],[10,11,2],[11,12],[12,13], // triene + OH
    [7,14],[14,15],[15,16], // side chain
    [0,17],[6,18], // methyls
  ];
  addMol({
    name: 'Vitamin D\u2083', category: 'Vitamin',
    atoms, bonds, he: 28,
    mos: [
      ['\u03C0 triene', [[5,2,1,1,'sin',0.4],[9,2,1,1,'sin',-0.4],[10,2,1,1,'sin',0.4],[11,2,1,1,'sin',-0.4]]],
      ['O lone pair', [[12,2,1,1,'cos',0.9]]],
      ['\u03C3 ring C', [[0,2,0,0,'real',0.25],[1,2,0,0,'real',0.25],[2,2,0,0,'real',0.25],[3,2,0,0,'real',0.25],[4,2,0,0,'real',0.25],[5,2,0,0,'real',0.25]]],
      ['\u03C3 ring D', [[1,2,0,0,'real',0.2],[2,2,0,0,'real',0.2],[6,2,0,0,'real',0.3],[7,2,0,0,'real',0.3],[8,2,0,0,'real',0.3]]],
    ]
  });
  MOLECULE_LABELS['Vitamin D\u2083'] = 'C\u2082\u2087H\u2084\u2084O (Cholecalciferol)';
}

// ============================================================
// Sucralose — C₁₂H₁₉Cl₃O₈ — 42 atoms (simplified)
// ============================================================
{
  // Sucrose with 3 OH→Cl substitutions
  // Glucose ring (pyranose) + fructose ring (furanose), linked
  const R = 2.88;
  // Glucose ring: 5C + 1O in chair
  const gR = [];
  for (let i = 0; i < 6; i++) {
    const h = chairHexPos(R, i, 0.47);
    gR.push(h);
  }
  // Fructose ring: 4C + 1O (furanose, 5-membered)
  // Position fructose so glycosidic O is 2.70 from glucose C4 and 2.70 from fructose C6
  // gR[4] is glucose C4 position. Place glycosidic O 2.70 along +z from gR[4]
  const glyOz = gR[4][2] + 2.70;
  // Fructose C6 at 2.70 further along z from glycosidic O
  const fBaseZ = glyOz + 2.70;
  const fR = [];
  for (let i = 0; i < 5; i++) {
    const p = pentPos(2.40, i);
    fR.push([p[0], p[1], p[2] + fBaseZ]);
  }

  const atoms = [
    // Glucose ring: C0-C4 + O5
    ['C', ...gR[0]], ['C', ...gR[1]], ['C', ...gR[2]], ['C', ...gR[3]],
    ['C', ...gR[4]], ['O', ...gR[5]],
    // Fructose ring: C6-C9 + O10
    ['C', ...fR[0]], ['C', ...fR[1]], ['C', ...fR[2]], ['C', ...fR[3]],
    ['O', ...fR[4]],
    // Glycosidic O
    ['O', 0, 0, glyOz],
    // Cl substituents (3)
    ['Cl', gR[0][0]+3.32, gR[0][1], gR[0][2]],
    ['Cl', fR[1][0]-3.32, fR[1][1], fR[1][2]],
    ['Cl', fR[3][0]+3.32, fR[3][1], fR[3][2]],
    // OH groups (5 remaining)
    ['O', gR[1][0]-2.70, gR[1][1], gR[1][2]], ['H', gR[1][0]-4.53, gR[1][1], gR[1][2]],
    ['O', gR[2][0]+2.70, gR[2][1], gR[2][2]], ['H', gR[2][0]+4.53, gR[2][1], gR[2][2]],
    ['O', gR[3][0]-2.70, gR[3][1], gR[3][2]], ['H', gR[3][0]-4.53, gR[3][1], gR[3][2]],
    ['O', fR[0][0]+2.70, fR[0][1], fR[0][2]], ['H', fR[0][0]+4.53, fR[0][1], fR[0][2]],
    ['O', fR[2][0]-2.70, fR[2][1], fR[2][2]], ['H', fR[2][0]-4.53, fR[2][1], fR[2][2]],
    // CH₂OH on fructose
    ['C', fR[0][0], fR[0][1], fR[0][2]+2.88],
    ['O', fR[0][0]+2.70, fR[0][1], fR[0][2]+2.88+1.83],
    ['H', fR[0][0]+4.53, fR[0][1], fR[0][2]+2.88+1.83],
  ];
  const bonds = [
    [0,1],[1,2],[2,3],[3,4],[4,5],[5,0], // glucose ring
    [6,7],[7,8],[8,9],[9,10],[10,6], // fructose ring
    [4,11],[11,6], // glycosidic linkage
    [0,12],[7,13],[9,14], // Cl
    [1,15],[15,16],[2,17],[17,18],[3,19],[19,20], // glucose OH
    [6,21],[21,22],[8,23],[23,24], // fructose OH
    [6,25],[25,26],[26,27], // CH₂OH
  ];
  addMol({
    name: 'Sucralose', category: 'Sugar',
    atoms, bonds, he: 30,
    mos: [
      ['\u03C3(C-Cl)', [[0,2,1,0,'real',0.5],[12,3,1,0,'real',-0.5]]],
      ['O lone pair', [[5,2,1,1,'cos',0.7],[10,2,1,1,'cos',0.7],[11,2,1,1,'cos',0.7]]],
      ['\u03C3(C-O) ring', [[0,2,0,0,'real',0.3],[1,2,0,0,'real',0.3],[2,2,0,0,'real',0.3],[3,2,0,0,'real',0.3],[4,2,0,0,'real',0.3]]],
    ]
  });
  MOLECULE_LABELS['Sucralose'] = 'C\u2081\u2082H\u2081\u2089Cl\u2083O\u2088 (Sucralose)';
}

// ============================================================
// Glycylglycine (simplest dipeptide) — C₄H₈N₂O₃ — 17 atoms
// ============================================================
addMol({
  name: 'Glycylglycine', category: 'Peptide',
  atoms: [
    // NH₂-CH₂-CO-NH-CH₂-COOH
    ['N', -7.20, 0, 0],       // NH₂
    ['H', -8.17, 1.03, 0.85],
    ['H', -8.17, -1.03, 0.85],
    ['C', -4.32, 0, 0],       // alpha C1
    ['H', -4.32, 2.06, 0],
    ['H', -4.32, -2.06, 0],
    ['C', -1.44, 0, 0],       // C=O (peptide bond)
    ['O', -1.44, 0, 2.27],    // =O
    ['N', 1.32, 0, 0],        // NH (peptide bond)
    ['H', 1.32, 1.91, 0],
    ['C', 4.20, 0, 0],        // alpha C2
    ['H', 4.20, 2.06, 0],
    ['H', 4.20, -2.06, 0],
    ['C', 7.08, 0, 0],        // COOH
    ['O', 8.69, 0, 1.60],
    ['O', 8.69, 0, -1.60],
    ['H', 8.69, 0, -3.43],
  ],
  bonds: [
    [0,3],[0,1],[0,2], // NH₂ - alpha C1
    [3,4],[3,5],[3,6], // alpha C1
    [6,7,2],[6,8], // peptide bond C=O and C-N
    [8,9],[8,10], // NH - alpha C2
    [10,11],[10,12],[10,13], // alpha C2
    [13,14,2],[13,15],[15,16], // COOH
  ],
  he: 22,
  mos: [
    ['\u03C3(C=O) peptide', [[6,2,1,0,'real',0.65],[7,2,1,0,'real',-0.65]]],
    ['\u03C0(C=O) peptide', [[6,2,1,1,'sin',0.5],[7,2,1,1,'sin',-0.5]]],
    ['N lone pair (NH\u2082)', [[0,2,1,1,'sin',1.0]]],
    ['\u03C3(C=O) acid', [[13,2,1,0,'real',0.65],[14,2,1,0,'real',-0.65]]],
  ]
});
MOLECULE_LABELS['Glycylglycine'] = 'C\u2084H\u2088N\u2082O\u2083 (Glycylglycine)';
