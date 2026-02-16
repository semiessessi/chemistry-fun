// Mixer and reaction controls: orbital mixer sliders, reaction scrubber, physics parameter sliders.

import { MixerController } from '../orbital-mixer.js';
import { ReactionController } from '../reactions.js';
import { ORBITAL_MAP } from '../orbitals.js';
import { clearMoleculeContext } from '../molecules/index.js';
import { camera, controls } from '../scene.js';
import { createSliderWithDisplay } from './slider-helpers.js';

export const mixer = new MixerController();
export const reactionController = new ReactionController();

let stateGetter, stateSetter;
let getSelectedOrbital, adaptiveGrid, getColorMode, loadOrbitalAsync, clearMeshes;

// DOM elements - mixer
let mixerWrapper, mixerPreset, mixerSlidersDiv, mixerNormalize;

// DOM elements - reaction
let reactionWrapper, rxnScrubber, rxnPlayBtn, rxnProgress, rxnProgressLabel, rxnProgressFill;
let rxnDescription, rxnImpactSlider, rxnImpactDisplay, rxnSpeedSlider, rxnSpeedDisplay;
let rxnAngleSlider, rxnAngleDisplay;

let mixerRebuildTimeout = null;

export function initMixerControls(elements, state, callbacks) {
  // Unpack DOM elements
  ({ mixerWrapper, mixerPreset, mixerSlidersDiv, mixerNormalize,
     reactionWrapper, rxnScrubber, rxnPlayBtn, rxnProgress, rxnProgressLabel, rxnProgressFill,
     rxnDescription, rxnImpactSlider, rxnImpactDisplay, rxnSpeedSlider, rxnSpeedDisplay,
     rxnAngleSlider, rxnAngleDisplay } = elements);

  // Unpack state accessors
  ({ stateGetter, stateSetter } = state);

  // Unpack callbacks
  ({ getSelectedOrbital, adaptiveGrid, getColorMode, loadOrbitalAsync, clearMeshes } = callbacks);

  // Mixer preset selector
  mixerPreset.addEventListener('change', () => {
    mixer.setPreset(mixerPreset.value);
    populateMixerSliders();
    scheduleMixerRebuild();
  });

  // Mixer normalize toggle
  mixerNormalize.addEventListener('change', () => {
    mixer.normalize = mixerNormalize.checked;
    scheduleMixerRebuild();
  });

  // Reaction scrubber
  rxnScrubber.addEventListener('input', () => {
    const t = parseInt(rxnScrubber.value) / 100;
    if (reactionController.state === 'playing') {
      reactionController.pause();
      rxnPlayBtn.textContent = '\u25B6 Play';
    }
    const desc = reactionController.scrubTo(t);
    if (desc) rxnDescription.textContent = desc;
  });

  // Reaction play/pause
  rxnPlayBtn.addEventListener('click', () => {
    if (reactionController.state === 'playing') {
      reactionController.pause();
      rxnPlayBtn.textContent = '\u25B6 Play';
    } else if (reactionController.state === 'ready') {
      reactionController.play();
      rxnPlayBtn.textContent = '\u23F8 Pause';
    }
  });

  // Reaction physics sliders
  createSliderWithDisplay(rxnImpactSlider, rxnImpactDisplay, {
    parse: (v) => parseInt(v) / 10,
    format: (v) => `b = ${v.toFixed(1)} a\u2080`,
    onChange: () => {
      const orbital = getSelectedOrbital();
      if (orbital && orbital.isReaction) {
        cancelReaction();
        startReactionBuild(orbital, true);
      }
    },
  });

  createSliderWithDisplay(rxnSpeedSlider, rxnSpeedDisplay, {
    parse: (v) => parseInt(v) / 10,
    format: (v) => `v\u2080 = ${v.toFixed(1)}`,
    onChange: () => {
      const orbital = getSelectedOrbital();
      if (orbital && orbital.isReaction) {
        cancelReaction();
        startReactionBuild(orbital, true);
      }
    },
  });

  createSliderWithDisplay(rxnAngleSlider, rxnAngleDisplay, {
    parse: (v) => parseInt(v),
    format: (v) => `\u03B8 = ${v}\u00B0`,
    onChange: () => {
      const orbital = getSelectedOrbital();
      if (orbital && orbital.isReaction) {
        cancelReaction();
        startReactionBuild(orbital, true);
      }
    },
  });
}

