// Vibration controls: mode selector, amplitude slider, play/pause, frame cache building.

import { VibrationController, generateVibrationalModes } from '../vibrations.js';
import { resetMoleculeContextPositions } from '../molecules/index.js';
import { hasFieldGroup, setFieldVisVisible } from '../electric-field.js';
import { updateLegend } from '../layer-materials.js';

export const vibController = new VibrationController();

let stateGetter, stateSetter;
let getSelectedOrbital, getHalfExtent, adaptiveGrid, getColorMode, updateOrbitalOpacity;
let rebuildFieldVis, updateShareLink;
let d1Select;

// DOM elements
let vibWrapper, vibModeSelect, vibAmplitudeSlider, vibAmplitudeGroup, vibAmplitudeDisplay;
let vibProgress, vibProgressLabel, vibProgressFill, vibPlayBtn;

let vibAmplitudeTimeout = null;
let vibCurrentModes = [];
let vibStaticMeshesHidden = false;

export function initVibrationControls(elements, state, callbacks) {
  // Unpack DOM elements
  ({ vibWrapper, vibModeSelect, vibAmplitudeSlider, vibAmplitudeGroup, vibAmplitudeDisplay,
     vibProgress, vibProgressLabel, vibProgressFill, vibPlayBtn, d1Select } = elements);

  // Unpack state accessors
  ({ stateGetter, stateSetter } = state);

  // Unpack callbacks
  ({ getSelectedOrbital, getHalfExtent, adaptiveGrid, getColorMode, updateOrbitalOpacity,
     rebuildFieldVis, updateShareLink } = callbacks);

  // Mode selector
  vibModeSelect.addEventListener('change', () => {
    cancelVibration();
    updateVibAmplitudeVisibility();
    if (vibModeSelect.value === 'random' || parseInt(vibModeSelect.value) >= 0) {
      startVibBuild();
    }
  });

  // Amplitude slider
  vibAmplitudeSlider.addEventListener('input', () => {
    const v = parseInt(vibAmplitudeSlider.value) / 100;
    vibAmplitudeDisplay.textContent = v.toFixed(2) + ' a\u2080';
    if (vibAmplitudeTimeout) clearTimeout(vibAmplitudeTimeout);
    vibAmplitudeTimeout = setTimeout(() => {
      if (vibModeSelect.value === 'random' || parseInt(vibModeSelect.value) >= 0) {
        cancelVibration();
        startVibBuild();
      }
    }, 300);
  });

  // Play/pause button
  vibPlayBtn.addEventListener('click', () => {
    if (vibController.state === 'playing') {
      vibController.pause();
      vibPlayBtn.textContent = '\u25B6 Play';
      restoreStaticMeshes();
      resetMoleculeContextPositions();
    } else if (vibController.state === 'ready') {
      hideStaticMeshes();
      vibController.play();
      vibPlayBtn.textContent = '\u23F8 Pause';
    }
  });
}

export function updateVibWrapperVisibility() {
  const d1 = d1Select.value;
  const show = d1 === 'Molecules';
  vibWrapper.classList.toggle('dropdown-hidden', !show);
  if (!show) cancelVibration();
}

export function populateVibModes(moleculeName) {
  vibModeSelect.innerHTML = '';
  const noneOpt = document.createElement('option');
  noneOpt.value = '-1';
  noneOpt.textContent = 'None';
  vibModeSelect.appendChild(noneOpt);

  vibCurrentModes = generateVibrationalModes(moleculeName);

  if (vibCurrentModes.length > 0) {
    const mixOpt = document.createElement('option');
    mixOpt.value = 'random';
    mixOpt.textContent = 'Random Mix';
    vibModeSelect.appendChild(mixOpt);
  }

  for (let i = 0; i < vibCurrentModes.length; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = vibCurrentModes[i].name;
    vibModeSelect.appendChild(opt);
  }

  // Pre-select Random Mix as default, but None on mobile to avoid expensive builds
  const isMobile = window.innerWidth < 500 || 'ontouchstart' in window;
  if (vibCurrentModes.length > 0 && !isMobile) {
    vibModeSelect.value = 'random';
  }
  updateVibAmplitudeVisibility();
}

