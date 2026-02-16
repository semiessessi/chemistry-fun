// Interactive energy level diagram rendered on a 2D canvas.
// Atomic: hydrogen energy levels E_n = -13.6/n² eV with subshell labels.
// Molecular: AO→MO correlation diagram with electron arrows.
// Click a level to select that orbital in 3D.

const COLORS = {
  bg: 'rgba(0,0,0,0.65)',
  line: '#aaa',
  label: '#ccc',
  selected: '#6af',
  selectedGlow: 'rgba(102,170,255,0.35)',
  electron: '#fff',
  sigma: '#f88',
  sigmaStar: '#f66',
  pi: '#8bf',
  piStar: '#66f',
  delta: '#f8d',
  deltaStar: '#f6b',
  nonbond: '#8d8',
  bond: '#fa5',
};

// Subshell labels and electron capacities
const SUBSHELLS = ['s', 'p', 'd', 'f'];
const SUBSHELL_CAPACITY = [2, 6, 10, 14];

// ---- Sizing parameters for three display modes ----

function getSizingParams(size, moCount = 0, containerWidth = 210) {
  switch (size) {
    case 'tiny':
      return {
        width: 120,
        height: 60,
        fontSize: 8,
        labelFontSize: 7,
        showLabels: false,  // Only show diagram, minimal text
        showEnergies: false,
        showCitations: false,
        lineHeight: 6,
        margin: 20,
        compact: true
      };

    case 'large':
      return {
        width: 420,
        height: Math.max(500, moCount * 35 + 100),
        fontSize: 13,
        labelFontSize: 11,
        showLabels: true,
        showEnergies: true,   // Show eV values on each level
        showCitations: true,  // Show data source at bottom
        lineHeight: 18,
        margin: 50,
        compact: false
      };

    default: // 'normal'
      return {
        width: Math.max(160, containerWidth - 8),
        height: moCount ? Math.max(200, moCount * 28 + 60) : 320,
        fontSize: 11,
        labelFontSize: 10,
        showLabels: true,
        showEnergies: false,
        showCitations: false,
        lineHeight: 14,
        margin: 38,
        compact: containerWidth < 180
      };
  }
}

// ---- Atomic Energy Diagram ----

export function renderAtomicDiagram(container, selectedOrbital, onSelect, size = 'normal') {
  clearDiagram(container);

  const canvas = document.createElement('canvas');
  const containerWidth = container.clientWidth || container.parentElement?.clientWidth || 210;
  const sizing = getSizingParams(size, 0, containerWidth);

  const W = sizing.width;
  const H = sizing.height;
  const maxN = 7;
  canvas.width = W;
  canvas.height = H;
  canvas.style.cursor = 'pointer';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // Gradient background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, 'rgba(5,10,25,0.75)');
  bgGrad.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Use sizing params
  const compact = sizing.compact;
  const fontSize = sizing.fontSize;
  const labelFontSize = sizing.labelFontSize;

  // Energy levels: E_n = -13.6 / n²
  // Use log-scale mapping for better high-n spacing
  const levels = [];
  const margin = sizing.margin;
  const topY = 22;
  const botY = H - 28;
  const eMin = -13.6;
  // Sqrt-scale: maps |E| via sqrt for smoother high-n spacing
  // botY = most negative (n=1), topY = near zero (high n)
  const sqrtMax = Math.sqrt(-eMin);
  const eToY = (e) => {
    if (e >= -0.01) return topY;
    const frac = Math.sqrt(-e) / sqrtMax; // 1 at n=1, small at high n
    return topY + (botY - topY) * frac;
  };

  // Draw energy axis with anti-aliased line
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin - 10, topY);
  ctx.lineTo(margin - 10, botY);
  ctx.stroke();

  // Axis labels
  ctx.fillStyle = '#666';
  ctx.font = `${labelFontSize}px sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText('0 eV', margin - 14, topY + 4);
  ctx.fillText('-13.6', margin - 14, botY + 4);

  // Draw ionization threshold dashed line
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = '#333';
  ctx.beginPath();
  ctx.moveTo(margin, topY);
  ctx.lineTo(W - 10, topY);
  ctx.stroke();
  ctx.setLineDash([]);

  for (let n = 1; n <= maxN; n++) {
    const eBase = -13.6 / (n * n);
    const maxL = n - 1;
    const numSub = Math.min(maxL + 1, 4);
    const availW = W - margin - 10;
    const subWidth = availW / Math.max(numSub, 1);

    const yBase = eToY(eBase);

    for (let l = 0; l <= maxL && l < 4; l++) {
      // Visual offset: higher l drawn slightly higher (less negative energy)
      // Mimics multi-electron splitting for readability
      const y = yBase - l * 6;
      const x1 = margin + 5 + l * subWidth;
      const x2 = x1 + subWidth - 6;
      const label = `${n}${SUBSHELLS[l]}`;
      const capacityLabel = `${SUBSHELL_CAPACITY[l]}`;

      // Check if this is selected
      const isSelected = selectedOrbital &&
        selectedOrbital.d1 === 'Atomic' &&
        selectedOrbital.d2 === `n=${n}` &&
        selectedOrbital.d3 === SUBSHELLS[l];

      // Glow effect on selected level
      if (isSelected) {
        ctx.shadowColor = COLORS.selectedGlow;
        ctx.shadowBlur = 8;
      }

      ctx.strokeStyle = isSelected ? COLORS.selected : COLORS.line;
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();

      ctx.shadowBlur = 0;

      // Label + capacity superscript
      ctx.fillStyle = isSelected ? COLORS.selected : COLORS.label;
      ctx.font = isSelected ? `bold ${fontSize}px sans-serif` : `${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      const labelX = (x1 + x2) / 2;
      if (!compact || n <= 4) {
        ctx.fillText(label, labelX, y - 5);
        // Capacity superscript
        ctx.font = `${labelFontSize - 1}px sans-serif`;
        ctx.fillStyle = isSelected ? COLORS.selected : '#888';
        const labelW = ctx.measureText(label).width;
        ctx.textAlign = 'left';
        ctx.fillText(capacityLabel, labelX + labelW / 2 + 1, y - 7);

        // Energy value in large mode
        if (sizing.showEnergies && l === 0) {  // Only show once per n
          ctx.font = `${labelFontSize}px sans-serif`;
          ctx.fillStyle = '#999';
          ctx.textAlign = 'right';
          const energy = eBase;
          ctx.fillText(`${energy.toFixed(2)} eV`, W - 12, y + 3);
        }
      }

      // Energy label on hover (tooltip via title)
      levels.push({ n, l, x1, x2, y, label, subshell: SUBSHELLS[l], energy: eBase });
    }
  }

  // Hint + title
  ctx.textAlign = 'center';
  ctx.fillStyle = '#555';
  ctx.font = `${labelFontSize}px sans-serif`;
  ctx.fillText('click a level to view orbital', W / 2, H - 18);
  ctx.fillStyle = '#888';
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillText('Hydrogen Energy Levels', W / 2, H - 5);

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

  // Hover tooltip
  canvas.title = '';
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const my = (e.clientY - rect.top) * (H / rect.height);
    let tip = '';
    for (const lev of levels) {
      if (mx >= lev.x1 - 4 && mx <= lev.x2 + 4 && Math.abs(my - lev.y) < 10) {
        tip = `${lev.label}: E = ${lev.energy.toFixed(3)} eV, capacity = ${SUBSHELL_CAPACITY[lev.l]}`;
        break;
      }
    }
    canvas.title = tip;
  });
}

