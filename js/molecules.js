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
const torusGeo = new THREE.TorusGeometry(1, 0.04, 8, 48);

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

// ---- addMol factory ----

function addMol(mol) {
  MOLECULES[mol.name] = mol;
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
  if (aroAdj.size < 6) return [];
  const rings = [], seen = new Set();
  for (const start of aroAdj.keys()) {
    (function dfs(node, path) {
      if (path.length === 6) {
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

  // Aromatic ring torus
  for (const ring of aroRings) {
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
    // TorusGeometry default: ring in XY plane, normal along Z
    torus.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    torus.scale.setScalar(ringR * 0.8);
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
