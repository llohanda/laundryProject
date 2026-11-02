// Content test (GDD 20 M1, 21).
import { describe, expect, it } from 'vitest';
import itemsJson from '../content/items.json';
import levelsJson from '../content/levels.json';
import configJson from '../content/config.json';
import cardsJson from '../content/cards.json';
import rulebookJson from '../content/rulebook.json';
import stringsJson from '../content/strings.en.json';
import fixturesJson from '../content/fixtures.json';
import { baseId, content, ContentError, parseContent, type RawContent } from '../content';
import { FixturesFile } from './fixturesSchema';
import { evaluateLoad, type LevelDef } from '../engine';

const raw: RawContent = {
  items: itemsJson, levels: levelsJson, config: configJson,
  cards: cardsJson, rulebook: rulebookJson, strings: stringsJson,
};
const clone = <T>(v: T): T => structuredClone(v);

function counts(ids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = (out[id] ?? 0) + 1;
  return out;
}
const levelCounts = (l: LevelDef) => Object.fromEntries(l.items.map((e) => [e.id, e.count]));
const solutionIds = (l: LevelDef) => l.par.solution.flatMap((load) => [...load.items, ...load.bags.flat()]);
const itemCount = (l: LevelDef) => l.items.reduce((n, e) => n + e.count, 0);

describe('content files', () => {
  it('all runtime files load and pass zod validation', () => {
    expect(() => parseContent(raw)).not.toThrow();
  });

  it('has the 37-item catalog with unique ids', () => {
    expect(content.items).toHaveLength(37);
    expect(Object.keys(content.itemsById)).toHaveLength(37);
  });

  it('has all 12 levels in order', () => {
    expect(content.levels.map((l) => l.id)).toEqual([
      '1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3',
    ]);
  });

  it('config matches the GDD 13.1 defaults', () => {
    expect(content.config.lostThresholdU32).toBe(2 ** 31);
    expect(content.config.lintAffectsFlexDark).toBe(true);
  });
});

describe.each(content.levels.map((l) => [l.id, l] as const))('level %s', (_id, level) => {
  it("items equal the multiset of the par solution", () => {
    expect(counts(solutionIds(level))).toEqual(levelCounts(level));
  });

  it('minLoads equals the solution length', () => {
    expect(level.par.minLoads).toBe(level.par.solution.length);
  });

  it('par.seconds matches the GDD 9.3 formula and the fixture recomputation', () => {
    const fx = fixturesJson.par.find((p) => p.levelId === level.id);
    expect(fx).toBeDefined();
    expect(fx!.itemCount).toBe(itemCount(level));
    expect(fx!.multiplierTenths).toBe(level.par.multiplierTenths);
    const formula = Math.floor(
      (fx!.sumCostMs + 100 * level.par.multiplierTenths * (3 * itemCount(level) + 10) + 500) / 1000,
    );
    expect(level.par.seconds).toBe(formula);
    expect(level.par.seconds).toBe(fx!.parSeconds);
  });

  it('smallItemLoss is true exactly when the level contains small items', () => {
    const hasSmall = level.items.some((e) => content.itemsById[e.id]!.small);
    expect(level.flags.smallItemLoss).toBe(hasSmall);
  });

  it('has 2 bags in Tutorial 4 and none before (GDD 6.4)', () => {
    expect(level.bags).toBe(level.tutorial === 4 ? 2 : 0);
  });

  it('shows the fill ring from Tutorial 2 on (GDD 6.1)', () => {
    expect(level.flags.showFillRing).toBe(level.tutorial >= 2);
  });

  it('bags only hold small items in the par solution', () => {
    for (const id of level.par.solution.flatMap((load) => load.bags.flat())) {
      expect(content.itemsById[id]!.small, id).toBe(true);
    }
  });

  it('par solution has zero violations, no jam and no illegal state', () => {
    for (const load of level.par.solution) {
      const e = evaluateLoad(content.itemsById, load, content.config);
      expect({ violations: e.violations, jam: e.jam, illegal: e.illegal }).toEqual({ violations: [], jam: false, illegal: [] });
    }
  });
});

