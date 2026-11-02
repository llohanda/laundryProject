// Replay (GDD 13.4, 15): rebuild each load from the recorded decisions, then score it.
// A run that cannot have happened (unknown item, washed item moved, cost-formula change,
// mismatched outcome) throws ReplayError instead of being silently repaired.
import { consequencesFor } from './consequences';
import { evaluateLoad } from './evaluate';
import { expandLevel } from './level';
import { scoreRun } from './score';
import type { Config, InstanceId, ItemDef, LevelDef, LoadInput, ReplayResult, RunRecord } from './types';

export class ReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplayError';
  }
}

type Location = 'hamper' | 'floor' | 'drum' | 'bag:1' | 'bag:2' | 'washed';
type BagId = 1 | 2;

export function replay(defs: Record<string, ItemDef>, level: LevelDef, run: RunRecord, cfg: Config): ReplayResult {
  if (run.levelId !== level.id) throw new ReplayError(`run is for level ${run.levelId}, not ${level.id}`);

  const where = new Map<InstanceId, Location>(expandLevel(level).map((id) => [id, 'hamper']));
  const bagInDrum: Record<BagId, boolean> = { 1: false, 2: false };
  const bagUsed: Record<BagId, boolean> = { 1: false, 2: false };
  const loads: LoadInput[] = [];
  let lastT = 0;
  let ended: { outcome: 'finished' | 'jam'; t: number } | null = null;

  const checkBag = (bag: BagId) => {
    if (bag > level.bags) throw new ReplayError(`level ${level.id} has no bag ${bag}`);
    if (!level.bagsReusable && bagUsed[bag]) throw new ReplayError(`bag ${bag} was already used`);
  };

  for (const ev of run.events) {
    if (ended) throw new ReplayError(`event after levelEnd: ${ev.type}`);
    if (ev.t < lastT) throw new ReplayError(`event time went backwards at t=${ev.t}`);
    lastT = ev.t;

    switch (ev.type) {
      case 'place': {
        const from = where.get(ev.item);
        if (from === undefined) throw new ReplayError(`unknown item ${ev.item}`);
        if (from === 'washed') throw new ReplayError(`${ev.item} was already washed`);
        if (ev.to === 'bag:1' || ev.to === 'bag:2') checkBag(ev.to === 'bag:1' ? 1 : 2);
        where.set(ev.item, ev.to);
        break;
      }
      case 'bagToDrum':
      case 'bagFromDrum':
        checkBag(ev.bag);
        bagInDrum[ev.bag] = ev.type === 'bagToDrum';
        break;
      case 'start': {
        const bags = ([1, 2] as const).filter((b) => bagInDrum[b]);
        const load: LoadInput = {
          items: [...where].filter(([, loc]) => loc === 'drum').map(([id]) => id),
          bags: bags.map((b) => [...where].filter(([, loc]) => loc === `bag:${b}`).map(([id]) => id)),
        };
        const e = evaluateLoad(defs, load, cfg, { smallItemLoss: level.flags.smallItemLoss });
        if (e.illegal.length) throw new ReplayError(`illegal load at t=${ev.t}: ${e.illegal.join(', ')}`);
        if (ev.cycleCostMs !== e.cycleCostMs) {
          throw new ReplayError(`recorded cycle cost ${ev.cycleCostMs} ms, engine computes ${e.cycleCostMs} ms`);
        }
        loads.push(load);
        for (const id of [...load.items, ...load.bags.flat()]) where.set(id, 'washed');
        for (const b of bags) {
          bagInDrum[b] = false;
          bagUsed[b] = true;
        }
        // The timer jumps by the cycle cost at Start (GDD 15).
        lastT = ev.t + ev.cycleCostMs;
        break;
      }
      case 'levelEnd':
        ended = { outcome: ev.outcome, t: ev.t };
        break;
      case 'abandon':
        throw new ReplayError('an abandoned run has no score to replay');
      case 'skipAnimation':
      case 'rulebook':
      case 'card':
      case 'pause':
      case 'resume':
        break;
    }
  }

  if (!ended) throw new ReplayError('run has no levelEnd event');
  const result = scoreRun(defs, level, loads, ended.t, cfg);
  if (result.outcome !== ended.outcome) {
    throw new ReplayError(`levelEnd says ${ended.outcome}, engine says ${result.outcome}`);
  }
  if (result.outcome === 'finished') {
    const left = [...where].filter(([, loc]) => loc !== 'washed').map(([id]) => id);
    if (left.length) throw new ReplayError(`finished with unwashed items: ${left.join(', ')}`);
  }

  // Consequences only for the loads scoreRun evaluated (a jam ends the run at that load).
  const consequences = loads.slice(0, result.perLoad.length).map((load, loadIndex) =>
    consequencesFor(defs, load, level.seed, loadIndex, cfg, { smallItemLoss: level.flags.smallItemLoss }));
  return { ...result, consequences };
}
