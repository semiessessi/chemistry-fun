// Density samplers: electron density generators for bond-forming molecules.

import { evaluateOrbital } from '../math.js';
import { generateH2Orbital, generateN2Orbital, generateO2Orbital, generateCOOrbital, generateCO2Orbital, generateO3Orbital } from './orbital-generators.js';

// ---- Helper: distance between two [x,y,z] arrays ----

function dist(a, b) {
  const dx = b[0]-a[0], dy = b[1]-a[1], dz = b[2]-a[2];
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

// ---- Density sampler factory ----

function makeDensitySampler(moList) {
  return (x, y, z) => {
    let rho = 0;
    for (const { mo, occ } of moList) {
      const psi = evaluateOrbital(mo, x, y, z);
      rho += occ * psi * psi;
    }
    return Math.sqrt(rho);
  };
}

// ---- Generate px variant from py orbital (or vice versa) ----

function swapPxPy(orbital) {
  return {
    ...orbital,
    terms: orbital.terms.map(t => ({
      ...t,
      angType: t.angType === 'cos' ? 'sin' : t.angType === 'sin' ? 'cos' : t.angType,
    })),
  };
}

// ============================================================
// Diatomic density generators
// ============================================================

export function generateH2Density(R) {
  const bonding = generateH2Orbital('bonding', R);
  const moList = [{ terms: bonding.terms, occ: 2 }];
  return {
    name: 'H\u2082 density',
    halfExtent: bonding.halfExtent,
    moList,
    customSample: makeDensitySampler([{ mo: bonding, occ: 2 }]),
  };
}

export function generateN2Density(R, orientations) {
  const s2s = generateN2Orbital('sigma_2s', R, orientations);
  const ss2s = generateN2Orbital('sigma_star_2s', R, orientations);
  const pi_px = generateN2Orbital('pi_2p', R, orientations);
  const pi_py = swapPxPy(pi_px);
  const s2p = generateN2Orbital('sigma_2p', R, orientations);
  const halfExtent = Math.max(R / 2 + 8, 12);
  const moList = [
    { terms: s2s.terms, occ: 2 }, { terms: ss2s.terms, occ: 2 },
    { terms: pi_px.terms, occ: 2 }, { terms: pi_py.terms, occ: 2 },
    { terms: s2p.terms, occ: 2 },
  ];
  return {
    name: 'N\u2082 density',
    halfExtent,
    moList,
    customSample: makeDensitySampler(moList.map(m => ({ mo: { terms: m.terms }, occ: m.occ }))),
  };
}

export function generateO2Density(R, orientations) {
  const s2s = generateO2Orbital('sigma_2s', R, orientations);
  const s2p = generateO2Orbital('sigma_2p', R, orientations);
  const pi_px = generateO2Orbital('pi_2p', R, orientations);
  const pi_py = swapPxPy(pi_px);
  const piS_px = generateO2Orbital('pi_star_2px', R, orientations);
  const piS_py = generateO2Orbital('pi_star_2py', R, orientations);
  const halfExtent = Math.max(R / 2 + 8, 12);
  const moList = [
    { terms: s2s.terms, occ: 2 }, { terms: s2p.terms, occ: 2 },
    { terms: pi_px.terms, occ: 2 }, { terms: pi_py.terms, occ: 2 },
    { terms: piS_px.terms, occ: 1 }, { terms: piS_py.terms, occ: 1 },
  ];
  return {
    name: 'O\u2082 density',
    halfExtent,
    moList,
    customSample: makeDensitySampler(moList.map(m => ({ mo: { terms: m.terms }, occ: m.occ }))),
  };
}

export function generateCODensity(R, orientations) {
  const s2s = generateCOOrbital('sigma_2s', R, orientations);
  const ss2s = generateCOOrbital('sigma_star_2s', R, orientations);
  const pi_px = generateCOOrbital('pi_2p', R, orientations);
  const pi_py = swapPxPy(pi_px);
  const s2p = generateCOOrbital('sigma_2p', R, orientations);
  const halfExtent = Math.max(R / 2 + 8, 12);
  const moList = [
    { terms: s2s.terms, occ: 2 }, { terms: ss2s.terms, occ: 2 },
    { terms: pi_px.terms, occ: 2 }, { terms: pi_py.terms, occ: 2 },
    { terms: s2p.terms, occ: 2 },
  ];
  return {
    name: 'CO density',
    halfExtent,
    moList,
    customSample: makeDensitySampler(moList.map(m => ({ mo: { terms: m.terms }, occ: m.occ }))),
  };
}

// ============================================================
// Triatomic density generators
// ============================================================

export function generateCO2Density(positions, orientations) {
  const s2s = generateCO2Orbital('sigma_2s', positions, orientations);
  const s2p = generateCO2Orbital('sigma_2p', positions, orientations);
  const pi_px = generateCO2Orbital('pi_2p', positions, orientations);
  const pi_py = swapPxPy(pi_px);
  const piS_px = generateCO2Orbital('pi_star_2p', positions, orientations);
  const piS_py = swapPxPy(piS_px);
  const halfExtent = Math.max(dist(positions[0], positions[1]), dist(positions[1], positions[2])) + 8;
  const moList = [
    { terms: s2s.terms, occ: 2 }, { terms: s2p.terms, occ: 2 },
    { terms: pi_px.terms, occ: 2 }, { terms: pi_py.terms, occ: 2 },
    { terms: piS_px.terms, occ: 2 }, { terms: piS_py.terms, occ: 2 },
  ];
  return {
    name: 'CO\u2082 density',
    halfExtent,
    moList,
    customSample: makeDensitySampler(moList.map(m => ({ mo: { terms: m.terms }, occ: m.occ }))),
  };
}

export function generateO3Density(positions, orientations) {
  const ss = generateO3Orbital('sigma_sym', positions, orientations);
  const pi = generateO3Orbital('pi_deloc', positions, orientations);
  const piS = generateO3Orbital('pi_star', positions, orientations);
  const lp = generateO3Orbital('lone_pair', positions, orientations);
  const s2s = generateO3Orbital('sigma_2s', positions, orientations);
  const ss2s = generateO3Orbital('sigma_star_2s', positions, orientations);
  const nb2s = generateO3Orbital('nb_2s', positions, orientations);
  const sStar = generateO3Orbital('sigma_star', positions, orientations);
  const lpOuter = generateO3Orbital('lp_outer', positions, orientations);
  const halfExtent = Math.max(dist(positions[0], positions[1]), dist(positions[1], positions[2])) + 8;
  const moList = [
    { terms: s2s.terms, occ: 2 }, { terms: ss2s.terms, occ: 2 }, { terms: nb2s.terms, occ: 2 },
    { terms: ss.terms, occ: 2 }, { terms: pi.terms, occ: 2 },
    { terms: piS.terms, occ: 2 }, { terms: lp.terms, occ: 2 },
    { terms: sStar.terms, occ: 2 }, { terms: lpOuter.terms, occ: 2 },
  ];
  return {
    name: 'O\u2083 density',
    halfExtent,
    moList,
    customSample: makeDensitySampler(moList.map(m => ({ mo: { terms: m.terms }, occ: m.occ }))),
  };
}