function updateVibAmplitudeVisibility() {
  const modeVal = vibModeSelect.value;
  const showAmplitude = parseInt(modeVal) >= 0;
  vibAmplitudeGroup.classList.toggle('dropdown-hidden', !showAmplitude);
}

export function isVibActive() {
  return vibController.state !== 'idle' &&
    (vibModeSelect.value === 'random' || parseInt(vibModeSelect.value) >= 0);
}

export function cancelVibration() {
  vibController.cancel();
  vibPlayBtn.disabled = true;
  vibPlayBtn.textContent = '\u25B6 Play';
  vibProgress.classList.add('dropdown-hidden');
  restoreStaticMeshes();
  resetMoleculeContextPositions();
}

function restoreStaticMeshes() {
  if (vibStaticMeshesHidden) {
    const st = stateGetter();
    for (const m of st.currentMeshes) m.visible = st.showDensityField;
    if (st.showFieldVis) {
      if (hasFieldGroup()) {
        setFieldVisVisible(true);
      } else {
        rebuildFieldVis(st.isDynamics && st.dynOrbitalGroup ? st.dynOrbitalGroup : undefined, st.getCurrentAtomInfo);
      }
    }
    vibStaticMeshesHidden = false;
    updateOrbitalOpacity();
    const espOpts = st.isESPotentialMode && st.isESPotentialMode() ? { isESP: true, espMaxValue: st.currentProbability } : undefined;
    updateLegend(st.currentLayers, st.currentProbability, getColorMode(), espOpts);
  }
}

function hideStaticMeshes() {
  if (!vibStaticMeshesHidden) {
    const st = stateGetter();
    for (const m of st.currentMeshes) m.visible = false;
    if (vibController.hasFieldVis) setFieldVisVisible(false);
    vibStaticMeshesHidden = true;
  }
}

export async function startVibBuild() {
  const modeVal = vibModeSelect.value;
  const isRandom = modeVal === 'random';
  const modeIdx = isRandom ? -1 : parseInt(modeVal);

  if (!isRandom && (modeIdx < 0 || modeIdx >= vibCurrentModes.length)) {
    cancelVibration();
    return;
  }

  const orbital = getSelectedOrbital();
  if (!orbital || !orbital.molecule) return;

  const st = stateGetter();
  const amplitude = parseInt(vibAmplitudeSlider.value) / 100;
  const halfExtent = getHalfExtent(orbital);
  const gs = adaptiveGrid(halfExtent, true);

  vibPlayBtn.disabled = true;
  vibPlayBtn.textContent = '\u25B6 Play';
  vibProgress.classList.remove('dropdown-hidden');

  const colorMode = getColorMode();
  const settings = {
    moleculeName: orbital.molecule,
    moIndex: orbital.moIndex,
    amplitude,
    probability: st.currentProbability,
    layers: st.currentLayers,
    gridSize: gs,
    halfExtent,
    colorMode,
    showFieldVis: st.showFieldVis,
    atomInfo: (st.showFieldVis || colorMode === 'charge') ? st.getCurrentAtomInfo() : null,
  };

  if (isRandom) {
    settings.mixModes = vibCurrentModes.map(mode => ({
      mode,
      weight: mode.physicalAmplitude || 0.15,
      phaseOffset: Math.random() * 2 * Math.PI,
    }));
    settings.amplitude = 1.0;
  } else {
    settings.mode = vibCurrentModes[modeIdx];
  }

  await vibController.buildFrameCache(
    settings,
    (frameIdx, total) => {
      vibProgressLabel.textContent = `Building frame ${frameIdx + 1}/${total}...`;
      vibProgressFill.style.width = ((frameIdx + 1) / total * 100) + '%';
    },
    () => {
      vibProgress.classList.add('dropdown-hidden');
      vibPlayBtn.disabled = false;
      hideStaticMeshes();
      vibController.play();
      vibPlayBtn.textContent = '\u23F8 Pause';
    }
  );
}
