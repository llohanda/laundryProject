// Level screen (GDD 4, 6): top bar, washer, floor, hamper; drag or tap-to-assign;
// Start with the live cost; the skippable spin; then the payoff scene.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { content, t } from '../content';
import { baseId, type InstanceId } from '../engine';
import { BagSprite, ItemSprite, spriteSize } from '../art/ItemSprite';
import { BagPopover } from './Bag';
import { useItemDrag, type DropInfo } from './drag';
import { Floor, floorPosFor } from './Floor';
import { Hamper } from './Hamper';
import { bagIds, createLevelStore, type BagId, type LevelStore, type Place } from './levelStore';
import { CardModal, RulebookModal } from './Modals';
import { Payoff } from './Payoff';
import { progressStore } from './progressStore';
import { hrefFor } from './router';
import { Timer } from './Timer';
import { Washer } from './Washer';

const SPIN_MS = 1500;
const SHAKE_MS = 400;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const asBag = (id: string): BagId | null => (id === 'bag:1' ? 1 : id === 'bag:2' ? 2 : null);

/** Retry restarts with the same seed and a fresh timer: a new store per attempt (GDD 4). */
export function LevelRoute({ id }: { id: string }) {
  const [attempt, setAttempt] = useState(0);
  const level = content.levels.find((l) => l.id === id);
  if (!level) return null;
  return <LevelPlay key={`${id}:${attempt}`} levelId={id} onRetry={() => setAttempt((a) => a + 1)} />;
}

function LevelPlay({ levelId, onRetry }: { levelId: string; onRetry(): void }) {
  const progress = progressStore();
  const seenCards = useStore(progress, (p) => p.save.seenCards);
  const [store] = useState<LevelStore>(() => {
    const level = content.levels.find((l) => l.id === levelId)!;
    const p = progress.getState();
    const card = level.tutorialCard && !p.save.seenCards.includes(level.tutorialCard) ? level.tutorialCard : null;
    return createLevelStore({
      level,
      defs: content.itemsById,
      cfg: content.config,
      clock: () => performance.now(),
      card,
      onCardSeen: (cardId) => progress.getState().seeCard(cardId),
      onEnd: (payoff) => progress.getState().recordRun(levelId, payoff),
      onAbandon: () => progress.getState().recordAbandon(levelId),
    });
  });
  const s = useStore(store);
  const actions = store.getState();
  const [openBag, setOpenBag] = useState<BagId | null>(null);
  const [shaking, setShaking] = useState<string | null>(null);
  const shakeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

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

  useEffect(() => () => clearTimeout(shakeTimer.current), []);

  /** A refused move (full bag, item that is not small) shakes the target; no text (GDD 0.2 rule 7). */
  const refuse = useCallback((target: string) => {
    clearTimeout(shakeTimer.current);
    setShaking(target);
    shakeTimer.current = setTimeout(() => setShaking(null), SHAKE_MS);
  }, []);

  const onDrop = useCallback(({ id, to, local }: DropInfo) => {
    const st = store.getState();
    const bag = asBag(id);
    if (bag !== null) {
      // Dropping a bag on the drum puts it in; anywhere else returns it to its slot.
      if (to !== `bag:${bag}`) st.moveBag(bag, to === 'drum' ? 'drum' : 'slot');
      return;
    }
    const def = content.itemsById[baseId(id)]!;
    if (!st.place(id, to, to === 'floor' ? floorPosFor(local, spriteSize(def.bulk)) : undefined)) refuse(to);
  }, [store, refuse]);
  const { drag, bind, consumeDragClick } = useItemDrag(onDrop, s.phase === 'playing');

  const onTapItem = (id: InstanceId) => {
    if (!consumeDragClick()) actions.toggleSelect(id);
  };
  const onTapBag = (bag: BagId) => {
    if (consumeDragClick()) return;
    if (s.selected) {
      if (!actions.placeSelected(`bag:${bag}`)) refuse(`bag:${bag}`);
    } else {
      actions.interact();
      setOpenBag(bag);
    }
  };
  const selectedSize = s.selected ? spriteSize(content.itemsById[baseId(s.selected)]!.bulk) : 44;

  if (s.phase === 'payoff' && s.payoff) {
    return <Payoff payoff={s.payoff} levelId={levelId} onRetry={onRetry} />;
  }

  const spinning = s.phase === 'washing' ? s.loads.at(-1)! : null;
  const placeButton = (to: Place, key: string, vars: Record<string, number> = {}) => (
    <button
      key={to}
      type="button"
      className="sr-only"
      disabled={!s.selected || s.where[s.selected] === to}
      onClick={() => {
        if (!actions.placeSelected(to)) refuse(to);
      }}
    >
      {t(key, vars)}
    </button>
  );

  return (
    <main className="level" onPointerDownCapture={actions.interact}>
      <header className="top-bar">
        <button
          type="button"
          className="icon-button"
          aria-label={t('level.rulebook')}
          disabled={s.phase !== 'playing' || seenCards.length === 0}
          onClick={() => actions.setRulebook(true)}
        >
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
        shaking={shaking}
        bind={bind}
        onTap={onTapItem}
        onTapDrum={() => actions.placeSelected('drum')}
        onTapBag={onTapBag}
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
        {bagIds(s.level).filter((b) => s.bags[b] !== 'used').map((b) => placeButton(`bag:${b}`, 'level.toBag', { n: b }))}
      </div>

      {drag && (() => {
        // A 28 px drum chip lifts out at its full sprite size.
        const bag = asBag(drag.id);
        const size = bag !== null ? 56 : spriteSize(content.itemsById[baseId(drag.id)]!.bulk);
        return (
          <div className="drag-ghost" style={{ left: drag.at.x - size / 2, top: drag.at.y - size / 2 }} aria-hidden="true">
            {bag !== null
              ? <BagSprite size={size} filled={s.bagOrder[bag].length} slots={content.config.bagBulkCap / 2} />
              : <ItemSprite def={content.itemsById[baseId(drag.id)]!} size={size} />}
          </div>
        );
      })()}

      {openBag !== null && s.phase === 'playing' && (
        <BagPopover
          s={s}
          bag={openBag}
          onTakeOut={(id) => actions.place(id, 'floor')}
          onMoveBag={(bag, to) => {
            actions.moveBag(bag, to);
            setOpenBag(null);
          }}
          onClose={() => setOpenBag(null)}
        />
      )}

      {spinning && (
        <button type="button" className="wash-overlay" onClick={() => actions.finishWash(true)}>
          <span className="sr-only">{t('level.skip')}</span>
        </button>
      )}

      {s.phase === 'card' && s.card && <CardModal id={s.card} onDismiss={actions.dismissCard} />}
      {s.rulebookOpen && <RulebookModal seenCards={seenCards} onClose={() => actions.setRulebook(false)} />}
    </main>
  );
}
