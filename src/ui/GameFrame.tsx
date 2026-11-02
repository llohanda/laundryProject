// The 9:16 game container (GDD 3.2). Children are laid out in the 360 x 640 design
// viewport and scaled uniformly to fit; the page around the frame is black.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../content';

export const DESIGN_WIDTH = 360;
export const DESIGN_HEIGHT = 640;

export function GameFrame({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setScale(frame.clientHeight / DESIGN_HEIGHT);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="page">
      <div className="frame" ref={frameRef}>
        <div
          className="stage"
          style={{ width: DESIGN_WIDTH, height: DESIGN_HEIGHT, transform: `scale(${scale})` }}
        >
          {children}
        </div>
      </div>
      <div className="rotate-overlay" role="alert">
        <div className="rotate-icon" aria-hidden="true" />
        <p>{t('app.rotate')}</p>
      </div>
    </div>
  );
}
