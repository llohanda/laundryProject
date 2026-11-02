// Drag and drop with Pointer Events (GDD 3.1, 6.3), not the HTML5 drag API.
// Drop targets are elements with data-drop="hamper|floor|drum". Coordinates are
// converted into the 360 x 640 design stage, which GameFrame scales to fit.
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { InstanceId } from '../engine';
import { DESIGN_WIDTH } from './GameFrame';
import type { Place } from './levelStore';

export interface Point { x: number; y: number; }
export interface DragState { id: InstanceId; size: number; at: Point; }   // `at` = pointer, stage coords

export interface DropInfo {
  id: InstanceId;
  to: Place;
  /** Pointer position inside the drop target, in stage px. */
  local: Point;
}

const DRAG_THRESHOLD_PX = 6;

function stageOf(el: Element) {
  const stage = el.closest('.stage');
  if (!stage) throw new Error('item is not inside the game stage');
  const rect = stage.getBoundingClientRect();
  return { rect, scale: rect.width / DESIGN_WIDTH };
}

/** Pointer position relative to `el`, in stage px. */
export function localPoint(el: Element, clientX: number, clientY: number): Point {
  const { scale } = stageOf(el);
  const r = el.getBoundingClientRect();
  return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
}

export function useItemDrag(onDrop: (drop: DropInfo) => void, enabled: boolean) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const pending = useRef<{ id: InstanceId; size: number; startX: number; startY: number; el: Element } | null>(null);
  const dragging = useRef(false);
  const suppressClick = useRef(false);

  const toStage = (el: Element, clientX: number, clientY: number): Point => {
    const { rect, scale } = stageOf(el);
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  };

  const bind = useCallback((id: InstanceId, size: number) => ({
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      if (!enabled || e.button !== 0) return;
      suppressClick.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
      pending.current = { id, size, startX: e.clientX, startY: e.clientY, el: e.currentTarget };
    },
    onPointerMove(e: ReactPointerEvent<HTMLElement>) {
      const p = pending.current;
      if (!p) return;
      const moved = Math.hypot(e.clientX - p.startX, e.clientY - p.startY) >= DRAG_THRESHOLD_PX;
      if (!dragging.current && !moved) return;
      dragging.current = true;
      setDrag({ id: p.id, size: p.size, at: toStage(p.el, e.clientX, e.clientY) });
    },
    onPointerUp(e: ReactPointerEvent<HTMLElement>) {
      const p = pending.current;
      const wasDragging = dragging.current;
      pending.current = null;
      dragging.current = false;
      setDrag(null);
      if (!p || !wasDragging) return;
      // A drag is not a tap: swallow the click that follows the pointerup.
      suppressClick.current = true;
      const target = document.elementsFromPoint(e.clientX, e.clientY)
        .map((el) => el.closest<HTMLElement>('[data-drop]'))
        .find((el): el is HTMLElement => el !== null);
      const to = target?.dataset.drop as Place | undefined;
      if (target && to) onDrop({ id: p.id, to, local: localPoint(target, e.clientX, e.clientY) });
    },
    onPointerCancel() {
      pending.current = null;
      dragging.current = false;
      setDrag(null);
    },
  }), [enabled, onDrop]);

  /** Call from onClick: true when the click is the tail of a drag and must be ignored. */
  const consumeDragClick = useCallback(() => {
    const was = suppressClick.current;
    suppressClick.current = false;
    return was;
  }, []);

  return { drag, bind, consumeDragClick };
}
