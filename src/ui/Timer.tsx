import { useEffect, useRef, useState } from 'react';
import { t } from '../content';

/** m:ss (GDD 9.1). */
export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Small timer at the top middle; ticks forward visibly when a cycle cost is added. */
export function Timer({ read }: { read(): number }) {
  const [ms, setMs] = useState(read);
  const [bump, setBump] = useState(false);
  const last = useRef(ms);

  useEffect(() => {
    const id = setInterval(() => {
      const now = read();
      if (now - last.current >= 2000) {
        setBump(true);
        setTimeout(() => setBump(false), 400);
      }
      last.current = now;
      setMs(now);
    }, 100);
    return () => clearInterval(id);
  }, [read]);

  return (
    <span className={`timer${bump ? ' bump' : ''}`} role="timer" aria-label={t('level.timer')}>
      {formatTime(ms)}
    </span>
  );
}
