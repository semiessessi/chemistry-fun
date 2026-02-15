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

export function getLayerMaterials(numLayers, isDensity) {
  const key = `${numLayers}-${isDensity}`;
  if (cache[key]) return cache[key];
  const mats = { pos: [], neg: [] };
  for (let i = 0; i < numLayers; i++) {
    const t = numLayers === 1 ? 0 : i / (numLayers - 1); // 0=inner, 1=outer
    if (isDensity) {
      mats.pos.push(makeMat(elevationColor(t), elevationOpacity(t)));
      mats.neg.push(mats.pos[i]); // density is always positive
    } else {
      mats.pos.push(makeMat(redRamp(t), orbitalOpacity(t)));
      mats.neg.push(makeMat(blueRamp(t), orbitalOpacity(t)));
    }
  }
  cache[key] = mats;
  return mats;
}

// ---- Opacity scaling ----

export function applyOpacityScale(numLayers, isDensity, scale) {
  const key = `${numLayers}-${isDensity}`;
  const mats = cache[key];
  if (!mats) return;
  for (let i = 0; i < numLayers; i++) {
    const t = numLayers === 1 ? 0 : i / (numLayers - 1);
    const baseOp = isDensity ? elevationOpacity(t) : orbitalOpacity(t);
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

export function updateLegend(numLayers, maxProb, isDensity) {
  const container = document.getElementById('layer-key');
  if (!container) return;
  container.innerHTML = '';
  if (numLayers <= 1) return;

  for (let i = numLayers - 1; i >= 0; i--) {
    // i=numLayers-1 is innermost (highest %), i=0 is outermost (lowest %)
    const t = numLayers === 1 ? 0 : i / (numLayers - 1);
    const pct = ((i + 1) / numLayers * maxProb * 100).toFixed(0);

    const color = isDensity ? elevationColor(t) : redRamp(t);
    const opacity = isDensity ? elevationOpacity(t) : orbitalOpacity(t);

    const row = document.createElement('div');
    row.className = 'layer-row';

    const swatch = document.createElement('div');
    swatch.className = 'layer-swatch';
    swatch.style.background = colorToCSS(color, opacity);

    if (!isDensity) {
      // Show both pos and neg swatches for orbital mode
      const negColor = blueRamp(t);
      const negSwatch = document.createElement('div');
      negSwatch.className = 'layer-swatch';
      negSwatch.style.background = colorToCSS(negColor, opacity);

      const label = document.createElement('span');
      label.textContent = `${pct}%`;

      row.appendChild(swatch);
      row.appendChild(negSwatch);
      row.appendChild(label);
    } else {
      const label = document.createElement('span');
      label.textContent = `${pct}%`;

      row.appendChild(swatch);
      row.appendChild(label);
    }

    container.appendChild(row);
  }
}
