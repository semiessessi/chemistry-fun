// Citation display for molecule data sources

import { getMoleculeSources } from '../molecules/core.js';

export function updateCitationDisplay(moleculeName) {
  const section = document.getElementById('source-citation-section');
  if (!section) return;  // UI not initialized yet

  const sources = getMoleculeSources(moleculeName);

  if (!sources) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  updateGeometryCitation(sources.geometry);
  updateVibrationCitation(sources.vibration);
  updateMOCitation(sources.mo);
}

function updateGeometryCitation(geomSource) {
  const div = document.getElementById('geom-citation');
  if (!div) return;

  if (!geomSource) {
    div.innerHTML = '';
    div.style.display = 'none';
    return;
  }

  div.style.display = 'block';
  div.innerHTML = `<strong>Geometry:</strong> ${formatCitation(geomSource)}`;
}

function updateVibrationCitation(vibSource) {
  const div = document.getElementById('vib-citation-block');
  if (!div) return;

  if (!vibSource) {
    div.innerHTML = '';
    div.style.display = 'none';
    return;
  }

  div.style.display = 'block';
  const modeInfo = vibSource.modes ? ` (${vibSource.modes.length} modes)` : '';
  div.innerHTML = `<strong>Vibrations:</strong> ${formatCitation(vibSource)}${modeInfo}`;
}

function updateMOCitation(moSource) {
  const div = document.getElementById('mo-citation');
  if (!div) return;

  if (!moSource || !moSource.citation) {
    div.innerHTML = '';
    div.style.display = 'none';
    return;
  }

  div.style.display = 'block';
  div.innerHTML = `<strong>MO Method:</strong> ${moSource.method} — ${formatCitation(moSource)}`;
}

function formatCitation(source) {
  if (!source) return '';

  if (source.type === 'nist') {
    return `NIST CCCBDB. <a href="${source.url}" target="_blank">View ↗</a>`;
  } else if (source.type === 'pubchem') {
    return `PubChem CID ${source.id}. <a href="${source.url}" target="_blank">View ↗</a>`;
  } else if (source.type === 'pdb') {
    return `Protein Data Bank ${source.id}. <a href="${source.url}" target="_blank">View ↗</a>`;
  } else if (source.type === 'hitran') {
    return `HITRAN Database. <a href="${source.url}" target="_blank">View ↗</a>`;
  } else if (source.type === 'sdbs') {
    return `SDBS (AIST Japan). <a href="${source.url}" target="_blank">View ↗</a>`;
  } else if (source.type === 'computational') {
    return `${source.citation} <a href="${source.url}" target="_blank">DOI ↗</a>`;
  }

  // Generic fallback
  const citationText = source.citation || source.type;
  return source.url
    ? `${citationText} <a href="${source.url}" target="_blank">↗</a>`
    : citationText;
}
