// UI store for one attempt at one level (GDD 3.1, 4). Holds UI state and the current run and
// records the run's decisions as RunEvents; every rule is delegated to the engine, so
// `replay(events)` reproduces the payoff exactly. No React here, so tests can drive it directly.
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  baseId, consequencesFor, evaluateLoad, expandLevel, scoreRun, shuffleIds,
  type Config, type InstanceId, type ItemDef, type ItemOutcome, type LevelDef, type LoadEval,
  type LoadInput, type RunEvent, type RunResult,
} from '../engine';
import { RunTimer, type Clock } from '../services/timer';

export type BagId = 1 | 2;
export type BagPlace = `bag:${BagId}`;
export type Place = 'hamper' | 'floor' | 'drum' | BagPlace;
/** CARD -> PLAYING <-> WASHING -> ... -> PAYOFF, or ABANDONED (GDD 4). */
export type Phase = 'card' | 'playing' | 'washing' | 'payoff' | 'abandoned';
/** A bag sits in its slot beside the machine or in the drum; with `bagsReusable` false it is gone after one wash. */
export type BagLoc = 'slot' | 'drum' | 'used';

export interface FloorPos { x: number; y: number; }

export interface Payoff extends RunResult {
  loads: LoadInput[];
  consequences: Record<InstanceId, ItemOutcome>[];   // one map per evaluated load
}

export interface LevelState {
  level: LevelDef;
  phase: Phase;
  /** The tutorial card shown at the start of this attempt, if any (GDD 10.1). */
  card: string | null;
  rulebookOpen: boolean;
  where: Record<InstanceId, Place | 'washed'>;
  hamperOrder: InstanceId[];          // seeded shuffle; returned items take their old slot
  drumOrder: InstanceId[];            // placement order, for the chips
  bagOrder: Record<BagId, InstanceId[]>;
  bags: Record<BagId, BagLoc>;
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
  dismissCard(): void;
  /** The rulebook counts as an interaction and does not pause the timer (GDD 9.1, 10.2). */
  setRulebook(open: boolean): void;
  /** Tap an item: select it, or deselect it if it is already selected. */
  toggleSelect(id: InstanceId): void;
  /** Moves an item. Returns false when the move is not allowed (a bag that is full or not for this item). */
  place(id: InstanceId, to: Place, pos?: FloorPos): boolean;
  /** Tap a destination with an item selected (tap-to-assign). */
  placeSelected(to: Place, pos?: FloorPos): boolean;
  moveBag(bag: BagId, to: 'slot' | 'drum'): void;
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
  /** The level's tutorial card when the player has never seen it, else null. */
  card?: string | null;
  onCardSeen?(id: string): void;
  onEnd?(payoff: Payoff): void;
  onAbandon?(): void;
}

export type LevelStore = StoreApi<LevelState>;

export const BAG_IDS = [1, 2] as const;

export function bagIds(level: LevelDef): BagId[] {
  return BAG_IDS.filter((b) => b <= level.bags);
}

export function drumLoad(s: Pick<LevelState, 'drumOrder' | 'bagOrder' | 'bags'>): LoadInput {
  return {
    items: [...s.drumOrder],
    bags: BAG_IDS.filter((b) => s.bags[b] === 'drum').map((b) => [...s.bagOrder[b]]),
  };
}

/** Start needs at least one real item in the drum, loose or in a bag; an empty bag alone is not enough (GDD 4). */
export function canStart(s: Pick<LevelState, 'phase' | 'drumOrder' | 'bagOrder' | 'bags'>): boolean {
  if (s.phase !== 'playing') return false;
  const load = drumLoad(s);
  return load.items.length + load.bags.flat().length > 0;
}

export function itemsIn(s: Pick<LevelState, 'where'>, place: Place): InstanceId[] {
  return Object.keys(s.where).filter((id) => s.where[id] === place);
}

/** Bulk inside a bag (capacity is cfg.bagBulkCap, GDD 5.3). */
export function bagBulk(defs: Record<string, ItemDef>, ids: InstanceId[]): number {
  return ids.reduce((sum, id) => sum + defs[baseId(id)]!.bulk, 0);
}

const bagOf = (p: Place | 'washed' | undefined): BagId | null =>
  p === 'bag:1' ? 1 : p === 'bag:2' ? 2 : null;

/** Default floor spot for tap-to-assign without a position: a loose grid. */
function defaultFloorPos(n: number): FloorPos {
  return { x: 12 + (n % 5) * 68, y: 12 + (Math.floor(n / 5) % 2) * 72 };
}

