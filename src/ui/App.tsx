import { useState } from 'react';
import { useStore } from 'zustand';
import { content, t } from '../content';
import { GameFrame } from './GameFrame';
import { LevelRoute } from './Level';
import { levelProgress, progressStore, unlockedLevels } from './progressStore';
import { hrefFor, useRoute } from './router';

// Boot gets the first-launch consent note in M9 (GDD 16.3).

function Boot() {
  return (
    <main className="screen boot">
      <h1>{t('app.title')}</h1>
      <a className="button" href={hrefFor({ name: 'levels' })}>{t('boot.play')}</a>
    </main>
  );
}

function MiniStars({ n }: { n: number }) {
  return (
    <span className="mini-stars" aria-hidden="true">
      {[1, 2, 3].map((k) => (
        <svg key={k} width="14" height="14" viewBox="0 0 24 24">
          <path d="M12 2.5 L14.9 8.6 L21.5 9.3 L16.5 13.8 L17.9 20.4 L12 17 L6.1 20.4 L7.5 13.8 L2.5 9.3 L9.1 8.6 Z"
            fill={n >= k ? '#FFD45C' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      ))}
    </span>
  );
}

/** 12 levels in 4 blocks; locked ones dimmed, best stars shown, any unlocked level replayable (GDD 17). */
function LevelSelect() {
  const save = useStore(progressStore(), (p) => p.save);
  const open = unlockedLevels(content.levels, save);
  const tutorials = [1, 2, 3, 4] as const;
  return (
    <main className="screen level-select">
      <div className="screen-head">
        <h1>{t('levelSelect.title')}</h1>
        <a className="icon-button dark" href={hrefFor({ name: 'settings' })} aria-label={t('settings.title')}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.9 4.9 L7 7 M17 17 L19.1 19.1 M4.9 19.1 L7 17 M17 7 L19.1 4.9"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </a>
      </div>
      {tutorials.map((n) => (
        <section key={n}>
          <h2>{t('levelSelect.tutorial', { n })}</h2>
          <div className="level-row">
            {content.levels.filter((l) => l.tutorial === n).map((l) => {
              const best = levelProgress(save, l.id).bestStars;
              return open.has(l.id)
                ? (
                  <a key={l.id} className="level-tile" href={hrefFor({ name: 'level', id: l.id })}
                    aria-label={`${l.id}, ${t('payoff.stars', { n: best })}`}>
                    <span>{l.id}</span>
                    <MiniStars n={best} />
                  </a>
                )
                : (
                  <span key={l.id} className="level-tile locked" aria-disabled="true"
                    aria-label={t('levelSelect.locked', { id: l.id })}>
                    <span>{l.id}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" />
                      <path d="M8 11 V8 A4 4 0 0 1 16 8 V11" fill="none" stroke="currentColor" strokeWidth="2.5" />
                    </svg>
                  </span>
                );
            })}
          </div>
        </section>
      ))}
      <a className="back" href={hrefFor({ name: 'boot' })}>{t('nav.back')}</a>
    </main>
  );
}

/** Consent toggle arrives with the analytics upload in M9 (GDD 16.3). */
function Settings() {
  const reset = useStore(progressStore(), (p) => p.reset);
  const persisted = useStore(progressStore(), (p) => p.persisted);
  const [confirming, setConfirming] = useState(false);
  return (
    <main className="screen settings">
      <h1>{t('settings.title')}</h1>
      {confirming
        ? (
          <div className="confirm">
            <p>{t('settings.resetConfirm')}</p>
            <div className="row">
              <button type="button" className="button" onClick={() => { reset(); setConfirming(false); }}>
                {t('settings.resetYes')}
              </button>
              <button type="button" className="button secondary" onClick={() => setConfirming(false)}>
                {t('settings.resetNo')}
              </button>
            </div>
          </div>
        )
        : <button type="button" className="button secondary" onClick={() => setConfirming(true)}>{t('settings.reset')}</button>}
      {!persisted && <p className="note">{t('settings.notSaved')}</p>}
      <p className="version">{t('settings.version', { v: __APP_VERSION__ })}</p>
      <a className="back" href={hrefFor({ name: 'levels' })}>{t('nav.back')}</a>
    </main>
  );
}

/** A locked level's URL shows the level select instead (GDD 8). */
function LevelOrSelect({ id }: { id: string }) {
  const save = useStore(progressStore(), (p) => p.save);
  if (!unlockedLevels(content.levels, save).has(id)) return <LevelSelect />;
  return <LevelRoute key={id} id={id} />;
}

export function App() {
  const route = useRoute();
  return (
    <GameFrame>
      {route.name === 'boot' && <Boot />}
      {route.name === 'levels' && <LevelSelect />}
      {route.name === 'settings' && <Settings />}
      {route.name === 'level' && <LevelOrSelect key={route.id} id={route.id} />}
    </GameFrame>
  );
}
