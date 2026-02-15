// Color ramps, material pool, and legend update for multi-layer isosurface rendering.

import * as THREE from 'three';

// ---- Color ramp helpers ----

function hslToHex(h, s, l) {
  // h in [0,360], s,l in [0,100]
  const c = new THREE.Color();
  c.setHSL(h / 360, s / 100, l / 100);
  return c;
}

// Orbital wavefunction ramps (t: 0=inner, 1=outer)
function redRamp(t) {
  // deep red (inner) → pale pink (outer)
  return hslToHex(0, 80 - 30 * t, 40 + 40 * t);
}

function blueRamp(t) {
  // deep blue (inner) → pale blue (outer)
  return hslToHex(225, 75 - 30 * t, 40 + 40 * t);
}

function orbitalOpacity(t) {
  // inner 0.70 → outer 0.12
  return 0.70 - 0.58 * t;
}

// Electron density elevation map ramp (t: 0=inner, 1=outer)
function elevationColor(t) {
  // Piecewise: red(0) → yellow(0.33) → green(0.66) → blue(1)
  let h;
  if (t < 0.333) {
    h = 0 + (60 * t / 0.333);        // 0 → 60
  } else if (t < 0.666) {
    h = 60 + (60 * (t - 0.333) / 0.333); // 60 → 120
  } else {
    h = 120 + (120 * (t - 0.666) / 0.334); // 120 → 240
  }
  return hslToHex(h, 80, 50);
}

function elevationOpacity(t) {
  // inner 0.65 → outer 0.15
  return 0.65 - 0.50 * t;
}

// Charge density ramps (t: 0=inner, 1=outer)
// Power curve applied to t: p=1 linear, p>1 colors stay vivid longer, p<1 fade faster
let chargeCurvePower = 1.0;

function chargeRedRamp(t) {
  const c = Math.pow(t, chargeCurvePower);
  return hslToHex(0, 80 * (1 - c), 40 + 60 * c);
}

function chargeBlueRamp(t) {
  const c = Math.pow(t, chargeCurvePower);
  return hslToHex(225, 75 * (1 - c), 40 + 60 * c);
}

// ---- Material creation ----

function makeMat(color, opacity) {
  return new THREE.MeshPhongMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    shininess: 40,
    depthWrite: false
  });
}

// ---- Material pool (cached) ----

const cache = {};

export function getLayerMaterials(numLayers, colorMode) {
  const key = `${numLayers}-${colorMode}`;
  if (cache[key]) return cache[key];
  const mats = { pos: [], neg: [] };
  for (let i = 0; i < numLayers; i++) {
    const t = numLayers === 1 ? 0 : i / (numLayers - 1); // 0=inner, 1=outer
    if (colorMode === 'density') {
      mats.pos.push(makeMat(elevationColor(t), elevationOpacity(t)));
      mats.neg.push(mats.pos[i]); // density is always positive
    } else if (colorMode === 'charge') {
      mats.pos.push(makeMat(chargeRedRamp(t), orbitalOpacity(t)));
      mats.neg.push(makeMat(chargeBlueRamp(t), orbitalOpacity(t)));
    } else {
      mats.pos.push(makeMat(redRamp(t), orbitalOpacity(t)));
      mats.neg.push(makeMat(blueRamp(t), orbitalOpacity(t)));
    }
  }
  cache[key] = mats;
  return mats;
}

// ---- Charge curve update (live, no rebuild) ----

export function setChargeCurve(power) {
  chargeCurvePower = power;
  // Update colors on all cached charge materials in-place
  for (const key of Object.keys(cache)) {
    if (!key.endsWith('-charge')) continue;
    const mats = cache[key];
    const numLayers = mats.pos.length;
    for (let i = 0; i < numLayers; i++) {
      const t = numLayers === 1 ? 0 : i / (numLayers - 1);
      mats.pos[i].color.copy(chargeRedRamp(t));
      mats.neg[i].color.copy(chargeBlueRamp(t));
    }
  }
}

// ---- Opacity scaling ----

export function applyOpacityScale(numLayers, colorMode, scale) {
  const key = `${numLayers}-${colorMode}`;
  const mats = cache[key];
  if (!mats) return;
  for (let i = 0; i < numLayers; i++) {
    const t = numLayers === 1 ? 0 : i / (numLayers - 1);
    const baseOp = colorMode === 'density' ? elevationOpacity(t) : orbitalOpacity(t);
    mats.pos[i].opacity = baseOp * scale;
    if (mats.neg[i] !== mats.pos[i]) mats.neg[i].opacity = baseOp * scale;
  }
}

// ---- Legend ----

function colorToCSS(threeColor, opacity) {
  const r = Math.round(threeColor.r * 255);
  const g = Math.round(threeColor.g * 255);
  const b = Math.round(threeColor.b * 255);
  return `rgba(${r},${g},${b},${opacity})`;
}

function buildGradientCSS(colorFn) {
  const stops = 16;
  const parts = [];
  for (let i = 0; i <= stops; i++) {
    const t = i / stops; // left=inner(t=0), right=outer(t=1)
    parts.push(colorToCSS(colorFn(t), 1.0));
  }
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

export function updateLegend(numLayers, maxProb, colorMode) {
  const container = document.getElementById('layer-key');
  if (!container) return;
  container.innerHTML = '';
  if (numLayers <= 1) return;

  const W = 160; // bar width in px

  const addBar = (colorFn) => {
    const bar = document.createElement('div');
    bar.style.cssText = `width:${W}px;height:14px;border-radius:3px;border:1px solid rgba(255,255,255,0.15);background:${buildGradientCSS(colorFn)};`;
    container.appendChild(bar);
  };

  if (colorMode === 'density') {
    addBar(elevationColor);
  } else if (colorMode === 'charge') {
    addBar(chargeRedRamp);
    addBar(chargeBlueRamp);
  } else {
    addBar(redRamp);
    addBar(blueRamp);
  }

  const labels = document.createElement('div');
  labels.style.cssText = `display:flex;justify-content:space-between;width:${W}px;font-size:10px;font-family:Consolas,Menlo,monospace;color:#aaa;padding-top:2px;`;
  const pctMax = maxProb * 100;
  for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
    const span = document.createElement('span');
    span.textContent = `${(frac * pctMax).toFixed(0)}%`;
    labels.appendChild(span);
  }
  container.appendChild(labels);
}
