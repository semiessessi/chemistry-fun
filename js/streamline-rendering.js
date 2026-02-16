// Streamline rendering: RK4 integration, tube mesh generation, and direction cones.

import * as THREE from 'three';
import { trilinearInterp, trilinearInterpScalar } from './gradient-computation.js';

// ---- Global array for animated streamline materials ----
export const streamlineMaterials = [];

// ---- Streamline integration (RK4) ----

export function integrateStreamline(grad, gs, he, step, startX, startY, startZ, maxSteps, dt, sign) {
  const pts = [[startX, startY, startZ]];
  let x = startX, y = startY, z = startZ;
  const minMag = 1e-6, bound = he * 0.95;

  for (let s = 0; s < maxSteps; s++) {
    const k1 = trilinearInterp(grad, gs, he, step, x, y, z);
    if (!k1) break;
    const m1 = Math.sqrt(k1[0] * k1[0] + k1[1] * k1[1] + k1[2] * k1[2]);
    if (m1 < minMag) break;
    const n1x = sign * k1[0] / m1, n1y = sign * k1[1] / m1, n1z = sign * k1[2] / m1;

    const k2 = trilinearInterp(grad, gs, he, step, x + n1x * dt * 0.5, y + n1y * dt * 0.5, z + n1z * dt * 0.5);
    if (!k2) break;
    const m2 = Math.sqrt(k2[0] * k2[0] + k2[1] * k2[1] + k2[2] * k2[2]);
    if (m2 < minMag) break;
    const n2x = sign * k2[0] / m2, n2y = sign * k2[1] / m2, n2z = sign * k2[2] / m2;

    const k3 = trilinearInterp(grad, gs, he, step, x + n2x * dt * 0.5, y + n2y * dt * 0.5, z + n2z * dt * 0.5);
    if (!k3) break;
    const m3 = Math.sqrt(k3[0] * k3[0] + k3[1] * k3[1] + k3[2] * k3[2]);
    if (m3 < minMag) break;
    const n3x = sign * k3[0] / m3, n3y = sign * k3[1] / m3, n3z = sign * k3[2] / m3;

    const k4 = trilinearInterp(grad, gs, he, step, x + n3x * dt, y + n3y * dt, z + n3z * dt);
    if (!k4) break;
    const m4 = Math.sqrt(k4[0] * k4[0] + k4[1] * k4[1] + k4[2] * k4[2]);
    if (m4 < minMag) break;
    const n4x = sign * k4[0] / m4, n4y = sign * k4[1] / m4, n4z = sign * k4[2] / m4;

    const nx = x + dt * (n1x + 2 * n2x + 2 * n3x + n4x) / 6;
    const ny = y + dt * (n1y + 2 * n2y + 2 * n3y + n4y) / 6;
    const nz = z + dt * (n1z + 2 * n2z + 2 * n3z + n4z) / 6;

    if (Math.abs(nx) > bound || Math.abs(ny) > bound || Math.abs(nz) > bound) break;

    if (pts.length >= 2) {
      const p = pts[pts.length - 1], pp = pts[pts.length - 2];
      const d1x = p[0] - pp[0], d1y = p[1] - pp[1], d1z = p[2] - pp[2];
      const d2x = nx - p[0], d2y = ny - p[1], d2z = nz - p[2];
      if (d1x * d2x + d1y * d2y + d1z * d2z < 0) break;
    }

    x = nx; y = ny; z = nz;
    pts.push([x, y, z]);
  }
  return pts;
}

// ---- Potential color ramp: red (+) → white (0) → blue (−) ----

function potentialColor(t) {
  // t in [-1, +1], normalized potential
  if (t > 0) return new THREE.Color(1, 1 - 0.6 * t, 1 - 0.6 * t);  // white→red
  const a = -t;
  return new THREE.Color(1 - 0.7 * a, 1 - 0.7 * a, 1);  // white→blue
}

// ---- Streamline mesh + direction cones with optional potential coloring ----

