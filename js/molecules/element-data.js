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
  H:  { color: 0xdcdcdc, radius: 0.3, matOptions: { shininess: 113, specular: 0xaaaaaa, reflectivity: 0.15 } },  // Shiny white — 25% more gloss
  C:  { color: 0x020202, radius: 0.4, matOptions: { shininess: 256, specular: 0x4d4d4d, reflectivity: 0.03, emissiveIntensity: 0 } },  // Snooker black — pinpoint highlight, no env bleed
  N:  { color: 0x0c20cc, radius: 0.4 },  // Darker, more saturated blue
  O:  { color: 0xcc0000, radius: 0.4 },  // Snooker red
  B:  { color: 0xffb5b5, radius: 0.38 },
  F:  { color: 0x60a818, radius: 0.35 },  // Darker yellow-green
  Na: { color: 0x8030e0, radius: 0.55 },  // Darker purple
  Al: { color: 0xbfa6a6, radius: 0.50 },
  P:  { color: 0xffcc00, radius: 0.42 },  // Yellow
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
  Ag: { color: 0xc0c0c0, radius: 0.50, matOptions: { shininess: 200, specular: 0xffffff, reflectivity: 0.5 } },  // Silver — mirror finish
  Co: { color: 0xf090a0, radius: 0.48 },  // Cobalt — pink (Jmol CPK)
  Ni: { color: 0x50d050, radius: 0.48 },  // Nickel — light green (Jmol CPK)
  Hg: { color: 0xb8b8d0, radius: 0.52, matOptions: { shininess: 220, specular: 0xffffff, reflectivity: 0.6 } },  // Mercury — silvery blue, liquid-metal finish
  Ru: { color: 0x248f8f, radius: 0.50 },  // Ruthenium
  Pd: { color: 0x006985, radius: 0.50 },  // Palladium
  Mg: { color: 0x8aff00, radius: 0.52 },  // Magnesium
  Zn: { color: 0x7d80b0, radius: 0.49 },  // Zinc
  Mn: { color: 0x9c7ac7, radius: 0.50 },  // Manganese
  Cr: { color: 0x8a99c7, radius: 0.50 },  // Chromium
  V:  { color: 0xa6a6ab, radius: 0.51 },  // Vanadium
  W:  { color: 0x2194d6, radius: 0.52 },  // Tungsten
  Au: { color: 0xffd123, radius: 0.50, matOptions: { shininess: 220, specular: 0xffee88, reflectivity: 0.6 } },  // Gold — warm metallic
  Pt: { color: 0xd0d0e0, radius: 0.51, matOptions: { shininess: 200, specular: 0xffffff, reflectivity: 0.5 } },  // Platinum
  Ir: { color: 0x175487, radius: 0.51 },  // Iridium
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
      shininess: 90,
      specular: 0x886644,
      envMap: envMap,
      reflectivity: 0.12,
      combine: THREE.MixOperation,
      emissive: baseColor.clone(),
      emissiveIntensity: 0.12,
      ...el.matOptions,        // Per-element overrides (e.g. carbon's dull finish)
    });
  }
  return materialCache[elem];
}

// ---- Ghost (overlay) materials — 5% opacity, always on top ----

const ghostCache = {};
export function getGhostMaterial(elem) {
  if (!ghostCache[elem]) {
    const el = ELEMENTS[elem] || { color: 0xcccccc };
    ghostCache[elem] = new THREE.MeshBasicMaterial({
      color: el.color,
      transparent: true,
      opacity: elem === 'H' ? 0.10 : 0.20,
      depthTest: false,
      depthWrite: false,
      side: THREE.FrontSide,
    });
  }
  return ghostCache[elem];
}

export const bondMaterial = new THREE.MeshPhongMaterial({
  color: 0xcccccc,     // ~80% grey — used chalk
  shininess: 3,        // Near-matte
  specular: 0x0a0a0a,  // Almost no specular highlight
  side: THREE.DoubleSide
});
