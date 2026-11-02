// UI store for one attempt at one level (GDD 3.1, 4). Holds UI state and the current run and
// records the run's decisions as RunEvents; every rule is delegated to the engine, so
// `replay(events)` reproduces the payoff exactly. No React here, so tests can drive it directly.
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  consequencesFor, evaluateLoad, expandLevel, scoreRun, shuffleIds,
  type Config, type InstanceId, type ItemDef, type ItemOutcome, type LevelDef, type LoadEval,
  type LoadInput, type RunEvent, type RunResult,
} from '../engine';
import { RunTimer, type Clock } from '../services/timer';

export type Place = 'hamper' | 'floor' | 'drum';
export type Phase = 'playing' | 'washing' | 'payoff' | 'abandoned';

export interface FloorPos { x: number; y: number; }

export interface Payoff extends RunResult {
  loads: LoadInput[];
  consequences: Record<InstanceId, ItemOutcome>[];   // one map per evaluated load
}

export interface LevelState {
  level: LevelDef;
  phase: Phase;
  where: Record<InstanceId, Place | 'washed'>;
  hamperOrder: InstanceId[];          // seeded shuffle; returned items take their old slot
  drumOrder: InstanceId[];            // placement order, for the chips
  floorPos: Record<InstanceId, FloorPos>;
  floorOrder: InstanceId[];           // back to front: the last one is on top (last touched)
  selected: InstanceId | null;
  loads: LoadInput[];
  pendingEnd: 'finished' | 'jam' | null;
  events: RunEvent[];
  payoff: Payoff | null;

  timeMs(): number;
  /** First pointer interaction starts the timer (GDD 9.1). */
  interact(): void;
  /** Tap an item: select it, or deselect it if it is already selected. */
  toggleSelect(id: InstanceId): void;
  place(id: InstanceId, to: Place, pos?: FloorPos): void;
  /** Tap a destination with an item selected (tap-to-assign). */
  placeSelected(to: Place, pos?: FloorPos): void;
  start(): void;
  finishWash(skipped: boolean): void;
  setHidden(hidden: boolean): void;
  abandon(): void;
}

export interface LevelStoreDeps {
  level: LevelDef;
  defs: Record<string, ItemDef>;
  cfg: Config;
  clock: Clock;
}

export type LevelStore = StoreApi<LevelState>;

export function drumLoad(s: Pick<LevelState, 'drumOrder'>): LoadInput {
  return { items: [...s.drumOrder], bags: [] };
}

/** Start needs at least one real item in the drum (GDD 4). */
export function canStart(s: Pick<LevelState, 'phase' | 'drumOrder'>): boolean {
  return s.phase === 'playing' && s.drumOrder.length > 0;
}

export function itemsIn(s: Pick<LevelState, 'where'>, place: Place): InstanceId[] {
  return Object.keys(s.where).filter((id) => s.where[id] === place);
}

/** Default floor spot for tap-to-assign without a position: a loose grid. */
function defaultFloorPos(n: number): FloorPos {
  return { x: 12 + (n % 5) * 68, y: 12 + (Math.floor(n / 5) % 2) * 72 };
}

