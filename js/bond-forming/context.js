// Bond-forming context: orbital registration + THREE.js mesh management.

import * as THREE from 'three';
import { add } from '../orbitals.js';
import { scene } from '../scene.js';
import {
  generateH2Orbital, generateN2Orbital, generateO2Orbital, generateCOOrbital,
  generateCO2Orbital, generateO3Orbital
} from './orbital-generators.js';
import {
  generateH2Density, generateN2Density, generateO2Density, generateCODensity,
  generateCO2Density, generateO3Density
} from './density-samplers.js';
import { BOND_CONFIGS, TRIATOMIC_CONFIGS, ELEM_STYLE, BOND_FORMING_CONFIG } from './configs.js';

const O3_THETA = 116.8 * Math.PI / 180;

// ============================================================
// Register orbital entries
// ============================================================

// ---- H₂ ----
add({
  name: 'H\u2082 \u03C3 bonding (dynamic)',
  terms: generateH2Orbital('bonding', BOND_CONFIGS['H\u2082'].R_EQ).terms,
  halfExtent: 10,
  d1: 'Bond Formation', d2: 'H\u2082', d3: '\u03C3 bonding', d4: null,
  bondForming: { type: 'bonding', generate: (R) => generateH2Orbital('bonding', R), molecule: 'H\u2082' },
});
add({
  name: 'H\u2082 \u03C3* antibonding (dynamic)',
  terms: generateH2Orbital('antibonding', BOND_CONFIGS['H\u2082'].R_EQ).terms,
  halfExtent: 10,
  d1: 'Bond Formation', d2: 'H\u2082', d3: '\u03C3* antibonding', d4: null,
  bondForming: { type: 'antibonding', generate: (R) => generateH2Orbital('antibonding', R), molecule: 'H\u2082' },
});
add({
  name: 'H\u2082 electron density (dynamic)',
  ...generateH2Density(BOND_CONFIGS['H\u2082'].R_EQ),
  d1: 'Bond Formation', d2: 'H\u2082', d3: 'electron density', d4: null,
  bondForming: { type: 'density', generate: (R) => generateH2Density(R), molecule: 'H\u2082' },
});

// ---- N₂ ----
const N2_REQ = BOND_CONFIGS['N\u2082'].R_EQ;
const N2_TYPES = [
  ['sigma_2s', '\u03C3(2s)'], ['sigma_star_2s', '\u03C3*(2s)'],
  ['pi_2p', '\u03C0(2p)'], ['sigma_2p', '\u03C3(2p)'], ['pi_star_2p', '\u03C0*(2p)'],
];
for (const [type, label] of N2_TYPES) {
  add({
    name: `N\u2082 ${label} (dynamic)`,
    terms: generateN2Orbital(type, N2_REQ).terms,
    halfExtent: 12,
    d1: 'Bond Formation', d2: 'N\u2082', d3: label, d4: null,
    bondForming: { type, generate: (R, ori) => generateN2Orbital(type, R, ori), molecule: 'N\u2082' },
  });
}
add({
  name: 'N\u2082 electron density (dynamic)',
  ...generateN2Density(N2_REQ),
  d1: 'Bond Formation', d2: 'N\u2082', d3: 'electron density', d4: null,
  bondForming: { type: 'density', generate: (R, ori) => generateN2Density(R, ori), molecule: 'N\u2082' },
});

// ---- O₂ ----
const O2_REQ = BOND_CONFIGS['O\u2082'].R_EQ;
const O2_TYPES = [
  ['sigma_2s', '\u03C3(2s)'], ['sigma_2p', '\u03C3(2p)'],
  ['pi_2p', '\u03C0(2p)'], ['pi_star_2px', '\u03C0*(2px)'], ['pi_star_2py', '\u03C0*(2py)'],
];
for (const [type, label] of O2_TYPES) {
  add({
    name: `O\u2082 ${label} (dynamic)`,
    terms: generateO2Orbital(type, O2_REQ).terms,
    halfExtent: 12,
    d1: 'Bond Formation', d2: 'O\u2082', d3: label, d4: null,
    bondForming: { type, generate: (R, ori) => generateO2Orbital(type, R, ori), molecule: 'O\u2082' },
  });
}
add({
  name: 'O\u2082 electron density (dynamic)',
  ...generateO2Density(O2_REQ),
  d1: 'Bond Formation', d2: 'O\u2082', d3: 'electron density', d4: null,
  bondForming: { type: 'density', generate: (R, ori) => generateO2Density(R, ori), molecule: 'O\u2082' },
});

