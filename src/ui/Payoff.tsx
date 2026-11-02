// Payoff scene (GDD 11). Every load is revealed at once on a clothesline (about 4 s,
// skippable, not interactive), then the stars, time and par. A jam replaces the whole
// scene: the jammed load's items balloon to their wet bulk and wedge the shuddering drum.
import { useEffect, useState } from 'react';
import { content, t } from '../content';
import { baseId, type InstanceId, type ItemOutcome, type LoadEval } from '../engine';
import { ItemSprite, kindOf, spriteSize } from '../art/ItemSprite';
import { ui } from '../art/palette';
import { hrefFor } from './router';
import type { Payoff as PayoffData } from './levelStore';
import { formatTime } from './Timer';

export const CLOTHESLINE_MS = 4000;
export const JAM_MS = 2200;
const LINE_WIDTH = 344;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Star({ filled, i }: { filled: boolean; i: number }) {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" aria-hidden="true" className="star" style={{ animationDelay: `${i * 150}ms` }}>
      <path
        d="M12 2.5 L14.9 8.6 L21.5 9.3 L16.5 13.8 L17.9 20.4 L12 17 L6.1 20.4 L7.5 13.8 L2.5 9.3 L9.1 8.6 Z"
        fill={filled ? '#FFD45C' : 'none'}
        stroke={ui.outline}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Peg() {
  return (
    <svg className="peg" width="8" height="14" viewBox="0 0 8 14" aria-hidden="true">
      <rect x="1" y="0" width="6" height="14" rx="2" fill="#F2C14E" stroke={ui.outline} strokeWidth="1" />
    </svg>
  );
}

/** One load on the line; items drop in one after another. */
function Line({ items, startIndex, stepMs }: { items: [InstanceId, ItemOutcome][]; startIndex: number; stepMs: number }) {
  const size = Math.min(44, Math.floor(LINE_WIDTH / Math.max(1, items.length)) - 4);
  return (
    <div className="line">
      <div className="rope" aria-hidden="true" />
      {items.map(([id, outcome], k) => {
        const def = content.itemsById[baseId(id)]!;
        const lost = outcome.shape === 'lost';
        const lostUndies = lost && kindOf(def.id) === 'undies';
        return (
          <span key={id} className="hanging" style={{ width: size + 4, animationDelay: `${(startIndex + k) * stepMs}ms` }}
            aria-label={def.name} role="img">
            <span className="pegs" aria-hidden="true">
              <Peg />
              {/* A lost item leaves an empty peg beside what is left of it. */}
              {lost && !lostUndies && <Peg />}
            </span>
            <ItemSprite def={def} size={size} outcome={outcome} />
          </span>
        );
      })}
    </div>
  );
}

/** Wet-bulk growth of an item: area scales with swell, so size with its square root. */
function balloonScale(swell: 'low' | 'medium' | 'high'): number {
  return Math.sqrt(content.config.swellTenths[swell] / 10);
}

function JamScene({ items, load }: { items: [InstanceId, ItemOutcome][]; load: LoadEval }) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const wet = load.wetBulkTenths / content.config.drumWetBulkTenths;   // display only
  const r = 104;
  const c = 2 * Math.PI * r;
  return (
    <div className="jam-scene">
      <div className="jam-drum">
        <svg className="jam-ring" width="240" height="240" aria-hidden="true">
          <circle cx="120" cy="120" r={r} fill="none" stroke={ui.ringOver} strokeWidth="10" />
          <circle cx="120" cy="120" r={r - 11} fill="none" stroke={ui.ringOver} strokeOpacity="0.55" strokeWidth="7"
            strokeDasharray={`${Math.max(0, Math.min(1, wet - 1)) * c} ${c}`} transform="rotate(-90 120 120)" />
        </svg>
        <div className="jam-items">
          {items.map(([id, outcome], k) => {
            const def = content.itemsById[baseId(id)]!;
            const size = Math.round(spriteSize(def.bulk) * balloonScale(def.swell));
            // A sunflower spiral packs the items into the drum, overlapping like a wedged load.
            const rad = 62 * Math.sqrt((k + 0.5) / items.length);
            const x = 120 + rad * Math.cos(k * golden) - size / 2;
            const y = 120 + rad * Math.sin(k * golden) - size / 2;
            return (
              <span key={id} className="jam-item" style={{ left: x, top: y }} role="img" aria-label={def.name}>
                <ItemSprite def={def} size={size} outcome={outcome} />
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Payoff({ payoff, levelId, onRetry }: { payoff: PayoffData; levelId: string; onRetry(): void }) {
  const level = content.levels.find((l) => l.id === levelId)!;
  const next = content.levels[content.levels.indexOf(level) + 1];
  const jam = payoff.outcome === 'jam';
  const [done, setDone] = useState(prefersReducedMotion);

  useEffect(() => {
    if (done) return;
    const id = setTimeout(() => setDone(true), jam ? JAM_MS : CLOTHESLINE_MS);
    return () => clearTimeout(id);
  }, [done, jam]);

  const lines = payoff.consequences.map((m) => Object.entries(m));
  const total = lines.reduce((n, l) => n + l.length, 0);
  const stepMs = Math.floor((CLOTHESLINE_MS - 800) / Math.max(1, total));
  const starts = lines.map((_, i) => lines.slice(0, i).reduce((n, l) => n + l.length, 0));

  return (
    <main className={`payoff${done ? ' done' : ''}${done && payoff.stars === 3 ? ' sunny' : ''}`}>
      <div className="scene" onClick={() => setDone(true)}>
        {jam
          ? <JamScene items={lines.at(-1)!} load={payoff.perLoad.at(-1)!} />
          : <div className="clothesline">
              {lines.map((items, i) => <Line key={i} items={items} startIndex={starts[i]!} stepMs={stepMs} />)}
            </div>}
        {!done && <button type="button" className="sr-only" onClick={() => setDone(true)}>{t('level.skip')}</button>}
      </div>

      <div className="results" aria-hidden={!done} aria-live="polite">
        {done && <>
          <div className="stars" role="img" aria-label={t('payoff.stars', { n: payoff.stars })}>
            {[1, 2, 3].map((n) => <Star key={n} i={n} filled={payoff.stars >= n} />)}
          </div>
          <div className="times">
            <span aria-label={t('payoff.time', { t: formatTime(payoff.totalTimeMs) })}>{formatTime(payoff.totalTimeMs)}</span>
            <span className="par" aria-label={t('payoff.par', { t: formatTime(level.par.seconds * 1000) })}>
              {formatTime(level.par.seconds * 1000)}
            </span>
          </div>
          <div className="payoff-buttons">
            <button type="button" className="button" onClick={onRetry}>{t('payoff.retry')}</button>
            {payoff.completed && next && (
              <a className="button" href={hrefFor({ name: 'level', id: next.id })}>{t('payoff.next')}</a>
            )}
            <a className="button secondary" href={hrefFor({ name: 'levels' })}>{t('payoff.levelSelect')}</a>
          </div>
        </>}
      </div>
    </main>
  );
}
