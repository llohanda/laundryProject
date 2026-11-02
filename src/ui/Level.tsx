// Level screen (GDD 4, 6): top bar, washer, floor, hamper; drag or tap-to-assign;
// Start with the live cost; the skippable spin; then the result screen.
import { useCallback, useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { content, t } from '../content';
import { baseId, type InstanceId } from '../engine';
import { ItemSprite, spriteSize } from '../art/ItemSprite';
import { useItemDrag, type DropInfo } from './drag';
import { Floor, floorPosFor } from './Floor';
import { Hamper } from './Hamper';
import { createLevelStore, type LevelStore, type Place } from './levelStore';
import { Payoff } from './Payoff';
import { hrefFor } from './router';
import { Timer } from './Timer';
import { Washer } from './Washer';

const SPIN_MS = 1500;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Retry restarts with the same seed and a fresh timer: a new store per attempt (GDD 4). */
export function LevelRoute({ id }: { id: string }) {
  const [attempt, setAttempt] = useState(0);
  const level = content.levels.find((l) => l.id === id);
  if (!level) return null;
  return <LevelPlay key={`${id}:${attempt}`} levelId={id} onRetry={() => setAttempt((a) => a + 1)} />;
}

function LevelPlay({ levelId, onRetry }: { levelId: string; onRetry(): void }) {
  const [store] = useState<LevelStore>(() => createLevelStore({
    level: content.levels.find((l) => l.id === levelId)!,
    defs: content.itemsById,
    cfg: content.config,
    clock: () => performance.now(),
  }));
  const s = useStore(store);
  const actions = store.getState();

  // Backgrounding the app pauses the timer (GDD 9.1).
  useEffect(() => {
    const onVisibility = () => store.getState().setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [store]);

  // Leaving mid-level (menu button, back, any route change) abandons the run (GDD 4).
  useEffect(() => {
    const onLeave = () => store.getState().abandon();
    window.addEventListener('hashchange', onLeave);
    return () => window.removeEventListener('hashchange', onLeave);
  }, [store]);

  // The spin: 1.5 s, tap to skip, skipped entirely with reduced motion (GDD 9.1).
  useEffect(() => {
    if (s.phase !== 'washing') return;
    if (prefersReducedMotion()) {
      store.getState().finishWash(false);
      return;
    }
    const id = setTimeout(() => store.getState().finishWash(false), SPIN_MS);
    return () => clearTimeout(id);
  }, [s.phase, s.loads.length, store]);

  const onDrop = useCallback(({ id, to, local }: DropInfo) => {
    const def = content.itemsById[baseId(id)]!;
    store.getState().place(id, to, to === 'floor' ? floorPosFor(local, spriteSize(def.bulk)) : undefined);
  }, [store]);
  const { drag, bind, consumeDragClick } = useItemDrag(onDrop, s.phase === 'playing');

  const onTapItem = (id: InstanceId) => {
    if (!consumeDragClick()) actions.toggleSelect(id);
  };
  const selectedSize = s.selected ? spriteSize(content.itemsById[baseId(s.selected)]!.bulk) : 44;

  if (s.phase === 'payoff' && s.payoff) {
    return <Payoff payoff={s.payoff} levelId={levelId} onRetry={onRetry} />;
  }

  const spinning = s.phase === 'washing' ? s.loads.at(-1)! : null;
  const placeButton = (to: Place, key: string) => (
    <button
      type="button"
      className="sr-only"
      disabled={!s.selected || s.where[s.selected] === to}
      onClick={() => actions.placeSelected(to)}
    >
      {t(key)}
    </button>
  );

  return (
    <main className="level" onPointerDownCapture={actions.interact}>
      <header className="top-bar">
        {/* The rulebook modal arrives in M5. */}
        <button type="button" className="icon-button" aria-label={t('level.rulebook')} disabled>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 4 H11 V20 H4 Z M13 4 H20 V20 H13 Z" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
        <Timer read={s.timeMs} />
        <a className="icon-button" href={hrefFor({ name: 'levels' })} aria-label={t('level.menu')}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7 H20 M4 12 H20 M4 17 H20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </a>
      </header>

      <Washer
        s={s}
        spinning={spinning}
        liftedId={drag?.id ?? null}
        bind={bind}
        onTap={onTapItem}
        onTapDrum={() => actions.placeSelected('drum')}
        onStart={actions.start}
      />
      <Floor
        s={s}
        liftedId={drag?.id ?? null}
        bind={bind}
        onTap={onTapItem}
        onTapFloor={(point) => actions.placeSelected('floor', floorPosFor(point, selectedSize))}
      />
      <Hamper
        s={s}
        liftedId={drag?.id ?? null}
        bind={bind}
        onTap={onTapItem}
        onTapHamper={() => actions.placeSelected('hamper')}
      />

      <div className="sr-only-group">
        {placeButton('drum', 'level.toDrum')}
        {placeButton('floor', 'level.toFloor')}
        {placeButton('hamper', 'level.toHamper')}
      </div>

      {drag && (() => {
        // A 28 px drum chip lifts out at its full sprite size.
        const def = content.itemsById[baseId(drag.id)]!;
        const size = spriteSize(def.bulk);
        return (
          <div className="drag-ghost" style={{ left: drag.at.x - size / 2, top: drag.at.y - size / 2 }} aria-hidden="true">
            <ItemSprite def={def} size={size} />
          </div>
        );
      })()}

      {spinning && (
        <button type="button" className="wash-overlay" onClick={() => actions.finishWash(true)}>
          <span className="sr-only">{t('level.skip')}</span>
        </button>
      )}
    </main>
  );
}
