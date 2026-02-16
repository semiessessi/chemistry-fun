// Three.js scene setup: camera, renderer, controls, lighting, materials

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111118);

export const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(25, 20, 30);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

// Lighting — low ambient + multi-directional for strong 3D contrast
scene.add(new THREE.AmbientLight(0xffffff, 0.18));

// Key light — warm, strong, from upper-right-front
const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.0);
keyLight.position.set(5, 10, 7);
scene.add(keyLight);

// Fill light — cool, dimmer, opposite side to soften shadows
const fillLight = new THREE.DirectionalLight(0xc0d0ff, 0.30);
fillLight.position.set(-7, 2, -4);
scene.add(fillLight);

// Rim / back light — highlights edges from behind
const rimLight = new THREE.DirectionalLight(0xffffff, 0.50);
rimLight.position.set(-2, 6, -10);
scene.add(rimLight);

// Bottom fill — subtle uplight to stop undersides going fully black
const bottomLight = new THREE.DirectionalLight(0x8090b0, 0.15);
bottomLight.position.set(0, -8, 2);
scene.add(bottomLight);

// ---- Adaptive grid & axes (XZ plane, labeled in Ångströms) ----

const BOHR_PER_ANG = 1 / 0.529177; // scene units per Å
const ANG_PER_BOHR = 0.529177;

const LABEL_BASE_SCALE = [3.6, 1.8];
const LABEL_REF_DIST = 45;
const labelSprites = [];
const gridObjects = [];  // track all grid/axis/label objects for cleanup

let currentGridAng = 0;  // current grid extent in Å

function clearGrid() {
  for (const obj of gridObjects) {
    scene.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (obj.material.map) obj.material.map.dispose();
      obj.material.dispose();
    }
  }
  gridObjects.length = 0;
  labelSprites.length = 0;
}

