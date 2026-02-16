// Orbital generators: LCAO molecular orbitals for diatomic and triatomic bond formation.

import { BOND_FORMING_CONFIG } from './configs.js';

// ---- Helper functions ----

function overlap1s(R) {
  return (1 + R + R * R / 3) * Math.exp(-R);
}

function slaterZeta(R) {
  const dR = R - BOND_FORMING_CONFIG.R_EQ;
  return 1 + 0.197 * Math.exp(-0.5 * dR * dR);
}

function dist(a, b) {
  const dx = b[0]-a[0], dy = b[1]-a[1], dz = b[2]-a[2];
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

// ============================================================
// Diatomic orbital generators
// ============================================================

export function generateH2Orbital(type, R) {
  const zeta = slaterZeta(R);
  const S = overlap1s(zeta * R);
  const halfR = R / 2;

  let coeff, name;
  if (type === 'bonding') {
    coeff = 1 / Math.sqrt(2 * (1 + S));
    name = 'H\u2082 \u03C3 bonding';
  } else {
    coeff = 1 / Math.sqrt(2 * (1 - S));
    name = 'H\u2082 \u03C3* antibonding';
  }

  const sign = type === 'bonding' ? 1 : -1;
  const halfExtent = Math.max(R / 2 + 6, 10);

  return {
    name,
    terms: [
      { n: 1, l: 0, m: 0, angType: 'real', center: [0, 0, -halfR], coeff: coeff, zeta },
      { n: 1, l: 0, m: 0, angType: 'real', center: [0, 0, halfR], coeff: sign * coeff, zeta },
    ],
    halfExtent,
  };
}

export function generateN2Orbital(type, R, orientations) {
  const halfR = R / 2;
  const c = 1 / Math.sqrt(2);
  const halfExtent = Math.max(R / 2 + 8, 12);

  const configs = {
    'sigma_2s': {
      name: 'N\u2082 \u03C3(2s)',
      terms: [
        { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, -halfR], coeff: c },
        { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, halfR], coeff: c },
      ],
    },
    'sigma_star_2s': {
      name: 'N\u2082 \u03C3*(2s)',
      terms: [
        { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, -halfR], coeff: c },
        { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, halfR], coeff: -c },
      ],
    },
    'pi_2p': {
      name: 'N\u2082 \u03C0(2p)',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, -halfR], coeff: c },
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, halfR], coeff: c },
      ],
    },
    'sigma_2p': {
      name: 'N\u2082 \u03C3(2p)',
      terms: [
        { n: 2, l: 1, m: 0, angType: 'real', center: [0, 0, -halfR], coeff: c },
        { n: 2, l: 1, m: 0, angType: 'real', center: [0, 0, halfR], coeff: -c },
      ],
    },
    'pi_star_2p': {
      name: 'N\u2082 \u03C0*(2p)',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, -halfR], coeff: c },
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, halfR], coeff: -c },
      ],
    },
  };

  const cfg = configs[type];
  if (orientations) {
    for (const term of cfg.terms) {
      const atomIdx = term.center[2] < 0 ? 0 : 1;
      term.rot = orientations[atomIdx];
    }
  }
  return { name: cfg.name, terms: cfg.terms, halfExtent };
}

export function generateO2Orbital(type, R, orientations) {
  const halfR = R / 2;
  const c = 1 / Math.sqrt(2);
  const halfExtent = Math.max(R / 2 + 8, 12);

  const configs = {
    'sigma_2s': {
      name: 'O\u2082 \u03C3(2s)',
      terms: [
        { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, -halfR], coeff: c },
        { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, halfR], coeff: c },
      ],
    },
    'sigma_2p': {
      name: 'O\u2082 \u03C3(2p)',
      terms: [
        { n: 2, l: 1, m: 0, angType: 'real', center: [0, 0, -halfR], coeff: c },
        { n: 2, l: 1, m: 0, angType: 'real', center: [0, 0, halfR], coeff: -c },
      ],
    },
    'pi_2p': {
      name: 'O\u2082 \u03C0(2p)',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, -halfR], coeff: c },
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, halfR], coeff: c },
      ],
    },
    'pi_star_2px': {
      name: 'O\u2082 \u03C0*(2px)',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, -halfR], coeff: c },
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, halfR], coeff: -c },
      ],
    },
    'pi_star_2py': {
      name: 'O\u2082 \u03C0*(2py)',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'sin', center: [0, 0, -halfR], coeff: c },
        { n: 2, l: 1, m: 1, angType: 'sin', center: [0, 0, halfR], coeff: -c },
      ],
    },
  };

  const cfg = configs[type];
  if (orientations) {
    for (const term of cfg.terms) {
      const atomIdx = term.center[2] < 0 ? 0 : 1;
      term.rot = orientations[atomIdx];
    }
  }
  return { name: cfg.name, terms: cfg.terms, halfExtent };
}

