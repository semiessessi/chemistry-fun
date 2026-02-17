// Worker pool manager with async task API and progress reporting.
// Distributes grid sampling, threshold computation, and marching cubes across workers.

import { sampleGrid } from './grid.js';
import { initWebGPU, sampleGridGPU, sampleDensityGridGPU } from './webgpu-sampler.js';

const WORKER_URL = new URL('./compute-worker.js', import.meta.url).href;
const NUM_WORKERS = Math.max(2, Math.min((navigator.hardwareConcurrency - 1) || 7, 16));

// Kick off GPU init eagerly; sampleGridAsync checks gpuReady before dispatching workers
let gpuReady = false;
initWebGPU().then(ok => { gpuReady = ok; console.log('[perf] WebGPU:', ok ? 'ready' : 'unavailable'); });

// ---- Worker pool ----

const workers = [];
const idleWorkers = [];
const taskQueue = [];
let msgId = 0;
const pending = new Map(); // msgId → { resolve, reject }

function initPool() {
  for (let i = 0; i < NUM_WORKERS; i++) {
    const w = new Worker(WORKER_URL, { type: 'module' });
    w.onmessage = (e) => {
      const { id } = e.data;
      const p = pending.get(id);
      if (p) {
        pending.delete(id);
        p.resolve(e.data);
      }
      idleWorkers.push(w);
      drainQueue();
    };
    w.onerror = (err) => {
      console.error('Worker error:', err);
      idleWorkers.push(w);
      drainQueue();
    };
    workers.push(w);
    idleWorkers.push(w);
  }
}

function drainQueue() {
  while (taskQueue.length > 0 && idleWorkers.length > 0) {
    const task = taskQueue.shift();
    const w = idleWorkers.pop();
    w.postMessage(task.msg, task.transferables || []);
  }
}

function runTask(msg, transferables) {
  const id = ++msgId;
  msg.id = id;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    if (idleWorkers.length > 0) {
      const w = idleWorkers.pop();
      w.postMessage(msg, transferables || []);
    } else {
      taskQueue.push({ msg, transferables });
    }
  });
}

// ---- Generation-based cancellation ----

let generation = 0;

export function cancelCompute() {
  generation++;
}

function isStale(gen) {
  return gen !== generation;
}

// ---- High-level async API ----

/**
 * Sample the grid asynchronously across workers.
 * Falls back to main-thread chunked sampling if orbital.customSample exists.
 */
