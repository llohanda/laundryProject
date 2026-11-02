// Result screen (M3 placeholder for the payoff scene, GDD 11). Every load is revealed at once
// with placeholder consequence art; a jam shows only the jammed load. The clothesline
// animation and final consequence visuals come in M7.
import { content, t } from '../content';
import { baseId } from '../engine';
import { ItemSprite } from '../art/ItemSprite';
import { hrefFor } from './router';
import type { Payoff as PayoffData } from './levelStore';
import { formatTime } from './Timer';

const SPRITE = 36;

function Star({ filled }: { filled: boolean }) {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.5 L14.9 8.6 L21.5 9.3 L16.5 13.8 L17.9 20.4 L12 17 L6.1 20.4 L7.5 13.8 L2.5 9.3 L9.1 8.6 Z"
        fill={filled ? '#FFD45C' : 'none'}
        stroke="#073A40"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Payoff({ payoff, levelId, onRetry }: { payoff: PayoffData; levelId: string; onRetry(): void }) {
  const level = content.levels.find((l) => l.id === levelId)!;
  const next = content.levels[content.levels.indexOf(level) + 1];
  const jam = payoff.outcome === 'jam';
  // "Earlier loads are not shown; the jam is the whole scene" (GDD 11).
  const shown = jam ? [payoff.consequences.length - 1] : payoff.consequences.map((_, i) => i);

  return (
    <main className={`payoff${payoff.stars === 3 ? ' sunny' : ''}`}>
      <div className="payoff-loads">
        {shown.map((i) => (
          <div key={i} className={`payoff-load${jam ? ' jammed' : ''}`}>
            {Object.entries(payoff.consequences[i]!).map(([id, outcome]) => (
              <span key={id} className="payoff-item" aria-label={content.itemsById[baseId(id)]!.name}>
                <ItemSprite def={content.itemsById[baseId(id)]!} size={SPRITE} outcome={outcome} />
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="stars" role="img" aria-label={t('payoff.stars', { n: payoff.stars })}>
        {[1, 2, 3].map((n) => <Star key={n} filled={payoff.stars >= n} />)}
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
    </main>
  );
}
