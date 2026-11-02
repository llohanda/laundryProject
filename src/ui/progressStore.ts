// Player progress (GDD 8, 14): best stars and times, seen cards, derived unlocks.
// The pure functions do the bookkeeping; the store persists every change and keeps
// working from memory when storage fails.
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { LevelDef, RunResult } from '../engine';
import {
  browserStorage, freshSave, loadSave, newPlayerId, writeSave,
  type KeyValueStorage, type LevelProgress, type SaveData,
} from '../services/storage';

const NO_PROGRESS: LevelProgress = { bestStars: 0, bestTimeMs: null, attempts: 0, completed: false };

export function levelProgress(save: SaveData, id: string): LevelProgress {
  return save.levels[id] ?? NO_PROGRESS;
}

/** 1-1 always; each next level once the one before it is completed (GDD 8, 14). */
export function unlockedLevels(levels: LevelDef[], save: SaveData): Set<string> {
  const open = new Set<string>();
  for (const [i, l] of levels.entries()) {
    const prev = levels[i - 1];
    if (i === 0 || (prev && levelProgress(save, prev.id).completed)) open.add(l.id);
  }
  return open;
}

/** Record a finished or jammed run. Best stars and best time only ever improve. */
export function applyRun(save: SaveData, levelId: string, run: Pick<RunResult, 'stars' | 'completed' | 'totalTimeMs'>): SaveData {
  const p = levelProgress(save, levelId);
  const next: LevelProgress = {
    bestStars: run.stars > p.bestStars ? run.stars : p.bestStars,
    bestTimeMs: run.completed && (p.bestTimeMs === null || run.totalTimeMs < p.bestTimeMs) ? run.totalTimeMs : p.bestTimeMs,
    attempts: p.attempts + 1,
    completed: p.completed || run.completed,
  };
  return { ...save, levels: { ...save.levels, [levelId]: next } };
}

export function applyAbandon(save: SaveData, levelId: string): SaveData {
  const p = levelProgress(save, levelId);
  return { ...save, levels: { ...save.levels, [levelId]: { ...p, attempts: p.attempts + 1 } } };
}

export function applyCardSeen(save: SaveData, cardId: string): SaveData {
  return save.seenCards.includes(cardId) ? save : { ...save, seenCards: [...save.seenCards, cardId] };
}

/** Reset clears levels and seen cards, not the player id or consent (GDD 14). */
export function applyReset(save: SaveData): SaveData {
  return { ...freshSave(save.playerId, save.consent), settings: save.settings };
}

export interface ProgressState {
  save: SaveData;
  /** False once a write has failed; progress then lives only in memory for this session. */
  persisted: boolean;
  recordRun(levelId: string, run: Pick<RunResult, 'stars' | 'completed' | 'totalTimeMs'>): void;
  recordAbandon(levelId: string): void;
  seeCard(cardId: string): void;
  reset(): void;
}

export type ProgressStore = StoreApi<ProgressState>;

export function createProgressStore(storage: KeyValueStorage | null, newId: () => string = newPlayerId): ProgressStore {
  const initial = loadSave(storage, newId);
  return createStore<ProgressState>()((set, get) => {
    const commit = (save: SaveData) => set({ save, persisted: writeSave(storage, save) && get().persisted });
    return {
      save: initial,
      persisted: writeSave(storage, initial),
      recordRun: (levelId, run) => commit(applyRun(get().save, levelId, run)),
      recordAbandon: (levelId) => commit(applyAbandon(get().save, levelId)),
      seeCard: (cardId) => commit(applyCardSeen(get().save, cardId)),
      reset: () => commit(applyReset(get().save)),
    };
  });
}

let appStore: ProgressStore | null = null;

/** The app's single progress store, backed by localStorage. */
export function progressStore(): ProgressStore {
  appStore ??= createProgressStore(browserStorage());
  return appStore;
}
