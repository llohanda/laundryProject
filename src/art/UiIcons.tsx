// Interface icons (GDD 6.1): drawn with currentColor on a 24 x 24 grid, no text.
import type { ReactNode } from 'react';

const TEETH = 8;

/** A cog: eight teeth round a hub. */
function gearPath(): string {
  const pts: string[] = [];
  for (let k = 0; k < TEETH; k++) {
    const a = (k / TEETH) * 2 * Math.PI;
    const w = Math.PI / TEETH;
    const at = (r: number, da: number) => `${(12 + r * Math.sin(a + da)).toFixed(2)} ${(12 - r * Math.cos(a + da)).toFixed(2)}`;
    pts.push(`${at(7.6, -w * 0.9)} ${at(10.6, -w * 0.45)} ${at(10.6, w * 0.45)} ${at(7.6, w * 0.9)}`);
  }
  return `M${pts.join(' L')} Z`;
}
const GEAR = gearPath();

const PATHS: Record<string, ReactNode> = {
  gear: (
    <>
      <path d={GEAR} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  // A closed book: cover with a spine band, a title plate and the page edge along the bottom.
  book: (
    <>
      <path d="M6 3.5 H18.5 A1.5 1.5 0 0 1 20 5 V17.5 H6.5 A2.5 2.5 0 0 0 4 20 V5.5 A2 2 0 0 1 6 3.5 Z"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M4 20 A2.5 2.5 0 0 0 6.5 22.5 H20 V17.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 3.5 V17.5 M11 8 H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  pause: <path d="M8 5 V19 M16 5 V19" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />,
  play: <path d="M8 5 L19 12 L8 19 Z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  restart: (
    <>
      <path d="M19 12 A7 7 0 1 1 16.9 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M17.5 3 V7.5 H13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  exit: (
    <>
      <path d="M10 4 H5 V20 H10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12 H20 M16 8 L20 12 L16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export type UiIconName = keyof typeof PATHS;

export function UiIcon({ name, size = 24 }: { name: UiIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