describe('cards and rulebook', () => {
  it('every tutorialCard exists in cards.json', () => {
    const ids = new Set(content.cards.map((c) => c.id));
    for (const l of content.levels) if (l.tutorialCard) expect(ids.has(l.tutorialCard), l.id).toBe(true);
  });

  it('has the six cards on their first levels (GDD 10.1)', () => {
    expect(content.cards.map((c) => [c.id, c.firstLevel])).toEqual([
      ['t1_sort', '1-1'], ['t1_bleed', '1-2'], ['t2_size', '2-1'],
      ['t3_household', '3-1'], ['t3_rags', '3-2'], ['t4_bags', '4-1'],
    ]);
  });

  it('has one rulebook page per tutorial (GDD 10.2)', () => {
    expect(content.rulebook.map((p) => [p.page, p.unlockedBy])).toEqual([
      [1, 't1_sort'], [2, 't2_size'], [3, 't3_household'], [4, 't4_bags'],
    ]);
  });
});

describe('fixtures.json', () => {
  const fixtures = FixturesFile.parse(fixturesJson);

  it('passes zod validation with the GDD 21 group sizes', () => {
    expect(fixtures.traps).toHaveLength(27);
    expect(fixtures.illegal).toHaveLength(6);
    expect(fixtures.zones).toHaveLength(10);
    expect(fixtures.jam).toHaveLength(5);
    expect(fixtures.cycleCosts).toHaveLength(8);
    expect(fixtures.stars).toHaveLength(13);
    expect(fixtures.rng.fnv1a32).toHaveLength(4);
    expect(fixtures.rng.mulberry32).toHaveLength(3);
    expect(fixtures.par).toHaveLength(12);
    expect(fixtures.hamperShuffle).toHaveLength(2);
    expect(fixtures.consequences).toHaveLength(6);
    expect(fixtures.noReuseAlternative43).toHaveLength(4);
  });

  it('only refers to items and levels that exist', () => {
    const refs = [
      ...fixtures.traps.map((f) => f.load),
      ...fixtures.illegal.map((f) => f.load),
      ...fixtures.consequences.map((f) => f.load),
      ...fixtures.noReuseAlternative43,
    ].flatMap((load) => [...load.items, ...load.bags.flat()]);
    refs.push(...fixtures.hamperShuffle.flatMap((h) => h.instanceIdsIn));
    for (const ref of refs) expect(content.itemsById[baseId(ref)], ref).toBeDefined();

    const levelIds = new Set(content.levels.map((l) => l.id));
    for (const p of [...fixtures.par, ...fixtures.hamperShuffle]) expect(levelIds.has(p.levelId), p.levelId).toBe(true);
  });
});

describe('validation rejects bad content', () => {
  function problemsOf(r: RawContent): string[] {
    try {
      parseContent(r);
    } catch (e) {
      if (e instanceof ContentError) return e.problems;
      throw e;
    }
    return [];
  }

  it('rejects an unknown swell value', () => {
    const items = clone(itemsJson);
    (items.items[0] as { swell: string }).swell = 'huge';
    expect(problemsOf({ ...raw, items })).toEqual([expect.stringContaining('items.json: items.0.swell')]);
  });

  it('rejects an unexpected field (typo guard)', () => {
    const items = clone(itemsJson);
    (items.items[0] as Record<string, unknown>).weigth = 4;
    expect(problemsOf({ ...raw, items }).join('\n')).toContain('items.json');
  });

  it('rejects a float multiplier (numbers are integers, GDD 0.2)', () => {
    const levels = clone(levelsJson);
    levels.levels[0]!.par.multiplierTenths = 1.6;
    expect(problemsOf({ ...raw, levels }).join('\n')).toContain('levels.json: levels.0.par.multiplierTenths');
  });

  it('rejects a config value that differs from the GDD', () => {
    expect(problemsOf({ ...raw, config: { ...configJson, drumWeight: 95 } }).join('\n')).toContain('drumWeight');
  });

  it('rejects a level that refers to an unknown item', () => {
    const levels = clone(levelsJson);
    levels.levels[0]!.items[0]!.id = 'tee_purple';
    expect(problemsOf({ ...raw, levels })).toContain('level 1-1: unknown item tee_purple');
  });

  it('rejects a card whose text has no string', () => {
    const strings: Record<string, string> = { ...stringsJson };
    delete strings['card.t1_sort'];
    expect(problemsOf({ ...raw, strings })).toContain('card t1_sort: missing string card.t1_sort');
  });

  it('rejects a card that its first level does not show', () => {
    const levels = clone(levelsJson);
    levels.levels[0]!.tutorialCard = null;
    expect(problemsOf({ ...raw, levels })).toContain('card t1_sort: level 1-1 has tutorialCard null');
  });
});
