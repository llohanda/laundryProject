// Mesh bags (GDD 6.3, 6.4). Tap a bag with a small item selected to put it in; tap with
// nothing selected to open the popover. A bag can also be dragged into or out of the drum.
import { content, t } from '../content';
import { baseId, type InstanceId } from '../engine';
import { BagSprite, ItemSprite, spriteSize } from '../art/ItemSprite';
import { itemColors } from '../art/palette';
import type { DragBind } from './ItemButton';
import type { BagId, LevelState } from './levelStore';

/** Six dots, one per 2 bulk: a bag holds 12 and a sock is 1, underwear 2 (GDD 5.3). */
const SLOTS = content.config.bagBulkCap / 2;

/** One color per filled dot, in the order the items went in. */
export function bagDots(ids: InstanceId[]): string[] {
  const units = ids.flatMap((id) => {
    const def = content.itemsById[baseId(id)]!;
    return Array<string>(def.bulk).fill(itemColors[def.id]?.fill ?? '#CCCCCC');
  });
  return units.filter((_, i) => i % 2 === 0);
}

interface BagProps {
  s: LevelState;
  bag: BagId;
  size: number;
  lifted: boolean;
  shaking: boolean;
  bind: DragBind;
  onTap(bag: BagId): void;
}

export function Bag({ s, bag, size, lifted, shaking, bind, onTap }: BagProps) {
  const items = s.bagOrder[bag];
  const dots = bagDots(items);
  const hit = Math.max(44, size);
  return (
    <button
      type="button"
      className={`item bag${lifted ? ' lifted' : ''}${shaking ? ' shake' : ''}`}
      aria-label={t('level.bag', { n: bag, k: dots.length })}
      data-drop={`bag:${bag}`}
      style={{ width: hit, height: hit }}
      {...bind(`bag:${bag}`, size)}
      onClick={(e) => {
        e.stopPropagation();
        onTap(bag);
      }}
    >
      <BagSprite size={size} filled={dots.length} slots={SLOTS} contents={dots} />
    </button>
  );
}

interface PopoverProps {
  s: LevelState;
  bag: BagId;
  onTakeOut(id: InstanceId): void;
  onMoveBag(bag: BagId, to: 'slot' | 'drum'): void;
  onClose(): void;
}

/** What is in a bag; tap an item to send it to the floor, and move the bag in or out of the drum. */
export function BagPopover({ s, bag, onTakeOut, onMoveBag, onClose }: PopoverProps) {
  const inDrum = s.bags[bag] === 'drum';
  return (
    <div className="popover-backdrop" onClick={onClose}>
      <div className="bag-popover" role="dialog" aria-label={t('level.bagContents', { n: bag })}
        onClick={(e) => e.stopPropagation()}>
        <div className="bag-popover-items">
          {s.bagOrder[bag].map((id) => {
            const def = content.itemsById[baseId(id)]!;
            return (
              <button key={id} type="button" className="item" aria-label={`${def.name}. ${t('level.toFloor')}`}
                style={{ width: 44, height: 44 }} onClick={() => onTakeOut(id)}>
                <ItemSprite def={def} size={spriteSize(def.bulk)} />
              </button>
            );
          })}
          {s.bagOrder[bag].length === 0 && <BagSprite size={44} filled={0} slots={SLOTS} />}
        </div>
        <div className="bag-popover-actions">
          <button type="button" className="icon-button round"
            aria-label={t(inDrum ? 'level.bagFromDrum' : 'level.bagToDrum')}
            onClick={() => onMoveBag(bag, inDrum ? 'slot' : 'drum')}>
            <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
              <circle cx="14" cy="14" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" />
              {inDrum
                ? <path d="M14 18 L14 6 M9 10 L14 5 L19 10" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                : <path d="M14 4 L14 16 M9 12 L14 17 L19 12" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" />}
            </svg>
          </button>
          <button type="button" className="icon-button round" aria-label={t('level.close')} onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
