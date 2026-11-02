// zod schemas for every content file (GDD 3.1, 13.1). Types are inferred from these,
// so the validators and the TypeScript types cannot drift. Pure: no DOM, no I/O.
import { z } from 'zod';

const int = () => z.number().int();
const nonNegInt = () => int().min(0);
const posInt = () => int().min(1);

export const Tier = z.enum(['light', 'dark']);
export const Hygiene = z.enum(['clean', 'flex', 'dirty']);
export const Swell = z.enum(['low', 'medium', 'high']);
export const Severity = z.enum(['minor', 'major', 'fatal']);
// JAM is not a violation; it is reported as `jam: boolean` (GDD 13.1).
export const RuleId = z.enum([
  'COLOR_BLEED', 'COLOR_DYE', 'COLOR_LINT',
  'HYG_DIRTY_WITH_LIGHT', 'HYG_DIRTY_WITH_DARK',
  'SMALL_LOOSE',
]);
export const FillZone = z.enum(['light', 'good', 'tight', 'overfull']);
export const IllegalCode = z.enum(['BAG_COUNT', 'BAG_NOT_SMALL', 'BAG_CAPACITY', 'EMPTY_LOAD', 'DUPLICATE_ITEM']);
export const RunOutcome = z.enum(['finished', 'jam', 'abandon']);
export const Shape = z.enum(['normal', 'stretched', 'lost']);
// Precedence ascending (GDD 13.6).
export const Tint = z.enum(['none', 'lint', 'stained', 'smudged', 'greyBlue', 'pink']);

const DefId = z.string().regex(/^[a-z][a-z0-9_]*$/, 'item id must be snake_case');
/** Def id, or instance id `${defId}#${n}` with n >= 1. */
const ItemRef = z.string().regex(/^[a-z][a-z0-9_]*(#[1-9][0-9]*)?$/, 'expected defId or defId#n');
const LevelId = z.string().regex(/^[1-9]-[1-9]$/, 'level id must look like 1-1');
const CardId = z.string().regex(/^t[0-9]+_[a-z_]+$/, 'card id must look like t1_sort');
const StringKey = z.string().min(1);

// ---------------------------------------------------------------- items.json
export const ItemDef = z.strictObject({
  id: DefId,
  name: z.string().min(1),
  weight: posInt(),
  bulk: posInt(),
  swell: Swell,
  tier: Tier,
  bleeds: z.boolean(),
  hygiene: Hygiene,
  small: z.boolean(),
  shedder: z.boolean(),
});
export const ItemsFile = z.strictObject({ schema: z.literal(1), items: z.array(ItemDef).min(1) });

// ---------------------------------------------------------------- levels.json
export const ItemEntry = z.strictObject({ id: DefId, count: posInt() });
export const LoadInput = z.strictObject({ items: z.array(ItemRef), bags: z.array(z.array(ItemRef)) });

export const LevelDef = z.strictObject({
  id: LevelId,
  tutorial: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  seed: nonNegInt(),
  bags: int().min(0).max(2),
  // TODO(GDD-OPEN): bag reuse (GDD 22.2). Default true; false is supported and verified.
  bagsReusable: z.boolean(),
  flags: z.strictObject({ showFillRing: z.boolean(), smallItemLoss: z.boolean() }),
  tutorialCard: CardId.nullable(),
  items: z.array(ItemEntry).min(1),
  par: z.strictObject({
    seconds: posInt(),
    multiplierTenths: posInt(),
    minLoads: posInt(),
    // Def ids, repeated per count.
    solution: z.array(z.strictObject({ items: z.array(DefId), bags: z.array(z.array(DefId)) })).min(1),
  }),
});
export const LevelsFile = z.strictObject({ schema: z.literal(1), levels: z.array(LevelDef).min(1) });

// ---------------------------------------------------------------- config.json
export const Config = z.strictObject({
  drumWeight: z.literal(90),
  drumBulk: z.literal(100),
  drumWetBulkTenths: z.literal(1000),
  bagWeight: z.literal(2),
  bagBulk: z.literal(2),
  bagBulkCap: z.literal(12),
  maxBagsPerLoad: z.literal(2),
  swellTenths: z.strictObject({ low: z.literal(10), medium: z.literal(12), high: z.literal(20) }),
  cycleBaseMs: z.literal(6000),
  cycleDivisor: z.literal(15),
  lostThresholdU32: int().min(0).max(2 ** 32),
  // TODO(GDD-OPEN): lint scope (GDD 22.1). Default true; false keeps every par solution valid.
  lintAffectsFlexDark: z.boolean(),
});

// ---------------------------------------------------------------- cards.json, rulebook.json, strings
export const CardDef = z.strictObject({
  id: CardId,
  firstLevel: LevelId,
  illustration: z.string().min(1),   // art key, drawn in M7
  text: StringKey,
});
export const CardsFile = z.strictObject({ schema: z.literal(1), cards: z.array(CardDef).min(1) });

export const RulebookLine = z.strictObject({
  unlockedBy: CardId,
  icons: z.array(z.string().min(1)).min(1),
  caption: StringKey.nullable(),
});
export const RulebookPage = z.strictObject({
  page: posInt(),
  unlockedBy: CardId,
  lines: z.array(RulebookLine).min(1),
});
export const RulebookFile = z.strictObject({ schema: z.literal(1), pages: z.array(RulebookPage).min(1) });

export const StringsFile = z.record(z.string(), z.string().min(1));

// ---------------------------------------------------------------- shared with fixtures.json
export const ViolationPair = z.tuple([RuleId, Severity]);
export const ItemOutcome = z.strictObject({ shape: Shape, tint: Tint, ruined: z.boolean(), ballooned: z.boolean() });
export { DefId, ItemRef, LevelId, int, nonNegInt, posInt };
