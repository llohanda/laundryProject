// Placeholder item art (M3). One rough silhouette per garment family; the real SVG
// silhouettes and consequence visuals come in M7. Light vs dark also differs by
// outline weight, the colorblind-safe secondary cue (GDD 5.4, 18).
import { useId } from 'react';
import type { ItemDef, ItemOutcome } from '../engine';
import { itemColors, ui } from './palette';

/** Sprite size class by dry bulk (GDD 6.2). */
export function spriteSize(bulk: number): 44 | 56 | 72 {
  if (bulk <= 6) return 44;
  if (bulk <= 20) return 56;
  return 72;
}

type Family = 'top' | 'bottom' | 'flat' | 'sock' | 'undies';

function familyOf(id: string): Family {
  if (/^(tee|shirt|hoodie|jacket|puffer)_/.test(id)) return 'top';
  if (/^(trousers|jeans)_/.test(id)) return 'bottom';
  if (id.startsWith('sock_')) return 'sock';
  if (id.startsWith('undies_')) return 'undies';
  return 'flat';
}

// 48 x 48 viewBox outlines.
const PATHS: Record<Family, string> = {
  top: 'M16 6 L32 6 L44 14 L39 22 L34 19 L34 42 L14 42 L14 19 L9 22 L4 14 Z',
  bottom: 'M12 4 L36 4 L39 44 L28 44 L24 18 L20 44 L9 44 Z',
  flat: 'M7 9 Q24 5 41 9 L41 39 Q24 43 7 39 Z',
  sock: 'M17 4 L29 4 L29 28 L38 33 Q42 40 35 43 L21 43 Q15 42 17 35 Z',
  undies: 'M6 12 L42 12 L40 22 Q30 26 27 36 L21 36 Q18 26 8 22 Z',
};

const TINT_FILL: Partial<Record<ItemOutcome['tint'], string>> = {
  pink: ui.bleedPink,
  greyBlue: ui.dyeGreyBlue,
};

export function ItemSprite({ def, size, outcome }: { def: ItemDef; size: number; outcome?: ItemOutcome }) {
  const family = familyOf(def.id);
  const colors = itemColors[def.id] ?? { fill: '#CCCCCC' };
  const fill = (outcome && TINT_FILL[outcome.tint]) ?? colors.fill;
  const dark = def.tier === 'dark';
  const clip = `clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const stretched = outcome?.shape === 'stretched';
  const lost = outcome?.shape === 'lost';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      className="item-sprite"
      style={{
        overflow: 'visible',
        opacity: lost ? 0.25 : 1,
        transform: stretched ? 'scaleY(1.35)' : undefined,
        transformOrigin: 'top',
      }}
    >
      <defs>
        <clipPath id={clip}><path d={PATHS[family]} /></clipPath>
      </defs>
      {outcome?.ruined && <circle cx="24" cy="24" r="25" fill="none" stroke={ui.accent} strokeWidth="2.5" />}
      <path d={PATHS[family]} fill={fill} />
      {colors.stripe && !TINT_FILL[outcome?.tint ?? 'none'] && (
        <g clipPath={`url(#${clip})`} stroke={colors.stripe} strokeWidth="2.5">
          {[10, 17, 24, 31, 38].map((x) => <line key={x} x1={x} y1="0" x2={x} y2="48" />)}
        </g>
      )}
      {outcome?.tint === 'smudged' && (
        <g clipPath={`url(#${clip})`} fill={ui.smudgeGrey} opacity="0.6">
          <ellipse cx="18" cy="22" rx="9" ry="6" /><ellipse cx="30" cy="34" rx="8" ry="5" />
        </g>
      )}
      {outcome?.tint === 'stained' && (
        <g clipPath={`url(#${clip})`} fill="#8A6A3B" opacity="0.8">
          <circle cx="19" cy="24" r="4" /><circle cx="29" cy="32" r="3" /><circle cx="26" cy="17" r="2.5" />
        </g>
      )}
      {outcome?.tint === 'lint' && (
        <g clipPath={`url(#${clip})`} fill="#FFFFFF">
          {[[16, 18], [28, 22], [21, 30], [32, 34], [18, 38], [26, 13]].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" />
          ))}
        </g>
      )}
      <path
        d={PATHS[family]}
        fill="none"
        stroke={ui.outline}
        strokeWidth={dark ? 3 : 1.5}
        strokeLinejoin="round"
        strokeDasharray={lost ? '3 3' : undefined}
      />
      {dark && (
        <path d={PATHS[family]} fill="none" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1"
          strokeLinejoin="round" transform="translate(24 24) scale(0.86) translate(-24 -24)" />
      )}
    </svg>
  );
}