export async function sampleGridAsync(orbital, gridSize, halfExtent, onProgress) {
  const gen = generation;
  const N = gridSize;
  const totalVoxels = N * N * N;
  const _t0 = performance.now();

  // GPU fast path for density
  if (orbital.moList && gpuReady) {
    const gpuResult = await sampleDensityGridGPU(orbital.moList, N, halfExtent);
    if (gpuResult) { console.log(`[perf] sample ${N}³ density GPU: ${(performance.now()-_t0).toFixed(0)}ms`); return gpuResult; }
  }

  // Worker path for density: dispatch moList to workers
  if (orbital.moList) {
    const numChunks = NUM_WORKERS * 4;
    const slicesPerWorker = Math.ceil(N / numChunks);
    const tasks = [];
    for (let i = 0; i < numChunks; i++) {
      const zStart = i * slicesPerWorker;
      const zEnd = Math.min(zStart + slicesPerWorker, N);
      if (zStart >= N) break;
      tasks.push({ zStart, zEnd });
    }

    const results = new Array(tasks.length);
    let completed = 0;

    await Promise.all(tasks.map((t, i) =>
      runTask({
        type: 'sampleDensityGridChunk',
        moList: orbital.moList,
        gridSize: N,
        halfExtent,
        zStart: t.zStart,
        zEnd: t.zEnd
      }).then(result => {
        if (isStale(gen)) return;
        results[i] = { chunk: result.chunk, zStart: t.zStart, zEnd: t.zEnd };
        completed++;
        if (onProgress) onProgress(completed / tasks.length);
      })
    ));

    if (isStale(gen)) return null;

    const data = new Float32Array(totalVoxels);
    const sliceSize = N * N;
    for (const r of results) {
      if (!r) continue;
      data.set(r.chunk, r.zStart * sliceSize);
    }
    console.log(`[perf] sample ${N}³ density workers(${NUM_WORKERS}): ${(performance.now()-_t0).toFixed(0)}ms`);
    return data;
  }

  // Fallback: customSample must run on main thread
  if (orbital.customSample) {
    const data = new Float32Array(totalVoxels);
    const step = (2 * halfExtent) / (N - 1);
    const CHUNK = 4; // Z-slices per setTimeout chunk
    let doneSlices = 0;

    return new Promise((resolve) => {
      function doChunk() {
        if (isStale(gen)) { resolve(null); return; }
        const end = Math.min(doneSlices + CHUNK, N);
        for (let iz = doneSlices; iz < end; iz++) {
          const z = -halfExtent + iz * step;
          for (let iy = 0; iy < N; iy++) {
            const y = -halfExtent + iy * step;
            for (let ix = 0; ix < N; ix++) {
              const x = -halfExtent + ix * step;
              const idx = iz * N * N + iy * N + ix;
              data[idx] = orbital.customSample(x, y, z);
            }
          }
        }
        doneSlices = end;
        if (onProgress) onProgress(doneSlices / N);
        if (doneSlices >= N) {
          resolve(data);
        } else {
          setTimeout(doChunk, 0);
        }
      }
      doChunk();
    });
  }

  // GPU fast path: bypass workers entirely when WebGPU is available
  if (gpuReady && orbital.terms) {
    const gpuResult = await sampleGridGPU(orbital.terms, N, halfExtent);
    if (gpuResult) { console.log(`[perf] sample ${N}³ GPU: ${(performance.now()-_t0).toFixed(0)}ms`); return gpuResult; }
  }

  // Worker path: split Z-slices across workers (finer chunks for better load-balancing)
  const numChunks = NUM_WORKERS * 4;
  const slicesPerWorker = Math.ceil(N / numChunks);
  const tasks = [];
  for (let i = 0; i < numChunks; i++) {
    const zStart = i * slicesPerWorker;
    const zEnd = Math.min(zStart + slicesPerWorker, N);
    if (zStart >= N) break;
    tasks.push({ zStart, zEnd });
  }

  const results = new Array(tasks.length);
  let completed = 0;

  await Promise.all(tasks.map((t, i) =>
    runTask({
      type: 'sampleGridChunk',
      terms: orbital.terms,
      gridSize: N,
      halfExtent,
      zStart: t.zStart,
      zEnd: t.zEnd
    }).then(result => {
      if (isStale(gen)) return;
      results[i] = { chunk: result.chunk, zStart: t.zStart, zEnd: t.zEnd };
      completed++;
      if (onProgress) onProgress(completed / tasks.length);
    })
  ));

  if (isStale(gen)) return null;

  // Merge chunks into single Float32Array
  const data = new Float32Array(totalVoxels);
  const sliceSize = N * N;
  for (const r of results) {
    if (!r) continue;
    data.set(r.chunk, r.zStart * sliceSize);
  }
  console.log(`[perf] sample ${N}³ workers(${NUM_WORKERS}): ${(performance.now()-_t0).toFixed(0)}ms`);
  return data;
}

/**
 * Render layers asynchronously: compute thresholds then run marching cubes across workers.
 */
export async function renderLayersAsync(cacheData, halfExtent, gridSize, probability, numLayers, isDensity, onProgress) {
  const gen = generation;
  const _t0mc = performance.now();

  // Step 1: compute thresholds on one worker
  const threshResult = await runTask({
    type: 'computeThresholds',
    data: cacheData,
    probability,
    numLayers,
    halfExtent,
    gridSize
  });

  if (isStale(gen)) return null;

  const thresholds = threshResult.thresholds;

  // Step 2: negate data (main thread, fast)
  const negData = new Float32Array(cacheData.length);
  for (let j = 0; j < cacheData.length; j++) negData[j] = -cacheData[j];

  if (isStale(gen)) return null;

  // Step 3: dispatch two multi-threshold tasks (pos + neg) — data copied once each,
  // eliminating the 48× structured-clone overhead of the old per-threshold approach.
  const mcResults = [];

  await Promise.all(['pos', 'neg'].map((side, si) => {
    const data = si === 0 ? cacheData : negData;
    return runTask({ type: 'marchingCubesMulti', data, thresholds, gridSize })
      .then(result => {
        if (isStale(gen)) return;
        for (const r of result.results) {
          mcResults.push({ layer: r.ti, side, vertices: r.vertices, indices: r.indices });
        }
        if (onProgress) onProgress((si + 1) / 2);
      });
  }));

  if (isStale(gen)) return null;

  console.log(`[perf] MC ${gridSize}³ (${thresholds.length} layers): ${(performance.now()-_t0mc).toFixed(0)}ms`);
  return { thresholds, results: mcResults };
}

export async function computeGradientAsync(data, gridSize, halfExtent) {
  // Do NOT transfer data.buffer — caller may still need c.data after this resolves
  const result = await runTask({ type: 'computeGradient', data, gridSize, halfExtent });
  return result.grad;
}

// Initialize pool immediately
initPool();
