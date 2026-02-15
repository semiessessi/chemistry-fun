// Interactive energy level diagram rendered on a 2D canvas.
// Atomic: hydrogen energy levels E_n = -13.6/n² eV with subshell labels.
// Molecular: AO→MO correlation diagram with electron arrows.
// Click a level to select that orbital in 3D.

const COLORS = {
  bg: 'rgba(0,0,0,0.65)',
  line: '#aaa',
  label: '#ccc',
  selected: '#6af',
  electron: '#fff',
  sigma: '#f88',
  sigmaStar: '#f66',
  pi: '#8bf',
  piStar: '#66f',
  nonbond: '#8d8',
  bond: '#fa5',
};

// ---- Atomic Energy Diagram ----

export function renderAtomicDiagram(container, selectedOrbital, onSelect) {
  clearDiagram(container);

  const canvas = document.createElement('canvas');
  const W = 200, H = 260;
  canvas.width = W;
  canvas.height = H;
  canvas.style.cursor = 'pointer';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // Energy levels: E_n = -13.6 / n²
  const levels = [];
  const maxN = 4;
  const margin = 30;
  const topY = 15;
  const botY = H - 25;
  // Map energy to y: E_1 = -13.6 at bottom, E_∞ = 0 at top
  const eMin = -13.6, eMax = 0;
  const eToY = (e) => topY + (botY - topY) * (1 - (e - eMin) / (eMax - eMin));

  // Draw energy axis
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin - 10, topY);
  ctx.lineTo(margin - 10, botY);
  ctx.stroke();

  ctx.fillStyle = '#777';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('0 eV', margin - 14, topY + 4);
  ctx.fillText('-13.6', margin - 14, botY + 4);

  const subshells = ['s', 'p', 'd', 'f'];

  for (let n = 1; n <= maxN; n++) {
    const e = -13.6 / (n * n);
    const y = eToY(e);
    const maxL = n - 1;
    const numSub = Math.min(maxL + 1, 4);
    const subWidth = (W - margin - 20) / maxN;

    for (let l = 0; l <= maxL && l < 4; l++) {
      const x1 = margin + 10 + l * subWidth;
      const x2 = x1 + subWidth - 8;
      const label = `${n}${subshells[l]}`;

      // Check if this is selected
      const isSelected = selectedOrbital &&
        selectedOrbital.d1 === 'Atomic' &&
        selectedOrbital.d2 === `n=${n}` &&
        selectedOrbital.d3 === subshells[l];

      ctx.strokeStyle = isSelected ? COLORS.selected : COLORS.line;
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();

      // Label
      ctx.fillStyle = isSelected ? COLORS.selected : COLORS.label;
      ctx.font = isSelected ? 'bold 11px sans-serif' : '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, (x1 + x2) / 2, y - 6);

      // Store for click detection
      levels.push({ n, l, x1, x2, y, label, subshell: subshells[l] });
    }
  }

  // Title
  ctx.fillStyle = '#999';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Hydrogen Energy Levels', W / 2, H - 6);

  // Click handler
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const my = (e.clientY - rect.top) * (H / rect.height);

    for (const lev of levels) {
      if (mx >= lev.x1 - 4 && mx <= lev.x2 + 4 && Math.abs(my - lev.y) < 10) {
        if (onSelect) onSelect('Atomic', `n=${lev.n}`, lev.subshell, null);
        return;
      }
    }
  });
}

// ---- Molecular Orbital Diagram ----

export function renderMolecularDiagram(container, moleculeName, moList, selectedOrbital, onSelect) {
  clearDiagram(container);

  if (!moList || moList.length === 0) return;

  const canvas = document.createElement('canvas');
  const W = 210, H = Math.max(200, moList.length * 28 + 60);
  canvas.width = W;
  canvas.height = H;
  canvas.style.cursor = 'pointer';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // Assign relative energies from MO ordering (lowest index = lowest energy)
  const levels = [];
  const margin = 15;
  const topY = 25;
  const botY = H - 30;
  const lineWidth = W - 2 * margin - 40;

  for (let i = 0; i < moList.length; i++) {
    const moName = moList[i][0];
    const y = botY - (i / Math.max(1, moList.length - 1)) * (botY - topY);
    const x1 = margin + 20;
    const x2 = x1 + lineWidth;

    // Determine MO type for coloring
    let color = COLORS.line;
    const nameLower = moName.toLowerCase();
    if (nameLower.includes('*') || nameLower.includes('anti')) {
      color = nameLower.includes('\u03C0') || nameLower.includes('pi') ? COLORS.piStar : COLORS.sigmaStar;
    } else if (nameLower.includes('\u03C0') || nameLower.includes('pi')) {
      color = COLORS.pi;
    } else if (nameLower.includes('\u03C3') || nameLower.includes('sigma')) {
      color = COLORS.sigma;
    } else if (nameLower.includes('lone') || nameLower.includes('lp')) {
      color = COLORS.nonbond;
    } else {
      color = COLORS.bond;
    }

    const isSelected = selectedOrbital &&
      selectedOrbital.d3 === moName;

    ctx.strokeStyle = isSelected ? COLORS.selected : color;
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();

    // Electron arrows (assume all listed MOs are occupied)
    const arrowX = x1 + lineWidth / 2;
    drawElectronArrow(ctx, arrowX - 5, y, true);
    drawElectronArrow(ctx, arrowX + 5, y, false);

    // Label
    ctx.fillStyle = isSelected ? COLORS.selected : '#ccc';
    ctx.font = isSelected ? 'bold 10px sans-serif' : '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(moName, x1 - 4, y + 4);

    levels.push({ moName, x1, x2, y });
  }

  // Energy axis label
  ctx.save();
  ctx.translate(8, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#777';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Energy \u2192', 0, 0);
  ctx.restore();

  // Title
  ctx.fillStyle = '#999';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(moleculeName, W / 2, H - 8);

  // Click handler
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const my = (e.clientY - rect.top) * (H / rect.height);

    for (const lev of levels) {
      if (mx >= lev.x1 - 4 && mx <= lev.x2 + 4 && Math.abs(my - lev.y) < 12) {
        if (onSelect) onSelect(null, null, lev.moName, null);
        return;
      }
    }
  });
}