// ---- Molecular Orbital Diagram ----

export function renderMolecularDiagram(container, moleculeName, moList, selectedOrbital, onSelect, size = 'normal') {
  clearDiagram(container);

  if (!moList || moList.length === 0) return;

  const canvas = document.createElement('canvas');
  const containerWidth = container.clientWidth || container.parentElement?.clientWidth || 210;
  const sizing = getSizingParams(size, moList.length, containerWidth);

  const W = sizing.width;
  const H = sizing.height;
  canvas.width = W;
  canvas.height = H;
  canvas.style.cursor = 'pointer';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // Gradient background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, 'rgba(5,10,25,0.75)');
  bgGrad.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Assign relative energies from MO ordering (lowest index = lowest energy)
  const levels = [];
  const margin = size === 'tiny' ? 10 : 15;
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
    if (nameLower.includes('\u03B4') || nameLower.includes('delta')) {
      color = nameLower.includes('*') ? COLORS.deltaStar : COLORS.delta;
    } else if (nameLower.includes('*') || nameLower.includes('anti')) {
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

    if (isSelected) {
      ctx.shadowColor = COLORS.selectedGlow;
      ctx.shadowBlur = 8;
    }

    ctx.strokeStyle = isSelected ? COLORS.selected : color;
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Electron arrows (assume all listed MOs are occupied)
    const arrowX = x1 + lineWidth / 2;
    drawElectronArrow(ctx, arrowX - 5, y, true);
    drawElectronArrow(ctx, arrowX + 5, y, false);

    // Label with σ/π/δ type
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
  ctx.fillStyle = '#666';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Energy \u2192', 0, 0);
  ctx.restore();

  // Title
  ctx.fillStyle = '#888';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(moleculeName, W / 2, H - 8);

  ctx.fillStyle = '#555';
  ctx.font = '8px sans-serif';
  ctx.fillText('click a level to view orbital', W / 2, H - 20);

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

export function renderDiatomicDiagram(container, selectedOrbital, onSelect, size = 'normal') {
  clearDiagram(container);

  const canvas = document.createElement('canvas');
  const containerWidth = container.clientWidth || container.parentElement?.clientWidth || 210;
  const sizing = getSizingParams(size, 0, containerWidth);

  const W = sizing.width;
  const H = size === 'tiny' ? 80 : size === 'large' ? 400 : 280;
  canvas.width = W;
  canvas.height = H;
  canvas.style.cursor = 'pointer';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // Gradient background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, 'rgba(5,10,25,0.75)');
  bgGrad.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Standard diatomic MO ordering (bottom to top = low to high energy)
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

    if (isSelected) {
      ctx.shadowColor = COLORS.selectedGlow;
      ctx.shadowBlur = 8;
    }

    ctx.strokeStyle = isSelected ? COLORS.selected : color;
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(centerX1, y);
    ctx.lineTo(centerX2, y);
    ctx.stroke();
    ctx.shadowBlur = 0;

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
  ctx.fillStyle = '#666';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Energy \u2192', 0, 0);
  ctx.restore();

  // AO labels
  ctx.fillStyle = '#777';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AO', leftX, topY - 8);
  ctx.fillText('MO', (centerX1 + centerX2) / 2, topY - 8);
  ctx.fillText('AO', rightX, topY - 8);

  ctx.fillStyle = '#888';
  ctx.font = '11px sans-serif';
  ctx.fillText('Diatomic MO Diagram', W / 2, H - 8);

  ctx.fillStyle = '#555';
  ctx.font = '8px sans-serif';
  ctx.fillText('click a level to view orbital', W / 2, H - 20);

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
