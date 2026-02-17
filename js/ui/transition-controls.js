// Transition controls: electron transition animation, spectrum bar visualization.

import { TransitionController, transitionWavelength, wavelengthToRGB } from '../transitions.js';

export const transitionController = new TransitionController();

let stateGetter, stateSetter;
let getSelectedOrbital, adaptiveGrid, getColorMode;
let d1Select;

// DOM elements
let transitionWrapper, transitionProgress, transitionProgressLabel, transitionProgressFill, transitionPlayBtn;
let transitionScrubber, transitionScrubberDisplay;
let spectrumBar, spectrumIndicator, spectrumLabel;

export function initTransitionControls(elements, state, callbacks) {
  // Unpack DOM elements
  ({ transitionWrapper, transitionProgress, transitionProgressLabel, transitionProgressFill,
     transitionPlayBtn, transitionScrubber, transitionScrubberDisplay,
     spectrumBar, spectrumIndicator, spectrumLabel, d1Select } = elements);

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
