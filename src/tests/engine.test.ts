// Engine behaviour beyond the fixture groups (GDD 13, 20 M2, 21).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import {
  consequencesFor, evaluateLoad, expandLevel, replay, ReplayError, scoreRun, solutionLoads,
  type LevelDef, type RunEvent, type RunRecord,
} from '../engine';

const { itemsById: defs, config: cfg, levels } = content;
const levelById = (id: string) => levels.find((l) => l.id === id)!;

describe.each(levels.map((l) => [l.id, l] as const))('par solution %s', (_id, level) => {
  const loads = solutionLoads(level);

  it('uses each level instance exactly once', () => {
    expect(loads.flatMap((l) => [...l.items, ...l.bags.flat()]).sort()).toEqual(expandLevel(level).sort());
  });

  it('scores 3 stars at exactly par, 2 stars one millisecond over', () => {
    const atPar = scoreRun(defs, level, loads, level.par.seconds * 1000, cfg);
    expect(atPar).toMatchObject({ outcome: 'finished', stars: 3, completed: true });
    expect(atPar.perLoad.every((e) => !e.jam && e.violations.length === 0 && e.illegal.length === 0)).toBe(true);
    expect(scoreRun(defs, level, loads, level.par.seconds * 1000 + 1, cfg).stars).toBe(2);
  });

  it('stays valid with lintAffectsFlexDark = false', () => {
    const off = { ...cfg, lintAffectsFlexDark: false };
    for (const load of loads) expect(evaluateLoad(defs, load, off).violations).toEqual([]);
  });
});

describe('scoreRun', () => {
  const level = levelById('2-3');

  it('a jam ends the run at that load with 0 stars, regardless of earlier loads', () => {
    const [lights] = solutionLoads(level);
    const jammer = { items: ['puffer_navy#1', 'hoodie_navy#1', 'hoodie_navy#2', 'trousers_black#1'], bags: [] };
    const r = scoreRun(defs, level, [lights!, jammer, { items: ['tee_red#1'], bags: [] }], 1000, cfg);
    expect(r).toMatchObject({ outcome: 'jam', stars: 0, completed: false });
    expect(r.perLoad).toHaveLength(2);
  });

  it('a fatal mistake still finishes, with 0 stars and not completed', () => {
    const r = scoreRun(defs, levelById('1-2'), [
      { items: ['tee_red#1', 'tee_white#1', 'shirt_white#1', 'tee_mint#1', 'shirt_pastel_blue#1'], bags: [] },
      { items: ['tee_black#1', 'shirt_navy#1', 'trousers_black#1'], bags: [] },
    ], 1000, cfg);
    expect(r).toMatchObject({ outcome: 'finished', stars: 0, completed: false });
  });

  it('SMALL_LOOSE is inactive when the level flag smallItemLoss is false', () => {
    const fake: LevelDef = { ...levelById('1-1'), flags: { showFillRing: false, smallItemLoss: false } };
    const r = scoreRun(defs, fake, [{ items: ['sock_white#1', 'tee_white#1'], bags: [] }], 1000, cfg);
    expect(r.perLoad[0]!.violations).toEqual([]);
  });
});

describe('violation detail', () => {
  it('COLOR_* is reported once per load and names every light item', () => {
    const e = evaluateLoad(defs, { items: ['tee_red#1', 'tee_white#1', 'shirt_white#1'], bags: [] }, cfg);
    expect(e.violations).toEqual([
      { rule: 'COLOR_BLEED', severity: 'fatal', instanceIds: ['tee_white#1', 'shirt_white#1'] },
    ]);
  });

  it('HYG_* and COLOR_LINT are reported once per affected item, in GDD 7 order', () => {
    const e = evaluateLoad(defs, { items: ['rag_white#1', 'tee_black#1', 'jeans_blue#1'], bags: [] }, cfg);
    expect(e.violations).toEqual([
      { rule: 'HYG_DIRTY_WITH_DARK', severity: 'major', instanceIds: ['tee_black#1'] },
      { rule: 'COLOR_LINT', severity: 'minor', instanceIds: ['tee_black#1'] },
      { rule: 'COLOR_LINT', severity: 'minor', instanceIds: ['jeans_blue#1'] },
    ]);
  });

  it('bag contents follow color rules; a bag counts W2 B2 and 20 wet-tenths', () => {
    const e = evaluateLoad(defs, { items: ['tee_white#1'], bags: [['sock_white#1', 'sock_black#1']] }, cfg);
    expect(e).toMatchObject({ weight: 10, dryBulk: 11, wetBulkTenths: 110 });
    expect(e.violations.map((v) => v.rule)).toEqual(['COLOR_DYE']);
  });

  it('a drum with only an empty bag is EMPTY_LOAD', () => {
    expect(evaluateLoad(defs, { items: [], bags: [[]] }, cfg).illegal).toEqual(['EMPTY_LOAD']);
  });
});

