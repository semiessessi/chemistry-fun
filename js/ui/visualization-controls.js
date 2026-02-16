// Visualization controls: probability, layers, opacity, ball-stick, density field, vector field toggles.

import { cancelCompute } from '../worker-pool.js';
import { setMoleculeContextVisible, resetMoleculeContextPositions } from '../molecules/index.js';
import { setBondFormingContextVisible } from '../bond-forming.js';
import { setFieldVisVisible, setFieldMode, setFieldSource, hasFieldGroup } from '../electric-field.js';

let stateGetter, stateSetter;
let renderFromCachesAsync, rebuildFieldVis, hideProgress, renderChargeVisualisation;
let updateShareLink, updateOrbitalOpacity, applyDensityFieldVisibility;
let vibController, isVibActive, cancelVibration, startVibBuild, rebuildTransitionIfActive;
let vibPlayBtn, vibProgress;

// DOM elements
let probSlider, probDisplay, layerSelect, customLayersRow, customLayersInput;
let ballStickToggle, densityFieldToggle, densityOptions;
let fieldVisToggle, fieldStyleSelect, fieldSourceSelect, fieldOptions;
let opacitySlider, opacityDisplay;

let rebuildTimeout = null;
let probDragging = false;

export function initVisualizationControls(elements, state, callbacks) {
  // Unpack DOM elements
  ({ probSlider, probDisplay, layerSelect, customLayersRow, customLayersInput,
     ballStickToggle, densityFieldToggle, densityOptions,
     fieldVisToggle, fieldStyleSelect, fieldSourceSelect, fieldOptions,
     opacitySlider, opacityDisplay, vibPlayBtn, vibProgress } = elements);

  // Unpack state accessors
  ({ stateGetter, stateSetter } = state);

  // Unpack callbacks
  ({ renderFromCachesAsync, rebuildFieldVis, hideProgress, renderChargeVisualisation,
     updateShareLink, updateOrbitalOpacity, applyDensityFieldVisibility,
     vibController, isVibActive, cancelVibration, startVibBuild, rebuildTransitionIfActive } = callbacks);

  // Probability slider
  probSlider.addEventListener('input', () => {
    const st = stateGetter();
    stateSetter({ currentProbability: parseInt(probSlider.value) / 100 });
    probDisplay.textContent = probSlider.value + '%';
    probDragging = true;
    cancelCompute();
    if (rebuildTimeout) clearTimeout(rebuildTimeout);
  });

  probSlider.addEventListener('pointerup', () => {
    probDragging = false;
    triggerProbRebuild();
    updateShareLink();
  });

  probSlider.addEventListener('change', () => {
    if (!probDragging) {
      stateSetter({ currentProbability: parseInt(probSlider.value) / 100 });
      probDisplay.textContent = probSlider.value + '%';
      triggerProbRebuild();
    }
  });

  // Layer select
  layerSelect.addEventListener('change', async () => {
    const st = stateGetter();
    if (layerSelect.value === 'custom') {
      customLayersRow.classList.remove('dropdown-hidden');
      customLayersInput.value = st.currentLayers;
      customLayersInput.focus();
    } else {
      customLayersRow.classList.add('dropdown-hidden');
      stateSetter({ currentLayers: parseInt(layerSelect.value) });
      await applyLayerChange();
    }
  });

  customLayersInput.addEventListener('change', async () => {
    const v = Math.max(1, Math.min(500, parseInt(customLayersInput.value) || 5));
    customLayersInput.value = v;
    stateSetter({ currentLayers: v });
    await applyLayerChange();
  });

  // Ball & Stick toggle
  ballStickToggle.addEventListener('change', () => {
    const checked = ballStickToggle.checked;
    stateSetter({ showBallAndStick: checked });
    setMoleculeContextVisible(checked);
    setBondFormingContextVisible(checked);
    updateShareLink();
  });

  // Density Field toggle
  densityFieldToggle.addEventListener('change', () => {
    const checked = densityFieldToggle.checked;
    stateSetter({ showDensityField: checked });
    densityOptions.style.display = checked ? '' : 'none';
    applyDensityFieldVisibility();
    updateShareLink();
  });

  // Vector Field toggle
  fieldVisToggle.addEventListener('change', () => {
    const checked = fieldVisToggle.checked;
    stateSetter({ showFieldVis: checked });
    const st = stateGetter();
    const vibPlaying = vibController.state === 'playing' || vibController.state === 'building';

    if (checked) {
      fieldOptions.classList.remove('dropdown-hidden');
      if (!vibPlaying) {
        if (hasFieldGroup()) {
          setFieldVisVisible(true);
        } else {
          rebuildFieldVis(st.isDynamics && st.dynOrbitalGroup ? st.dynOrbitalGroup : undefined, st.getCurrentAtomInfo);
        }
      }
      if (isVibActive() && !vibController.hasFieldVis) {
        rebuildVibIfActive();
      } else if (isVibActive()) {
        vibController.setFieldVisVisible(true);
      }
    } else {
      fieldOptions.classList.add('dropdown-hidden');
      setFieldVisVisible(false);
      vibController.setFieldVisVisible(false);
    }
    updateShareLink();
  });

  fieldStyleSelect.addEventListener('change', () => {
    const st = stateGetter();
    stateSetter({ fieldStyle: fieldStyleSelect.value });
    setFieldMode(fieldStyleSelect.value);
    if (st.showFieldVis && st.currentCaches.length > 0) {
      rebuildFieldVis(st.isDynamics && st.dynOrbitalGroup ? st.dynOrbitalGroup : undefined, st.getCurrentAtomInfo);
    }
    rebuildVibIfActive();
    updateShareLink();
  });

  fieldSourceSelect.addEventListener('change', () => {
    const st = stateGetter();
    setFieldSource(fieldSourceSelect.value);
    if (st.showFieldVis && st.currentCaches.length > 0) {
      rebuildFieldVis(st.isDynamics && st.dynOrbitalGroup ? st.dynOrbitalGroup : undefined, st.getCurrentAtomInfo);
    }
    rebuildVibIfActive();
    updateShareLink();
  });

  // Opacity slider
  if (opacitySlider) {
    opacitySlider.addEventListener('input', () => {
      stateSetter({ currentOpacityTarget: parseInt(opacitySlider.value) });
      opacityDisplay.textContent = opacitySlider.value + '%';
      updateOrbitalOpacity();
      updateShareLink();
    });
  }
}

