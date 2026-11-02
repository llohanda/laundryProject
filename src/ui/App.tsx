import { content, t } from '../content';
import { GameFrame } from './GameFrame';
import { LevelRoute } from './Level';
import { hrefFor, useRoute } from './router';

// Boot and LevelSelect are placeholders until M8 (level select, unlocks) and M9 (consent).

function Boot() {
  return (
    <main className="screen boot">
      <h1>{t('app.title')}</h1>
      <a className="button" href={hrefFor({ name: 'levels' })}>{t('boot.play')}</a>
    </main>
  );
}

function LevelSelect() {
  const tutorials = [1, 2, 3, 4] as const;
  return (
    <main className="screen level-select">
      <h1>{t('levelSelect.title')}</h1>
      {tutorials.map((n) => (
        <section key={n}>
          <h2>{t('levelSelect.tutorial', { n })}</h2>
          <div className="level-row">
            {content.levels.filter((l) => l.tutorial === n).map((l) => (
              <a key={l.id} className="level-tile" href={hrefFor({ name: 'level', id: l.id })}>{l.id}</a>
            ))}
          </div>
        </section>
      ))}
      <a className="back" href={hrefFor({ name: 'boot' })}>{t('nav.back')}</a>
    </main>
  );
}

export function App() {
  const route = useRoute();
  return (
    <GameFrame>
      {route.name === 'boot' && <Boot />}
      {route.name === 'levels' && <LevelSelect />}
      {route.name === 'level' && <LevelRoute key={route.id} id={route.id} />}
    </GameFrame>
  );
}