export function createStreamlineMesh(pts, parent, coneDatas, potentialGrid, gs, he, materialsOut) {
  if (pts.length < 4) return null;
  const vectors = pts.map(p => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(vectors);
  const segments = Math.min(vectors.length * 2, 100);
  const tubeGeo = new THREE.TubeGeometry(curve, segments, 0.02, 4, false);

  let tubeColor = new THREE.Color(0xffffff);
  if (potentialGrid && gs && he) {
    // Average potential along streamline path
    const potStep = (2 * he) / (gs - 1);
    let potSum = 0, potCount = 0, potMin = Infinity, potMax = -Infinity;
    // Sample a subset of points for efficiency
    const sampleStep = Math.max(1, Math.floor(pts.length / 10));
    for (let i = 0; i < pts.length; i += sampleStep) {
      const v = trilinearInterpScalar(potentialGrid, gs, he, potStep, pts[i][0], pts[i][1], pts[i][2]);
      potSum += v;
      potCount++;
      if (v < potMin) potMin = v;
      if (v > potMax) potMax = v;
    }
    // Use global magnitude estimate from endpoint range
    const range = Math.max(Math.abs(potMin), Math.abs(potMax)) || 1;
    const avg = potSum / potCount;
    const t = Math.max(-1, Math.min(1, avg / range));
    tubeColor = potentialColor(t);
  }

  // Custom shader material with UV scrolling animation
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uBaseColor: { value: tubeColor },
      uOpacity: { value: 0.28 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uBaseColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float pattern = fract(vUv.x * 6.0 - uTime * 0.3);
        float dash = smoothstep(0.0, 0.12, pattern) * (1.0 - smoothstep(0.45, 0.57, pattern));
        float alpha = mix(0.05, uOpacity, dash);
        gl_FragColor = vec4(uBaseColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  (materialsOut || streamlineMaterials).push(mat);

  const mesh = new THREE.Mesh(tubeGeo, mat);
  parent.add(mesh);

  const CONE_INTERVAL = 15;
  for (let i = CONE_INTERVAL; i < pts.length - 1; i += CONE_INTERVAL) {
    const p = pts[i];
    const pn = pts[i + 1];
    coneDatas.push({
      x: p[0], y: p[1], z: p[2],
      dx: pn[0] - p[0], dy: pn[1] - p[1], dz: pn[2] - p[2],
      color: tubeColor,
    });
  }

  return mesh;
}

// ---- Direction cones for streamlines ----

export function createDirectionCones(coneDatas, parent, usePotColor) {
  if (coneDatas.length === 0) return null;

  const upY = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();
  const coneGeo = new THREE.ConeGeometry(0.05, 0.15, 5);
  coneGeo.translate(0, 0.075, 0);

  const mat = new THREE.MeshPhongMaterial({
    color: 0xffffff, transparent: true, opacity: 0.4,
    depthWrite: false, shininess: 30,
    vertexColors: usePotColor,
  });

  const mesh = new THREE.InstancedMesh(coneGeo, mat, coneDatas.length);
  const dummy = new THREE.Object3D();

  if (usePotColor) {
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(coneDatas.length * 3), 3);
  }

  for (let i = 0; i < coneDatas.length; i++) {
    const c = coneDatas[i];
    const len = Math.sqrt(c.dx * c.dx + c.dy * c.dy + c.dz * c.dz);
    if (len < 1e-8) continue;
    const dir = new THREE.Vector3(c.dx / len, c.dy / len, c.dz / len);
    dummy.position.set(c.x, c.y, c.z);
    quat.setFromUnitVectors(upY, dir);
    dummy.quaternion.copy(quat);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    if (usePotColor && c.color && c.color.isColor) {
      mesh.instanceColor.setXYZ(i, c.color.r, c.color.g, c.color.b);
    }
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (usePotColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  parent.add(mesh);
  return mesh;
}

// ---- Collect streamline seeds ----

export function collectStreamlineSeeds(grad, data, gs, he, step, bounds, useMagnitudeBounds, magBounds) {
  const stride = Math.max(4, Math.round(gs / 16));
  const seeds = [];

  for (let iz = stride; iz < gs - stride; iz += stride) {
    for (let iy = stride; iy < gs - stride; iy += stride) {
      for (let ix = stride; ix < gs - stride; ix += stride) {
        const idx = iz * gs * gs + iy * gs + ix;

        if (useMagnitudeBounds) {
          const mag = magBounds.mags[idx];
          if (mag < magBounds.lo || mag > magBounds.hi) continue;
        } else {
          const absVal = Math.abs(data[idx]);
          if (absVal < bounds.lo || absVal > bounds.hi) continue;
        }

        const oi = idx * 3;
        const gx = grad[oi], gy = grad[oi + 1], gz = grad[oi + 2];
        const mag = Math.sqrt(gx * gx + gy * gy + gz * gz);
        if (mag < 1e-8) continue;

        seeds.push({ x: -he + ix * step, y: -he + iy * step, z: -he + iz * step, mag });
      }
    }
  }

  const maxSeeds = 200;
  if (seeds.length > maxSeeds) {
    seeds.sort((a, b) => b.mag - a.mag);
    seeds.length = maxSeeds;
  }

  return seeds;
}
