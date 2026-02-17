// Color ramps, material pool, and legend update for multi-layer isosurface rendering.

import * as THREE from 'three';

// ---- Color ramp helpers ----

function hslToHex(h, s, l) {
  // h in [0,360], s,l in [0,100]
  const c = new THREE.Color();
  c.setHSL(h / 360, s / 100, l / 100);
  return c;
}

// t^32 via repeated squaring (5 multiplies)
function powerRamp(t) {
  const t2 = t * t;
  const t4 = t2 * t2;
  const t8 = t4 * t4;
  const t16 = t8 * t8;
  return t8;
}

// Orbital wavefunction ramps (t: 0=inner, 1=outer)
function redRamp(t) {
  const c = powerRamp(t);
  return hslToHex(0, 80 - 30 * c, 40 + 40 * c);
}

function blueRamp(t) {
  const c = powerRamp(t);
  return hslToHex(225, 75 - 30 * c, 40 + 40 * c);
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
function chargeRedRamp(t) {
  const c = powerRamp(t);
  return hslToHex(0, 80 * (1 - c), 40 + 60 * c);
}

function chargeBlueRamp(t) {
  const c = powerRamp(t);
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

export function getLayerMaterials(numLayers, colorMode, isTransition = false) {
  // Don't cache transition materials (they need to be tracked separately)
  if (isTransition) {
    const mats = { pos: [], neg: [] };
    for (let i = 0; i < numLayers; i++) {
      const t = numLayers === 1 ? 0 : i / (numLayers - 1); // 0=inner, 1=outer
      if (colorMode === 'density') {
        mats.pos.push(createOscillatingMaterial(elevationColor(t), elevationOpacity(t), true));
        mats.neg.push(mats.pos[i]); // density is always positive
      } else if (colorMode === 'charge') {
        mats.pos.push(createOscillatingMaterial(chargeRedRamp(t), orbitalOpacity(t), true));
        mats.neg.push(createOscillatingMaterial(chargeBlueRamp(t), orbitalOpacity(t), true));
      } else {
        mats.pos.push(createOscillatingMaterial(redRamp(t), orbitalOpacity(t), true));
        mats.neg.push(createOscillatingMaterial(blueRamp(t), orbitalOpacity(t), true));
      }
    }
    return mats;
  }

  // Normal cached materials
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

// ---- QED Oscillating Shaders ----

export const transitionMaterials = [];

export function createOscillatingMaterial(baseColor, baseOpacity, isTransition) {
  if (!isTransition) {
    return new THREE.MeshPhongMaterial({
      color: baseColor,
      transparent: true,
      opacity: baseOpacity,
      side: THREE.DoubleSide,
      shininess: 40,
      depthWrite: false
    });
  }

  // Shader material with time-dependent modulation
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uOmega: { value: 1.0 },
      uBaseColor: { value: new THREE.Color(baseColor) },
      uBaseOpacity: { value: baseOpacity },
      uInterferenceStrength: { value: 0.0 },  // 2c₁c₂
      uLightPosition: { value: new THREE.Vector3(10, 10, 10) },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOmega;
      uniform vec3 uBaseColor;
      uniform float uBaseOpacity;
      uniform float uInterferenceStrength;
      uniform vec3 uLightPosition;

      varying vec3 vNormal;
      varying vec3 vViewPosition;

      void main() {
        // Phong lighting
        vec3 normal = normalize(vNormal);
        vec3 lightDir = normalize(uLightPosition - vViewPosition);
        vec3 viewDir = normalize(vViewPosition);
        vec3 reflectDir = reflect(-lightDir, normal);

        float ambient = 0.3;
        float diffuse = max(dot(normal, lightDir), 0.0) * 0.6;
        float specular = pow(max(dot(viewDir, reflectDir), 0.0), 40.0) * 0.3;

        vec3 litColor = uBaseColor * (ambient + diffuse) + vec3(specular);

        // Oscillating opacity modulation
        float oscillation = cos(uOmega * uTime);
        float opacityMod = 1.0 + uInterferenceStrength * oscillation;

        float finalOpacity = uBaseOpacity * clamp(opacityMod, 0.2, 1.8);

        gl_FragColor = vec4(litColor, finalOpacity);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  transitionMaterials.push(mat);
  return mat;
}

export function tickTransitionMaterials(oscillationTime, omega, c1, c2) {
  const interferenceStrength = 2 * c1 * c2;
  for (const mat of transitionMaterials) {
    if (mat.uniforms) {
      mat.uniforms.uTime.value = oscillationTime;  // set directly so speed multiplier is respected
      mat.uniforms.uOmega.value = omega;
      mat.uniforms.uInterferenceStrength.value = interferenceStrength;
    }
  }
}

export function clearTransitionMaterials() {
  transitionMaterials.length = 0;
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

export function updateLegend(numLayers, maxProb, colorMode, opts) {
  const container = document.getElementById('layer-key');
  if (!container) return;
  container.innerHTML = '';
  if (numLayers <= 1) return;

  const addBar = (colorFn) => {
    const bar = document.createElement('div');
    bar.style.cssText = `width:100%;height:14px;border-radius:3px;border:1px solid rgba(255,255,255,0.15);background:${buildGradientCSS(colorFn)};`;
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
  labels.style.cssText = `display:flex;justify-content:space-between;width:100%;font-size:10px;font-family:Consolas,Menlo,monospace;color:#aaa;padding-top:2px;`;

  // ESP mode: show values in Eₕ instead of percentages
  const useEsp = opts && opts.isESP;
  const espMax = (opts && opts.espMaxValue) || 1.0;
  const pctMax = maxProb * 100;

  for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
    const span = document.createElement('span');
    if (useEsp) {
      const val = frac * espMax;
      span.textContent = val < 0.01 ? '0' : val.toFixed(2) + ' Eₕ';
    } else {
      span.textContent = `${(frac * pctMax).toFixed(0)}%`;
    }
    labels.appendChild(span);
  }
  container.appendChild(labels);
}
