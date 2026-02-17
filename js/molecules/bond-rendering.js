// Bond rendering: cylinders, aromatic rings, and helper utilities.

import * as THREE from 'three';
import { ELEMENTS, sphereGeo, cylGeo, torusGeo, getElementMaterial, bondMaterial } from './element-data.js';

// ---- Helper utilities ----

export function getPerpendicularVector(dir) {
  const ref = Math.abs(dir.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  return new THREE.Vector3().crossVectors(ref, dir).normalize();
}

export function detectAromaticRings(mol) {
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

export function makeAtomLabel(elem, x, y, z) {
  // Use luminance of the element color to decide white vs black text
  const elemHex = ELEMENTS[elem]?.color ?? 0x888888;
  const lr = (elemHex >> 16) & 0xff;
  const lg = (elemHex >> 8)  & 0xff;
  const lb =  elemHex        & 0xff;
  const luminance = (0.299 * lr + 0.587 * lg + 0.114 * lb) / 255;
  const usesBlackText = luminance > 0.5;

  // Per-element text colour overrides; all others get plain white or black
  const TEXT_TINT = { C: '#aaaaaa', O: '#ffcc44' };
  const textColor   = TEXT_TINT[elem] ?? (usesBlackText ? '#000000' : '#ffffff');
  const strokeColor = usesBlackText ? '#ffffff' : '#000000';

  // 8x resolution for ultra-crisp antialiased labels
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: false });

  // Enable high-quality antialiasing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Bold font for light-background elements (black text), regular for dark
  ctx.font = usesBlackText ? '900 176px sans-serif' : '176px sans-serif';  // 22 * 8
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Draw stroke (outline) for better contrast - scaled to 8x
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = usesBlackText ? 5.0 : 12.0;
  ctx.strokeText(elem, 256, 256);  // Center: 32 * 8

  // Draw fill
  ctx.fillStyle = textColor;
  ctx.fillText(elem, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 16;  // Maximum anisotropic filtering

  // Dual-pass rendering: faint base + faintest punchthrough
  const baseOpacity = 1.0;
  const baseLayer = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture.clone(),
      transparent: true,
      opacity: baseOpacity,
      depthTest: true,   // Gets occluded by geometry
      depthWrite: false, // Don't write to depth buffer (prevents square artifacts)
      blending: THREE.NormalBlending
    })
  );

  const additiveLayer = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.1,  // Faintest punchthrough
      depthTest: false,  // Always on top
      depthWrite: false, // Don't write to depth buffer
      blending: THREE.NormalBlending  // Alpha blending: black darkens, white lightens
    })
  );

  // Scale label with atom radius, plus per-element fine-tuning
  const baseScale = 1.2 * (ELEMENTS[elem]?.radius ?? 0.4) / 0.4;
  const LABEL_BOOST = { S: 1.4, C: 1.05, N: 1.1, O: 1.1 };
  const labelScale = baseScale * (LABEL_BOOST[elem] ?? 1.0);

  // Position in front of atom (will be updated by camera-facing logic)
  baseLayer.position.set(x, y + 0.6, z);
  additiveLayer.position.set(x, y + 0.6, z);
  baseLayer.scale.set(labelScale, labelScale, 1);
  additiveLayer.scale.set(labelScale, labelScale, 1);

  // Render order: base EARLY (gets occluded), additive LATE (punches through)
  baseLayer.renderOrder = 100;  // Low = renders first
  additiveLayer.renderOrder = 2000;  // High = renders last

  // Return container object with both sprites and atom position
  return {
    baseLayer,
    additiveLayer,
    atomPos: new THREE.Vector3(x, y, z),
    elem
  };
}

/**
 * Update atom label positions to face camera
 * @param {Array} trackedAtoms - Array of tracked atom objects with {mesh, label, ...}
 * @param {THREE.Camera} camera - Three.js camera
 * @param {number} offset - Distance in front of atom (default 0.6)
 */
export function updateAtomLabelPositions(trackedAtoms, camera, offset = 0.6) {
  const camDir = new THREE.Vector3();
  for (const tracked of trackedAtoms) {
    if (!tracked.label || !tracked.label.atomPos) continue;

    // Get current atom position (might be displaced by vibration)
    const atomPos = tracked.mesh.position;

    // Calculate direction from atom to camera
    camDir.subVectors(camera.position, atomPos).normalize();

    // Position label in front of atom toward camera
    const labelPos = atomPos.clone().add(camDir.multiplyScalar(offset));

    // Update both sprite positions
    tracked.label.baseLayer.position.copy(labelPos);
    tracked.label.additiveLayer.position.copy(labelPos);
  }
}

