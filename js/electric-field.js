// Vector field visualization: arrow glyphs (InstancedMesh) + streamline tubes with direction cones.
// Supports two field sources:
//   - Gradient: ∇ψ or ∇ρ computed via central finite differences from the cached scalar grid
//   - Electrostatic: Coulomb field E = Σ Zᵢ(r−Rᵢ)/|r−Rᵢ|³ from nuclear point charges
// Fully async with progress reporting. Ring-buffer cache (8 entries).

import * as THREE from 'three';

let fieldGroup = null;
let fieldMeshes = [];
let currentMode = 'both';          // 'arrows' | 'streamlines' | 'both'
let currentSource = 'gradient';    // 'gradient' | 'electrostatic'
let buildGeneration = 0;
let currentCacheKey = null;

// ---- Atomic numbers ----

const ATOMIC_Z = {
  H: 1, He: 2, C: 6, N: 7, O: 8, F: 9, Na: 11, Al: 13,
  P: 15, S: 16, Cl: 17, Ca: 20, Ti: 22, Fe: 26, Cu: 29,
};

// ---- Ring-buffer cache ----

const CACHE_SIZE = 8;
const cache = [];

function cacheFingerprint(caches, probability, atomInfo) {
  let fp = `p${probability.toFixed(3)}m${currentMode}s${currentSource}`;
  if (currentSource === 'electrostatic' && atomInfo) {
    for (const a of atomInfo) fp += `|${a.Z}@${a.x.toFixed(2)},${a.y.toFixed(2)},${a.z.toFixed(2)}`;
  }
  for (const c of caches) {
    const d = c.data;
    const n = d.length;
    fp += `|gs${c.gridSize}he${c.halfExtent.toFixed(2)}`;
    const step = Math.max(1, (n / 16) | 0);
    for (let i = 0; i < n; i += step) fp += ',' + d[i].toFixed(6);
  }
  return fp;
}

function cacheGet(key) {
  const idx = cache.findIndex(e => e.key === key);
  if (idx < 0) return null;
  const entry = cache.splice(idx, 1)[0];
  cache.push(entry);
  return entry;
}

function cachePut(key, group, meshes) {
  while (cache.length >= CACHE_SIZE) {
    const old = cache.shift();
    disposeEntry(old);
  }
  cache.push({ key, group, meshes });
}

function disposeEntry(entry) {
  if (!entry) return;
  for (const m of entry.meshes) {
    if (m.parent) m.parent.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) m.material.forEach(mt => mt.dispose());
      else m.material.dispose();
    }
  }
  if (entry.group && entry.group.parent) entry.group.parent.remove(entry.group);
}

function yield_() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// ---- Gradient computation (central finite differences on scalar grid) ----

function computeGradient(data, gridSize, halfExtent) {
  const h = (2 * halfExtent) / (gridSize - 1);
  const N = gridSize, N2 = N * N;
  const grad = new Float32Array(N * N * N * 3);

  for (let iz = 1; iz < N - 1; iz++) {
    for (let iy = 1; iy < N - 1; iy++) {
      for (let ix = 1; ix < N - 1; ix++) {
        const idx = iz * N2 + iy * N + ix;
        const oi = idx * 3;
        grad[oi]     = (data[idx + 1]  - data[idx - 1])  / (2 * h);
        grad[oi + 1] = (data[idx + N]  - data[idx - N])  / (2 * h);
        grad[oi + 2] = (data[idx + N2] - data[idx - N2]) / (2 * h);
      }
    }
  }
  return grad;
}

// ---- Electrostatic field: E = Σ Zᵢ (r−Rᵢ)/|r−Rᵢ|³ ----

function computeElectrostaticField(atomInfo, gridSize, halfExtent) {
  const N = gridSize, N2 = N * N;
  const step = (2 * halfExtent) / (N - 1);
  const grad = new Float32Array(N * N * N * 3);
  const softening2 = 0.25; // avoid singularity at nuclei

  for (let iz = 0; iz < N; iz++) {
    const z = -halfExtent + iz * step;
    for (let iy = 0; iy < N; iy++) {
      const y = -halfExtent + iy * step;
      for (let ix = 0; ix < N; ix++) {
        const x = -halfExtent + ix * step;
        const oi = (iz * N2 + iy * N + ix) * 3;
        let ex = 0, ey = 0, ez = 0;
        for (const atom of atomInfo) {
          const dx = x - atom.x, dy = y - atom.y, dz = z - atom.z;
          const r2 = dx * dx + dy * dy + dz * dz + softening2;
          const r = Math.sqrt(r2);
          const f = atom.Z / (r2 * r);
          ex += f * dx;
          ey += f * dy;
          ez += f * dz;
        }
        grad[oi] = ex;
        grad[oi + 1] = ey;
        grad[oi + 2] = ez;
      }
    }
  }
  return grad;
}

