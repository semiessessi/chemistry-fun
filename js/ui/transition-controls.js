// Transition controls: electron transition animation, spectrum bar visualization.

import { TransitionController, transitionWavelength, wavelengthToRGB, computeBohrFrequency, oscillationPeriod } from '../transitions.js';
import { setFieldOscillation, setFieldVisVisible } from '../electric-field.js';

export const transitionController = new TransitionController();

let stateGetter, stateSetter;
let getSelectedOrbital, adaptiveGrid, getColorMode;
let d1Select;

// DOM elements
let transitionWrapper, transitionProgress, transitionProgressLabel, transitionProgressFill, transitionPlayBtn;
let transitionScrubber, transitionScrubberDisplay;
let spectrumBar, spectrumIndicator, spectrumLabel;
let qedToggle, oscillationSpeedSlider, oscillationSpeedDisplay;
let emFieldToggle, dipoleToggle;
let bohrFreqDisplay, periodDisplay;

export function initTransitionControls(elements, state, callbacks) {
  // Unpack DOM elements
  ({ transitionWrapper, transitionProgress, transitionProgressLabel, transitionProgressFill,
     transitionPlayBtn, transitionScrubber, transitionScrubberDisplay,
     spectrumBar, spectrumIndicator, spectrumLabel, d1Select } = elements);

  // QED controls
  qedToggle = document.getElementById('qed-oscillations');
  oscillationSpeedSlider = document.getElementById('oscillation-speed');
  oscillationSpeedDisplay = document.getElementById('oscillation-speed-display');
  emFieldToggle = document.getElementById('show-em-field');
  dipoleToggle = document.getElementById('show-dipole');
  bohrFreqDisplay = document.getElementById('bohr-frequency');
  periodDisplay = document.getElementById('oscillation-period');

  // Unpack state accessors
  ({ stateGetter, stateSetter } = state);

  // Unpack callbacks
  ({ getSelectedOrbital, adaptiveGrid, getColorMode } = callbacks);

  // Timeline scrubber - manually control position
  if (!transitionScrubber) {
    console.error('transitionScrubber element not found!');
    return;
  }

  transitionScrubber.addEventListener('input', () => {
    const percent = parseFloat(transitionScrubber.value);
    transitionScrubberDisplay.textContent = `${percent.toFixed(1)}%`;

    // If playing, pause and seek
    if (transitionController.state === 'playing') {
      transitionController.pause();
      transitionPlayBtn.textContent = '\u25B6 Play';
    }

    // Seek to position
    if (transitionController.state === 'ready') {
      transitionController.phase = percent / 100;
      const frameIdx = Math.floor(transitionController.phase * transitionController.frames.length);
      transitionController._switchFrame(frameIdx);
    }
  });

  // Play/pause button
  transitionPlayBtn.addEventListener('click', () => {
    const st = stateGetter();
    if (transitionController.state === 'playing') {
      transitionController.pause();
      transitionPlayBtn.textContent = '\u25B6 Play';
      if (transitionController.lastFrameIdx >= 0 && transitionController.frames[transitionController.lastFrameIdx]) {
        transitionController.frames[transitionController.lastFrameIdx].group.visible = false;
      }
      for (const m of st.currentMeshes) m.visible = st.showDensityField;
    } else if (transitionController.state === 'ready') {
      for (const m of st.currentMeshes) m.visible = false;
      transitionController.play();
      transitionPlayBtn.textContent = '\u23F8 Pause';
      if (transitionController.lastFrameIdx < 0 && transitionController.frames[0]) {
        transitionController.frames[0].group.visible = true;
        transitionController.lastFrameIdx = 0;
      }
    }
  });

  // QED oscillations toggle
  if (qedToggle) {
    qedToggle.addEventListener('change', () => {
      transitionController.qedMode = qedToggle.checked;
    });
  }

  // Oscillation speed slider
  if (oscillationSpeedSlider) {
    oscillationSpeedSlider.addEventListener('input', () => {
      const speed = parseFloat(oscillationSpeedSlider.value);
      oscillationSpeedDisplay.textContent = `${speed.toFixed(1)}×`;
      transitionController.oscillationSpeedMultiplier = speed;
    });
  }

  // EM field toggle
  if (emFieldToggle) {
    emFieldToggle.addEventListener('change', () => {
      transitionController.showEmField = emFieldToggle.checked;
      if (emFieldToggle.checked && transitionController.state !== 'idle') {
        setFieldOscillation(true, transitionController.displayOmega);
        setFieldVisVisible(true);
      } else {
        setFieldOscillation(false);
        setFieldVisVisible(false);
      }
    });
  }

  // Dipole moment toggle
  if (dipoleToggle) {
    dipoleToggle.addEventListener('change', () => {
      transitionController.showDipole = dipoleToggle.checked;
      if (transitionController.dipoleArrow) {
        transitionController.dipoleArrow.visible = dipoleToggle.checked;
      }
    });
  }
}