export function createLevelStore(deps: LevelStoreDeps): LevelStore {
  const { level, defs, cfg, clock } = deps;
  const timer = new RunTimer(clock);
  const ids = expandLevel(level);
  const opts = { smallItemLoss: level.flags.smallItemLoss };
  const card = deps.card ?? null;
  let isHidden = false;

  return createStore<LevelState>()((set, get) => {
    const record = (ev: RunEvent) => set((s) => ({ events: [...s.events, ev] }));
    const live = () => get().phase === 'playing';

    const endRun = (outcome: 'finished' | 'jam') => {
      const t = timer.nowMs();
      record({ t, type: 'levelEnd', outcome });
      const { loads } = get();
      const result = scoreRun(defs, level, loads, t, cfg);
      const consequences = loads.slice(0, result.perLoad.length)
        .map((load, i) => consequencesFor(defs, load, level.seed, i, cfg, opts));
      const payoff: Payoff = { ...result, loads, consequences };
      set({ phase: 'payoff', pendingEnd: null, payoff });
      deps.onEnd?.(payoff);
    };

    // A card pauses the timer (GDD 9.1); the timer has not started yet, so this only holds it.
    if (card) timer.pause('card');

    return {
      level,
      phase: card ? 'card' : 'playing',
      card,
      rulebookOpen: false,
      where: Object.fromEntries(ids.map((id) => [id, 'hamper'])),
      hamperOrder: shuffleIds(ids, level.seed),
      drumOrder: [],
      bagOrder: { 1: [], 2: [] },
      bags: { 1: 'slot', 2: 'slot' },
      floorPos: {},
      floorOrder: [],
      selected: null,
      loads: [],
      pendingEnd: null,
      events: card ? [{ t: 0, type: 'card', id: card, open: true }] : [],
      payoff: null,

      timeMs: () => timer.nowMs(),

      interact() {
        if (live()) timer.start();
      },

      dismissCard() {
        const s = get();
        if (s.phase !== 'card' || !s.card) return;
        record({ t: timer.nowMs(), type: 'card', id: s.card, open: false });
        timer.resume('card');
        set({ phase: 'playing' });
        deps.onCardSeen?.(s.card);
      },

      setRulebook(open) {
        const s = get();
        if (s.rulebookOpen === open || (open && !live())) return;
        timer.start();
        record({ t: timer.nowMs(), type: 'rulebook', open });
        set({ rulebookOpen: open, selected: open ? null : s.selected });
      },

      toggleSelect(id) {
        const s = get();
        if (!live() || s.where[id] === undefined || s.where[id] === 'washed') return;
        timer.start();
        set({ selected: s.selected === id ? null : id });
      },

      place(id, to, pos) {
        const s = get();
        const from = s.where[id];
        if (!live() || from === undefined || from === 'washed') return false;
        const toBag = bagOf(to);
        const fromBag = bagOf(from);
        if (toBag !== null && toBag !== fromBag) {
          // The UI never builds an illegal load (GDD 13.4): only small items, never over capacity.
          const def = defs[baseId(id)]!;
          if (toBag > level.bags || s.bags[toBag] === 'used' || !def.small) return false;
          if (bagBulk(defs, s.bagOrder[toBag]) + def.bulk > cfg.bagBulkCap) return false;
        }
        timer.start();
        const floorPos = { ...s.floorPos };
        let floorOrder = s.floorOrder.filter((x) => x !== id);
        if (to === 'floor') {
          floorPos[id] = pos ?? s.floorPos[id] ?? defaultFloorPos(s.floorOrder.length);
          floorOrder = [...floorOrder, id];
        } else {
          delete floorPos[id];
        }
        const keepOrAppend = (list: InstanceId[], inIt: boolean) =>
          inIt ? (from === to ? list : [...list, id]) : list.filter((x) => x !== id);
        const drumOrder = keepOrAppend(s.drumOrder, to === 'drum');
        const bagOrder = {
          1: keepOrAppend(s.bagOrder[1], toBag === 1),
          2: keepOrAppend(s.bagOrder[2], toBag === 2),
        };
        set({ where: { ...s.where, [id]: to }, floorPos, floorOrder, drumOrder, bagOrder, selected: null });
        // Repositioning on the floor is not a decision; only container changes are recorded.
        if (from !== to) record({ t: timer.nowMs(), type: 'place', item: id, to });
        return true;
      },

      placeSelected(to, pos) {
        const { selected } = get();
        return selected ? get().place(selected, to, pos) : false;
      },

      moveBag(bag, to) {
        const s = get();
        if (!live() || bag > level.bags || s.bags[bag] === 'used' || s.bags[bag] === to) return;
        // A load holds at most two bags (GDD 6.4); there are only two, so no further check.
        timer.start();
        set({ bags: { ...s.bags, [bag]: to }, selected: null });
        record({ t: timer.nowMs(), type: to === 'drum' ? 'bagToDrum' : 'bagFromDrum', bag });
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
        for (const id of [...load.items, ...load.bags.flat()]) where[id] = 'washed';
        const bags = { ...s.bags };
        const bagOrder = { ...s.bagOrder };
        for (const b of BAG_IDS) {
          if (bags[b] !== 'drum') continue;
          // Reusable bags come back empty to their slot; otherwise they are spent (GDD 6.4).
          bags[b] = level.bagsReusable ? 'slot' : 'used';
          bagOrder[b] = [];
        }
        const left = Object.values(where).some((p) => p !== 'washed');
        set({
          phase: 'washing',
          where,
          drumOrder: [],
          bags,
          bagOrder,
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
        set({ phase: 'abandoned', selected: null, rulebookOpen: false });
        deps.onAbandon?.();
      },
    };
  });
}
