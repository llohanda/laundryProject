// Tutorial card and rulebook modals (GDD 10.1, 10.2). Cards pause the timer (the store does
// that); the rulebook does not. These are the only places with sentences during a level.
import { useState } from 'react';
import { content, t } from '../content';
import { CardIllustration, RuleIcon } from '../art/Icons';

export function CardModal({ id, onDismiss }: { id: string; onDismiss(): void }) {
  const card = content.cards.find((c) => c.id === id)!;
  return (
    <div className="modal-backdrop">
      <div className="modal card-modal" role="dialog" aria-modal="true" aria-labelledby="card-text">
        <div className="illustration"><CardIllustration id={card.illustration} /></div>
        <p id="card-text">{t(card.text)}</p>
        {/* autoFocus so keyboard and screen-reader users land on the only action. */}
        <button type="button" className="button" autoFocus onClick={onDismiss}>{t('card.gotIt')}</button>
      </div>
    </div>
  );
}

/** Pages unlock with their card; a line within a page unlocks with its own card. */
export function rulebookPages(seenCards: readonly string[]) {
  const seen = new Set(seenCards);
  return content.rulebook
    .filter((p) => seen.has(p.unlockedBy))
    .map((p) => ({ ...p, lines: p.lines.filter((l) => seen.has(l.unlockedBy)) }));
}

export function RulebookModal({ seenCards, onClose }: { seenCards: readonly string[]; onClose(): void }) {
  const pages = rulebookPages(seenCards);
  const [index, setIndex] = useState(pages.length - 1);
  const page = pages[index];
  if (!page) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal rulebook" role="dialog" aria-modal="true" aria-label={t('level.rulebook')}
        onClick={(e) => e.stopPropagation()}>
        <div className="tabs" role="tablist">
          {pages.map((p, i) => (
            <button key={p.page} type="button" role="tab" aria-selected={i === index}
              className={`tab${i === index ? ' active' : ''}`} onClick={() => setIndex(i)}>
              {p.page}
            </button>
          ))}
          <button type="button" className="icon-button tab-close" aria-label={t('level.close')} autoFocus onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="rule-page" role="tabpanel">
          {page.lines.map((line) => (
            <div key={line.unlockedBy} className="rule-line">
              <div className="rule-icons">
                {line.icons.map((icon) => <RuleIcon key={icon} name={icon} />)}
              </div>
              {line.caption && <p>{t(line.caption)}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
