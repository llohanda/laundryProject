// Par, stars and run scoring (GDD 8, 9.3, 13.4).
import { evaluateLoad } from './evaluate';
import type { Config, ItemDef, LevelDef, LoadEval, LoadInput, RuleId, RunResult, Severity } from './types';

/** round_half_up(sumCycleCost + m * (3 * items + 10)) seconds, with m in tenths (GDD 9.3). */
export function parSeconds(sumCycleCostMs: number, multiplierTenths: number, itemCount: number): number {
  return Math.floor((sumCycleCostMs + 100 * multiplierTenths * (3 * itemCount + 10) + 500) / 1000);
}

/** 3 stars need par time and no extra loads; a spare cycle can otherwise hide inside par (GDD 8). */
export function starsFor(
  violations: [RuleId, Severity][],
  jam: boolean,
  totalMs: number,
  parSecs: number,
  loads: number,
  minLoads: number,
): 0 | 1 | 2 | 3 {
  if (jam) return 0;
  if (violations.some(([, s]) => s === 'fatal')) return 0;
  if (violations.length) return 1;
  return totalMs <= parSecs * 1000 && loads <= minLoads ? 3 : 2;
}

/** The first load that jams ends the run (outcome `jam`, 0 stars), regardless of earlier loads. */
export function scoreRun(
  defs: Record<string, ItemDef>,
  level: LevelDef,
  loads: LoadInput[],
  totalTimeMs: number,
  cfg: Config,
): RunResult {
  const perLoad: LoadEval[] = [];
  for (const load of loads) {
    const e = evaluateLoad(defs, load, cfg, { smallItemLoss: level.flags.smallItemLoss });
    perLoad.push(e);
    if (e.jam) return { outcome: 'jam', stars: 0, completed: false, totalTimeMs, perLoad };
  }
  const violations = perLoad.flatMap((e) => e.violations.map((v): [RuleId, Severity] => [v.rule, v.severity]));
  const stars = starsFor(violations, false, totalTimeMs, level.par.seconds, loads.length, level.par.minLoads);
  return { outcome: 'finished', stars, completed: stars >= 1, totalTimeMs, perLoad };
}
