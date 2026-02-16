// Bond-forming module: barrel export for all bond-forming functionality.
// Refactored into 4 focused modules: configs, orbital-generators, density-samplers, context.

export {
  BOND_CONFIGS,
  TRIATOMIC_CONFIGS,
  ELEM_STYLE,
  BOND_FORMING_CONFIG,
  setActiveBondConfig,
  morseEnergy
} from './bond-forming/configs.js';

export {
  setContextMode,
  showBondFormingContext,
  showBondFormingContextAtPositions,
  showTriatomicContext,
  setBondCylinderOpacity,
  setTriatomicBondOpacity,
  clearBondFormingContext,
  setBondFormingContextVisible,
  setContextAtomStyle
} from './bond-forming/context.js';

// Orbital generators and density samplers are only imported by context.js,
// so we don't need to re-export them here unless external modules need them.
