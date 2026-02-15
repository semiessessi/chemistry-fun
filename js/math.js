// Hydrogen atom wavefunction math:
// Radial part (associated Laguerre polynomials)
// Angular part (real spherical harmonics via associated Legendre polynomials)

export function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

// Associated Laguerre polynomial L_p^k(x) via recurrence
// L_0^k = 1, L_1^k = 1+k-x
// (p+1) L_{p+1}^k = (2p+1+k-x) L_p^k - (p+k) L_{p-1}^k
export function assocLaguerre(p, k, x) {
  if (p === 0) return 1;
  if (p === 1) return 1 + k - x;
  let lPrev = 1;
  let lCurr = 1 + k - x;
  for (let i = 1; i < p; i++) {
    const lNext = ((2 * i + 1 + k - x) * lCurr - (i + k) * lPrev) / (i + 1);
    lPrev = lCurr;
    lCurr = lNext;
  }
  return lCurr;
}

// Associated Legendre polynomial P_l^m(x) for m >= 0
// Includes Condon-Shortley phase
export function assocLegendre(l, m, x) {
  if (m < 0) throw new Error('m must be >= 0');
  let pmm = 1.0;
  if (m > 0) {
    const somx2 = Math.sqrt(1 - x * x);
    let fact = 1;
    for (let i = 1; i <= m; i++) {
      pmm *= -fact * somx2;
      fact += 2;
    }
  }
  if (l === m) return pmm;
  let pmm1 = x * (2 * m + 1) * pmm;
  if (l === m + 1) return pmm1;
  let pll = 0;
  for (let ll = m + 2; ll <= l; ll++) {
    pll = ((2 * ll - 1) * x * pmm1 - (ll + m - 1) * pmm) / (ll - m);
    pmm = pmm1;
    pmm1 = pll;
  }
  return pll;
}

// Radial wavefunction R_{n,l}(r) for hydrogen (r in units of a_0)
// R_{nl}(r) = sqrt((2/n)^3 * (n-l-1)! / (2n*(n+l)!)) * exp(-rho/2) * rho^l * L_{n-l-1}^{2l+1}(rho)
// where rho = 2r/n
export function radialWavefunction(n, l, r) {
  const rho = 2 * r / n;
  const normSq = Math.pow(2 / n, 3) * factorial(n - l - 1) / (2 * n * factorial(n + l));
  const norm = Math.sqrt(normSq);
  const expPart = Math.exp(-rho / 2);
  const rhoPow = Math.pow(rho, l);
  const lag = assocLaguerre(n - l - 1, 2 * l + 1, rho);
  return norm * expPart * rhoPow * lag;
}

// Real spherical harmonic Y_{l,m}(theta, phi)
// m=0: N * P_l^0(cos theta)
// m>0 cos: sqrt(2) * N * P_l^m(cos theta) * cos(m*phi)
// m>0 sin: sqrt(2) * N * P_l^m(cos theta) * sin(m*phi)
// N = sqrt((2l+1)/(4pi) * (l-m)!/(l+m)!)
export function realSphericalHarmonic(l, m, type, theta, phi) {
  const absm = Math.abs(m);
  const norm = Math.sqrt(
    (2 * l + 1) / (4 * Math.PI) * factorial(l - absm) / factorial(l + absm)
  );
  const plm = assocLegendre(l, absm, Math.cos(theta));

  if (m === 0) return norm * plm;

  const sqrt2 = Math.sqrt(2);
  if (type === 'cos') {
    return sqrt2 * norm * plm * Math.cos(absm * phi);
  } else {
    return sqrt2 * norm * plm * Math.sin(absm * phi);
  }
}

// Full hydrogen wavefunction psi(r, theta, phi) for a given orbital
export function psi(orbital, r, theta, phi) {
  if (r < 1e-10) r = 1e-10;
  const R = radialWavefunction(orbital.n, orbital.l, r);
  const Y = realSphericalHarmonic(orbital.l, orbital.m, orbital.type, theta, phi);
  return R * Y;
}

// Cartesian to spherical coordinates
export function cartToSph(x, y, z) {
  const r = Math.sqrt(x * x + y * y + z * z);
  const theta = r < 1e-15 ? 0 : Math.acos(z / r);
  const phi = Math.atan2(y, x);
  return { r, theta, phi };
}

// Evaluate a multi-center multi-term wavefunction at (x, y, z)
export function evaluateOrbital(orbital, x, y, z) {
  let value = 0;
  for (const term of orbital.terms) {
    let dx = x - term.center[0], dy = y - term.center[1], dz = z - term.center[2];
    // Per-atom orientation: rotate displacement into atom's local frame
    if (term.rot && term.l > 0) {
      const m = term.rot;
      const rx = m[0]*dx + m[1]*dy + m[2]*dz;
      const ry = m[3]*dx + m[4]*dy + m[5]*dz;
      const rz = m[6]*dx + m[7]*dy + m[8]*dz;
      dx = rx; dy = ry; dz = rz;
    }
    const { r, theta, phi } = cartToSph(dx, dy, dz);
    const zeta = term.zeta || 1;
    const psiVal = psi(
      { n: term.n, l: term.l, m: term.m, type: term.angType },
      r * zeta, theta, phi
    );
    value += term.coeff * psiVal * Math.pow(zeta, 1.5);
  }
  return value;
}
