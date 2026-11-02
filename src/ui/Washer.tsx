// Washing machine (GDD 6.1): the drum with compact chips, the fill ring (from Tutorial 2),
// the Start button with the live cost, and two bag slots beside the drum (Tutorial 4).
import { content, t } from '../content';
import { baseId, evaluateLoad, zoneOf, type FillZone, type InstanceId, type LoadInput } from '../engine';
import { ItemSprite } from '../art/ItemSprite';
import { ui } from '../art/palette';
import { Bag } from './Bag';
import { ItemButton, type DragBind } from './ItemButton';
import { bagIds, canStart, drumLoad, type BagId, type LevelState } from './levelStore';

const CHIP = 28;

const RING_COLOR: Record<FillZone, string> = {
  light: ui.ringLight,
  good: ui.ringGood,
  tight: ui.ringTight,
  overfull: ui.ringOver,
};

/**
 * Ring around the drum showing dry fill (GDD 6.5). The zone comes from the engine's integer
 * thresholds; the arc length is display only. Ticks mark 70% and 90%.
 */
function FillRing({ size, weight, dryBulk }: { size: number; weight: number; dryBulk: number }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const zone = zoneOf(weight, dryBulk);
  const fill = Math.min(1, Math.max(weight / content.config.drumWeight, dryBulk / content.config.drumBulk));
  const tick = (f: number) => {
    const a = -Math.PI / 2 + f * 2 * Math.PI;
    const p = (rr: number) => `${size / 2 + rr * Math.cos(a)} ${size / 2 + rr * Math.sin(a)}`;
    return `M${p(r - 7)} L${p(r + 7)}`;
  };
  return (
    <svg className={`fill-ring zone-${zone}`} width={size} height={size} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ui.outline} strokeOpacity="0.45" strokeWidth="9" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={RING_COLOR[zone]} strokeWidth="9"
        strokeDasharray={`${fill * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="fill-arc"
      />
      <path d={`${tick(0.7)} ${tick(0.9)}`} stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

interface Props {
  s: LevelState;
  spinning: LoadInput | null;
  liftedId: string | null;
  shaking: string | null;
  bind: DragBind;
  onTap(id: InstanceId): void;
  onTapDrum(): void;
  onTapBag(bag: BagId): void;
  onStart(): void;
}

export function Washer({ s, spinning, liftedId, shaking, bind, onTap, onTapDrum, onTapBag, onStart }: Props) {
  const { itemsById: defs, config: cfg } = content;
  const load = drumLoad(s);
  const startable = canStart(s);
  const e = load.items.length || load.bags.length
    ? evaluateLoad(defs, load, cfg, { smallItemLoss: s.level.flags.smallItemLoss })
    : null;
  const costMs = startable && e ? e.cycleCostMs : null;
  const bags = bagIds(s.level);
  const size = bags.length ? 200 : 216;
  const overfull = e?.zone === 'overfull';

  return (
    <section className={`washer${bags.length ? ' with-bags' : ''}`} aria-label={t('level.drum')}>
      {bags.length > 0 && (
        <div className="bag-slots">
          {bags.map((b) => (
            s.bags[b] === 'slot'
              ? <Bag key={b} s={s} bag={b} size={56} lifted={liftedId === `bag:${b}`} shaking={shaking === `bag:${b}`}
                  bind={bind} onTap={onTapBag} />
              : <span key={b} className={`bag-slot-empty${s.bags[b] === 'used' ? ' used' : ''}`} aria-hidden="true" />
          ))}
        </div>
      )}
      <div className="drum-wrap" style={{ width: size, height: size }}>
        {s.level.flags.showFillRing && (
          <FillRing size={size} weight={e?.weight ?? 0} dryBulk={e?.dryBulk ?? 0} />
        )}
        <div
          className={`drum${overfull && !spinning ? ' overfull' : ''}`}
          data-drop="drum"
          onClick={onTapDrum}
          style={{ inset: s.level.flags.showFillRing ? 14 : 0 }}
        >
          <div className={`drum-inner${spinning ? ' spinning' : ''}`}>
            {spinning
              ? [...spinning.items, ...spinning.bags.map((_, i) => `bag#${i}`)].map((id) => (
                  <span key={id} className="chip" aria-hidden="true">
                    {id.startsWith('bag#')
                      ? <span className="chip-bag" />
                      : <ItemSprite def={defs[baseId(id)]!} size={CHIP} />}
                  </span>
                ))
              : <>
                  {s.drumOrder.map((id) => (
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
                  {bags.filter((b) => s.bags[b] === 'drum').map((b) => (
                    <Bag key={b} s={s} bag={b} size={CHIP + 8} lifted={liftedId === `bag:${b}`}
                      shaking={shaking === `bag:${b}`} bind={bind} onTap={onTapBag} />
                  ))}
                </>}
          </div>
        </div>
      </div>
      <button
        type="button"
        className="start"
        disabled={!startable}
        aria-label={costMs === null ? t('level.start') : t('level.startCost', { s: (costMs / 1000).toFixed(1) })}
        onClick={(ev) => {
          ev.stopPropagation();
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
