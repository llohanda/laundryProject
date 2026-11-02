// Engine types (GDD 13.1). Content types are inferred from the zod schemas in schema.ts;
// the rest are runtime shapes the engine produces and are declared directly.
import type { z } from 'zod';
import type * as S from './schema';

export type Tier = z.infer<typeof S.Tier>;
export type Hygiene = z.infer<typeof S.Hygiene>;
export type Swell = z.infer<typeof S.Swell>;
export type Severity = z.infer<typeof S.Severity>;
export type RuleId = z.infer<typeof S.RuleId>;
export type FillZone = z.infer<typeof S.FillZone>;
export type IllegalCode = z.infer<typeof S.IllegalCode>;
export type RunOutcome = z.infer<typeof S.RunOutcome>;
export type Shape = z.infer<typeof S.Shape>;
export type Tint = z.infer<typeof S.Tint>;

export type ItemDef = z.infer<typeof S.ItemDef>;
export type ItemEntry = z.infer<typeof S.ItemEntry>;
export type LevelDef = z.infer<typeof S.LevelDef>;
export type Config = z.infer<typeof S.Config>;
export type CardDef = z.infer<typeof S.CardDef>;
export type RulebookPage = z.infer<typeof S.RulebookPage>;
export type Strings = z.infer<typeof S.StringsFile>;
export type ItemOutcome = z.infer<typeof S.ItemOutcome>;

/** Instance ids are `${defId}#${n}`, n starting at 1, assigned in levels.json `items` order. */
export type InstanceId = string;

/** Loose items, then each bag's contents. */
export interface LoadInput { items: InstanceId[]; bags: InstanceId[][]; }

export interface Violation { rule: RuleId; severity: Severity; instanceIds: InstanceId[]; }

export interface LoadEval {
  weight: number;
  dryBulk: number;
  wetBulkTenths: number;         // integer, wet bulk x 10
  zone: FillZone;                // GDD 6.5 integer thresholds
  jam: boolean;                  // weight > 90 || wetBulkTenths > 1000
  cycleCostMs: number;           // GDD 9.2, integer
  violations: Violation[];       // empty when the load is perfect
  illegal: IllegalCode[];        // sorted, each code at most once per load
}

export type RunEvent =
  | { t: number; type: 'place'; item: InstanceId; to: 'hamper' | 'floor' | 'drum' | 'bag:1' | 'bag:2' }
  | { t: number; type: 'bagToDrum'; bag: 1 | 2 }
  | { t: number; type: 'bagFromDrum'; bag: 1 | 2 }
  | { t: number; type: 'start'; cycleCostMs: number }
  | { t: number; type: 'skipAnimation' }
  | { t: number; type: 'rulebook'; open: boolean }
  | { t: number; type: 'card'; id: string; open: boolean }
  | { t: number; type: 'pause' | 'resume' }
  | { t: number; type: 'levelEnd'; outcome: 'finished' | 'jam' }
  | { t: number; type: 'abandon' };

export interface RunRecord {
  schema: 1; runId: string; gameVersion: string; playerId: string; levelId: string; startedAt: string;
  events: RunEvent[];
  result: { outcome: RunOutcome; stars: 0 | 1 | 2 | 3; timeMs: number; loads: number; violations: [RuleId, Severity][] };
}

export interface RunResult {
  outcome: Exclude<RunOutcome, 'abandon'>;
  stars: 0 | 1 | 2 | 3;
  completed: boolean;            // outcome === 'finished' && stars >= 1
  totalTimeMs: number;
  perLoad: LoadEval[];
}

export interface ReplayResult extends RunResult {
  consequences: Record<InstanceId, ItemOutcome>[];   // one map per load, index = loadIndex
}
