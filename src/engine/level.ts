// Level instances (GDD 12.5, 13.1): `${defId}#${n}`, n from 1, in levels.json `items` order.
import type { InstanceId, LevelDef, LoadInput } from './types';

export function expandLevel(level: LevelDef): InstanceId[] {
  return level.items.flatMap((e) => Array.from({ length: e.count }, (_, k) => `${e.id}#${k + 1}`));
}

/** The par solution as instance-id loads (def ids numbered in order of appearance). */
export function solutionLoads(level: LevelDef): LoadInput[] {
  const next: Record<string, number> = {};
  const inst = (defId: string) => `${defId}#${(next[defId] = (next[defId] ?? 0) + 1)}`;
  return level.par.solution.map((load) => ({
    items: load.items.map(inst),
    bags: load.bags.map((bag) => bag.map(inst)),
  }));
}