// ---- CO ----
const CO_REQ = BOND_CONFIGS['CO'].R_EQ;
const CO_TYPES = [
  ['sigma_2s', '\u03C3(2s)'], ['sigma_star_2s', '\u03C3*(2s)'],
  ['pi_2p', '\u03C0(2p)'], ['sigma_2p', '\u03C3(2p)'], ['pi_star_2p', '\u03C0*(2p)'],
];
for (const [type, label] of CO_TYPES) {
  add({
    name: `CO ${label} (dynamic)`,
    terms: generateCOOrbital(type, CO_REQ).terms,
    halfExtent: 12,
    d1: 'Bond Formation', d2: 'CO', d3: label, d4: null,
    bondForming: { type, generate: (R, ori) => generateCOOrbital(type, R, ori), molecule: 'CO' },
  });
}
add({
  name: 'CO electron density (dynamic)',
  ...generateCODensity(CO_REQ),
  d1: 'Bond Formation', d2: 'CO', d3: 'electron density', d4: null,
  bondForming: { type: 'density', generate: (R, ori) => generateCODensity(R, ori), molecule: 'CO' },
});

// ---- CO₂ (triatomic) ----
const CO2_CFG = TRIATOMIC_CONFIGS['CO\u2082'];
const CO2_EQ = [[0, 0, -CO2_CFG.morse[0].R_EQ], [0, 0, 0], [0, 0, CO2_CFG.morse[1].R_EQ]];

const CO2_TYPES = [
  ['sigma_2s', '\u03C3(2s)'], ['sigma_2p', '\u03C3(2p)'],
  ['pi_2p', '\u03C0(2p)'], ['pi_star_2p', '\u03C0*(2p)'],
];
for (const [type, label] of CO2_TYPES) {
  const eq = generateCO2Orbital(type, CO2_EQ);
  add({
    name: `CO\u2082 ${label} (dynamic)`,
    terms: eq.terms,
    halfExtent: eq.halfExtent,
    d1: 'Bond Formation', d2: 'CO\u2082', d3: label, d4: null,
    bondForming: {
      type, molecule: 'CO\u2082',
      triatomic: CO2_CFG,
      generate3: (pos, ori) => generateCO2Orbital(type, pos, ori),
    },
  });
}
add({
  name: 'CO\u2082 electron density (dynamic)',
  ...generateCO2Density(CO2_EQ),
  d1: 'Bond Formation', d2: 'CO\u2082', d3: 'electron density', d4: null,
  bondForming: {
    type: 'density', molecule: 'CO\u2082',
    triatomic: CO2_CFG,
    generate3: (pos, ori) => generateCO2Density(pos, ori),
  },
});

// ---- O₃ (triatomic) ----
const O3_CFG = TRIATOMIC_CONFIGS['O\u2083'];
const O3_HALF = O3_THETA / 2;
const O3_D = O3_CFG.morse[0].R_EQ;
const O3_EQ = [
  [O3_D * Math.sin(O3_HALF), 0, O3_D * Math.cos(O3_HALF)],
  [0, 0, 0],
  [-O3_D * Math.sin(O3_HALF), 0, O3_D * Math.cos(O3_HALF)],
];

