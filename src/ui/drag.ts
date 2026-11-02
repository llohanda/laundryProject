// Drag and drop with Pointer Events (GDD 3.1, 6.3), not the HTML5 drag API.
// Drop targets are elements with data-drop="hamper|floor|drum". Coordinates are
// converted into the 360 x 640 design stage, which GameFrame scales to fit.
import { useCallback, useEffect, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react';
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
  const dragging = useRef(false);
  const suppressClick = useRef(false);
  const stop = useRef<(() => void) | null>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const toStage = (el: Element, clientX: number, clientY: number): Point => {
    const { rect, scale } = stageOf(el);
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  };

  // A gesture ends on window, not on the dragged element: a touchpad can release outside the
  // element or the window, lose capture, or send no pointerup at all (button already up).
  const begin = useCallback((id: InstanceId, size: number, el: HTMLElement, pointerId: number, startX: number, startY: number) => {
    stop.current?.();
    dragging.current = false;
    suppressClick.current = false;

    const finish = (clientX: number, clientY: number, drop: boolean) => {
      const was = dragging.current;
      end();
      if (!drop || !was) return;
      // A drag is not a tap: swallow the click that follows the pointerup.
      suppressClick.current = true;
      const target = document.elementsFromPoint(clientX, clientY)
        .map((x) => x.closest<HTMLElement>('[data-drop]'))
        .find((x): x is HTMLElement => x !== null);
      const to = target?.dataset.drop as Place | undefined;
      if (target && to) onDropRef.current({ id, to, local: localPoint(target, clientX, clientY) });
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      if (e.buttons === 0 && e.pointerType === 'mouse') {
        finish(e.clientX, e.clientY, true);   // the release was missed
        return;
      }
      if (!dragging.current && Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD_PX) return;
      dragging.current = true;
      setDrag({ id, size, at: toStage(el, e.clientX, e.clientY) });
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId === pointerId) finish(e.clientX, e.clientY, true);
    };
    const onCancel = (e: PointerEvent) => {
      if (e.pointerId === pointerId) finish(e.clientX, e.clientY, false);
    };
    const onBlur = () => finish(0, 0, false);
    function end() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onBlur);
      stop.current = null;
      dragging.current = false;
      setDrag(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onBlur);
    stop.current = end;
  }, []);

  useEffect(() => () => stop.current?.(), []);
  useEffect(() => {
    if (!enabled) stop.current?.();
  }, [enabled]);

  const bind = useCallback((id: InstanceId, size: number) => ({
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      if (!enabled || e.button !== 0) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // capture is a convenience; window listeners carry the gesture
      }
      begin(id, size, e.currentTarget, e.pointerId, e.clientX, e.clientY);
    },
    /** The browser's own drag-and-drop would cancel the pointer stream mid-gesture. */
    onDragStart(e: ReactDragEvent<HTMLElement>) {
      e.preventDefault();
    },
  }), [enabled, begin]);

  /** Call from onClick: true when the click is the tail of a drag and must be ignored. */
  const consumeDragClick = useCallback(() => {
    const was = suppressClick.current;
    suppressClick.current = false;
    return was;
  }, []);

  return { drag, bind, consumeDragClick };
}