describe('determinism', () => {
  const load = { items: ['tee_white#1', 'sock_white#1', 'undies_white#1', 'sock_black#1'], bags: [] };

  it('the same inputs always give the same outcomes', () => {
    const a = consequencesFor(defs, load, 14010, 0, cfg);
    for (let i = 0; i < 5; i++) expect(consequencesFor(defs, load, 14010, 0, cfg)).toEqual(a);
  });

  it('different seeds change only lost vs stretched, never violations or tints', () => {
    const base = consequencesFor(defs, load, 0, 0, cfg);
    const shapes = new Set<string>();
    for (let seed = 0; seed < 64; seed++) {
      const o = consequencesFor(defs, load, seed, seed % 4, cfg);
      for (const [id, out] of Object.entries(o)) {
        expect({ ...out, shape: undefined }).toEqual({ ...base[id], shape: undefined });
        if (id.startsWith('tee_')) expect(out.shape).toBe('normal');
        else shapes.add(out.shape);
      }
    }
    expect([...shapes].sort()).toEqual(['lost', 'stretched']);
  });
});

describe('replay', () => {
  // The GDD 15 example: a perfect, fast run of 4-1 with the bag reused.
  const example: RunRecord = {
    schema: 1, runId: 'r', gameVersion: '0.1.0', playerId: 'p', levelId: '4-1', startedAt: '2026-11-02T04:12:30Z',
    events: [
      { t: 900, type: 'place', item: 'tee_white#1', to: 'drum' },
      { t: 1500, type: 'place', item: 'hoodie_white#1', to: 'drum' },
      { t: 2300, type: 'place', item: 'sock_white#1', to: 'bag:1' },
      { t: 2900, type: 'place', item: 'undies_white#1', to: 'bag:1' },
      { t: 3400, type: 'bagToDrum', bag: 1 },
      { t: 4100, type: 'start', cycleCostMs: 7800 },
      { t: 12800, type: 'place', item: 'jeans_blue#1', to: 'drum' },
      { t: 13400, type: 'place', item: 'shirt_black#1', to: 'drum' },
      { t: 14000, type: 'place', item: 'tee_black#1', to: 'drum' },
      { t: 14900, type: 'place', item: 'sock_black#1', to: 'bag:1' },
      { t: 15500, type: 'place', item: 'undies_black#1', to: 'bag:1' },
      { t: 16000, type: 'bagToDrum', bag: 1 },
      { t: 16500, type: 'start', cycleCostMs: 8067 },
      { t: 24567, type: 'levelEnd', outcome: 'finished' },
    ],
    result: { outcome: 'finished', stars: 3, timeMs: 24567, loads: 2, violations: [] },
  };
  const level = levelById('4-1');
  const withEvents = (events: RunEvent[]): RunRecord => ({ ...example, events });

  it('reproduces the GDD 15 example: 3 stars, 24567 ms, finished', () => {
    const r = replay(defs, level, example, cfg);
    expect(r).toMatchObject({ outcome: 'finished', stars: 3, completed: true, totalTimeMs: 24567 });
    expect(r.perLoad).toHaveLength(example.result.loads);
    expect(r.consequences).toHaveLength(2);
    expect(Object.values(r.consequences[0]!).every((o) => o.shape === 'normal' && o.tint === 'none')).toBe(true);
  });

  it('is deterministic across repeated replays', () => {
    expect(replay(defs, level, example, cfg)).toEqual(replay(defs, level, example, cfg));
  });

  it('a loose sock gives 1 star and a seeded shape', () => {
    const events = example.events.filter((e) => !(e.type === 'place' && e.item === 'sock_white#1'));
    events.splice(3, 0, { t: 3000, type: 'place', item: 'sock_white#1', to: 'drum' });   // before bagToDrum at 3400
    const r = replay(defs, level, withEvents(events), cfg);
    expect(r.stars).toBe(1);
    expect(r.consequences[0]!['sock_white#1']!.shape).toMatch(/^(lost|stretched)$/);
  });

  it('rejects a recorded cycle cost the engine does not reproduce', () => {
    const events = example.events.map((e) => (e.type === 'start' && e.t === 4100 ? { ...e, cycleCostMs: 7801 } : e));
    expect(() => replay(defs, level, withEvents(events), cfg)).toThrow(ReplayError);
  });

  it('rejects events that land inside a cycle cost (time must jump at start)', () => {
    const events = example.events.map((e) => (e.t === 12800 ? { ...e, t: 11899 } : e));
    expect(() => replay(defs, level, withEvents(events), cfg)).toThrow(/backwards/);
  });

  it('rejects moving an item that was already washed', () => {
    const events = [...example.events];
    events.splice(6, 0, { t: 12000, type: 'place', item: 'tee_white#1', to: 'floor' });
    expect(() => replay(defs, level, withEvents(events), cfg)).toThrow(/already washed/);
  });

  it('rejects reusing a bag when the level does not allow it', () => {
    const noReuse: LevelDef = { ...level, bagsReusable: false };
    expect(() => replay(defs, noReuse, example, cfg)).toThrow(/already used/);
  });

  it('rejects finishing with unwashed items', () => {
    const events = example.events.filter((e) => !(e.type === 'place' && e.item === 'tee_black#1'));
    const cost = evaluateLoad(defs, {
      items: ['jeans_blue#1', 'shirt_black#1'], bags: [['sock_black#1', 'undies_black#1']],
    }, cfg).cycleCostMs;
    const fixed = events.map((e) => (e.type === 'start' && e.t === 16500 ? { ...e, cycleCostMs: cost } : e))
      .map((e) => (e.type === 'levelEnd' ? { ...e, t: 16500 + cost } : e));
    expect(() => replay(defs, level, withEvents(fixed), cfg)).toThrow(/unwashed/);
  });

  it('replays a jam: outcome jam, 0 stars, everything ballooned', () => {
    const l = levelById('2-3');
    const ids = ['puffer_navy#1', 'hoodie_navy#1', 'hoodie_navy#2', 'trousers_black#1'];
    const e = evaluateLoad(defs, { items: ids, bags: [] }, cfg);
    const events: RunEvent[] = [
      ...ids.map((item, k): RunEvent => ({ t: 100 * (k + 1), type: 'place', item, to: 'drum' })),
      { t: 1000, type: 'start', cycleCostMs: e.cycleCostMs },
      { t: 1000 + e.cycleCostMs, type: 'levelEnd', outcome: 'jam' },
    ];
    const r = replay(defs, l, { ...example, levelId: '2-3', events }, cfg);
    expect(r).toMatchObject({ outcome: 'jam', stars: 0, completed: false });
    expect(Object.values(r.consequences[0]!).every((o) => o.ballooned)).toBe(true);
  });
});

describe('engine purity (GDD 0.2.2, 20 M2)', () => {
  const dir = join(__dirname, '../engine');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
  const source = (f: string) =>
    readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it.each(files)('%s has no Math.random, clocks, DOM, React or timers', (f) => {
    expect(source(f)).not.toMatch(/Math\.random|Date\.|performance\.|\bwindow\b|\bdocument\b|setTimeout|setInterval|from 'react'/);
  });

  it.each(files)('%s has no decimal literals or float parsing', (f) => {
    expect(source(f)).not.toMatch(/\b\d+\.\d+\b|parseFloat|toFixed/);
  });
});
