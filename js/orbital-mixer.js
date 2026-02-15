// Interactive orbital mixer: LCAO coefficient sliders for hybrid orbital construction.
// Presets for sp, sp², sp³ with textbook coefficients; custom mode for free mixing.

const COMPONENTS = [
  { name: '2s',  n: 2, l: 0, m: 0, angType: 'real' },
  { name: '2pz', n: 2, l: 1, m: 0, angType: 'real' },
  { name: '2px', n: 2, l: 1, m: 1, angType: 'cos' },
  { name: '2py', n: 2, l: 1, m: 1, angType: 'sin' },
];

const INV_SQRT2 = 1 / Math.sqrt(2);
const INV_SQRT3 = 1 / Math.sqrt(3);
const INV_SQRT6 = 1 / Math.sqrt(6);

// Textbook hybrid orbital coefficients
const PRESETS = {
  sp: {
    label: 'sp',
    // sp₁ = (1/√2)(s + pz)
    coeffs: [INV_SQRT2, INV_SQRT2, 0, 0],
    components: [0, 1], // indices into COMPONENTS
  },
  sp2: {
    label: 'sp²',
    // sp²₁ = (1/√3)s + (√2/√3)px
    coeffs: [INV_SQRT3, 0, Math.sqrt(2 / 3), 0],
    components: [0, 1, 2],
  },
  sp3: {
    label: 'sp³',
    // sp³₁ = ½(s + px + py + pz)
    coeffs: [0.5, 0.5, 0.5, 0.5],
    components: [0, 1, 2, 3],
  },
  custom: {
    label: 'Custom',
    coeffs: [INV_SQRT2, INV_SQRT2, 0, 0],
    components: [0, 1, 2, 3],
  },
};

export class MixerController {
  constructor() {
    this.preset = 'sp';
    this.coeffs = [...PRESETS.sp.coeffs];
    this.normalize = true;
  }

  setPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    this.preset = name;
    this.coeffs = [...preset.coeffs];
  }

  setCoefficient(index, value) {
    if (index >= 0 && index < 4) {
      this.coeffs[index] = value;
    }
  }

  getActiveComponents() {
    const preset = PRESETS[this.preset];
    if (!preset) return COMPONENTS;
    return preset.components.map(i => ({ ...COMPONENTS[i], index: i }));
  }

  buildOrbital() {
    let coeffs = [...this.coeffs];

    // Normalize if enabled
    if (this.normalize) {
      const norm = Math.sqrt(coeffs.reduce((s, c) => s + c * c, 0));
      if (norm > 1e-10) {
        coeffs = coeffs.map(c => c / norm);
      }
    }

    const terms = [];
    for (let i = 0; i < COMPONENTS.length; i++) {
      if (Math.abs(coeffs[i]) < 1e-10) continue;
      const comp = COMPONENTS[i];
      terms.push({
        n: comp.n,
        l: comp.l,
        m: comp.m,
        angType: comp.angType,
        center: [0, 0, 0],
        coeff: coeffs[i],
      });
    }

    // Fallback: if no terms, return a tiny 2s
    if (terms.length === 0) {
      terms.push({
        n: 2, l: 0, m: 0, angType: 'real',
        center: [0, 0, 0], coeff: 0.001,
      });
    }

    return {
      name: 'Custom Mix',
      terms,
      halfExtent: 18,
      d1: 'Orbital Mixer', d2: 'Mixer', d3: 'Custom Mix', d4: null,
    };
  }
}

export { COMPONENTS, PRESETS };