export function generateCOOrbital(type, R, orientations) {
  const halfR = R / 2;
  const halfExtent = Math.max(R / 2 + 8, 12);

  const configs = {
    'sigma_2s': {
      name: 'CO \u03C3(2s)',
      terms: [
        { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, -halfR], coeff: 0.55 },
        { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, halfR], coeff: 0.85 },
      ],
    },
    'sigma_star_2s': {
      name: 'CO \u03C3*(2s)',
      terms: [
        { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, -halfR], coeff: 0.85 },
        { n: 2, l: 0, m: 0, angType: 'real', center: [0, 0, halfR], coeff: -0.55 },
      ],
    },
    'pi_2p': {
      name: 'CO \u03C0(2p)',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, -halfR], coeff: 0.6 },
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, halfR], coeff: 0.8 },
      ],
    },
    'sigma_2p': {
      name: 'CO \u03C3(2p)',
      terms: [
        { n: 2, l: 1, m: 0, angType: 'real', center: [0, 0, -halfR], coeff: 0.6 },
        { n: 2, l: 1, m: 0, angType: 'real', center: [0, 0, halfR], coeff: -0.8 },
      ],
    },
    'pi_star_2p': {
      name: 'CO \u03C0*(2p)',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, -halfR], coeff: 0.8 },
        { n: 2, l: 1, m: 1, angType: 'cos', center: [0, 0, halfR], coeff: -0.6 },
      ],
    },
  };

  const cfg = configs[type];
  if (orientations) {
    for (const term of cfg.terms) {
      const atomIdx = term.center[2] < 0 ? 0 : 1;
      term.rot = orientations[atomIdx];
    }
  }
  return { name: cfg.name, terms: cfg.terms, halfExtent };
}

// ============================================================
// Triatomic orbital generators (canonical frame)
// ============================================================

export function generateCO2Orbital(type, positions, orientations) {
  const d1 = dist(positions[0], positions[1]);
  const d2 = dist(positions[1], positions[2]);
  const halfExtent = Math.max(d1, d2) + 8;
  const cO1 = [0, 0, -d1], cC = [0, 0, 0], cO2 = [0, 0, d2];
  const centerToAtom = [cO1, cC, cO2];

  const configs = {
    'sigma_2s': {
      name: 'CO\u2082 \u03C3(2s)',
      terms: [
        { n: 2, l: 0, m: 0, angType: 'real', center: cO1, coeff: 0.5 },
        { n: 2, l: 0, m: 0, angType: 'real', center: cC,  coeff: 0.7 },
        { n: 2, l: 0, m: 0, angType: 'real', center: cO2, coeff: 0.5 },
      ],
    },
    'sigma_2p': {
      name: 'CO\u2082 \u03C3(2p)',
      terms: [
        { n: 2, l: 1, m: 0, angType: 'real', center: cO1, coeff: 0.7 },
        { n: 2, l: 1, m: 0, angType: 'real', center: cC,  coeff: 1.0 },
        { n: 2, l: 1, m: 0, angType: 'real', center: cO2, coeff: -0.7 },
      ],
    },
    'pi_2p': {
      name: 'CO\u2082 \u03C0(2p)',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'cos', center: cO1, coeff: 0.6 },
        { n: 2, l: 1, m: 1, angType: 'cos', center: cC,  coeff: 1.0 },
        { n: 2, l: 1, m: 1, angType: 'cos', center: cO2, coeff: 0.6 },
      ],
    },
    'pi_star_2p': {
      name: 'CO\u2082 \u03C0*(2p)',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'cos', center: cO1, coeff: 0.7 },
        { n: 2, l: 1, m: 1, angType: 'cos', center: cC,  coeff: 0.0 },
        { n: 2, l: 1, m: 1, angType: 'cos', center: cO2, coeff: -0.7 },
      ],
    },
  };

  const cfg = configs[type];
  if (orientations) {
    for (const term of cfg.terms) {
      const atomIdx = centerToAtom.indexOf(term.center);
      if (atomIdx >= 0) term.rot = orientations[atomIdx];
    }
  }
  return { name: cfg.name, terms: cfg.terms, halfExtent };
}

