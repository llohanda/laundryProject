import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { ItemSprite } from '../art/ItemSprite';
import type { InstanceId, ItemDef } from '../engine';

export type DragBind = (id: InstanceId, size: number) => {
  onPointerDown(e: ReactPointerEvent<HTMLElement>): void;
  onPointerMove(e: ReactPointerEvent<HTMLElement>): void;
  onPointerUp(e: ReactPointerEvent<HTMLElement>): void;
  onPointerCancel(): void;
};

interface Props {
  id: InstanceId;
  def: ItemDef;
  /** Drawn size; the hit area is never below 44 px (GDD 6.2). */
  size: number;
  selected: boolean;
  lifted: boolean;
  bind: DragBind;
  onTap(id: InstanceId): void;
  style?: CSSProperties;
}

/** An item is a real button with an accessible name, so keyboards and screen readers work (GDD 6.3). */
export function ItemButton({ id, def, size, selected, lifted, bind, onTap, style }: Props) {
  const hit = Math.max(44, size);
  return (
    <button
      type="button"
      className={`item${selected ? ' selected' : ''}${lifted ? ' lifted' : ''}`}
      aria-label={def.name}
      aria-pressed={selected}
      style={{ width: hit, height: hit, ...style }}
      {...bind(id, size)}
      onClick={(e) => {
        e.stopPropagation();
        onTap(id);
      }}
    >
      <ItemSprite def={def} size={size} />
    </button>
  );
}
