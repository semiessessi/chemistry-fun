// Element data: CPK colors, covalent radii, shared geometries, and materials.

import * as THREE from 'three';

// ---- Element data (CPK colors, covalent radii for sphere display) ----

export const ELEMENTS = {
  H:  { color: 0xffffff, radius: 0.3 },
  C:  { color: 0x909090, radius: 0.4 },
  N:  { color: 0x3050f8, radius: 0.4 },
  O:  { color: 0xff2010, radius: 0.4 },
  B:  { color: 0xffb5b5, radius: 0.38 },
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
  Br: { color: 0xa62929, radius: 0.44 },
  I:  { color: 0x940094, radius: 0.50 },
  Si: { color: 0xf0c8a0, radius: 0.46 },
  Ge: { color: 0x668f8f, radius: 0.47 },
  Se: { color: 0xffa100, radius: 0.46 },
  Kr: { color: 0x5cb8d1, radius: 0.46 },
  Xe: { color: 0x5cb8d1, radius: 0.50 },
  Pb: { color: 0x575961, radius: 0.54 },
  U:  { color: 0x008fff, radius: 0.58 },
  Sn: { color: 0x668080, radius: 0.51 },
  Bi: { color: 0x9e4fb5, radius: 0.54 },
  Mo: { color: 0x54b5b5, radius: 0.54 },
  Re: { color: 0x267dab, radius: 0.51 },
};

// ---- Shared geometries (created once) ----

export const sphereGeo = new THREE.SphereGeometry(1, 16, 12);
export const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
export const torusGeo = new THREE.TorusGeometry(1, 0.025, 8, 48);

// ---- Cached materials per element ----

const materialCache = {};
export function getElementMaterial(elem) {
  if (!materialCache[elem]) {
    const el = ELEMENTS[elem] || { color: 0xcccccc };
    materialCache[elem] = new THREE.MeshPhongMaterial({
      color: el.color, shininess: 60,
    });
  }
  return materialCache[elem];
}

export const bondMaterial = new THREE.MeshPhongMaterial({ color: 0x666666, shininess: 30, side: THREE.DoubleSide });
