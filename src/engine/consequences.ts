// Per-item outcomes (GDD 13.6). Port of `consequences` in tools/verify_gdd.py.
import { evaluateLoad, type EvalOptions } from './evaluate';
import { isLost } from './rng';
import type { Config, InstanceId, ItemDef, ItemOutcome, LoadInput, RuleId, Tint } from './types';

const TINT_FOR: Partial<Record<RuleId, Tint>> = {
  COLOR_BLEED: 'pink',
  COLOR_DYE: 'greyBlue',
  HYG_DIRTY_WITH_LIGHT: 'smudged',
  HYG_DIRTY_WITH_DARK: 'stained',
  COLOR_LINT: 'lint',
};

const TINT_RANK: Record<Tint, number> = { none: 0, lint: 1, stained: 2, smudged: 3, greyBlue: 4, pink: 5 };

export function consequencesFor(
  defs: Record<string, ItemDef>,
  load: LoadInput,
  levelSeed: number,
  loadIndex: number,
  cfg: Config,
  opts: EvalOptions = {},
): Record<InstanceId, ItemOutcome> {
  const e = evaluateLoad(defs, load, cfg, opts);
  const out: Record<InstanceId, ItemOutcome> = {};
  for (const id of [...load.items, ...load.bags.flat()]) {
    out[id] = { shape: 'normal', tint: 'none', ruined: false, ballooned: e.jam };
  }
  for (const v of e.violations) {
    const tint = TINT_FOR[v.rule];
    for (const id of v.instanceIds) {
      const o = out[id]!;
      if (tint) {
        if (TINT_RANK[tint] > TINT_RANK[o.tint]) o.tint = tint;
        if (v.severity === 'fatal') o.ruined = true;
      } else if (v.rule === 'SMALL_LOOSE') {
        o.shape = isLost(levelSeed, loadIndex, id, cfg) ? 'lost' : 'stretched';
      }
    }
  }
  return out;
}