// ---- Atom rendering ----

export function renderAtoms(mol, meshesOut, trackedAtomsOut) {
  for (let ai = 0; ai < mol.atoms.length; ai++) {
    const [elem, x, y, z] = mol.atoms[ai];
    const el = ELEMENTS[elem] || { radius: 0.4 };
    const mesh = new THREE.Mesh(sphereGeo, getElementMaterial(elem));
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(el.radius);
    meshesOut.push(mesh);

    const label = makeAtomLabel(elem, x, y, z);
    // Add both label sprites to meshes
    meshesOut.push(label.baseLayer, label.additiveLayer);

    trackedAtomsOut.push({
      mesh,
      label,
      atomIdx: ai,
      origPos: new THREE.Vector3(x, y, z),
      origLabelPos: new THREE.Vector3(x, y + 0.6, z),
    });
  }
}

// ---- Bond rendering ----

export function renderBonds(mol, aroRingBonds, meshesOut, trackedBondsOut) {
  // Helper: add a bond cylinder with tracking
  const addCyl = (ai, aj, pos, quat, radius, length) => {
    const m = new THREE.Mesh(cylGeo, bondMaterial);
    m.position.copy(pos);
    m.scale.set(radius, length, radius);
    m.quaternion.copy(quat);
    meshesOut.push(m);

    const aAtom = mol.atoms[ai], bAtom = mol.atoms[aj];
    const trueMid = new THREE.Vector3(
      (aAtom[1] + bAtom[1]) / 2, (aAtom[2] + bAtom[2]) / 2, (aAtom[3] + bAtom[3]) / 2,
    );
    const bondLen = new THREE.Vector3(
      bAtom[1] - aAtom[1], bAtom[2] - aAtom[2], bAtom[3] - aAtom[3],
    ).length();

    trackedBondsOut.push({
      mesh: m,
      atomI: ai,
      atomJ: aj,
      origPos: pos.clone(),
      origQuat: quat.clone(),
      origScaleY: length,
      midOffset: pos.clone().sub(trueMid),
      lengthRatio: bondLen > 1e-6 ? length / bondLen : 1,
    });
  };

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
      addCyl(i, j, mid, quat, 0.08, len);
    } else if (order === 2) {
      const off = perp.clone().multiplyScalar(0.12);
      addCyl(i, j, mid.clone().add(off), quat, 0.06, len);
      addCyl(i, j, mid.clone().sub(off), quat, 0.06, len);
    } else if (order === 3) {
      const perp2 = new THREE.Vector3().crossVectors(dir, perp).normalize();
      for (let k = 0; k < 3; k++) {
        const angle = (k * 2 * Math.PI) / 3;
        const off = perp.clone().multiplyScalar(Math.cos(angle) * 0.14)
          .add(perp2.clone().multiplyScalar(Math.sin(angle) * 0.14));
        addCyl(i, j, mid.clone().add(off), quat, 0.05, len);
      }
    } else if (order >= 4) {
      // Quadruple, quintuple, etc.: N cylinders in a ring
      const n = Math.round(order);
      const perp2 = new THREE.Vector3().crossVectors(dir, perp).normalize();
      const ringR = 0.08 + n * 0.03; // ring grows with order
      const cylR = Math.max(0.03, 0.16 / n);
      for (let k = 0; k < n; k++) {
        const angle = (k * 2 * Math.PI) / n;
        const off = perp.clone().multiplyScalar(Math.cos(angle) * ringR)
          .add(perp2.clone().multiplyScalar(Math.sin(angle) * ringR));
        addCyl(i, j, mid.clone().add(off), quat, cylR, len);
      }
    } else if (order === 1.5) {
      const bondKey = Math.min(i, j) + ',' + Math.max(i, j);
      if (aroRingBonds.has(bondKey)) {
        // Part of aromatic ring: single cylinder, torus shows aromaticity
        addCyl(i, j, mid, quat, 0.06, len);
      } else {
        // Non-ring resonance (e.g. O₃, CaCO₃): full + offset partial
        addCyl(i, j, mid, quat, 0.06, len);
        const off = perp.clone().multiplyScalar(0.12);
        addCyl(i, j, mid.clone().add(off), quat, 0.04, len * 0.45);
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
        addCyl(i, j, segMid, quat, 0.08, len * segFrac);
      }
    }
  }
}

// ---- Aromatic ring torus rendering ----

export function renderAromaticRings(mol, aroRings, meshesOut) {
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

  // Render torus for each aromatic ring
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
    meshesOut.push(torus);
  }
}