// ---- Filter bounds via histogram (O(n)) ----

function computeFilterBounds(data, halfExtent, gridSize, probability) {
  const voxelVol = Math.pow(2 * halfExtent / (gridSize - 1), 3);
  const N = data.length;

  let totalProb = 0, maxAbs = 0;
  for (let i = 0; i < N; i++) {
    const v = Math.abs(data[i]);
    if (v > maxAbs) maxAbs = v;
    totalProb += data[i] * data[i] * voxelVol;
  }
  if (maxAbs === 0 || totalProb === 0) return { lo: 0, hi: 0 };

  const BINS = 1024;
  const binWidth = maxAbs / BINS;
  const hist = new Float64Array(BINS);
  for (let i = 0; i < N; i++) {
    const v = Math.abs(data[i]);
    const bin = Math.min(BINS - 1, Math.floor(v / binWidth));
    hist[bin] += data[i] * data[i] * voxelVol;
  }

  let accum = 0, outerThreshold = 0;
  for (let b = BINS - 1; b >= 0; b--) {
    accum += hist[b];
    if (accum / totalProb >= probability) { outerThreshold = (b + 0.5) * binWidth; break; }
  }

  return { lo: outerThreshold * 0.3, hi: outerThreshold * 2.5 };
}

// ---- Electrostatic filter: magnitude-based band ----

function computeMagnitudeBounds(grad, gridSize) {
  const N = gridSize * gridSize * gridSize;
  let maxMag = 0;
  const mags = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const oi = i * 3;
    const m = Math.sqrt(grad[oi] * grad[oi] + grad[oi + 1] * grad[oi + 1] + grad[oi + 2] * grad[oi + 2]);
    mags[i] = m;
    if (m > maxMag) maxMag = m;
  }
  // Show arrows in mid-range magnitudes (skip near-zero and very strong near nuclei)
  return { lo: maxMag * 0.02, hi: maxMag * 0.5, mags, maxMag };
}

// ---- Trilinear interpolation of vector field ----

function trilinearInterp(grad, gs, he, step, x, y, z) {
  const fx = (x + he) / step, fy = (y + he) / step, fz = (z + he) / step;
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  if (ix < 0 || ix >= gs - 1 || iy < 0 || iy >= gs - 1 || iz < 0 || iz >= gs - 1) return null;

  const tx = fx - ix, ty = fy - iy, tz = fz - iz;
  const N = gs, N2 = N * N;
  const i000 = (iz * N2 + iy * N + ix) * 3;
  const i100 = i000 + 3;
  const i010 = (iz * N2 + (iy + 1) * N + ix) * 3;
  const i110 = i010 + 3;
  const i001 = ((iz + 1) * N2 + iy * N + ix) * 3;
  const i101 = i001 + 3;
  const i011 = ((iz + 1) * N2 + (iy + 1) * N + ix) * 3;
  const i111 = i011 + 3;

  const result = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const c00 = grad[i000 + c] * (1 - tx) + grad[i100 + c] * tx;
    const c10 = grad[i010 + c] * (1 - tx) + grad[i110 + c] * tx;
    const c01 = grad[i001 + c] * (1 - tx) + grad[i101 + c] * tx;
    const c11 = grad[i011 + c] * (1 - tx) + grad[i111 + c] * tx;
    const c0 = c00 * (1 - ty) + c10 * ty;
    const c1 = c01 * (1 - ty) + c11 * ty;
    result[c] = c0 * (1 - tz) + c1 * tz;
  }
  return result;
}

// ---- Streamline integration (RK4) ----

function integrateStreamline(grad, gs, he, step, startX, startY, startZ, maxSteps, dt, sign) {
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

// ---- Arrow construction (InstancedMesh) ----

function createArrowMeshes(arrows, maxMag, step, stride, parent) {
  if (arrows.length === 0) return;

  const upY = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();
  const shaftGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6, 1);
  shaftGeo.translate(0, 0.5, 0);
  const headGeo = new THREE.ConeGeometry(0.08, 0.25, 6);
  headGeo.translate(0, 0.125, 0);

  const mat = new THREE.MeshPhongMaterial({
    color: 0xffffff, transparent: true, opacity: 0.8,
    depthWrite: false, shininess: 30,
  });

  const count = arrows.length;
  const shaftMesh = new THREE.InstancedMesh(shaftGeo, mat, count);
  const headMesh = new THREE.InstancedMesh(headGeo, mat.clone(), count);
  const dummy = new THREE.Object3D();
  const invMaxMag = maxMag > 0 ? 1 / maxMag : 1;

  for (let i = 0; i < count; i++) {
    const a = arrows[i];
    const dir = new THREE.Vector3(a.gx, a.gy, a.gz).normalize();
    const len = (a.mag * invMaxMag) * step * stride * 0.8;

    dummy.position.set(a.x, a.y, a.z);
    quat.setFromUnitVectors(upY, dir);
    dummy.quaternion.copy(quat);
    dummy.scale.set(1, len, 1);
    dummy.updateMatrix();
    shaftMesh.setMatrixAt(i, dummy.matrix);

    dummy.position.set(a.x + dir.x * len, a.y + dir.y * len, a.z + dir.z * len);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    headMesh.setMatrixAt(i, dummy.matrix);
  }

  shaftMesh.instanceMatrix.needsUpdate = true;
  headMesh.instanceMatrix.needsUpdate = true;
  parent.add(shaftMesh);
  parent.add(headMesh);
  return [shaftMesh, headMesh];
}

