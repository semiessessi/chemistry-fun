// Molecule infrastructure: registration, orbital generation, and context management.

import * as THREE from 'three';
import { add } from '../orbitals.js';
import { evaluateOrbital } from '../math.js';
import { scene } from '../scene.js';
import { ELEMENTS } from './element-data.js';
import { detectAromaticRings, renderAtoms, renderBonds, renderAromaticRings } from './bond-rendering.js';

// ---- Context mesh tracking ----

let contextMeshes = [];
export let trackedAtoms = [];  // [{mesh, label, atomIdx, origPos, origLabelPos}]
let trackedBonds = [];  // [{mesh, atomI, atomJ, origPos, origQuat, origScaleY, midOffset, lengthRatio}]

// ---- Molecule registry (for context rendering) ----

const MOLECULES = {};
export { MOLECULES };  // Export for validation and debugging tools

// ---- Display labels: maps internal name → "Formula (Name)" for dropdowns ----
export const MOLECULE_LABELS = {};

// ---- Category tracking ----
export const MOLECULE_CATEGORIES = {}; // name → category string

// ---- Variant tracking ----
const MOLECULE_VARIANTS = {}; // name → variants array

// ---- PubChem CID tracking ----
const MOLECULE_CIDS = {}; // name → CID number
const MOLECULE_NIST = {}; // name → true if geometry from NIST CCCBDB

// ---- Multi-source citation tracking ----
const MOLECULE_SOURCES = {}; // name → sources object

// ---- Atom data access (for electrostatic field computation) ----
export function getMoleculeAtoms(name) {
  const mol = MOLECULES[name];
  return mol ? mol.atoms : null; // [[element, x, y, z], ...]
}

export function getMoleculeVariants(name) {
  return MOLECULE_VARIANTS[name] || null;
}

export function getMoleculeCid(name) {
  return MOLECULE_CIDS[name] || null;
}

export function getMoleculeNist(name) {
  return !!MOLECULE_NIST[name];
}