export function createLevelStore({ level, defs, cfg, clock }: LevelStoreDeps): LevelStore {
  const timer = new RunTimer(clock);
  const ids = expandLevel(level);
  const opts = { smallItemLoss: level.flags.smallItemLoss };
  let isHidden = false;

  return createStore<LevelState>()((set, get) => {
    const record = (ev: RunEvent) => set((s) => ({ events: [...s.events, ev] }));

    const endRun = (outcome: 'finished' | 'jam') => {
      const t = timer.nowMs();
      record({ t, type: 'levelEnd', outcome });
      const { loads } = get();
      const result = scoreRun(defs, level, loads, t, cfg);
      const consequences = loads.slice(0, result.perLoad.length)
        .map((load, i) => consequencesFor(defs, load, level.seed, i, cfg, opts));
      set({ phase: 'payoff', pendingEnd: null, payoff: { ...result, loads, consequences } });
    };

    return {
      level,
      phase: 'playing',
      where: Object.fromEntries(ids.map((id) => [id, 'hamper'])),
      hamperOrder: shuffleIds(ids, level.seed),
      drumOrder: [],
      floorPos: {},
      floorOrder: [],
      selected: null,
      loads: [],
      pendingEnd: null,
      events: [],
      payoff: null,

      timeMs: () => timer.nowMs(),

      interact() {
        if (get().phase === 'playing') timer.start();
      },

      toggleSelect(id) {
        const s = get();
        if (s.phase !== 'playing' || s.where[id] === undefined || s.where[id] === 'washed') return;
        timer.start();
        set({ selected: s.selected === id ? null : id });
      },

      place(id, to, pos) {
        const s = get();
        const from = s.where[id];
        if (s.phase !== 'playing' || from === undefined || from === 'washed') return;
        timer.start();
        const floorPos = { ...s.floorPos };
        let floorOrder = s.floorOrder.filter((x) => x !== id);
        if (to === 'floor') {
          floorPos[id] = pos ?? s.floorPos[id] ?? defaultFloorPos(s.floorOrder.length);
          floorOrder = [...floorOrder, id];
        } else {
          delete floorPos[id];
        }
        const drumOrder = to === 'drum'
          ? (from === 'drum' ? s.drumOrder : [...s.drumOrder, id])
          : s.drumOrder.filter((x) => x !== id);
        set({ where: { ...s.where, [id]: to }, floorPos, floorOrder, drumOrder, selected: null });
        // Repositioning on the floor is not a decision; only container changes are recorded.
        if (from !== to) record({ t: timer.nowMs(), type: 'place', item: id, to });
      },

      placeSelected(to, pos) {
        const { selected } = get();
        if (selected) get().place(selected, to, pos);
      },

      start() {
        const s = get();
        if (!canStart(s)) return;
        timer.start();
        const load = drumLoad(s);
        const e: LoadEval = evaluateLoad(defs, load, cfg, opts);
        record({ t: timer.nowMs(), type: 'start', cycleCostMs: e.cycleCostMs });
        timer.addCost(e.cycleCostMs);
        // The spin adds no time (GDD 9.1).
        timer.pause('washing');
        const where = { ...s.where };
        for (const id of load.items) where[id] = 'washed';
        const left = Object.values(where).some((p) => p !== 'washed');
        set({
          phase: 'washing',
          where,
          drumOrder: [],
          selected: null,
          loads: [...s.loads, load],
          pendingEnd: e.jam ? 'jam' : left ? null : 'finished',
        });
      },

      finishWash(skipped) {
        const s = get();
        if (s.phase !== 'washing') return;
        if (skipped) record({ t: timer.nowMs(), type: 'skipAnimation' });
        if (s.pendingEnd) {
          // Swap pauses without a running gap so levelEnd lands exactly at start + cost.
          timer.pause('ended');
          timer.resume('washing');
          endRun(s.pendingEnd);
        } else {
          timer.resume('washing');
          set({ phase: 'playing' });
        }
      },

      setHidden(hidden) {
        const s = get();
        if (s.phase === 'payoff' || s.phase === 'abandoned' || hidden === isHidden) return;
        isHidden = hidden;
        if (hidden) timer.pause('hidden');
        else timer.resume('hidden');
        if (timer.isStarted) record({ t: timer.nowMs(), type: hidden ? 'pause' : 'resume' });
      },

      abandon() {
        const s = get();
        if (s.phase === 'payoff' || s.phase === 'abandoned') return;
        record({ t: timer.nowMs(), type: 'abandon' });
        timer.pause('ended');
        set({ phase: 'abandoned', selected: null });
      },
    };
  });
}