// ---- Streamline mesh + direction cones ----

function createStreamlineMesh(pts, parent, coneDatas) {
  if (pts.length < 4) return null;
  const vectors = pts.map(p => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(vectors);
  const segments = Math.min(vectors.length * 2, 100);
  const tubeGeo = new THREE.TubeGeometry(curve, segments, 0.02, 4, false);

  const mat = new THREE.MeshPhongMaterial({
    color: 0xffffff, transparent: true, opacity: 0.45,
    depthWrite: false, shininess: 40, side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(tubeGeo, mat);
  parent.add(mesh);

  // Collect direction cone positions along this streamline
  const CONE_INTERVAL = 15; // place a cone every N points
  for (let i = CONE_INTERVAL; i < pts.length - 1; i += CONE_INTERVAL) {
    const p = pts[i];
    const pn = pts[i + 1];
    coneDatas.push({
      x: p[0], y: p[1], z: p[2],
      dx: pn[0] - p[0], dy: pn[1] - p[1], dz: pn[2] - p[2],
    });
  }

  return mesh;
}

function createDirectionCones(coneDatas, parent) {
  if (coneDatas.length === 0) return null;

  const upY = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();
  const coneGeo = new THREE.ConeGeometry(0.05, 0.15, 5);
  coneGeo.translate(0, 0.075, 0);

  const mat = new THREE.MeshPhongMaterial({
    color: 0xffffff, transparent: true, opacity: 0.65,
    depthWrite: false, shininess: 30,
  });

  const mesh = new THREE.InstancedMesh(coneGeo, mat, coneDatas.length);
  const dummy = new THREE.Object3D();

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
  }

  mesh.instanceMatrix.needsUpdate = true;
  parent.add(mesh);
  return mesh;
}

// ---- Collect arrow candidates from a vector field ----

function collectArrowCandidates(grad, data, gs, he, step, bounds, useMagnitudeBounds, magBounds) {
  const stride = Math.max(3, Math.round(gs / 25));
  const candidates = [];
  let maxMag = 0;

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

        candidates.push({
          x: -he + ix * step, y: -he + iy * step, z: -he + iz * step,
          gx, gy, gz, mag,
        });
        if (mag > maxMag) maxMag = mag;
      }
    }
  }

  let arrows = candidates;
  if (arrows.length > 1500) {
    const skip = Math.ceil(arrows.length / 1500);
    arrows = arrows.filter((_, i) => i % skip === 0);
  }

  return { arrows, maxMag, stride };
}

// ---- Collect streamline seeds ----