const O3_TYPES = [
  ['sigma_2s', '\u03C3(2s)'], ['sigma_star_2s', '\u03C3*(2s)'], ['nb_2s', 'nb(2s)'],
  ['sigma_sym', '\u03C3 sym'], ['pi_deloc', '\u03C0 deloc'],
  ['pi_star', '\u03C0* anti'], ['lone_pair', 'lone pair'],
  ['sigma_star', '\u03C3* anti'], ['lp_outer', 'lp outer'],
];
for (const [type, label] of O3_TYPES) {
  const eq = generateO3Orbital(type, O3_EQ);
  add({
    name: `O\u2083 ${label} (dynamic)`,
    terms: eq.terms,
    halfExtent: eq.halfExtent,
    d1: 'Bond Formation', d2: 'O\u2083', d3: label, d4: null,
    bondForming: {
      type, molecule: 'O\u2083',
      triatomic: O3_CFG,
      generate3: (pos, ori) => generateO3Orbital(type, pos, ori),
    },
  });
}
add({
  name: 'O\u2083 electron density (dynamic)',
  ...generateO3Density(O3_EQ),
  d1: 'Bond Formation', d2: 'O\u2083', d3: 'electron density', d4: null,
  bondForming: {
    type: 'density', molecule: 'O\u2083',
    triatomic: O3_CFG,
    generate3: (pos, ori) => generateO3Density(pos, ori),
  },
});

// ============================================================
// Context mesh management (supports 2 or 3 atoms)
// ============================================================

const sphereGeo = new THREE.SphereGeometry(1, 16, 12);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
const atomMaterials = [
  new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 60 }),
  new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 60 }),
  new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 60 }),
];
const bondMaterial = new THREE.MeshPhongMaterial({
  color: 0x666666, shininess: 30, transparent: true, opacity: 1.0, side: THREE.DoubleSide,
});

let contextGroup = null;
let spheres = [null, null, null];
let bondGroups = [[], []]; // arrays of cylinder meshes per bond
let currentBondOrders = [1, 1];
let activeAtomCount = 2;

function getBondPerp(dir) {
  const ref = Math.abs(dir.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  return new THREE.Vector3().crossVectors(ref, dir).normalize();
}

function ensureContextGroup() {
  if (contextGroup) return;
  contextGroup = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    spheres[i] = new THREE.Mesh(sphereGeo, atomMaterials[i]);
    spheres[i].scale.setScalar(0.3);
    contextGroup.add(spheres[i]);
  }
}

function clearBondGroup(bondIdx) {
  for (const cyl of bondGroups[bondIdx]) {
    if (cyl.parent) cyl.parent.remove(cyl);
  }
  bondGroups[bondIdx] = [];
}

function createBondCylinders(bondIdx, order) {
  ensureContextGroup();
  clearBondGroup(bondIdx);
  const count = order === 3 ? 3 : order === 2 ? 2 : order === 1.5 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const cyl = new THREE.Mesh(cylGeo, bondMaterial);
    contextGroup.add(cyl);
    bondGroups[bondIdx].push(cyl);
  }
  currentBondOrders[bondIdx] = order;
}

function setBondGroupVisible(bondIdx, visible) {
  for (const cyl of bondGroups[bondIdx]) cyl.visible = visible;
}

function orientBondGroup(bondIdx, posA, posB) {
  const cyls = bondGroups[bondIdx];
  if (!cyls.length) return;
  const mid = new THREE.Vector3().addVectors(posA, posB).multiplyScalar(0.5);
  const diff = new THREE.Vector3().subVectors(posB, posA);
  const len = diff.length();
  if (len < 0.01) return;
  const dir = diff.clone().divideScalar(len);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const perp = getBondPerp(dir);
  const order = currentBondOrders[bondIdx];

  if (order === 1 || cyls.length === 1) {
    cyls[0].position.copy(mid);
    cyls[0].scale.set(0.12, len, 0.12);
    cyls[0].quaternion.copy(quat);
  } else if (order === 2) {
    const off = perp.clone().multiplyScalar(0.12);
    cyls[0].position.copy(mid.clone().add(off));
    cyls[0].scale.set(0.08, len, 0.08);
    cyls[0].quaternion.copy(quat);
    cyls[1].position.copy(mid.clone().sub(off));
    cyls[1].scale.set(0.08, len, 0.08);
    cyls[1].quaternion.copy(quat);
  } else if (order === 3) {
    const perp2 = new THREE.Vector3().crossVectors(dir, perp).normalize();
    for (let k = 0; k < 3; k++) {
      const angle = (k * 2 * Math.PI) / 3;
      const off = perp.clone().multiplyScalar(Math.cos(angle) * 0.14)
        .add(perp2.clone().multiplyScalar(Math.sin(angle) * 0.14));
      cyls[k].position.copy(mid.clone().add(off));
      cyls[k].scale.set(0.07, len, 0.07);
      cyls[k].quaternion.copy(quat);
    }
  } else if (order === 1.5) {
    cyls[0].position.copy(mid);
    cyls[0].scale.set(0.08, len, 0.08);
    cyls[0].quaternion.copy(quat);
    const off = perp.clone().multiplyScalar(0.14);
    cyls[1].position.copy(mid.clone().add(off));
    cyls[1].scale.set(0.06, len * 0.45, 0.06);
    cyls[1].quaternion.copy(quat);
  }
}