function triggerProbRebuild() {
  if (rebuildTimeout) clearTimeout(rebuildTimeout);
  rebuildTimeout = setTimeout(async () => {
    const st = stateGetter();
    if (st.currentCaches.length > 0) {
      cancelCompute();
      if (st.isChargeDensityMode && st.isChargeDensityMode() && st.chargeCache) {
        await renderChargeVisualisation();
      } else {
        const target = st.isDynamics && st.dynOrbitalGroup ? st.dynOrbitalGroup : undefined;
        await renderFromCachesAsync(st.currentProbability, undefined, target);
        hideProgress();
      }
    }
    if (isVibActive()) { cancelVibration(); startVibBuild(); }
    rebuildTransitionIfActive();
  }, 50);
}

async function applyLayerChange() {
  const st = stateGetter();
  if (st.currentCaches.length > 0) {
    cancelCompute();
    if (st.isChargeDensityMode && st.isChargeDensityMode() && st.chargeCache) {
      await renderChargeVisualisation();
    } else {
      const target = st.isDynamics && st.dynOrbitalGroup ? st.dynOrbitalGroup : undefined;
      await renderFromCachesAsync(st.currentProbability, undefined, target);
      hideProgress();
    }
  }
  if (isVibActive()) { cancelVibration(); startVibBuild(); }
  rebuildTransitionIfActive();
  updateShareLink();
}

function rebuildVibIfActive() {
  if (isVibActive()) {
    vibController.cancel();
    vibPlayBtn.disabled = true;
    vibPlayBtn.textContent = '\u25B6 Play';
    vibProgress.classList.add('dropdown-hidden');
    resetMoleculeContextPositions();
    startVibBuild();
  }
}
