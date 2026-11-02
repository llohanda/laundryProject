// Payoff scene (GDD 11). Every load is revealed at once on a clothesline (about 4 s,
// skippable, not interactive). It is one timeline: the sun comes out first on a 3-star run,
// the stars pop as the last garment lands, then the time and buttons fade in. A jam replaces
// the whole scene: the jammed load's items balloon to their wet bulk and wedge the shuddering drum.
import { useEffect, useState } from 'react';
import { content, t } from '../content';
import { baseId, type InstanceId, type ItemOutcome, type LoadEval } from '../engine';
import { ItemSprite, kindOf, spriteSize } from '../art/ItemSprite';
import { ui } from '../art/palette';
import { hrefFor } from './router';
import type { Payoff as PayoffData } from './levelStore';
import { formatTime } from './Timer';

const LINE_WIDTH = 344;
const HANG_MS = 500;       // one garment dropping onto the line
const LAYOUT_MS = 3000;    // spread of the garment drops across the line
const STAR_STEP_MS = 150;
const STAR_MS = 350;
const FADE_MS = 300;
const JAM_STARS_AT = 1800;

/** When the stars start, and when the whole scene is at rest. */
export function timeline(garments: number, jam: boolean) {
  const stepMs = Math.floor(LAYOUT_MS / Math.max(1, garments));
  const starsAt = jam ? JAM_STARS_AT : Math.max(0, (garments - 1) * stepMs + HANG_MS - 150);
  const restMs = starsAt + 2 * STAR_STEP_MS + STAR_MS + FADE_MS;
  return { stepMs, starsAt, restMs };
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Star({ filled, i, at }: { filled: boolean; i: number; at: number }) {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" aria-hidden="true" className="star" style={{ animationDelay: `${at + (i - 1) * STAR_STEP_MS}ms` }}>
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

type Entry = [InstanceId, ItemOutcome];
type Slot = { pair: false; a: Entry } | { pair: true; a: Entry; b: Entry };

/** Socks are separate items during play and only meet in pairs here, on the line. */
function slotsOf(items: Entry[]): Slot[] {
  const waiting = new Map<string, Slot & { pair: false }>();
  const slots: Slot[] = [];
  for (const entry of items) {
    const defId = baseId(entry[0]);
    if (kindOf(defId) !== 'sock') {
      slots.push({ pair: false, a: entry });
      continue;
    }
    const first = waiting.get(defId);
    if (first) {
      const at = slots.indexOf(first);
      slots[at] = { pair: true, a: first.a, b: entry };
      waiting.delete(defId);
    } else {
      const slot = { pair: false as const, a: entry };
      waiting.set(defId, slot);
      slots.push(slot);
    }
  }
  return slots;
}

/** One garment on its peg; a lost small item leaves the peg empty. */
function Hung({ entry, size }: { entry: Entry; size: number }) {
  const def = content.itemsById[baseId(entry[0])]!;
  return (
    <span className="hung" aria-label={def.name} role="img">
      <Peg />
      <ItemSprite def={def} size={size} outcome={entry[1]} />
    </span>
  );
}

/** One load on the line; garments drop in one after another. */
function Line({ items, startIndex, stepMs }: { items: Entry[]; startIndex: number; stepMs: number }) {
  const slots = slotsOf(items);
  const units = slots.reduce((n, sl) => n + (sl.pair ? 1.7 : 1), 0);
  const size = Math.max(24, Math.min(44, Math.floor(LINE_WIDTH / Math.max(1, units)) - 4));
  let index = startIndex;
  return (
    <div className="line">
      <div className="rope" aria-hidden="true" />
      {slots.map((sl) => {
        const delay = `${index * stepMs}ms`;
        index += sl.pair ? 2 : 1;
        return sl.pair
          ? (
            <span key={sl.a[0]} className="hanging pair" style={{ animationDelay: delay }}>
              <Hung entry={sl.a} size={Math.round(size * 0.85)} />
              <Hung entry={sl.b} size={Math.round(size * 0.85)} />
            </span>
          )
          : (
            <span key={sl.a[0]} className="hanging" style={{ width: size + 4, animationDelay: delay }}>
              <Hung entry={sl.a} size={size} />
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
  const lines = payoff.consequences.map((m) => Object.entries(m));
  const garments = lines.reduce((n, l) => n + l.length, 0);
  const { stepMs, starsAt, restMs } = timeline(garments, jam);
  const [done, setDone] = useState(prefersReducedMotion);

  useEffect(() => {
    if (done) return;
    const id = setTimeout(() => setDone(true), restMs);
    return () => clearTimeout(id);
  }, [done, restMs]);

  const starts = lines.map((_, i) => lines.slice(0, i).reduce((n, l) => n + l.length, 0));
  const sunny = payoff.stars === 3;

  return (
    <main className={`payoff${done ? ' done' : ''}${sunny ? ' sunny' : ''}`} onClick={() => setDone(true)}>
      {sunny && (
        <svg className="sun" width="120" height="120" viewBox="-60 -60 120 120" aria-hidden="true">
          <g className="sun-rays" stroke="#FFC93C" strokeWidth="5" strokeLinecap="round">
            {Array.from({ length: 12 }, (_, k) => (
              <line key={k} x1="0" y1="-38" x2="0" y2="-52" transform={`rotate(${k * 30})`} />
            ))}
          </g>
          <circle r="28" fill="#FFD45C" stroke="#F2A81D" strokeWidth="3" />
        </svg>
      )}
      <div className="scene">
        {jam
          ? <JamScene items={lines.at(-1)!} load={payoff.perLoad.at(-1)!} />
          : <div className="clothesline">
              {lines.map((items, i) => <Line key={i} items={items} startIndex={starts[i]!} stepMs={stepMs} />)}
            </div>}
        {!done && <button type="button" className="sr-only" onClick={() => setDone(true)}>{t('level.skip')}</button>}
      </div>

      <div className="results" aria-live="polite">
        <div className="stars" role="img" aria-label={t('payoff.stars', { n: payoff.stars })}>
          {[1, 2, 3].map((n) => <Star key={n} i={n} at={starsAt} filled={payoff.stars >= n} />)}
        </div>
        <div className="after" style={{ animationDelay: `${starsAt + 2 * STAR_STEP_MS + STAR_MS}ms` }}>
          <div className="times">
            <span aria-label={t('payoff.time', { t: formatTime(payoff.totalTimeMs) })}>{formatTime(payoff.totalTimeMs)}</span>
          </div>
          <div className="payoff-buttons">
            <button type="button" className="button" onClick={(e) => { e.stopPropagation(); onRetry(); }}>{t('payoff.retry')}</button>
            {payoff.completed && next && (
              <a className="button" href={hrefFor({ name: 'level', id: next.id })} onClick={(e) => e.stopPropagation()}>{t('payoff.next')}</a>
            )}
            <a className="button secondary" href={hrefFor({ name: 'levels' })} onClick={(e) => e.stopPropagation()}>{t('payoff.levelSelect')}</a>
          </div>
        </div>
      </div>
    </main>
  );
}
