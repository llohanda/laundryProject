// Public engine API (GDD 13.2). Pure: no DOM, React, timers, Math.random or float comparisons.
export { baseId, cycleCostMs, evaluateLoad, isJam, zoneOf, type EvalOptions } from './evaluate';
export { consequencesFor } from './consequences';
export { expandLevel, solutionLoads } from './level';
export { replay, ReplayError } from './replay';
export { fnv1a32, isLost, mulberry32U32, shuffleIds } from './rng';
export { parSeconds, scoreRun, starsFor } from './score';
export type * from './types';