export function setContextMode(numAtoms, bondOrders) {
  ensureContextGroup();
  activeAtomCount = numAtoms;
  spheres[2].visible = numAtoms >= 3;
  const orders = bondOrders || [1, 1];
  createBondCylinders(0, orders[0] || 1);
  createBondCylinders(1, numAtoms >= 3 ? (orders[1] || 1) : 1);
  setBondGroupVisible(1, numAtoms >= 3);
}

export function showBondFormingContext(R) {
  ensureContextGroup();
  const halfR = R / 2;
  const posA = new THREE.Vector3(0, 0, -halfR);
  const posB = new THREE.Vector3(0, 0, halfR);
  spheres[0].position.copy(posA);
  spheres[1].position.copy(posB);
  orientBondGroup(0, posA, posB);
  if (!contextGroup.parent) scene.add(contextGroup);
}

export function showBondFormingContextAtPositions(posA, posB) {
  ensureContextGroup();
  spheres[0].position.copy(posA);
  spheres[1].position.copy(posB);
  orientBondGroup(0, posA, posB);
  if (!contextGroup.parent) scene.add(contextGroup);
}

export function showTriatomicContext(positions, bondPairs) {
  ensureContextGroup();
  for (let i = 0; i < 3; i++) {
    const p = positions[i];
    spheres[i].position.set(p.x !== undefined ? p.x : p[0], p.y !== undefined ? p.y : p[1], p.z !== undefined ? p.z : p[2]);
  }
  for (let b = 0; b < bondPairs.length && b < 2; b++) {
    const [bi, bj] = bondPairs[b];
    orientBondGroup(b, spheres[bi].position, spheres[bj].position);
  }
  if (!contextGroup.parent) scene.add(contextGroup);
}

function bondOpacity(R, rEq) {
  const solidAt = rEq * 1.5;
  const fadeEnd = rEq * 4;
  if (R > fadeEnd) return 0;
  if (R <= solidAt) return 1;
  return 1 - (R - solidAt) / (fadeEnd - solidAt);
}

export function setBondCylinderOpacity(R) {
  ensureContextGroup();
  const opacity = bondOpacity(R, BOND_FORMING_CONFIG.R_EQ);
  bondMaterial.opacity = opacity;
  for (const cyl of bondGroups[0]) {
    cyl.visible = opacity > 0.01;
  }
}

export function setTriatomicBondOpacity(bondDistances, morseConfigs) {
  ensureContextGroup();
  bondMaterial.opacity = 0;
  for (let b = 0; b < bondDistances.length && b < 2; b++) {
    const rEq = morseConfigs ? morseConfigs[b].R_EQ : 2.5;
    const opacity = bondOpacity(bondDistances[b], rEq);
    bondMaterial.opacity = Math.max(bondMaterial.opacity, opacity);
    const visible = opacity > 0.01;
    for (const cyl of bondGroups[b]) cyl.visible = visible;
  }
}

export function clearBondFormingContext() {
  if (contextGroup && contextGroup.parent) {
    scene.remove(contextGroup);
  }
}

export function setBondFormingContextVisible(visible) {
  if (contextGroup) contextGroup.visible = visible;
}

export function setContextAtomStyle(elements) {
  ensureContextGroup();
  const elems = typeof elements === 'string' ? [elements, elements] : elements;
  for (let i = 0; i < elems.length && i < 3; i++) {
    const style = ELEM_STYLE[elems[i]] || ELEM_STYLE.H;
    atomMaterials[i].color.setHex(style.color);
    spheres[i].scale.setScalar(style.radius);
  }
}