function collectStreamlineSeeds(grad, data, gs, he, step, bounds, useMagnitudeBounds, magBounds) {
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

// ---- Public API ----

export async function buildFieldVisAsync(caches, halfExtent, gridSize, parent, probability, onProgress, atomInfo) {
  detachFieldVis();
  if (!caches || caches.length === 0) return;

  const key = cacheFingerprint(caches, probability, atomInfo);

  const hit = cacheGet(key);
  if (hit) {
    fieldGroup = hit.group;
    fieldMeshes = hit.meshes;
    currentCacheKey = key;
    parent.add(fieldGroup);
    fieldGroup.visible = true;
    if (onProgress) onProgress(1);
    return;
  }

  const gen = ++buildGeneration;
  const stale = () => gen !== buildGeneration;

  fieldGroup = new THREE.Group();
  fieldMeshes = [];
  currentCacheKey = key;
  parent.add(fieldGroup);

  const doArrows = currentMode === 'arrows' || currentMode === 'both';
  const doStreamlines = currentMode === 'streamlines' || currentMode === 'both';
  const isElectrostatic = currentSource === 'electrostatic';

  const arrowWeight = doArrows ? 0.25 : 0;
  const streamWeight = doStreamlines ? 0.6 : 0;
  const totalWeight = 0.15 + arrowWeight + streamWeight;
  function report(p) { if (onProgress) onProgress(Math.min(1, p / totalWeight)); }

  for (let ci = 0; ci < caches.length; ci++) {
    const c = caches[ci];
    const gs = gridSize || c.gridSize;
    const he = c.halfExtent;
    const step = (2 * he) / (gs - 1);

    if (onProgress) onProgress(0);
    await yield_();
    if (stale()) return;

    // Phase 1: Compute vector field
    let grad, bounds = null, magBounds = null;
    const useMagnitudeBounds = isElectrostatic;

    if (isElectrostatic && atomInfo && atomInfo.length > 0) {
      // Nuclear Coulomb field
      grad = computeElectrostaticField(atomInfo, gs, he);
      // Add electron density gradient (electrons are negative charges,
      // their field points toward higher density)
      const densGrad = computeGradient(c.data, gs, he);
      // Scale electron contribution: match average magnitudes
      let nucAvg = 0, elAvg = 0;
      const N3 = gs * gs * gs;
      for (let i = 0; i < N3; i++) {
        const oi = i * 3;
        nucAvg += Math.sqrt(grad[oi] * grad[oi] + grad[oi+1] * grad[oi+1] + grad[oi+2] * grad[oi+2]);
        elAvg += Math.sqrt(densGrad[oi] * densGrad[oi] + densGrad[oi+1] * densGrad[oi+1] + densGrad[oi+2] * densGrad[oi+2]);
      }
      const scale = elAvg > 0 ? -(nucAvg / elAvg) * 0.5 : 0;
      for (let i = 0; i < grad.length; i++) grad[i] += scale * densGrad[i];
      magBounds = computeMagnitudeBounds(grad, gs);
    } else {
      grad = computeGradient(c.data, gs, he);
      bounds = computeFilterBounds(c.data, he, gs, probability || 0.8);
    }

    report(0.15);
    await yield_();
    if (stale()) return;

    // Phase 2: Arrows
    if (doArrows) {
      const { arrows, maxMag, stride } = collectArrowCandidates(
        grad, c.data, gs, he, step, bounds, useMagnitudeBounds, magBounds);

      await yield_();
      if (stale()) return;

      const arrowMeshes = createArrowMeshes(arrows, maxMag, step, stride, fieldGroup);
      if (arrowMeshes) fieldMeshes.push(...arrowMeshes);
      report(0.15 + arrowWeight);
      await yield_();
      if (stale()) return;
    }

    // Phase 3: Streamlines
    if (doStreamlines) {
      const seeds = collectStreamlineSeeds(
        grad, c.data, gs, he, step, bounds, useMagnitudeBounds, magBounds);

      const dt = step * 0.8;
      const maxSteps = 200;
      const BATCH = 10;
      const coneDatas = [];

      for (let si = 0; si < seeds.length; si += BATCH) {
        if (stale()) return;
        const end = Math.min(si + BATCH, seeds.length);

        for (let j = si; j < end; j++) {
          const s = seeds[j];
          const fwd = integrateStreamline(grad, gs, he, step, s.x, s.y, s.z, maxSteps, dt, 1);
          const bwd = integrateStreamline(grad, gs, he, step, s.x, s.y, s.z, maxSteps, dt, -1);

          bwd.reverse();
          const allPts = bwd.concat(fwd.slice(1));
          const mesh = createStreamlineMesh(allPts, fieldGroup, coneDatas);
          if (mesh) fieldMeshes.push(mesh);
        }

        report(0.15 + arrowWeight + streamWeight * (end / seeds.length));
        await yield_();
      }

      // Create direction cones for all streamlines at once (single draw call)
      const coneMesh = createDirectionCones(coneDatas, fieldGroup);
      if (coneMesh) fieldMeshes.push(coneMesh);
    }
  }

  if (onProgress) onProgress(1);

  if (!stale() && fieldGroup) {
    cachePut(key, fieldGroup, fieldMeshes);
  }
}

function detachFieldVis() {
  buildGeneration++;
  if (fieldGroup && fieldGroup.parent) fieldGroup.parent.remove(fieldGroup);
  fieldGroup = null;
  fieldMeshes = [];
  currentCacheKey = null;
}

export function clearFieldVis() { detachFieldVis(); }

export function purgeFieldCache() {
  detachFieldVis();
  for (const entry of cache) disposeEntry(entry);
  cache.length = 0;
}

export function setFieldVisVisible(visible) {
  if (fieldGroup) fieldGroup.visible = visible;
}

export function setFieldMode(mode) { currentMode = mode; }
export function setFieldSource(source) { currentSource = source; }
export function getFieldSource() { return currentSource; }