// ---- Diatomic MO Correlation Diagram ----

export function renderDiatomicDiagram(container, selectedOrbital, onSelect) {
  clearDiagram(container);

  const canvas = document.createElement('canvas');
  const W = 210, H = 280;
  canvas.width = W;
  canvas.height = H;
  canvas.style.cursor = 'pointer';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // Standard diatomic MO ordering (bottom to top = low to high energy)
  // d2/d3 map to the Molecular orbital tree registration in orbitals.js
  const moLevels = [
    { name: '\u03C3(1s)',  type: 'bond',  electrons: 2, d2: '1s', d3: '\u03C3' },
    { name: '\u03C3*(1s)', type: 'anti',  electrons: 0, d2: '1s', d3: '\u03C3*' },
    { name: '\u03C3(2s)',  type: 'bond',  electrons: 2, d2: '2s', d3: '\u03C3' },
    { name: '\u03C3*(2s)', type: 'anti',  electrons: 0, d2: '2s', d3: '\u03C3*' },
    { name: '\u03C3(2p)',  type: 'bond',  electrons: 2, d2: '2p', d3: '\u03C3' },
    { name: '\u03C0(2p)',  type: 'bond',  electrons: 4, degenerate: true, d2: '2p', d3: '\u03C0' },
    { name: '\u03C0*(2p)', type: 'anti',  electrons: 0, degenerate: true, d2: '2p', d3: '\u03C0*' },
    { name: '\u03C3*(2p)', type: 'anti',  electrons: 0, d2: '2p', d3: '\u03C3*' },
  ];

  const levels = [];
  const leftX = 20, rightX = W - 20;
  const centerX1 = 70, centerX2 = W - 70;
  const topY = 25, botY = H - 30;

  for (let i = 0; i < moLevels.length; i++) {
    const mo = moLevels[i];
    const y = botY - (i / (moLevels.length - 1)) * (botY - topY);
    const color = mo.type === 'anti' ? COLORS.sigmaStar : COLORS.sigma;

    const isSelected = selectedOrbital &&
      selectedOrbital.d1 === 'Molecular' &&
      selectedOrbital.d3 === mo.d3;

    ctx.strokeStyle = isSelected ? COLORS.selected : color;
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(centerX1, y);
    ctx.lineTo(centerX2, y);
    ctx.stroke();

    // Draw electrons
    if (mo.electrons >= 2) {
      drawElectronArrow(ctx, (centerX1 + centerX2) / 2 - 5, y, true);
      drawElectronArrow(ctx, (centerX1 + centerX2) / 2 + 5, y, false);
    }
    if (mo.electrons >= 4 && mo.degenerate) {
      drawElectronArrow(ctx, (centerX1 + centerX2) / 2 - 18, y, true);
      drawElectronArrow(ctx, (centerX1 + centerX2) / 2 + 18, y, false);
    }

    // Label
    ctx.fillStyle = isSelected ? COLORS.selected : '#ccc';
    ctx.font = isSelected ? 'bold 9px sans-serif' : '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(mo.name, (centerX1 + centerX2) / 2, y - 7);

    levels.push({ name: mo.name, d2: mo.d2, d3: mo.d3, x1: centerX1, x2: centerX2, y });
  }

  // Energy axis
  ctx.save();
  ctx.translate(8, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#777';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Energy \u2192', 0, 0);
  ctx.restore();

  // AO labels
  ctx.fillStyle = '#888';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AO', leftX, topY - 8);
  ctx.fillText('MO', (centerX1 + centerX2) / 2, topY - 8);
  ctx.fillText('AO', rightX, topY - 8);

  ctx.fillStyle = '#999';
  ctx.font = '11px sans-serif';
  ctx.fillText('Diatomic MO Diagram', W / 2, H - 8);

  // Click handler
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const my = (e.clientY - rect.top) * (H / rect.height);

    for (const lev of levels) {
      if (mx >= lev.x1 - 4 && mx <= lev.x2 + 4 && Math.abs(my - lev.y) < 12) {
        if (onSelect) onSelect('Molecular', lev.d2, lev.d3, null);
        return;
      }
    }
  });
}

// ---- Helpers ----

function drawElectronArrow(ctx, x, y, up) {
  const len = 10;
  const headSize = 3;
  const tipY = up ? y - len : y + len;
  const baseY = up ? y - 2 : y + 2;

  ctx.strokeStyle = COLORS.electron;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.lineTo(x, tipY);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(x, tipY);
  ctx.lineTo(x - headSize, tipY + (up ? headSize : -headSize));
  ctx.lineTo(x + headSize, tipY + (up ? headSize : -headSize));
  ctx.closePath();
  ctx.fillStyle = COLORS.electron;
  ctx.fill();
}

export function clearDiagram(container) {
  container.innerHTML = '';
}