export function generateO3Orbital(type, positions, orientations) {
  const d1 = dist(positions[0], positions[1]);
  const d2 = dist(positions[1], positions[2]);
  const halfExtent = Math.max(d1, d2) + 8;

  const v1 = [positions[0][0] - positions[1][0], positions[0][1] - positions[1][1], positions[0][2] - positions[1][2]];
  const v2 = [positions[2][0] - positions[1][0], positions[2][1] - positions[1][1], positions[2][2] - positions[1][2]];
  const dot = v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2];
  let cosAngle = dot / (d1 * d2);
  cosAngle = Math.max(-1, Math.min(1, cosAngle));
  const angle = Math.acos(cosAngle);
  const halfAngle = angle / 2;

  const cO1 = [d1 * Math.sin(halfAngle), 0, d1 * Math.cos(halfAngle)];
  const cCenter = [0, 0, 0];
  const cO2 = [-d2 * Math.sin(halfAngle), 0, d2 * Math.cos(halfAngle)];
  const centerToAtom = [cO1, cCenter, cO2];

  const configs = {
    'sigma_sym': {
      name: 'O\u2083 \u03C3 sym',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'cos', center: cCenter, coeff: 0.8 },
        { n: 2, l: 0, m: 0, angType: 'real', center: cO1, coeff: 0.45 },
        { n: 2, l: 0, m: 0, angType: 'real', center: cO2, coeff: 0.45 },
      ],
    },
    'pi_deloc': {
      name: 'O\u2083 \u03C0 deloc',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'sin', center: cCenter, coeff: 0.7 },
        { n: 2, l: 1, m: 1, angType: 'sin', center: cO1, coeff: 0.5 },
        { n: 2, l: 1, m: 1, angType: 'sin', center: cO2, coeff: 0.5 },
      ],
    },
    'pi_star': {
      name: 'O\u2083 \u03C0* anti',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'sin', center: cCenter, coeff: 0.0 },
        { n: 2, l: 1, m: 1, angType: 'sin', center: cO1, coeff: 0.7 },
        { n: 2, l: 1, m: 1, angType: 'sin', center: cO2, coeff: -0.7 },
      ],
    },
    'lone_pair': {
      name: 'O\u2083 lone pair',
      terms: [
        { n: 2, l: 1, m: 0, angType: 'real', center: cCenter, coeff: 1.0 },
      ],
    },
    'sigma_2s': {
      name: 'O\u2083 \u03C3(2s)',
      terms: [
        { n: 2, l: 0, m: 0, angType: 'real', center: cO1, coeff: 0.5 },
        { n: 2, l: 0, m: 0, angType: 'real', center: cCenter, coeff: 0.7 },
        { n: 2, l: 0, m: 0, angType: 'real', center: cO2, coeff: 0.5 },
      ],
    },
    'sigma_star_2s': {
      name: 'O\u2083 \u03C3*(2s)',
      terms: [
        { n: 2, l: 0, m: 0, angType: 'real', center: cO1, coeff: 0.7 },
        { n: 2, l: 0, m: 0, angType: 'real', center: cCenter, coeff: 0.0 },
        { n: 2, l: 0, m: 0, angType: 'real', center: cO2, coeff: -0.7 },
      ],
    },
    'nb_2s': {
      name: 'O\u2083 nb(2s)',
      terms: [
        { n: 2, l: 0, m: 0, angType: 'real', center: cO1, coeff: 0.3 },
        { n: 2, l: 0, m: 0, angType: 'real', center: cCenter, coeff: -0.9 },
        { n: 2, l: 0, m: 0, angType: 'real', center: cO2, coeff: 0.3 },
      ],
    },
    'sigma_star': {
      name: 'O\u2083 \u03C3* anti',
      terms: [
        { n: 2, l: 1, m: 1, angType: 'cos', center: cO1, coeff: 0.7 },
        { n: 2, l: 1, m: 1, angType: 'cos', center: cCenter, coeff: 0.0 },
        { n: 2, l: 1, m: 1, angType: 'cos', center: cO2, coeff: -0.7 },
      ],
    },
    'lp_outer': {
      name: 'O\u2083 lp outer',
      terms: [
        { n: 2, l: 1, m: 0, angType: 'real', center: cO1, coeff: 0.5 },
        { n: 2, l: 1, m: 1, angType: 'cos', center: cO1, coeff: 0.5 * Math.sin(halfAngle) },
        { n: 2, l: 1, m: 0, angType: 'real', center: cO2, coeff: 0.5 },
        { n: 2, l: 1, m: 1, angType: 'cos', center: cO2, coeff: -0.5 * Math.sin(halfAngle) },
      ],
    },
  };

  const cfg = configs[type];
  if (orientations) {
    for (const term of cfg.terms) {
      const atomIdx = centerToAtom.indexOf(term.center);
      if (atomIdx >= 0) term.rot = orientations[atomIdx];
    }
  }
  return { name: cfg.name, terms: cfg.terms, halfExtent };
}
