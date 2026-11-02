// Hamper (GDD 6.1): the starting pile as a wrapped grid in the seeded order; scrolls if it overflows.
import { content, t } from '../content';
import { baseId, type InstanceId } from '../engine';
import { spriteSize } from '../art/ItemSprite';
import { ItemButton, type DragBind } from './ItemButton';
import type { LevelState } from './levelStore';

interface Props {
  s: LevelState;
  liftedId: InstanceId | null;
  bind: DragBind;
  onTap(id: InstanceId): void;
  onTapHamper(): void;
}

export function Hamper({ s, liftedId, bind, onTap, onTapHamper }: Props) {
  return (
    <section className="hamper" aria-label={t('level.hamper')} data-drop="hamper" onClick={onTapHamper}>
      <div className="hamper-grid">
        {s.hamperOrder.filter((id) => s.where[id] === 'hamper').map((id) => {
          const def = content.itemsById[baseId(id)]!;
          return (
            <ItemButton
              key={id}
              id={id}
              def={def}
              size={spriteSize(def.bulk)}
              selected={s.selected === id}
              lifted={liftedId === id}
              bind={bind}
              onTap={onTap}
            />
          );
        })}
      </div>
    </section>
  );
}
