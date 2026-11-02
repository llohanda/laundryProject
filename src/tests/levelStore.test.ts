// Level store tests (GDD 4, 9, 21): drive the store like a player, then check that
// replaying the recorded events reproduces the store's own payoff.
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { replay, solutionLoads, type LevelDef, type RunRecord } from '../engine';
import { canStart, createLevelStore, itemsIn, type LevelStore } from '../ui/levelStore';

const { itemsById: defs, config: cfg } = content;
const levelById = (id: string) => content.levels.find((l) => l.id === id)!;

function setup(id: string) {
  let now = 0;
  const level = levelById(id);
  const store = createLevelStore({ level, defs, cfg, clock: () => now });
  return { level, store, advance: (ms: number) => { now += ms; } };
}

function record(store: LevelStore, level: LevelDef): RunRecord {
  const s = store.getState();
  return {
    schema: 1, runId: 'r', gameVersion: 'test', playerId: 'p', levelId: level.id, startedAt: '2026-11-02T00:00:00Z',
    events: s.events,
    result: { outcome: 'finished', stars: 0, timeMs: 0, loads: s.loads.length, violations: [] },
  };
}

/** Play a list of loads: put each item in the drum (stepMs apart), press Start, finish the spin. */
function play(store: LevelStore, advance: (ms: number) => void, loads: string[][], stepMs: number) {
  for (const load of loads) {
    for (const id of load) {
      advance(stepMs);
      store.getState().place(id, 'drum');
    }
    advance(stepMs);
    store.getState().start();
    advance(1500);   // the spin animation adds no time
    store.getState().finishWash(false);
  }
}