export function getMoleculeSources(name) {
  return MOLECULE_SOURCES[name] || null;
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
  if (mol.variants) MOLECULE_VARIANTS[mol.name] = mol.variants;
  if (mol.pubchemCid) MOLECULE_CIDS[mol.name] = mol.pubchemCid;
  if (mol.nistSource) MOLECULE_NIST[mol.name] = true;

  // Handle sources metadata (new multi-source citation system)
  if (mol.sources) {
    MOLECULE_SOURCES[mol.name] = mol.sources;
  } else {
    // Backward compatibility: auto-generate sources from legacy fields
    const sources = {};
    if (mol.pubchemCid) {
      sources.geometry = {
        type: 'pubchem',
        id: mol.pubchemCid,
        citation: `PubChem Compound Database`,
        url: `https://pubchem.ncbi.nlm.nih.gov/compound/${mol.pubchemCid}`
      };
    } else if (mol.nistSource) {
      sources.geometry = {
        type: 'nist',
        citation: 'NIST Computational Chemistry Comparison and Benchmark Database',
        url: 'https://cccbdb.nist.gov/'
      };
    }
    if (Object.keys(sources).length > 0) {
      MOLECULE_SOURCES[mol.name] = sources;
    }
  }
  const moOrbitals = [];
  const mosList = mol.mos || [];
  for (let i = 0; i < mosList.length; i++) {
    const mo = mosList[i];
    const moName = mo[0];
    const termDefs = mo[1];
    const terms = termDefs.map(td => {
      const [atomIdx, n, l, m, angType, coeff, rot] = td;
      const pos = mol.atoms[atomIdx];
      const term = { n, l, m, angType, center: [pos[1], pos[2], pos[3]], coeff };
      if (rot) term.rot = rot;
      return term;
    });
    const fullName = mol.name + ' ' + moName;
    add({
      name: fullName,
      terms,
      halfExtent: mol.he,
      d1: 'Molecules', d2: mol.name, d3: moName, d4: null,
      molecule: mol.name,
      moIndex: i,
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

  // Electrostatic potential: V(r) = V_nuc(r) + V_el(r)
  // Uses density sampler for initial grid, then transforms to potential in the load pathway
  add({
    name: mol.name + ' electrostatic potential',
    customSample: densitySampler,
    halfExtent: mol.he,
    d1: 'Molecules', d2: mol.name, d3: 'electrostatic potential', d4: null,
    molecule: mol.name,
    isElectrostaticPotential: true,
  });

  // Charge density: ρ_nuclear(Gaussian-smeared) − ρ_electronic
  // Positive near nuclei, negative in electron cloud; rendered as red/blue lobes
  add({
    name: mol.name + ' charge visualisation',
    customSample: densitySampler,
    halfExtent: mol.he,
    d1: 'Molecules', d2: mol.name, d3: 'charge visualisation', d4: null,
    molecule: mol.name,
    isChargeDensity: true,
  });

  // Electron Localization Function (ELF)
  // Computed from per-MO grids in a separate loading pathway
  add({
    name: mol.name + ' ELF',
    halfExtent: mol.he,
    d1: 'Molecules', d2: mol.name, d3: 'ELF', d4: null,
    molecule: mol.name,
    isELF: true,
  });
}

// ---- Displacement mechanism for vibrations ----

export function getMoleculeData(name) { return MOLECULES[name]; }

export function buildDisplacedOrbital(moleculeName, moIndex, displacements) {
  const mol = MOLECULES[moleculeName];
  if (!mol) return null;
  const [moName, termDefs] = mol.mos[moIndex];
  const terms = termDefs.map(td => {
    const [atomIdx, n, l, m, angType, coeff, rot] = td;
    const term = {
      n, l, m, angType, coeff,
      center: [
        mol.atoms[atomIdx][1] + displacements[atomIdx][0],
        mol.atoms[atomIdx][2] + displacements[atomIdx][1],
        mol.atoms[atomIdx][3] + displacements[atomIdx][2],
      ],
    };
    if (rot) term.rot = rot;
    return term;
  });
  return { name: `${moleculeName} ${moName}`, terms, halfExtent: mol.he };
}

export function buildDisplacedDensitySampler(moleculeName, displacements) {
  const mol = MOLECULES[moleculeName];
  if (!mol) return null;
  const moOrbitals = mol.mos.map((_, i) => buildDisplacedOrbital(moleculeName, i, displacements));
  return {
    name: `${moleculeName} density (vibrating)`,
    customSample: (x, y, z) => {
      let rho = 0;
      for (const mo of moOrbitals) {
        const psi = evaluateOrbital(mo, x, y, z);
        rho += 2 * psi * psi;
      }
      return Math.sqrt(rho);
    },
    halfExtent: mol.he,
  };
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

  // Render atoms and labels
  renderAtoms(mol, contextMeshes, trackedAtoms);

  // Render bonds
  renderBonds(mol, aroRingBonds, contextMeshes, trackedBonds);

  // Render aromatic ring tori
  renderAromaticRings(mol, aroRings, contextMeshes);

  // Add all meshes to scene
  for (const m of contextMeshes) scene.add(m);
}

export function clearMoleculeContext() {
  for (const m of contextMeshes) {
    scene.remove(m);
    // Don't dispose shared geometries/materials; just remove from scene
  }
  contextMeshes = [];
  trackedAtoms = [];
  trackedBonds = [];
}

export function setMoleculeContextVisible(visible) {
  for (const m of contextMeshes) m.visible = visible;
}

// Pre-allocated temporaries for updateMoleculeContextPositions (zero GC pressure)
const _up = new THREE.Vector3(0, 1, 0);
const _newDir = new THREE.Vector3();
const _newQuat = new THREE.Quaternion();
const _deltaQuat = new THREE.Quaternion();
const _rotOffset = new THREE.Vector3();

export function updateMoleculeContextPositions(moleculeName, displacements) {
  const mol = MOLECULES[moleculeName];
  if (!mol || !displacements) return;

  for (const { mesh, ghost, label, atomIdx, origPos, origLabelPos } of trackedAtoms) {
    const d = displacements[atomIdx];
    mesh.position.set(origPos.x + d[0], origPos.y + d[1], origPos.z + d[2]);
    if (ghost) ghost.position.copy(mesh.position);
    if (label && label.baseLayer && label.additiveLayer) {
      // New dual-layer label system: update both sprites
      const newPos = new THREE.Vector3(origLabelPos.x + d[0], origLabelPos.y + d[1], origLabelPos.z + d[2]);
      label.baseLayer.position.copy(newPos);
      label.additiveLayer.position.copy(newPos);
      label.atomPos.set(origPos.x + d[0], origPos.y + d[1], origPos.z + d[2]);
    } else if (label) {
      // Legacy fallback (single sprite)
      label.position.set(origLabelPos.x + d[0], origLabelPos.y + d[1], origLabelPos.z + d[2]);
    }
  }

  for (const bond of trackedBonds) {
    const { mesh, atomI, atomJ, origQuat, midOffset, lengthRatio } = bond;
    const di = displacements[atomI], dj = displacements[atomJ];
    const a = mol.atoms[atomI], b = mol.atoms[atomJ];

    // New displaced atom positions
    const ax = a[1] + di[0], ay = a[2] + di[1], az = a[3] + di[2];
    const bx = b[1] + dj[0], by = b[2] + dj[1], bz = b[3] + dj[2];

    // New direction and length
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const newLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (newLen < 1e-6) continue;

    _newDir.set(dx / newLen, dy / newLen, dz / newLen);
    _newQuat.setFromUnitVectors(_up, _newDir);

    // Rotate perpendicular offset from old orientation to new
    _deltaQuat.copy(origQuat).invert().premultiply(_newQuat);
    _rotOffset.copy(midOffset).applyQuaternion(_deltaQuat);

    // Apply new midpoint + rotated offset, new rotation, new length
    mesh.position.set(
      (ax + bx) / 2 + _rotOffset.x,
      (ay + by) / 2 + _rotOffset.y,
      (az + bz) / 2 + _rotOffset.z,
    );
    mesh.quaternion.copy(_newQuat);
    mesh.scale.y = newLen * lengthRatio;
  }
}

export function resetMoleculeContextPositions() {
  for (const { mesh, ghost, label, origPos, origLabelPos } of trackedAtoms) {
    mesh.position.copy(origPos);
    if (ghost) ghost.position.copy(origPos);
    if (label && label.baseLayer && label.additiveLayer) {
      // New dual-layer label system: update both sprites
      label.baseLayer.position.copy(origLabelPos);
      label.additiveLayer.position.copy(origLabelPos);
      label.atomPos.copy(origPos);
    } else if (label) {
      // Legacy fallback (single sprite)
      label.position.copy(origLabelPos);
    }
  }
  for (const { mesh, origPos, origQuat, origScaleY } of trackedBonds) {
    mesh.position.copy(origPos);
    mesh.quaternion.copy(origQuat);
    mesh.scale.y = origScaleY;
  }
}