export function makeLabel(text, position, fontSize, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = `bold ${fontSize || 26}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const fillColor = color || '#777777';
  // Use contrasting stroke: dark stroke for light colors, light stroke for dark colors
  const strokeColor = (fillColor.match(/#[89a-f]/i)) ? '#000000' : '#ffffff';

  // Draw stroke (outline)
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.5;
  ctx.strokeText(text, 64, 32);

  // Draw fill
  ctx.fillStyle = fillColor;
  ctx.fillText(text, 64, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  // Dual-pass rendering: 50% behind + 50% on top with alpha blending
  const baseLayer = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture.clone(),
      transparent: true,
      opacity: 0.5,
      depthTest: true,
      depthWrite: false, // Don't write to depth buffer (prevents square artifacts)
      blending: THREE.NormalBlending
    })
  );

  const additiveLayer = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
      depthWrite: false, // Don't write to depth buffer
      blending: THREE.NormalBlending  // Alpha blending: black darkens, white lightens
    })
  );

  baseLayer.position.copy(position);
  additiveLayer.position.copy(position);
  baseLayer.scale.set(LABEL_BASE_SCALE[0], LABEL_BASE_SCALE[1], 1);
  additiveLayer.scale.set(LABEL_BASE_SCALE[0], LABEL_BASE_SCALE[1], 1);

  // Render order: additive layer must render AFTER base layer
  baseLayer.renderOrder = 1000;
  additiveLayer.renderOrder = 2000;

  scene.add(baseLayer, additiveLayer);

  // Return container with both sprites
  const label = {
    baseLayer,
    additiveLayer,
    position: position.clone(),
    baseScale: [...LABEL_BASE_SCALE]
  };

  labelSprites.push(label);
  gridObjects.push(baseLayer, additiveLayer);
  return label;
}

export function updateLabelScales() {
  const camPos = camera.position;
  for (const label of labelSprites) {
    if (label.baseLayer && label.additiveLayer) {
      // New dual-layer labels
      const dist = camPos.distanceTo(label.position);
      const s = dist / LABEL_REF_DIST;
      const scaleX = label.baseScale[0] * s;
      const scaleY = label.baseScale[1] * s;
      label.baseLayer.scale.set(scaleX, scaleY, 1);
      label.additiveLayer.scale.set(scaleX, scaleY, 1);
    } else if (label.scale) {
      // Legacy single sprite fallback
      const dist = camPos.distanceTo(label.position);
      const s = dist / LABEL_REF_DIST;
      label.scale.set(LABEL_BASE_SCALE[0] * s, LABEL_BASE_SCALE[1] * s, 1);
    }
  }
}

function buildGrid(maxAng) {
  clearGrid();
  currentGridAng = maxAng;
  const GRID_MAX = maxAng * BOHR_PER_ANG;

  // Choose label step: 1 Å for small, 2 Å for medium, 5 Å for large
  const labelStep = maxAng <= 8 ? 1 : maxAng <= 20 ? 2 : 5;
  // Minor lines every labelStep, major every 2*labelStep
  const minorStep = labelStep;
  const majorStep = labelStep * 2;

  const minorPts = [];
  const majorPts = [];
  for (let a = -maxAng; a <= maxAng; a += minorStep) {
    if (a === 0) continue;
    const pos = a * BOHR_PER_ANG;
    const arr = (a % majorStep === 0) ? majorPts : minorPts;
    arr.push(new THREE.Vector3(pos, 0, -GRID_MAX), new THREE.Vector3(pos, 0, GRID_MAX));
    arr.push(new THREE.Vector3(-GRID_MAX, 0, pos), new THREE.Vector3(GRID_MAX, 0, pos));
  }

  if (minorPts.length > 0) {
    const geo = new THREE.BufferGeometry().setFromPoints(minorPts);
    const obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x333333 }));
    scene.add(obj);
    gridObjects.push(obj);
  }
  if (majorPts.length > 0) {
    const geo = new THREE.BufferGeometry().setFromPoints(majorPts);
    const obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x555555 }));
    scene.add(obj);
    gridObjects.push(obj);
  }

  // Axes
  const axesDef = [
    { dir: [1, 0, 0], color: 0x884444 },
    { dir: [0, 1, 0], color: 0x448844 },
    { dir: [0, 0, 1], color: 0x444488 },
  ];
  for (const { dir, color } of axesDef) {
    const d = new THREE.Vector3(...dir);
    const geo = new THREE.BufferGeometry().setFromPoints([
      d.clone().multiplyScalar(-GRID_MAX),
      d.clone().multiplyScalar(GRID_MAX),
    ]);
    const obj = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
    scene.add(obj);
    gridObjects.push(obj);
  }

  // Number labels along axes
  const LABEL_Y_OFF = -0.18;
  for (let a = -maxAng; a <= maxAng; a += labelStep) {
    const pos = a * BOHR_PER_ANG;
    const txt = a === 0 ? '0' : String(a);
    makeLabel(txt, new THREE.Vector3(pos, LABEL_Y_OFF, 0));
    if (a !== 0) makeLabel(txt, new THREE.Vector3(0, LABEL_Y_OFF, pos));
  }

  // Axis tip labels
  makeLabel('x (\u00C5)', new THREE.Vector3(GRID_MAX + 2, 0, 0), 22, '#aa6666');
  makeLabel('z (\u00C5)', new THREE.Vector3(0, 0, GRID_MAX + 2), 22, '#6666aa');
  makeLabel('y (\u00C5)', new THREE.Vector3(0, GRID_MAX + 2, 0), 22, '#66aa66');
}

/**
 * Update the coordinate grid to fit the given half-extent (in Bohr).
 * Rounds up to a nice Å value. No-ops if the grid already matches.
 */
export function updateGridExtent(halfExtentBohr) {
  const extentAng = halfExtentBohr * ANG_PER_BOHR;
  // Round up to nice values: 5, 8, 10, 15, 20, 25, 30, 40, 50
  const niceValues = [5, 8, 10, 15, 20, 25, 30, 40, 50];
  let maxAng = niceValues[niceValues.length - 1];
  for (const v of niceValues) {
    if (v >= extentAng * 0.85) { maxAng = v; break; }
  }
  if (maxAng === currentGridAng) return;
  buildGrid(maxAng);
}

// Build initial grid at 10 Å
buildGrid(10);

// Materials for positive (red) and negative (blue) lobes
export const matPositive = new THREE.MeshPhongMaterial({
  color: 0xdd3333,
  transparent: true,
  opacity: 0.7,
  side: THREE.DoubleSide,
  shininess: 40,
  depthWrite: false
});
export const matNegative = new THREE.MeshPhongMaterial({
  color: 0x3355dd,
  transparent: true,
  opacity: 0.7,
  side: THREE.DoubleSide,
  shininess: 40,
  depthWrite: false
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
