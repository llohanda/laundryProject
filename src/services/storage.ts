// Progress save (GDD 14): one JSON document in localStorage under `freshlaundry.save.v1`.
// Storage can fail (private mode, quota, disabled): the game then keeps an in-memory copy
// and carries on. A save that does not validate is replaced by a fresh one, keeping
// playerId and consent when they are still readable.
import { z } from 'zod';

export const SAVE_KEY = 'freshlaundry.save.v1';

const Stars = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const LevelProgress = z.strictObject({
  bestStars: Stars,
  bestTimeMs: z.number().int().nonnegative().nullable(),   // best time of a completed run
  attempts: z.number().int().nonnegative(),
  completed: z.boolean(),
});

export const Consent = z.enum(['unset', 'yes', 'no']);

export const SaveData = z.strictObject({
  schema: z.literal(1),
  playerId: z.string().min(1),
  consent: Consent,
  seenCards: z.array(z.string()),
  levels: z.record(z.string(), LevelProgress),
  settings: z.strictObject({ reducedMotion: z.boolean().nullable() }),
});

export type LevelProgress = z.infer<typeof LevelProgress>;
export type Consent = z.infer<typeof Consent>;
export type SaveData = z.infer<typeof SaveData>;

/** The part of the Web Storage API the save uses; tests pass a fake. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function freshSave(playerId: string, consent: Consent = 'unset'): SaveData {
  return { schema: 1, playerId, consent, seenCards: [], levels: {}, settings: { reducedMotion: null } };
}

export function loadSave(storage: KeyValueStorage | null, newId: () => string): SaveData {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(SAVE_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw === null) return freshSave(newId());
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return freshSave(newId());
  }
  const parsed = SaveData.safeParse(json);
  if (parsed.success) return parsed.data;
  // Keep the identity and the consent choice from a damaged save when they are intact.
  const partial = z.object({ playerId: z.string().min(1), consent: Consent }).safeParse(json);
  return partial.success ? freshSave(partial.data.playerId, partial.data.consent) : freshSave(newId());
}

/** Returns false when the write failed; the caller keeps its in-memory copy. */
export function writeSave(storage: KeyValueStorage | null, save: SaveData): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

/** window.localStorage, or null where touching it throws (some private modes). */
export function browserStorage(): KeyValueStorage | null {
  try {
    const s = window.localStorage;
    const probe = `${SAVE_KEY}.probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function newPlayerId(): string {
  return crypto.randomUUID();
}
