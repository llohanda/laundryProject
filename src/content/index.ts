// Loads and validates all runtime content (GDD 3.1, 20 M1). Throws on any problem:
// bad content must fail loudly at startup and in CI, never be patched over.
// fixtures.json is test-only and is not loaded here, so it stays out of the bundle.
import itemsJson from './items.json';
import levelsJson from './levels.json';
import configJson from './config.json';
import cardsJson from './cards.json';
import rulebookJson from './rulebook.json';
import stringsJson from './strings.en.json';
import type { z } from 'zod';
import * as S from '../engine/schema';
import type { CardDef, Config, ItemDef, LevelDef, RulebookPage, Strings } from '../engine/types';

export interface Content {
  items: ItemDef[];
  itemsById: Record<string, ItemDef>;
  levels: LevelDef[];
  config: Config;
  cards: CardDef[];
  rulebook: RulebookPage[];
  strings: Strings;
}

export interface RawContent {
  items: unknown; levels: unknown; config: unknown; cards: unknown; rulebook: unknown; strings: unknown;
}

export class ContentError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid content:\n- ${problems.join('\n- ')}`);
    this.name = 'ContentError';
  }
}

export function baseId(ref: string): string {
  return ref.split('#')[0]!;
}

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  return [...new Set(ids.filter((id) => seen.has(id) || !seen.add(id)))];
}

/** References between files that a per-file schema cannot see. */
export function crossCheck(c: Omit<Content, 'itemsById'>): string[] {
  const problems: string[] = [];
  const itemIds = new Set(c.items.map((i) => i.id));
  const levelById = new Map(c.levels.map((l) => [l.id, l]));
  const cardIds = new Set(c.cards.map((x) => x.id));
  const hasString = (key: string) => Object.hasOwn(c.strings, key);

  for (const id of duplicates(c.items.map((i) => i.id))) problems.push(`items: duplicate id ${id}`);
  for (const id of duplicates(c.levels.map((l) => l.id))) problems.push(`levels: duplicate id ${id}`);
  for (const id of duplicates(c.cards.map((x) => x.id))) problems.push(`cards: duplicate id ${id}`);
  for (const p of duplicates(c.rulebook.map((p) => String(p.page)))) problems.push(`rulebook: duplicate page ${p}`);

  for (const l of c.levels) {
    for (const e of l.items) {
      if (!itemIds.has(e.id)) problems.push(`level ${l.id}: unknown item ${e.id}`);
    }
    for (const [k, load] of l.par.solution.entries()) {
      for (const id of [...load.items, ...load.bags.flat()]) {
        if (!itemIds.has(id)) problems.push(`level ${l.id} par load ${k + 1}: unknown item ${id}`);
      }
    }
    if (l.tutorialCard !== null && !cardIds.has(l.tutorialCard)) {
      problems.push(`level ${l.id}: unknown tutorialCard ${l.tutorialCard}`);
    }
  }

  for (const card of c.cards) {
    const level = levelById.get(card.firstLevel);
    if (!level) problems.push(`card ${card.id}: unknown firstLevel ${card.firstLevel}`);
    else if (level.tutorialCard !== card.id) {
      problems.push(`card ${card.id}: level ${card.firstLevel} has tutorialCard ${level.tutorialCard}`);
    }
    if (!hasString(card.text)) problems.push(`card ${card.id}: missing string ${card.text}`);
  }

  for (const page of c.rulebook) {
    if (!cardIds.has(page.unlockedBy)) problems.push(`rulebook page ${page.page}: unknown card ${page.unlockedBy}`);
    for (const line of page.lines) {
      if (!cardIds.has(line.unlockedBy)) problems.push(`rulebook page ${page.page}: unknown card ${line.unlockedBy}`);
      if (line.caption !== null && !hasString(line.caption)) {
        problems.push(`rulebook page ${page.page}: missing string ${line.caption}`);
      }
    }
  }
  return problems;
}

export function parseContent(raw: RawContent): Content {
  const problems: string[] = [];
  function parse<T>(file: string, schema: z.ZodType<T>, value: unknown): T | undefined {
    const r = schema.safeParse(value);
    if (r.success) return r.data;
    for (const issue of r.error.issues) problems.push(`${file}: ${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`);
    return undefined;
  }
  const items = parse('items.json', S.ItemsFile, raw.items);
  const levels = parse('levels.json', S.LevelsFile, raw.levels);
  const config = parse('config.json', S.Config, raw.config);
  const cards = parse('cards.json', S.CardsFile, raw.cards);
  const rulebook = parse('rulebook.json', S.RulebookFile, raw.rulebook);
  const strings = parse('strings.en.json', S.StringsFile, raw.strings);
  if (!items || !levels || !config || !cards || !rulebook || !strings) throw new ContentError(problems);

  const c = { items: items.items, levels: levels.levels, config, cards: cards.cards, rulebook: rulebook.pages, strings };
  const crossProblems = crossCheck(c);
  if (crossProblems.length) throw new ContentError(crossProblems);
  return { ...c, itemsById: Object.fromEntries(c.items.map((i) => [i.id, i])) };
}

export const content: Content = parseContent({
  items: itemsJson, levels: levelsJson, config: configJson,
  cards: cardsJson, rulebook: rulebookJson, strings: stringsJson,
});

/** Look up a UI string; `{name}` placeholders are filled from `vars`. Missing keys are a bug. */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const s = content.strings[key];
  if (s === undefined) throw new Error(`missing string ${key}`);
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
