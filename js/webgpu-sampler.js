// WebGPU grid sampler — three-tier GPU fast path.
// initWebGPU() must be called (and awaited/then'd) before sampleGridGPU is useful.
// Falls back gracefully when WebGPU is unavailable or the device is lost.

// ---- WGSL compute shader ----

const SHADER_SRC = /* wgsl */`
struct Params { N: u32, halfExtent: f32, numTerms: u32, _pad: u32 }

// Term struct: 80 bytes (= 20 × f32), matches DataView packing in packTerms()
struct Term {
  cx: f32, cy: f32, cz: f32,
  n: u32,  l: u32,
  m: i32,  angType: u32,
  coeff: f32, zeta: f32, _p: f32,
  rot0: f32, rot1: f32, rot2: f32,
  rot3: f32, rot4: f32, rot5: f32,
  rot6: f32, rot7: f32, rot8: f32,
  _p2: f32,
}

@group(0) @binding(0) var<uniform>           params : Params;
@group(0) @binding(1) var<storage, read>     terms  : array<Term>;
@group(0) @binding(2) var<storage, read_write> output : array<f32>;

fn fact(n: i32) -> f32 {
  var r = 1.0;
  for (var i = 2; i <= n; i++) { r *= f32(i); }
  return r;
}

fn assocLaguerre(p: i32, k: i32, x: f32) -> f32 {
  if (p == 0) { return 1.0; }
  if (p == 1) { return 1.0 + f32(k) - x; }
  var lPrev = 1.0;
  var lCurr = 1.0 + f32(k) - x;
  for (var i = 1; i < p; i++) {
    let lNext = ((2.0 * f32(i) + 1.0 + f32(k) - x) * lCurr - (f32(i) + f32(k)) * lPrev) / f32(i + 1);
    lPrev = lCurr;
    lCurr = lNext;
  }
  return lCurr;
}

fn assocLegendre(l: i32, m: i32, x: f32) -> f32 {
  var pmm = 1.0;
  if (m > 0) {
    let somx2 = sqrt(1.0 - x * x);
    var fct = 1.0;
    for (var i = 1; i <= m; i++) { pmm *= -fct * somx2; fct += 2.0; }
  }
  if (l == m) { return pmm; }
  var pmm1 = x * f32(2 * m + 1) * pmm;
  if (l == m + 1) { return pmm1; }
  var pll = 0.0;
  for (var ll = m + 2; ll <= l; ll++) {
    pll = (f32(2 * ll - 1) * x * pmm1 - f32(ll + m - 1) * pmm) / f32(ll - m);
    pmm  = pmm1;
    pmm1 = pll;
  }
  return pll;
}

fn radialWavefunction(n: i32, l: i32, r: f32) -> f32 {
  let rho     = 2.0 * r / f32(n);
  let normSq  = pow(2.0 / f32(n), 3.0) * fact(n - l - 1) / (2.0 * f32(n) * fact(n + l));
  let expPart = exp(-rho * 0.5);
  let rhoPow  = pow(rho, f32(l));
  let lag     = assocLaguerre(n - l - 1, 2 * l + 1, rho);
  return sqrt(normSq) * expPart * rhoPow * lag;
}

fn realSphericalHarmonic(l: i32, m: i32, angType: u32, theta: f32, phi: f32) -> f32 {
  let absm = abs(m);
  let norm = sqrt(f32(2 * l + 1) / (4.0 * 3.14159265358979323846) * fact(l - absm) / fact(l + absm));
  let plm  = assocLegendre(l, absm, cos(theta));
  if (m == 0) { return norm * plm; }
  let sq2 = sqrt(2.0);
  if (angType == 1u) { return sq2 * norm * plm * cos(f32(absm) * phi); }
  return                      sq2 * norm * plm * sin(f32(absm) * phi);
}

fn evalTerm(ti: u32, x: f32, y: f32, z: f32) -> f32 {
  let t  = terms[ti];
  var dx = x - t.cx;
  var dy = y - t.cy;
  var dz = z - t.cz;

  if (t.l > 0u) {
    let rx = t.rot0*dx + t.rot1*dy + t.rot2*dz;
    let ry = t.rot3*dx + t.rot4*dy + t.rot5*dz;
    let rz = t.rot6*dx + t.rot7*dy + t.rot8*dz;
    dx = rx; dy = ry; dz = rz;
  }

  let r = max(sqrt(dx*dx + dy*dy + dz*dz), 1e-10);
  let theta = acos(clamp(dz / r, -1.0, 1.0));
  let phi   = atan2(dy, dx);

  let R = radialWavefunction(i32(t.n), i32(t.l), r * t.zeta);
  let Y = realSphericalHarmonic(i32(t.l), t.m, t.angType, theta, phi);
  return t.coeff * R * Y * pow(t.zeta, 1.5);
}

@compute @workgroup_size(8, 8, 4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let N = params.N;
  if (gid.x >= N || gid.y >= N || gid.z >= N) { return; }

  let step = 2.0 * params.halfExtent / f32(N - 1u);
  let x    = -params.halfExtent + f32(gid.x) * step;
  let y    = -params.halfExtent + f32(gid.y) * step;
  let z    = -params.halfExtent + f32(gid.z) * step;

  var value = 0.0;
  for (var ti = 0u; ti < params.numTerms; ti++) { value += evalTerm(ti, x, y, z); }

  output[gid.z * N * N + gid.y * N + gid.x] = value;
}
`;