describe('level store', () => {
  it('starts with every item in the hamper in the seeded order, and Start disabled', () => {
    const { store } = setup('1-1');
    const s = store.getState();
    expect(itemsIn(s, 'hamper')).toHaveLength(6);
    expect(s.hamperOrder).toEqual(['tee_grey#1', 'tee_white#1', 'tee_mint#1', 'tee_black#1', 'shirt_black#1', 'shirt_white#1']);
    expect(canStart(s)).toBe(false);
  });

  it('tap-to-assign: tap an item, tap a destination; tap again to deselect', () => {
    const { store } = setup('1-1');
    store.getState().toggleSelect('tee_white#1');
    expect(store.getState().selected).toBe('tee_white#1');
    store.getState().toggleSelect('tee_white#1');
    expect(store.getState().selected).toBeNull();
    store.getState().toggleSelect('tee_white#1');
    store.getState().placeSelected('drum');
    expect(store.getState().where['tee_white#1']).toBe('drum');
    expect(store.getState().selected).toBeNull();
    expect(canStart(store.getState())).toBe(true);
  });

  it('items can leave the drum again before Start; the floor keeps positions and stacking order', () => {
    const { store } = setup('1-1');
    const { place } = store.getState();
    place('tee_white#1', 'drum');
    place('tee_white#1', 'floor', { x: 40, y: 20 });
    place('tee_black#1', 'floor', { x: 50, y: 30 });
    place('tee_white#1', 'floor', { x: 60, y: 40 });   // touched last, so on top
    const s = store.getState();
    expect(s.drumOrder).toEqual([]);
    expect(s.floorPos['tee_white#1']).toEqual({ x: 60, y: 40 });
    expect(s.floorOrder).toEqual(['tee_black#1', 'tee_white#1']);
    // Moving within the floor is not a recorded decision.
    expect(s.events.filter((e) => e.type === 'place').map((e) => e.type === 'place' && e.to))
      .toEqual(['drum', 'floor', 'floor']);
  });

  it('the timer starts on the first interaction, and the cycle cost is added at Start', () => {
    const { store, advance } = setup('1-1');
    advance(5000);                                   // card or idle time before touching: not counted
    store.getState().interact();
    advance(1000);
    store.getState().place('tee_white#1', 'drum');
    advance(1000);
    store.getState().start();
    // tee_white alone: W4 B5 -> 6000 + floor((5*2000 + 15) / 30) = 6333 ms.
    expect(store.getState().events.at(-1)).toEqual({ t: 2000, type: 'start', cycleCostMs: 6333 });
    expect(store.getState().timeMs()).toBe(8333);
    advance(1500);
    expect(store.getState().timeMs()).toBe(8333);   // the spin adds no time
  });

  it('nothing can be moved while the drum spins; finishing the spin returns to play', () => {
    const { store } = setup('1-1');
    store.getState().place('tee_white#1', 'drum');
    store.getState().start();
    expect(store.getState().phase).toBe('washing');
    store.getState().place('tee_black#1', 'drum');
    expect(store.getState().where['tee_black#1']).toBe('hamper');
    store.getState().finishWash(true);
    expect(store.getState().phase).toBe('playing');
    expect(store.getState().events.at(-1)!.type).toBe('skipAnimation');
    expect(store.getState().where['tee_white#1']).toBe('washed');
  });

  it('a hidden page pauses the timer and is recorded', () => {
    const { store, advance } = setup('1-1');
    store.getState().interact();
    advance(1000);
    store.getState().setHidden(true);
    advance(60_000);
    store.getState().setHidden(true);   // repeated notifications are ignored
    store.getState().setHidden(false);
    advance(500);
    expect(store.getState().timeMs()).toBe(1500);
    expect(store.getState().events.map((e) => [e.type, e.t])).toEqual([['pause', 1000], ['resume', 1000]]);
  });

  it.each(content.levels.filter((l) => l.tutorial === 1).map((l) => [l.id, l] as const))(
    '%s: a fast par run gives 3 stars and replay reproduces it exactly', (_id, level) => {
      const { store, advance } = setup(level.id);
      play(store, advance, solutionLoads(level).map((l) => l.items), 100);
      const s = store.getState();
      expect(s.phase).toBe('payoff');
      expect(s.payoff).toMatchObject({ outcome: 'finished', stars: 3, completed: true });
      expect(s.events.at(-1)).toEqual({ t: s.payoff!.totalTimeMs, type: 'levelEnd', outcome: 'finished' });

      const r = replay(defs, level, record(store, level), cfg);
      expect(r.stars).toBe(s.payoff!.stars);
      expect(r.totalTimeMs).toBe(s.payoff!.totalTimeMs);
      expect(r.consequences).toEqual(s.payoff!.consequences);
    });

  it('3 stars at exactly par, 2 stars one millisecond over', () => {
    for (const extra of [0, 1]) {
      const { level, store, advance } = setup('1-1');
      const [a, b] = solutionLoads(level).map((l) => l.items);
      // Two loads of 3 items each cost 7067 ms apiece; spread the rest of par over the decisions.
      const decisionMs = level.par.seconds * 1000 - 2 * 7067 + extra;
      store.getState().interact();
      play(store, advance, [a!], 0);
      advance(decisionMs);
      play(store, advance, [b!], 0);
      expect(store.getState().payoff!.totalTimeMs).toBe(level.par.seconds * 1000 + extra);
      expect(store.getState().payoff!.stars).toBe(extra ? 2 : 3);
    }
  });

  it('a red tee in the lights finishes with 0 stars and pink lights', () => {
    const { store, advance } = setup('1-2');
    play(store, advance, [
      ['tee_red#1', 'tee_white#1', 'shirt_white#1', 'tee_mint#1', 'shirt_pastel_blue#1'],
      ['tee_black#1', 'shirt_navy#1', 'trousers_black#1'],
    ], 100);
    const p = store.getState().payoff!;
    expect(p).toMatchObject({ outcome: 'finished', stars: 0, completed: false });
    expect(p.consequences[0]!['tee_white#1']).toMatchObject({ tint: 'pink', ruined: true });
    expect(p.consequences[0]!['tee_red#1']).toMatchObject({ tint: 'none', ruined: false });
  });

  it('a jam ends the level at that load', () => {
    const { level, store, advance } = setup('2-3');
    play(store, advance, [['puffer_navy#1', 'hoodie_navy#1', 'hoodie_navy#2', 'trousers_black#1']], 100);
    const s = store.getState();
    expect(s.payoff).toMatchObject({ outcome: 'jam', stars: 0 });
    expect(itemsIn(s, 'hamper').length).toBeGreaterThan(0);
    expect(replay(defs, level, record(store, level), cfg).outcome).toBe('jam');
  });

  it('abandon records the event and freezes the level', () => {
    const { store, advance } = setup('1-1');
    store.getState().place('tee_white#1', 'drum');
    advance(700);
    store.getState().abandon();
    expect(store.getState().phase).toBe('abandoned');
    expect(store.getState().events.at(-1)).toEqual({ t: 700, type: 'abandon' });
    store.getState().start();
    expect(store.getState().events.at(-1)!.type).toBe('abandon');
  });
});
