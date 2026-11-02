// Load evaluation (GDD 6.5, 7, 9.2, 13.3, 13.4). Port of `evaluate` in tools/verify_gdd.py.
// All arithmetic is integer: wet bulk in tenths, time in milliseconds.
import type { Config, FillZone, IllegalCode, ItemDef, LoadEval, LoadInput, Violation } from './types';

export interface EvalOptions {
  /** Level flag `smallItemLoss`; SMALL_LOOSE is inactive when false (GDD 7.5). */
  smallItemLoss?: boolean;
}

/** `tee_white#2` -> `tee_white`. Def ids pass through unchanged. */
export function baseId(ref: string): string {
  const hash = ref.indexOf('#');
  return hash === -1 ? ref : ref.slice(0, hash);
}

export function defOf(defs: Record<string, ItemDef>, ref: string): ItemDef {
  const def = defs[baseId(ref)];
  if (!def) throw new Error(`unknown item ${ref}`);
  return def;
}

/** Fill zone from dry values, integer thresholds (GDD 6.5): 70% = W63/B70, 90% = W81/B90. */
export function zoneOf(weight: number, dryBulk: number): FillZone {
  if (weight > 90 || dryBulk > 100) return 'overfull';
  if (weight > 81 || dryBulk > 90) return 'tight';
  if (weight >= 63 || dryBulk >= 70) return 'good';
  return 'light';
}

export function isJam(weight: number, wetBulkTenths: number, cfg: Config): boolean {
  return weight > cfg.drumWeight || wetBulkTenths > cfg.drumWetBulkTenths;
}

/** base + max(W, B) / divisor seconds, in integer ms rounded half up (GDD 9.2). */
export function cycleCostMs(weight: number, dryBulk: number, cfg: Config): number {
  const max = Math.max(weight, dryBulk);
  return cfg.cycleBaseMs + Math.floor((max * 2000 + cfg.cycleDivisor) / (2 * cfg.cycleDivisor));
}

export function evaluateLoad(
  defs: Record<string, ItemDef>,
  load: LoadInput,
  cfg: Config,
  opts: EvalOptions = {},
): LoadEval {
  const smallItemLoss = opts.smallItemLoss ?? true;
  const loose = load.items.map((id) => ({ id, def: defOf(defs, id) }));
  const bags = load.bags.map((bag) => bag.map((id) => ({ id, def: defOf(defs, id) })));
  const contents = [...loose, ...bags.flat()];

  const illegal = new Set<IllegalCode>();
  if (bags.length > cfg.maxBagsPerLoad) illegal.add('BAG_COUNT');
  for (const bag of bags) {
    if (bag.some((x) => !x.def.small)) illegal.add('BAG_NOT_SMALL');
    if (bag.reduce((n, x) => n + x.def.bulk, 0) > cfg.bagBulkCap) illegal.add('BAG_CAPACITY');
  }
  if (contents.length === 0) illegal.add('EMPTY_LOAD');
  const ids = contents.map((x) => x.id);
  if (ids.some((id) => id.includes('#')) && new Set(ids).size !== ids.length) illegal.add('DUPLICATE_ITEM');

  let weight = cfg.bagWeight * bags.length;
  let dryBulk = cfg.bagBulk * bags.length;
  let wetBulkTenths = cfg.bagBulk * cfg.swellTenths.low * bags.length;
  for (const { def } of contents) {
    weight += def.weight;
    dryBulk += def.bulk;
    wetBulkTenths += def.bulk * cfg.swellTenths[def.swell];
  }

  // Order is fixed as in GDD 7 so results are stable.
  const violations: Violation[] = [];
  const dirtyLoad = contents.some((x) => x.def.hygiene === 'dirty');
  if (!dirtyLoad) {
    const light = contents.filter((x) => x.def.tier === 'light');
    const dark = contents.filter((x) => x.def.tier === 'dark');
    const lightIds = light.map((x) => x.id);
    if (light.length && dark.some((x) => x.def.bleeds)) {
      violations.push({ rule: 'COLOR_BLEED', severity: 'fatal', instanceIds: lightIds });
    } else if (light.length && dark.length) {
      violations.push({ rule: 'COLOR_DYE', severity: 'fatal', instanceIds: lightIds });
    }
  } else {
    for (const x of contents) {
      if (x.def.hygiene !== 'clean') continue;
      violations.push(x.def.tier === 'light'
        ? { rule: 'HYG_DIRTY_WITH_LIGHT', severity: 'fatal', instanceIds: [x.id] }
        : { rule: 'HYG_DIRTY_WITH_DARK', severity: 'major', instanceIds: [x.id] });
    }
    if (contents.some((x) => x.def.shedder && x.def.hygiene === 'dirty')) {
      for (const x of contents) {
        if (x.def.tier !== 'dark' || x.def.hygiene === 'dirty') continue;
        if (x.def.hygiene === 'flex' && !cfg.lintAffectsFlexDark) continue;
        violations.push({ rule: 'COLOR_LINT', severity: 'minor', instanceIds: [x.id] });
      }
    }
  }
  if (smallItemLoss) {
    for (const x of loose) {
      if (x.def.small) violations.push({ rule: 'SMALL_LOOSE', severity: 'major', instanceIds: [x.id] });
    }
  }

  return {
    weight,
    dryBulk,
    wetBulkTenths,
    zone: zoneOf(weight, dryBulk),
    jam: isJam(weight, wetBulkTenths, cfg),
    cycleCostMs: cycleCostMs(weight, dryBulk, cfg),
    violations,
    illegal: [...illegal].sort(),
  };
}
