// Washing machine (GDD 6.1): the drum with compact chips and the Start button with the live cost.
// The fill ring arrives in M4 and the bag slots in M6.
import { content, t } from '../content';
import { baseId, evaluateLoad, type InstanceId, type LoadInput } from '../engine';
import { ItemSprite } from '../art/ItemSprite';
import { ItemButton, type DragBind } from './ItemButton';
import { canStart, drumLoad, type LevelState } from './levelStore';

const CHIP = 28;

interface Props {
  s: LevelState;
  spinning: LoadInput | null;
  liftedId: InstanceId | null;
  bind: DragBind;
  onTap(id: InstanceId): void;
  onTapDrum(): void;
  onStart(): void;
}

export function Washer({ s, spinning, liftedId, bind, onTap, onTapDrum, onStart }: Props) {
  const { itemsById: defs, config: cfg } = content;
  const load = drumLoad(s);
  const costMs = load.items.length
    ? evaluateLoad(defs, load, cfg, { smallItemLoss: s.level.flags.smallItemLoss }).cycleCostMs
    : null;
  const startable = canStart(s);

  return (
    <section className="washer" aria-label={t('level.drum')}>
      <div className="drum" data-drop="drum" onClick={onTapDrum}>
        <div className={`drum-inner${spinning ? ' spinning' : ''}`}>
          {spinning
            ? spinning.items.map((id) => (
                <span key={id} className="chip" aria-hidden="true">
                  <ItemSprite def={defs[baseId(id)]!} size={CHIP} />
                </span>
              ))
            : s.drumOrder.map((id) => (
                <ItemButton
                  key={id}
                  id={id}
                  def={defs[baseId(id)]!}
                  size={CHIP}
                  selected={s.selected === id}
                  lifted={liftedId === id}
                  bind={bind}
                  onTap={onTap}
                />
              ))}
        </div>
      </div>
      <button
        type="button"
        className="start"
        disabled={!startable}
        aria-label={costMs === null ? t('level.start') : t('level.startCost', { s: (costMs / 1000).toFixed(1) })}
        onClick={(e) => {
          e.stopPropagation();
          onStart();
        }}
      >
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
          <path d="M9 6 L22 14 L9 22 Z" fill="currentColor" />
        </svg>
        {costMs !== null && <span className="cost">+{(costMs / 1000).toFixed(1)}s</span>}
      </button>
    </section>
  );
}
