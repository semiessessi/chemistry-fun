// Element data: CPK colors, covalent radii, shared geometries, and materials.

import * as THREE from 'three';

// ---- Environment map with strong horizon for reflections ----

function createSimpleEnvMap() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size * 2;  // 2:1 equirectangular ratio
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Strong sky-to-ground gradient with a bright horizon
  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0.0,  '#1a2a4a');  // Deep dark blue sky at top
  gradient.addColorStop(0.35, '#4070c0');  // Mid blue sky
  gradient.addColorStop(0.48, '#b0d0ff');  // Light sky near horizon
  gradient.addColorStop(0.50, '#fffae0');  // Bright warm horizon line
  gradient.addColorStop(0.52, '#c0a060');  // Warm ground near horizon
  gradient.addColorStop(0.70, '#604020');  // Mid brown ground
  gradient.addColorStop(1.0,  '#1a1008');  // Dark ground at bottom

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size * 2, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

const envMap = createSimpleEnvMap();

// ---- Element data (CPK colors, covalent radii for sphere display) ----

export const ELEMENTS = {
  H:  { color: 0xdcdcdc, radius: 0.3 },  // Soft white — shows specular shine
  C:  { color: 0x000000, radius: 0.4, matOptions: { shininess: 15, specular: 0x0d0d0d, reflectivity: 0.02 } },
  N:  { color: 0x0c20cc, radius: 0.4 },  // Darker, more saturated blue
  O:  { color: 0xbb0000, radius: 0.4 },  // Deep vivid red
  B:  { color: 0xffb5b5, radius: 0.38 },
  F:  { color: 0x60a818, radius: 0.35 },  // Darker yellow-green
  Na: { color: 0x8030e0, radius: 0.55 },  // Darker purple
  Al: { color: 0xbfa6a6, radius: 0.50 },
  P:  { color: 0xcc5500, radius: 0.42 },  // Darker orange
  S:  { color: 0xd4d400, radius: 0.45 },  // Darker saturated yellow
  Cl: { color: 0x0ba80b, radius: 0.42 },  // Darker green
  Ca: { color: 0x20b800, radius: 0.58 },  // Darker green
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
    const baseColor = new THREE.Color(el.color);
    const hsl = {};
    baseColor.getHSL(hsl);
    baseColor.setHSL(hsl.h, Math.min(1, hsl.s * 1.3), hsl.l);
    materialCache[elem] = new THREE.MeshPhongMaterial({
      color: baseColor.clone(),
      shininess: 70,
      specular: 0x553322,
      envMap: envMap,
      reflectivity: 0.08,
      combine: THREE.MixOperation,
      emissive: baseColor.clone(),
      emissiveIntensity: 0.12,
      ...el.matOptions,        // Per-element overrides (e.g. carbon's dull finish)
    });
  }
  return materialCache[elem];
}

export const bondMaterial = new THREE.MeshPhongMaterial({
  color: 0x666666,
  shininess: 50,       // Reduced from 100 for subtler bonds
  specular: 0x555555,  // Reduced from 0xaaaaaa
  side: THREE.DoubleSide
});
