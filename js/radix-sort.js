// Standalone Float32 radix sort, 2-pass LSD (16 bits per pass), ascending in-place.
// Handles negative floats via bit manipulation — no boxing, no object allocation.
// ~5-10× faster than Array.from().sort() on 1M+ elements.

export function radixSortFloat32(arr) {
  const n = arr.length;
  if (n <= 1) return;

  // Alias the input buffer as uint32 for bit manipulation
  const uint = new Uint32Array(arr.buffer, arr.byteOffset, n);
  const buf1 = new Uint32Array(n);
  const buf2 = new Uint32Array(n);
  const hist = new Uint32Array(65536);

  // Encode: map float bit pattern to a uint32 that sorts ascending
  //   positive floats (bit 31 = 0): flip sign bit only   → 0x80000000..0xFFFFFFFF
  //   negative floats (bit 31 = 1): flip all bits        → 0x00000000..0x7FFFFFFF
  // Combined: xor with  (signBit >> 31) | 0x80000000
  for (let i = 0; i < n; i++) {
    const x = uint[i];
    buf1[i] = (x ^ (((x >> 31) | 0x80000000) >>> 0)) >>> 0;
  }

  // Pass 1: sort by low 16 bits
  for (let i = 0; i < n; i++) hist[buf1[i] & 0xFFFF]++;
  let sum = 0;
  for (let i = 0; i < 65536; i++) { const c = hist[i]; hist[i] = sum; sum += c; }
  for (let i = 0; i < n; i++) { const k = buf1[i] & 0xFFFF; buf2[hist[k]++] = buf1[i]; }

  // Pass 2: sort by high 16 bits
  hist.fill(0);
  for (let i = 0; i < n; i++) hist[buf2[i] >>> 16]++;
  sum = 0;
  for (let i = 0; i < 65536; i++) { const c = hist[i]; hist[i] = sum; sum += c; }
  for (let i = 0; i < n; i++) { const k = buf2[i] >>> 16; buf1[hist[k]++] = buf2[i]; }

  // Decode back to float bit pattern and write in-place
  // Inverse of encode: positive (bit 31 = 1 after encode) → xor 0x80000000
  //                    negative (bit 31 = 0 after encode) → xor 0xFFFFFFFF
  for (let i = 0; i < n; i++) {
    const x = buf1[i];
    uint[i] = (x ^ ((((x >>> 31) - 1) | 0x80000000) >>> 0)) >>> 0;
  }
}
