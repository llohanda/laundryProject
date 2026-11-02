// Floor (GDD 6.1): free space, items stay where dropped, the last touched is on top.
import { content, t } from '../content';
import { baseId, type InstanceId } from '../engine';
import { spriteSize } from '../art/ItemSprite';
import { ItemButton, type DragBind } from './ItemButton';
import type { FloorPos, LevelState } from './levelStore';

export const FLOOR_WIDTH = 360;
export const FLOOR_HEIGHT = 180;

/** Top-left for an item of `size` centred on `point`, kept inside the floor. */
export function floorPosFor(point: { x: number; y: number }, size: number): FloorPos {
  const hit = Math.max(44, size);
  const clamp = (v: number, max: number) => Math.round(Math.min(Math.max(v, 0), max));
  return { x: clamp(point.x - hit / 2, FLOOR_WIDTH - hit), y: clamp(point.y - hit / 2, FLOOR_HEIGHT - hit) };
}

interface Props {
  s: LevelState;
  liftedId: InstanceId | null;
  bind: DragBind;
  onTap(id: InstanceId): void;
  onTapFloor(point: { x: number; y: number }): void;
}

export function Floor({ s, liftedId, bind, onTap, onTapFloor }: Props) {
  return (
    <section
      className="floor"
      aria-label={t('level.floor')}
      data-drop="floor"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const scale = r.width / FLOOR_WIDTH;
        onTapFloor({ x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale });
      }}
    >
      {s.floorOrder.map((id, z) => {
        const def = content.itemsById[baseId(id)]!;
        const pos = s.floorPos[id]!;
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
            style={{ position: 'absolute', left: pos.x, top: pos.y, zIndex: z + 1 }}
          />
        );
      })}
    </section>
  );
}