export function updateTransitionWrapperVisibility() {
  const d1 = d1Select.value;
  const show = d1 === 'Transitions';
  transitionWrapper.classList.toggle('dropdown-hidden', !show);
  if (!show) cancelTransition();
}

export function cancelTransition() {
  const st = stateGetter();
  transitionController.cancel();
  transitionPlayBtn.disabled = true;
  transitionPlayBtn.textContent = '\u25B6 Play';
  transitionProgress.classList.add('dropdown-hidden');
  for (const m of st.currentMeshes) m.visible = st.showDensityField;
}

export function isTransitionActive() {
  return transitionController.state !== 'idle' && d1Select.value === 'Transitions';
}

export function rebuildTransitionIfActive() {
  if (!isTransitionActive()) return;
  const orbital = getSelectedOrbital();
  if (orbital && orbital.isTransition) {
    cancelTransition();
    startTransitionBuild(orbital);
  }
}

export async function startTransitionBuild(orbital) {
  if (!orbital.isTransition || !orbital.transition) return;

  const st = stateGetter();
  const trans = orbital.transition;
  const halfExtent = orbital.halfExtent || 20;
  const gs = adaptiveGrid(halfExtent, true);

  transitionPlayBtn.disabled = true;
  transitionPlayBtn.textContent = '\u25B6 Play';
  transitionProgress.classList.remove('dropdown-hidden');

  const wavelength = transitionWavelength(trans.n1, trans.n2);
  updateSpectrumBar(wavelength);
  updateQedInfo(trans.n1, trans.n2);

  const colorMode = getColorMode();
  const settings = {
    orbital1: trans.orbital1,
    orbital2: trans.orbital2,
    transition: trans,
    probability: st.currentProbability,
    layers: st.currentLayers,
    gridSize: gs,
    halfExtent,
    colorMode,
  };

  await transitionController.buildFrameCache(
    settings,
    (ready, total) => {
      transitionProgressLabel.textContent = `Building frame ${ready}/${total}...`;
      transitionProgressFill.style.width = `${(ready / total) * 100}%`;
    },
    () => {
      transitionProgress.classList.add('dropdown-hidden');
      transitionPlayBtn.disabled = false;
      for (const m of st.currentMeshes) m.visible = false;
      transitionController.play();
      transitionPlayBtn.textContent = '\u23F8 Pause';
    }
  );
}

function updateSpectrumBar(wavelength) {
  if (wavelength < 380) {
    spectrumIndicator.style.left = '0%';
    spectrumLabel.textContent = `UV: ${wavelength.toFixed(1)} nm`;
  } else if (wavelength > 780) {
    spectrumIndicator.style.left = '100%';
    spectrumLabel.textContent = `IR: ${wavelength.toFixed(1)} nm`;
  } else {
    const percent = ((wavelength - 380) / 400) * 100;
    spectrumIndicator.style.left = `${percent}%`;
    spectrumLabel.textContent = `${wavelength.toFixed(1)} nm`;
    const color = wavelengthToRGB(wavelength);
    spectrumIndicator.style.borderTopColor = `rgb(${color.r * 255}, ${color.g * 255}, ${color.b * 255})`;
  }
}

function updateQedInfo(n1, n2) {
  if (!bohrFreqDisplay || !periodDisplay) return;

  const omega = computeBohrFrequency(n1, n2);
  const period = oscillationPeriod(n1, n2);

  bohrFreqDisplay.textContent = `ω = ${(omega / 1e15).toFixed(2)}×10¹⁵ rad/s`;
  periodDisplay.textContent = `T = ${period.toFixed(2)} fs`;
}