// ---- Module state ----

let device   = null;
let pipeline = null;

// ---- Buffer pool (avoids alloc/destroy on every sample call) ----
// busy: set synchronously before the first await so concurrent callers see it immediately
const gpuPool = { output: null, readback: null, size: 0, busy: false };

function getPooledBuffers(N3) {
  const needed = N3 * 4;
  if (!gpuPool.output || gpuPool.size < needed) {
    gpuPool.output?.destroy();
    gpuPool.readback?.destroy();
    gpuPool.output   = device.createBuffer({ size: needed, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    gpuPool.readback = device.createBuffer({ size: needed, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    gpuPool.size = needed;
  }
  return gpuPool;
}

// ---- Initialisation ----

export async function initWebGPU() {
  if (!navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return false;
    device = await adapter.requestDevice();
    device.lost.then(() => {
      device = null; pipeline = null;
      gpuPool.output = null; gpuPool.readback = null; gpuPool.size = 0;
    });

    const shaderModule = device.createShaderModule({ code: SHADER_SRC });
    pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'main' },
    });
    return true;
  } catch (e) {
    console.warn('WebGPU init failed:', e.message ?? e);
    return false;
  }
}

// ---- Term packing ----
// GPU struct Term is 80 bytes (20 × f32) — see SHADER_SRC for layout.

const TERM_BYTES  = 80;
const IDENT_ROT   = new Float32Array([1,0,0, 0,1,0, 0,0,1]);

function packTermsGPU(terms) {
  const buf = new ArrayBuffer(terms.length * TERM_BYTES);
  const dv  = new DataView(buf);
  for (let i = 0; i < terms.length; i++) {
    const t    = terms[i];
    const base = i * TERM_BYTES;
    dv.setFloat32(base +  0, t.center[0],                           true);
    dv.setFloat32(base +  4, t.center[1],                           true);
    dv.setFloat32(base +  8, t.center[2],                           true);
    dv.setUint32 (base + 12, t.n,                                   true);
    dv.setUint32 (base + 16, t.l,                                   true);
    dv.setInt32  (base + 20, t.m,                                   true);
    dv.setUint32 (base + 24, t.angType === 'cos' ? 1 : t.angType === 'sin' ? 2 : 0, true);
    dv.setFloat32(base + 28, t.coeff,                               true);
    dv.setFloat32(base + 32, t.zeta || 1,                           true);
    dv.setFloat32(base + 36, 0,                                     true);  // pad
    const rot = t.rot || IDENT_ROT;
    for (let r = 0; r < 9; r++) dv.setFloat32(base + 40 + r * 4, rot[r], true);
    dv.setFloat32(base + 76, 0,                                     true);  // pad2
  }
  return buf;
}

// ---- sampleGridGPU ----

export async function sampleGridGPU(terms, N, halfExtent) {
  if (!device || !pipeline) return null;
  if (gpuPool.busy) return null;  // concurrent call — fall back to workers
  gpuPool.busy = true;
  try {
    const N3 = N * N * N;

    // Params uniform (16 bytes)
    const paramsArr = new ArrayBuffer(16);
    const paramsDV  = new DataView(paramsArr);
    paramsDV.setUint32 (0, N,            true);
    paramsDV.setFloat32(4, halfExtent,   true);
    paramsDV.setUint32 (8, terms.length, true);
    const paramsGPU = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(paramsGPU, 0, paramsArr);

    // Terms storage
    const termsBuf = packTermsGPU(terms);
    const termsGPU = device.createBuffer({
      size: termsBuf.byteLength || 16,   // minimum 16 bytes
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    if (termsBuf.byteLength) device.queue.writeBuffer(termsGPU, 0, termsBuf);

    // Output storage + readback (pooled — reused if same or smaller size)
    const { output: outputGPU, readback: readbackGPU } = getPooledBuffers(N3);

    // Bind group + dispatch
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsGPU  } },
        { binding: 1, resource: { buffer: termsGPU   } },
        { binding: 2, resource: { buffer: outputGPU  } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass    = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(N / 8), Math.ceil(N / 8), Math.ceil(N / 4));
    pass.end();
    encoder.copyBufferToBuffer(outputGPU, 0, readbackGPU, 0, N3 * 4);
    device.queue.submit([encoder.finish()]);

    // Readback
    await readbackGPU.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(readbackGPU.getMappedRange().slice(0));
    readbackGPU.unmap();

    // Destroy only the small transient buffers (output/readback are pooled)
    paramsGPU.destroy();
    termsGPU.destroy();

    return result;
  } catch (e) {
    console.warn('sampleGridGPU failed:', e.message ?? e);
    return null;
  } finally {
    gpuPool.busy = false;
  }
}

// ---- Density shader (sum occ × ψ² over all MOs) ----

const DENSITY_SHADER_SRC = /* wgsl */`
struct Params { N: u32, halfExtent: f32, numMOs: u32, _pad: u32 }
struct MOHeader { termCount: u32, occ: f32, _p0: f32, _p1: f32 }
struct Term {
  cx: f32, cy: f32, cz: f32,
  n: u32, l: u32,
  m: i32, angType: u32,
  coeff: f32, zeta: f32, _p: f32,
  rot0: f32, rot1: f32, rot2: f32,
  rot3: f32, rot4: f32, rot5: f32,
  rot6: f32, rot7: f32, rot8: f32,
  _p2: f32,
}
@group(0) @binding(0) var<uniform>             params    : Params;
@group(0) @binding(1) var<storage, read>       moHeaders : array<MOHeader>;
@group(0) @binding(2) var<storage, read>       terms     : array<Term>;
@group(0) @binding(3) var<storage, read_write> output    : array<f32>;

fn fact(n: i32) -> f32 {
  var r = 1.0; for (var i = 2; i <= n; i++) { r *= f32(i); } return r;
}
fn assocLaguerre(p: i32, k: i32, x: f32) -> f32 {
  if (p == 0) { return 1.0; } if (p == 1) { return 1.0 + f32(k) - x; }
  var lP = 1.0; var lC = 1.0 + f32(k) - x;
  for (var i = 1; i < p; i++) {
    let lN = ((2.0*f32(i)+1.0+f32(k)-x)*lC - (f32(i)+f32(k))*lP) / f32(i+1);
    lP = lC; lC = lN;
  } return lC;
}
fn assocLegendre(l: i32, m: i32, x: f32) -> f32 {
  var pmm = 1.0;
  if (m > 0) { let s2 = sqrt(1.0-x*x); var f = 1.0; for (var i=1;i<=m;i++){pmm*=-f*s2;f+=2.0;} }
  if (l==m) { return pmm; } var pmm1 = x*f32(2*m+1)*pmm;
  if (l==m+1) { return pmm1; } var pll = 0.0;
  for (var ll=m+2;ll<=l;ll++) { pll=(f32(2*ll-1)*x*pmm1-f32(ll+m-1)*pmm)/f32(ll-m); pmm=pmm1; pmm1=pll; }
  return pll;
}
fn radialWF(n: i32, l: i32, r: f32) -> f32 {
  let rho=2.0*r/f32(n); let nSq=pow(2.0/f32(n),3.0)*fact(n-l-1)/(2.0*f32(n)*fact(n+l));
  return sqrt(nSq)*exp(-rho*0.5)*pow(rho,f32(l))*assocLaguerre(n-l-1,2*l+1,rho);
}
fn realSH(l: i32, m: i32, aT: u32, theta: f32, phi: f32) -> f32 {
  let am=abs(m); let norm=sqrt(f32(2*l+1)/(4.0*3.14159265358979)*fact(l-am)/fact(l+am));
  let plm=assocLegendre(l,am,cos(theta)); if(m==0){return norm*plm;}
  let sq2=sqrt(2.0); if(aT==1u){return sq2*norm*plm*cos(f32(am)*phi);} return sq2*norm*plm*sin(f32(am)*phi);
}
fn evalTerm(ti: u32, x: f32, y: f32, z: f32) -> f32 {
  let t=terms[ti]; var dx=x-t.cx; var dy=y-t.cy; var dz=z-t.cz;
  if(t.l>0u){let rx=t.rot0*dx+t.rot1*dy+t.rot2*dz;let ry=t.rot3*dx+t.rot4*dy+t.rot5*dz;let rz=t.rot6*dx+t.rot7*dy+t.rot8*dz;dx=rx;dy=ry;dz=rz;}
  let r=max(sqrt(dx*dx+dy*dy+dz*dz),1e-10);
  let R=radialWF(i32(t.n),i32(t.l),r*t.zeta);
  let Y=realSH(i32(t.l),t.m,t.angType,acos(clamp(dz/r,-1.0,1.0)),atan2(dy,dx));
  return t.coeff*R*Y*pow(t.zeta,1.5);
}
@compute @workgroup_size(8,8,4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let N=params.N; if(gid.x>=N||gid.y>=N||gid.z>=N){return;}
  let step=2.0*params.halfExtent/f32(N-1u);
  let x=-params.halfExtent+f32(gid.x)*step;
  let y=-params.halfExtent+f32(gid.y)*step;
  let z=-params.halfExtent+f32(gid.z)*step;
  var rho=0.0; var tOff=0u;
  for(var mo=0u;mo<params.numMOs;mo++){
    let hdr=moHeaders[mo]; var psi=0.0;
    for(var t=0u;t<hdr.termCount;t++){psi+=evalTerm(tOff+t,x,y,z);}
    rho+=hdr.occ*psi*psi; tOff+=hdr.termCount;
  }
  output[gid.z*N*N+gid.y*N+gid.x]=sqrt(rho);
}
`;

let densityPipeline = null;

async function getDensityPipeline() {
  if (!device) return null;
  if (densityPipeline) return densityPipeline;
  try {
    const mod = device.createShaderModule({ code: DENSITY_SHADER_SRC });
    densityPipeline = device.createComputePipeline({ layout: 'auto', compute: { module: mod, entryPoint: 'main' } });
    device.lost.then(() => { densityPipeline = null; });
    return densityPipeline;
  } catch (e) {
    console.warn('Density pipeline failed:', e.message ?? e);
    return null;
  }
}

function packDensityBuffers(moList) {
  // MO headers: [termCount u32, occ f32, pad f32, pad f32] = 16 bytes each
  const hdrBuf = new ArrayBuffer(moList.length * 16);
  const hdrDV  = new DataView(hdrBuf);
  let totalTerms = 0;
  for (let i = 0; i < moList.length; i++) {
    hdrDV.setUint32(i * 16,     moList[i].terms.length, true);
    hdrDV.setFloat32(i * 16 + 4, moList[i].occ,         true);
    totalTerms += moList[i].terms.length;
  }
  // Terms flat (same 80-byte struct as singleOrbital)
  const termsBuf = new ArrayBuffer(totalTerms * TERM_BYTES);
  const termsDV  = new DataView(termsBuf);
  let offset = 0;
  for (const mo of moList) {
    for (const t of mo.terms) {
      const b = offset * TERM_BYTES;
      termsDV.setFloat32(b,    t.center[0],  true);
      termsDV.setFloat32(b+4,  t.center[1],  true);
      termsDV.setFloat32(b+8,  t.center[2],  true);
      termsDV.setUint32 (b+12, t.n,          true);
      termsDV.setUint32 (b+16, t.l,          true);
      termsDV.setInt32  (b+20, t.m,          true);
      termsDV.setUint32 (b+24, t.angType === 'cos' ? 1 : t.angType === 'sin' ? 2 : 0, true);
      termsDV.setFloat32(b+28, t.coeff,      true);
      termsDV.setFloat32(b+32, t.zeta || 1,  true);
      termsDV.setFloat32(b+36, 0,            true);
      const rot = t.rot || IDENT_ROT;
      for (let r = 0; r < 9; r++) termsDV.setFloat32(b + 40 + r * 4, rot[r], true);
      termsDV.setFloat32(b+76, 0, true);
      offset++;
    }
  }
  return { hdrBuf, termsBuf };
}

export async function sampleDensityGridGPU(moList, N, halfExtent) {
  if (!device) return null;
  if (gpuPool.busy) return null;  // concurrent call — fall back to workers
  gpuPool.busy = true;            // claim synchronously before first await
  const pipe = await getDensityPipeline();
  if (!pipe) { gpuPool.busy = false; return null; }
  try {
    const N3 = N * N * N;
    const { hdrBuf, termsBuf } = packDensityBuffers(moList);

    const paramsBuf = new ArrayBuffer(16);
    const pDV = new DataView(paramsBuf);
    pDV.setUint32(0, N, true); pDV.setFloat32(4, halfExtent, true); pDV.setUint32(8, moList.length, true);
    const paramsGPU = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(paramsGPU, 0, paramsBuf);

    const hdrGPU = device.createBuffer({ size: Math.max(hdrBuf.byteLength, 16), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(hdrGPU, 0, hdrBuf);

    const termsGPU = device.createBuffer({ size: Math.max(termsBuf.byteLength, 16), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(termsGPU, 0, termsBuf);

    // Output/readback pooled — reused if same or smaller size
    const { output: outputGPU, readback: readbackGPU } = getPooledBuffers(N3);

    const bindGroup = device.createBindGroup({
      layout: pipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramsGPU  } },
        { binding: 1, resource: { buffer: hdrGPU     } },
        { binding: 2, resource: { buffer: termsGPU   } },
        { binding: 3, resource: { buffer: outputGPU  } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipe);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(N / 8), Math.ceil(N / 8), Math.ceil(N / 4));
    pass.end();
    encoder.copyBufferToBuffer(outputGPU, 0, readbackGPU, 0, N3 * 4);
    device.queue.submit([encoder.finish()]);

    await readbackGPU.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(readbackGPU.getMappedRange().slice(0));
    readbackGPU.unmap();

    paramsGPU.destroy(); hdrGPU.destroy(); termsGPU.destroy();
    return result;
  } catch (e) {
    console.warn('sampleDensityGridGPU failed:', e.message ?? e);
    return null;
  } finally {
    gpuPool.busy = false;
  }
}

// ---- GPU Poisson SOR for electrostatic potential ----

const SOR_SHADER_SRC = /* wgsl */`
struct SorParams {
  N:       i32,
  h2_4pi:  f32,
  omega:   f32,
  parity:  i32,
}

@group(0) @binding(0) var<uniform>            params : SorParams;
@group(0) @binding(1) var<storage, read>      rho    : array<f32>;
@group(0) @binding(2) var<storage, read_write> Vel   : array<f32>;

@compute @workgroup_size(8, 8, 4)
fn sor_pass(@builtin(global_invocation_id) gid: vec3<u32>) {
  let ix = i32(gid.x) + 1;
  let iy = i32(gid.y) + 1;
  let iz = i32(gid.z) + 1;
  let N  = params.N;
  if (ix >= N - 1 || iy >= N - 1 || iz >= N - 1) { return; }
  if ((ix + iy + iz) % 2 != params.parity)        { return; }
  let N2  = N * N;
  let idx = iz * N2 + iy * N + ix;
  let nbrs = Vel[idx-1] + Vel[idx+1] + Vel[idx-N] + Vel[idx+N]
           + Vel[idx-N2] + Vel[idx+N2];
  let newVal = (nbrs - params.h2_4pi * rho[idx]) / 6.0;
  Vel[idx] = Vel[idx] + params.omega * (newVal - Vel[idx]);
}
`;

let sorPipeline = null;

async function getSorPipeline() {
  if (sorPipeline) return sorPipeline;
  if (!device) return null;
  const mod = device.createShaderModule({ code: SOR_SHADER_SRC });
  sorPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: mod, entryPoint: 'sor_pass' },
  });
  return sorPipeline;
}

// Solves ∇²Vel = 4π·rho on an N³ grid via red-black SOR on the GPU.
// Returns Float32Array (N³) or null if GPU unavailable.
export async function solvePoissonGPU(rho, N, step, numIter) {
  if (!device) return null;
  const pipe = await getSorPipeline();
  if (!pipe) return null;
  try {
    const N3   = N * N * N;
    const h2pi = 4 * Math.PI * step * step;

    // Rho buffer (read-only)
    const rhoGPU = device.createBuffer({
      size: N3 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(rhoGPU, 0, rho);

    // Vel buffer (read-write, zero-initialised)
    const VelGPU = device.createBuffer({
      size: N3 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Two params uniforms: parity 0 (red) and parity 1 (black)
    function makeParamsBuffer(parity) {
      const buf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const arr = new ArrayBuffer(16);
      const dv  = new DataView(arr);
      dv.setInt32  (0,  N,      true);
      dv.setFloat32(4,  h2pi,   true);
      dv.setFloat32(8,  1.85,   true);
      dv.setInt32  (12, parity, true);
      device.queue.writeBuffer(buf, 0, arr);
      return buf;
    }
    const paramsRed   = makeParamsBuffer(0);
    const paramsBlack = makeParamsBuffer(1);

    const bgLayout = pipe.getBindGroupLayout(0);
    function makeBG(paramsBuf) {
      return device.createBindGroup({
        layout: bgLayout,
        entries: [
          { binding: 0, resource: { buffer: paramsBuf } },
          { binding: 1, resource: { buffer: rhoGPU    } },
          { binding: 2, resource: { buffer: VelGPU    } },
        ],
      });
    }
    const bgRed   = makeBG(paramsRed);
    const bgBlack = makeBG(paramsBlack);

    const wgX = Math.ceil((N - 2) / 8);
    const wgY = Math.ceil((N - 2) / 8);
    const wgZ = Math.ceil((N - 2) / 4);

    // All SOR passes in one encoder — WebGPU guarantees sequential execution
    // within a command encoder, so each pass sees writes from the previous pass.
    const encoder = device.createCommandEncoder();
    for (let i = 0; i < numIter; i++) {
      const passR = encoder.beginComputePass();
      passR.setPipeline(pipe);
      passR.setBindGroup(0, bgRed);
      passR.dispatchWorkgroups(wgX, wgY, wgZ);
      passR.end();

      const passB = encoder.beginComputePass();
      passB.setPipeline(pipe);
      passB.setBindGroup(0, bgBlack);
      passB.dispatchWorkgroups(wgX, wgY, wgZ);
      passB.end();
    }

    // Readback
    const readback = device.createBuffer({
      size: N3 * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    encoder.copyBufferToBuffer(VelGPU, 0, readback, 0, N3 * 4);
    device.queue.submit([encoder.finish()]);

    await readback.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(readback.getMappedRange().slice(0));
    readback.unmap();

    // Cleanup transient buffers
    rhoGPU.destroy();
    VelGPU.destroy();
    paramsRed.destroy();
    paramsBlack.destroy();
    readback.destroy();

    return result;
  } catch (e) {
    console.warn('solvePoissonGPU failed:', e.message ?? e);
    return null;
  }
}
