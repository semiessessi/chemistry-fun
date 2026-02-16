// Dynamics display helpers: slider mapping, info displays, equilibrium positions.

import { morseEnergy, BOND_FORMING_CONFIG } from './bond-forming.js';
import { SIM_STATE, SIM3_STATE } from './dynamics.js';

// ---- Constants ----

const BOHR_TO_ANGSTROM = 0.529177;

// ---- Slider-to-R mapping ----

function getSliderParams() {
  const { R_EQ, R_MAX } = BOND_FORMING_CONFIG;
  return { R_EQ, R_MAX, LOG_RATIO: Math.log(R_EQ / R_MAX) };
}

export function sliderToR(sliderValue) {
  const { R_MAX, LOG_RATIO } = getSliderParams();
  const t = sliderValue / 100;
  return R_MAX * Math.exp(LOG_RATIO * t);
}

export function rToSlider(R) {
  const { R_MAX, LOG_RATIO } = getSliderParams();
  return Math.round(100 * Math.log(R / R_MAX) / LOG_RATIO);
}

export function updateSepDisplay(R, sepDisplay) {
  const angstrom = R * BOHR_TO_ANGSTROM;
  const energy = morseEnergy(R);
  const eSign = energy < 0 ? '\u2212' : '';
  sepDisplay.textContent = `R = ${R.toFixed(3)} a\u2080 (${angstrom.toFixed(3)} \u00C5) \u00B7 E = ${eSign}${Math.abs(energy).toFixed(3)} eV`;
}

// ---- Info displays ----

export function updateDynInfo(dynInfo) {
  const R = SIM_STATE.R;
  const E = SIM_STATE.energy;
  const angstrom = R * BOHR_TO_ANGSTROM;
  const eSign = E < 0 ? '\u2212' : '+';
  let status = '';
  if (SIM_STATE.settled) status = ' [settled]';
  else if (R < 3) status = ' [bonded]';
  else if (SIM_STATE.running) status = ' [approaching]';
  dynInfo.textContent = `R=${R.toFixed(2)} a\u2080 (${angstrom.toFixed(2)}\u00C5) E=${eSign}${Math.abs(E).toFixed(2)}eV${status}`;
}

export function updateDyn3Info(dynInfo) {
  const Rs = SIM3_STATE.R;
  const E = SIM3_STATE.energy;
  const eSign = E < 0 ? '\u2212' : '+';
  let status = '';
  if (SIM3_STATE.settled) status = ' [settled]';
  else if (Rs.every(r => r < 5)) status = ' [bonded]';
  else if (SIM3_STATE.running) status = ' [approaching]';
  const rStr = Rs.map((r, i) => `R${i + 1}=${r.toFixed(2)}`).join(' ');
  dynInfo.textContent = `${rStr} E=${eSign}${Math.abs(E).toFixed(2)}eV${status}`;
}

// ---- Dynamics slider helpers ----

export function getImpactParam(dynImpactSlider) {
  return parseInt(dynImpactSlider.value) / 10;
}

export function getApproachSpeed(dynSpeedSlider) {
  return parseInt(dynSpeedSlider.value) / 10;
}

export function updateDynImpactDisplay(dynImpactSlider, dynImpactDisplay) {
  dynImpactDisplay.textContent = `b = ${getImpactParam(dynImpactSlider).toFixed(1)} a\u2080`;
}

export function updateDynSpeedDisplay(dynSpeedSlider, dynSpeedDisplay) {
  dynSpeedDisplay.textContent = `v\u2080 = ${getApproachSpeed(dynSpeedSlider).toFixed(1)}`;
}

// ---- Equilibrium position helpers ----

export function triatomicEquilibrium(triConfig) {
  if (triConfig.geometry === 'linear') {
    return [
      [0, 0, -triConfig.morse[0].R_EQ],
      [0, 0, 0],
      [0, 0, triConfig.morse[1].R_EQ],
    ];
  } else {
    const d = triConfig.morse[0].R_EQ;
    const halfAngle = triConfig.angle.thetaEq / 2;
    return [
      [d * Math.sin(halfAngle), 0, d * Math.cos(halfAngle)],
      [0, 0, 0],
      [-d * Math.sin(halfAngle), 0, d * Math.cos(halfAngle)],
    ];
  }
}

export function dist3(a, b) {
  const dx = b[0]-a[0], dy = b[1]-a[1], dz = b[2]-a[2];
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

export function getSliderParams_export() {
  return getSliderParams();
}
