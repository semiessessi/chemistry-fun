// Dynamics module: barrel export for all dynamics functionality.
// Refactored into 3 focused modules: dynamics-2body, dynamics-3body, dynamics-angular.

export {
  SIM_CONFIG,
  SIM_STATE,
  stepSimulation,
  resetSimulation,
  getAtomPositions,
  initTrails,
  recordTrailPoint,
  clearTrails
} from './dynamics-2body.js';

export {
  SIM3_STATE,
  step3Simulation,
  reset3Simulation,
  get3AtomPositions,
  init3Trails,
  record3TrailPoint,
  clear3Trails
} from './dynamics-3body.js';

// Orientation functions need wrappers to access state from respective modules
import { SIM_STATE } from './dynamics-2body.js';
import { SIM3_STATE } from './dynamics-3body.js';
import * as Angular from './dynamics-angular.js';

export function getAtomOrientations() {
  if (!SIM_STATE.angularActive) return null;
  return Angular.getAtomOrientations(SIM_STATE.atomQuats, SIM_STATE.pos);
}

export function get3AtomOrientations() {
  if (!SIM3_STATE.angularActive) return null;
  return Angular.get3AtomOrientations(SIM3_STATE.atomQuats, SIM3_STATE.pos, SIM3_STATE.config);
}
