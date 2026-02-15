// Worker pool manager with async task API and progress reporting.
// Distributes grid sampling, threshold computation, and marching cubes across workers.

import { sampleGrid } from './grid.js';

const WORKER_URL = new URL('./compute-worker.js', import.meta.url).href;
const NUM_WORKERS = Math.max(2, Math.min(8, navigator.hardwareConcurrency || 4));

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

  // Worker path for density: dispatch moList to workers
  if (orbital.moList) {
    const slicesPerWorker = Math.ceil(N / NUM_WORKERS);
    const tasks = [];
    for (let i = 0; i < NUM_WORKERS; i++) {
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

  // Worker path: split Z-slices across workers
  const slicesPerWorker = Math.ceil(N / NUM_WORKERS);
  const tasks = [];
  for (let i = 0; i < NUM_WORKERS; i++) {
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
  return data;
}

/**
 * Render layers asynchronously: compute thresholds then run marching cubes across workers.
 */
export async function renderLayersAsync(cacheData, halfExtent, gridSize, probability, numLayers, isDensity, onProgress) {
  const gen = generation;

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

  // Step 3: dispatch marching cubes tasks for each threshold × {pos, neg}
  const mcTasks = [];
  for (let i = 0; i < thresholds.length; i++) {
    mcTasks.push({ layer: i, side: 'pos', data: cacheData, threshold: thresholds[i] });
    mcTasks.push({ layer: i, side: 'neg', data: negData, threshold: thresholds[i] });
  }

  const totalMC = mcTasks.length;
  let mcCompleted = 0;
  const mcResults = [];

  await Promise.all(mcTasks.map(t =>
    runTask({
      type: 'marchingCubes',
      data: t.data,
      gridSize,
      threshold: t.threshold
    }).then(result => {
      if (isStale(gen)) return;
      mcResults.push({
        layer: t.layer,
        side: t.side,
        vertices: result.vertices,
        indices: result.indices
      });
      mcCompleted++;
      if (onProgress) onProgress(mcCompleted / totalMC);
    })
  ));

  if (isStale(gen)) return null;

  return { thresholds, results: mcResults };
}

// Initialize pool immediately
initPool();