export function populateMixerSliders() {
  mixerSlidersDiv.innerHTML = '';
  const active = mixer.getActiveComponents();
  for (const comp of active) {
    const row = document.createElement('div');
    row.className = 'mixer-slider-row';

    const label = document.createElement('span');
    label.className = 'mixer-label';
    label.textContent = comp.name;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '-100';
    slider.max = '100';
    slider.value = String(Math.round(mixer.coeffs[comp.index] * 100));
    slider.dataset.idx = comp.index;

    const valSpan = document.createElement('span');
    valSpan.className = 'mixer-value';
    valSpan.textContent = (mixer.coeffs[comp.index]).toFixed(2);

    slider.addEventListener('input', () => {
      const val = parseInt(slider.value) / 100;
      mixer.setCoefficient(comp.index, val);
      valSpan.textContent = val.toFixed(2);
      scheduleMixerRebuild();
    });

    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(valSpan);
    mixerSlidersDiv.appendChild(row);
  }
}

function scheduleMixerRebuild() {
  if (mixerRebuildTimeout) clearTimeout(mixerRebuildTimeout);
  mixerRebuildTimeout = setTimeout(() => {
    const orbital = mixer.buildOrbital();
    const existing = ORBITAL_MAP['Custom Mix'];
    if (existing) {
      existing.terms = orbital.terms;
      existing.halfExtent = orbital.halfExtent;
    }
    loadOrbitalAsync(orbital);
  }, 150);
}

export function cancelReaction() {
  reactionController.cancel();
  rxnPlayBtn.disabled = true;
  rxnPlayBtn.textContent = '\u25B6 Play';
  rxnProgress.classList.add('dropdown-hidden');
  rxnScrubber.value = '0';
  rxnDescription.textContent = '';
}

export async function startReactionBuild(orbital, keepSliders) {
  if (!orbital.isReaction || !orbital.reaction) return;

  const st = stateGetter();
  const rxn = orbital.reaction;
  const halfExtent = rxn.halfExtent || 14;
  const gs = adaptiveGrid(halfExtent, true);

  rxnPlayBtn.disabled = true;
  rxnPlayBtn.textContent = '\u25B6 Play';
  rxnProgress.classList.remove('dropdown-hidden');
  rxnScrubber.value = '0';

  if (rxn.descriptions && rxn.descriptions.length > 0) {
    rxnDescription.textContent = rxn.descriptions[0];
  }

  if (!keepSliders) {
    const defaultImpact = rxn.defaultImpact ?? 1.0;
    const defaultSpeed = rxn.defaultSpeed ?? 1.0;
    rxnImpactSlider.value = String(Math.round(defaultImpact * 10));
    rxnImpactDisplay.textContent = `b = ${defaultImpact.toFixed(1)} a\u2080`;
    rxnSpeedSlider.value = String(Math.round(defaultSpeed * 10));
    rxnSpeedDisplay.textContent = `v\u2080 = ${defaultSpeed.toFixed(1)}`;
    rxnAngleSlider.value = '0';
    rxnAngleDisplay.textContent = '\u03B8 = 0\u00B0';
  }

  const impactParam = parseInt(rxnImpactSlider.value) / 10;
  const speed = parseInt(rxnSpeedSlider.value) / 10;
  const angle = parseInt(rxnAngleSlider.value);

  const colorMode = getColorMode();
  const settings = {
    reaction: rxn,
    probability: st.currentProbability,
    layers: st.currentLayers,
    gridSize: gs,
    halfExtent,
    colorMode,
    impactParam,
    speed,
    angle,
  };

  clearMeshes();
  clearMoleculeContext();

  await reactionController.buildFrameCache(
    settings,
    (ready, total) => {
      rxnProgressLabel.textContent = `Building frame ${ready}/${total}...`;
      rxnProgressFill.style.width = `${(ready / total) * 100}%`;
    },
    () => {
      rxnProgress.classList.add('dropdown-hidden');
      rxnPlayBtn.disabled = false;
      const desc = reactionController.scrubTo(0);
      if (desc) rxnDescription.textContent = desc;
    }
  );

  if (!st.isDragging && !st.isDynamics) {
    const dist = halfExtent * 2.2;
    const dir = camera.position.clone().normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    controls.update();
  }
}
