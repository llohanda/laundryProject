// Progress and persistence (GDD 8, 14): derived unlocks, best results, reset, storage failure.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { content } from '../content';
import { freshSave, loadSave, SAVE_KEY, type KeyValueStorage, type SaveData } from '../services/storage';
import {
  applyCardSeen, applyReset, applyRun, createProgressStore, levelProgress, unlockedLevels,
} from '../ui/progressStore';
import { rulebookPages } from '../ui/Modals';
import stringsJson from '../content/strings.en.json';

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

class BrokenStorage implements KeyValueStorage {
  getItem(): string | null { throw new Error('SecurityError'); }
  setItem(): void { throw new Error('QuotaExceededError'); }
}

const ids = () => { let n = 0; return () => `player-${++n}`; };
const win = (stars: 0 | 1 | 2 | 3, totalTimeMs: number) => ({ stars, totalTimeMs, completed: stars >= 1 });

describe('unlocks', () => {
  it('1-1 is open from the start and nothing else', () => {
    expect([...unlockedLevels(content.levels, freshSave('p'))]).toEqual(['1-1']);
  });

  it('a completed level opens the next one; 0 stars opens nothing', () => {
    let save = applyRun(freshSave('p'), '1-1', win(0, 50_000));
    expect([...unlockedLevels(content.levels, save)]).toEqual(['1-1']);
    save = applyRun(save, '1-1', win(1, 90_000));
    save = applyRun(save, '1-2', win(3, 40_000));
    expect([...unlockedLevels(content.levels, save)]).toEqual(['1-1', '1-2', '1-3']);
  });

  it('crosses tutorial blocks in levels.json order', () => {
    let save = freshSave('p');
    for (const l of content.levels.slice(0, 3)) save = applyRun(save, l.id, win(2, 1));
    expect(unlockedLevels(content.levels, save).has('2-1')).toBe(true);
  });
});

describe('best results', () => {
  it('keeps the best stars and the best completed time, and counts every attempt', () => {
    let save = freshSave('p');
    save = applyRun(save, '1-1', win(2, 70_000));
    save = applyRun(save, '1-1', win(3, 55_000));
    save = applyRun(save, '1-1', win(1, 40_000));   // faster but sloppier: still the best time
    save = applyRun(save, '1-1', win(0, 10_000));   // a failed run never sets a time
    expect(levelProgress(save, '1-1')).toEqual({ bestStars: 3, bestTimeMs: 40_000, attempts: 4, completed: true });
  });

  it('a jam or fatal run alone leaves the level not completed', () => {
    const save = applyRun(freshSave('p'), '2-3', { stars: 0, totalTimeMs: 9000, completed: false });
    expect(levelProgress(save, '2-3')).toEqual({ bestStars: 0, bestTimeMs: null, attempts: 1, completed: false });
  });

  it('reset clears levels and seen cards but keeps the player id and consent', () => {
    let save: SaveData = { ...freshSave('keep-me'), consent: 'yes' };
    save = applyCardSeen(applyRun(save, '1-1', win(3, 1)), 't1_sort');
    const reset = applyReset(save);
    expect(reset).toEqual({ ...freshSave('keep-me'), consent: 'yes' });
  });

  it('a card is recorded once', () => {
    const save = applyCardSeen(applyCardSeen(freshSave('p'), 't1_sort'), 't1_sort');
    expect(save.seenCards).toEqual(['t1_sort']);
  });
});

describe('storage', () => {
  it('saves under freshlaundry.save.v1 and loads the same progress back', () => {
    const storage = new MemoryStorage();
    const a = createProgressStore(storage, ids());
    a.getState().recordRun('1-1', win(2, 51_200));
    a.getState().seeCard('t1_sort');
    expect(JSON.parse(storage.getItem(SAVE_KEY)!)).toMatchObject({
      schema: 1, playerId: 'player-1', consent: 'unset', seenCards: ['t1_sort'],
      levels: { '1-1': { bestStars: 2, bestTimeMs: 51_200, attempts: 1, completed: true } },
      settings: { reducedMotion: null },
    });
    const b = createProgressStore(storage, ids());
    expect(b.getState().save).toEqual(a.getState().save);
  });

  it('generates the player id once, on first launch', () => {
    const storage = new MemoryStorage();
    const first = createProgressStore(storage, () => 'first').getState().save.playerId;
    const second = createProgressStore(storage, () => 'second').getState().save.playerId;
    expect([first, second]).toEqual(['first', 'first']);
  });

  it('keeps working in memory when storage throws (private mode)', () => {
    const store = createProgressStore(new BrokenStorage(), ids());
    expect(store.getState().persisted).toBe(false);
    store.getState().recordRun('1-1', win(3, 1));
    expect(unlockedLevels(content.levels, store.getState().save).has('1-2')).toBe(true);
  });

  it('works with no storage at all', () => {
    const store = createProgressStore(null, ids());
    store.getState().seeCard('t1_sort');
    expect(store.getState().save.seenCards).toEqual(['t1_sort']);
  });

  it('a damaged save starts over but keeps a readable player id and consent', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ schema: 1, playerId: 'old', consent: 'no', levels: 'garbage' }));
    expect(loadSave(storage, () => 'new')).toEqual(freshSave('old', 'no'));
    storage.setItem(SAVE_KEY, '{not json');
    expect(loadSave(storage, () => 'new')).toEqual(freshSave('new'));
  });
});

describe('rulebook', () => {
  it('shows only pages and lines whose card has been seen', () => {
    expect(rulebookPages([])).toEqual([]);
    const p1 = rulebookPages(['t1_sort']);
    expect(p1.map((p) => p.page)).toEqual([1]);
    expect(p1[0]!.lines).toHaveLength(1);
    const later = rulebookPages(['t1_sort', 't1_bleed', 't2_size', 't3_household']);
    expect(later.map((p) => [p.page, p.lines.length])).toEqual([[1, 2], [2, 1], [3, 1]]);
  });
});

describe('strings', () => {
  it('every t() key used by the UI exists in strings.en.json', () => {
    const files = ['ui', 'art'].flatMap((dir) =>
      readdirSync(join(__dirname, '..', dir)).filter((f) => /\.tsx?$/.test(f)).map((f) => join(__dirname, '..', dir, f)));
    const keys = new Set<string>();
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([\w.]+)'/g)) keys.add(m[1]!);
      // Keys chosen at run time are written as t(cond ? 'a' : 'b') or passed as string literals.
      for (const m of readFileSync(f, 'utf8').matchAll(/'((?:level|payoff|settings|levelSelect|card|nav)\.[\w.]+)'/g)) keys.add(m[1]!);
    }
    expect(keys.size).toBeGreaterThan(20);
    const missing = [...keys].filter((k) => !Object.hasOwn(stringsJson, k));
    expect(missing).toEqual([]);
  });
});
