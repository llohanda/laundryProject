// Level store tests (GDD 4, 9, 21): drive the store like a player, then check that
// replaying the recorded events reproduces the store's own payoff.
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { replay, solutionLoads, type LevelDef, type LoadInput, type RunRecord } from '../engine';
import { canStart, createLevelStore, itemsIn, type LevelStore, type LevelStoreDeps } from '../ui/levelStore';
import fixturesJson from '../content/fixtures.json';

const { itemsById: defs, config: cfg } = content;
const levelById = (id: string) => content.levels.find((l) => l.id === id)!;

function setup(id: string | LevelDef, extra: Partial<LevelStoreDeps> = {}) {
  let now = 0;
  const level = typeof id === 'string' ? levelById(id) : id;
  const store = createLevelStore({ level, defs, cfg, clock: () => now, ...extra });
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

/**
 * Play a list of loads: put each item in the drum (stepMs apart), fill a free bag per bagged
 * group and put it in the drum, press Start, finish the spin.
 */
function play(store: LevelStore, advance: (ms: number) => void, loads: (string[] | LoadInput)[], stepMs: number) {
  for (const entry of loads) {
    const load = Array.isArray(entry) ? { items: entry, bags: [] } : entry;
    for (const id of load.items) {
      advance(stepMs);
      expect(store.getState().place(id, 'drum')).toBe(true);
    }
    const free = ([1, 2] as const).filter((b) => store.getState().bags[b] === 'slot');
    for (const [k, contents] of load.bags.entries()) {
      const bag = free[k]!;
      for (const id of contents) {
        advance(stepMs);
        expect(store.getState().place(id, `bag:${bag}`)).toBe(true);
      }
      advance(stepMs);
      store.getState().moveBag(bag, 'drum');
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

  it.each(content.levels.map((l) => [l.id, l] as const))(
    '%s: a fast par run gives 3 stars and replay reproduces it exactly', (_id, level) => {
      const { store, advance } = setup(level.id);
      play(store, advance, solutionLoads(level), 100);
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

  it('a tutorial card holds the timer until dismissed, is recorded, and is reported as seen', () => {
    const seen: string[] = [];
    const { store, advance } = setup('2-1', { card: 't2_size', onCardSeen: (id) => seen.push(id) });
    expect(store.getState().phase).toBe('card');
    store.getState().interact();
    store.getState().place('tee_black#1', 'drum');          // nothing moves behind the card
    expect(store.getState().where['tee_black#1']).toBe('hamper');
    advance(30_000);
    store.getState().dismissCard();
    expect(seen).toEqual(['t2_size']);
    expect(store.getState().phase).toBe('playing');
    advance(5000);                                          // idle after the card: not counted yet
    store.getState().interact();
    advance(1000);
    expect(store.getState().timeMs()).toBe(1000);
    expect(store.getState().events).toEqual([
      { t: 0, type: 'card', id: 't2_size', open: true },
      { t: 0, type: 'card', id: 't2_size', open: false },
    ]);
  });

  it('the rulebook counts as an interaction and does not pause the timer', () => {
    const { store, advance } = setup('1-1');
    advance(2000);
    store.getState().setRulebook(true);
    advance(4000);
    store.getState().setRulebook(false);
    expect(store.getState().timeMs()).toBe(4000);
    expect(store.getState().events).toEqual([
      { t: 0, type: 'rulebook', open: true },
      { t: 4000, type: 'rulebook', open: false },
    ]);
  });

  it('Start is disabled with an empty drum and with only an empty bag; one bagged item enables it', () => {
    const { store } = setup('4-1');
    expect(canStart(store.getState())).toBe(false);
    store.getState().moveBag(1, 'drum');
    expect(canStart(store.getState())).toBe(false);
    store.getState().start();
    expect(store.getState().phase).toBe('playing');
    store.getState().place('sock_white#1', 'bag:1');
    expect(canStart(store.getState())).toBe(true);
  });

  it('bags take only small items, and never more than 12 bulk', () => {
    const { store } = setup('4-3');
    const { place } = store.getState();
    expect(place('tee_white#1', 'bag:1')).toBe(false);
    expect(place('rag_grey#1', 'bag:1')).toBe(false);       // rags are not small
    const small = ['sock_white#1', 'undies_white#1', 'sock_black#1', 'sock_black#2', 'undies_black#1', 'undies_black#2'];
    for (const id of small) expect(place(id, 'bag:1')).toBe(true);
    expect(place('sock_worn_navy#1', 'bag:1')).toBe(false); // the seventh would be 14 bulk
    expect(store.getState().where['sock_worn_navy#1']).toBe('hamper');
    expect(place('sock_worn_navy#1', 'bag:2')).toBe(true);
    // Moving an item between bags or out of one is always allowed.
    expect(place('sock_white#1', 'floor')).toBe(true);
    expect(store.getState().bagOrder[1]).not.toContain('sock_white#1');
    // Refused moves are not recorded.
    expect(store.getState().events.filter((e) => e.type === 'place')).toHaveLength(8);
  });

  it('a level without bags refuses bag moves', () => {
    const { store } = setup('1-1');
    store.getState().moveBag(1, 'drum');
    expect(store.getState().bags[1]).toBe('slot');
    expect(store.getState().events).toEqual([]);
  });

  it('reusable bags come back empty after a wash', () => {
    const { store, advance } = setup('4-1');
    const [lights] = solutionLoads(levelById('4-1'));
    play(store, advance, [lights!], 100);
    const s = store.getState();
    expect(s.bags).toEqual({ 1: 'slot', 2: 'slot' });
    expect(s.bagOrder).toEqual({ 1: [], 2: [] });
    expect(s.where['sock_white#1']).toBe('washed');
  });

  it('with bagsReusable false a used bag is gone, and 4-3 is still solved by the no-reuse alternative', () => {
    const level: LevelDef = { ...levelById('4-3'), bagsReusable: false };
    const alt: LevelDef = { ...level, par: { ...level.par, solution: fixturesJson.noReuseAlternative43 } };
    const { store, advance } = setup(level);
    play(store, advance, solutionLoads(alt), 100);
    const s = store.getState();
    expect(s.bags).toEqual({ 1: 'used', 2: 'used' });
    expect(s.payoff).toMatchObject({ outcome: 'finished', completed: true });
    expect(s.payoff!.perLoad.every((e) => e.violations.length === 0)).toBe(true);
    expect(replay(defs, level, record(store, level), cfg).stars).toBe(s.payoff!.stars);

    const { store: again } = setup(level);
    again.getState().place('sock_white#1', 'bag:1');
    again.getState().place('tee_white#1', 'drum');
    again.getState().moveBag(1, 'drum');
    again.getState().start();
    again.getState().finishWash(true);
    expect(again.getState().place('sock_black#1', 'bag:1')).toBe(false);
    again.getState().moveBag(1, 'drum');
    expect(again.getState().bags[1]).toBe('used');
  });

  it('loose small items are a major mistake with a seeded look, identical on replay', () => {
    const { level, store, advance } = setup('4-1');
    play(store, advance, [
      ['tee_white#1', 'hoodie_white#1', 'sock_white#1', 'undies_white#1'],
      { items: ['jeans_blue#1', 'shirt_black#1', 'tee_black#1'], bags: [['sock_black#1', 'undies_black#1']] },
    ], 100);
    const p = store.getState().payoff!;
    expect(p).toMatchObject({ outcome: 'finished', stars: 1, completed: true });
    expect(p.perLoad[0]!.violations.map((v) => v.rule)).toEqual(['SMALL_LOOSE', 'SMALL_LOOSE']);
    for (const id of ['sock_white#1', 'undies_white#1']) {
      expect(['lost', 'stretched']).toContain(p.consequences[0]![id]!.shape);
    }
    expect(replay(defs, level, record(store, level), cfg).consequences).toEqual(p.consequences);
  });

  it('reports the end of a run and an abandon to its caller', () => {
    const ends: number[] = [];
    let abandons = 0;
    const { level, store, advance } = setup('1-1', { onEnd: (p) => ends.push(p.stars), onAbandon: () => { abandons++; } });
    play(store, advance, solutionLoads(level), 100);
    expect(ends).toEqual([3]);
    const other = setup('1-1', { onAbandon: () => { abandons++; } });
    other.store.getState().abandon();
    other.store.getState().abandon();
    expect(abandons).toBe(1);
  });
});
