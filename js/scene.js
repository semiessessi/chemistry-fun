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

// ---- Grid & axes (XZ plane, labeled in Ångströms) ----

const BOHR_PER_ANG = 1 / 0.529177; // scene units per Å
const GRID_MAX_ANG = 10;            // grid extends ±10 Å
const GRID_MAX = GRID_MAX_ANG * BOHR_PER_ANG;

// Collect line segments for minor (1 Å) and major (2 Å) grid lines
const minorPts = [];
const majorPts = [];
for (let a = -GRID_MAX_ANG; a <= GRID_MAX_ANG; a++) {
  if (a === 0) continue;
  const pos = a * BOHR_PER_ANG;
  const arr = (a % 2 === 0) ? majorPts : minorPts;
  arr.push(new THREE.Vector3(pos, 0, -GRID_MAX), new THREE.Vector3(pos, 0, GRID_MAX));
  arr.push(new THREE.Vector3(-GRID_MAX, 0, pos), new THREE.Vector3(GRID_MAX, 0, pos));
}

if (minorPts.length > 0) {
  const geo = new THREE.BufferGeometry().setFromPoints(minorPts);
  scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x333333 })));
}
if (majorPts.length > 0) {
  const geo = new THREE.BufferGeometry().setFromPoints(majorPts);
  scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x555555 })));
}

// Axes — colored, spanning full grid extent
const axesDef = [
  { dir: [1, 0, 0], color: 0x884444 }, // X red
  { dir: [0, 1, 0], color: 0x448844 }, // Y green
  { dir: [0, 0, 1], color: 0x444488 }, // Z blue
];
for (const { dir, color } of axesDef) {
  const d = new THREE.Vector3(...dir);
  const geo = new THREE.BufferGeometry().setFromPoints([
    d.clone().multiplyScalar(-GRID_MAX),
    d.clone().multiplyScalar(GRID_MAX),
  ]);
  scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })));
}

// ---- Text sprite labels (fixed screen-space size) ----

const labelSprites = [];
const LABEL_BASE_SCALE = [3.6, 1.8]; // base scale at reference distance
const LABEL_REF_DIST = 45;            // reference camera distance

export function makeLabel(text, position, fontSize, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = `bold ${fontSize || 26}px sans-serif`;
  ctx.fillStyle = color || '#777777';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(position);
  sprite.scale.set(LABEL_BASE_SCALE[0], LABEL_BASE_SCALE[1], 1);
  scene.add(sprite);
  labelSprites.push(sprite);
  return sprite;
}

// Call each frame to keep labels at constant screen-space size
export function updateLabelScales() {
  const camPos = camera.position;
  for (const sprite of labelSprites) {
    const dist = camPos.distanceTo(sprite.position);
    const s = dist / LABEL_REF_DIST;
    sprite.scale.set(LABEL_BASE_SCALE[0] * s, LABEL_BASE_SCALE[1] * s, 1);
  }
}

// Labels every 2 Å along X and Z axes
const LABEL_STEP = 2;
const LABEL_Y_OFF = -0.18; // slightly below grid plane
for (let a = -GRID_MAX_ANG; a <= GRID_MAX_ANG; a += LABEL_STEP) {
  const pos = a * BOHR_PER_ANG;
  const txt = a === 0 ? '0' : String(a);
  // X-axis labels (along z=0, offset below)
  makeLabel(txt, new THREE.Vector3(pos, LABEL_Y_OFF, 0));
  // Z-axis labels (along x=0, offset below) — skip 0 to avoid overlap
  if (a !== 0) makeLabel(txt, new THREE.Vector3(0, LABEL_Y_OFF, pos));
}

// Axis tip labels with unit
makeLabel('x (\u00C5)', new THREE.Vector3(GRID_MAX + 2, 0, 0), 22, '#aa6666');
makeLabel('z (\u00C5)', new THREE.Vector3(0, 0, GRID_MAX + 2), 22, '#6666aa');
makeLabel('y (\u00C5)', new THREE.Vector3(0, GRID_MAX + 2, 0), 22, '#66aa66');

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
