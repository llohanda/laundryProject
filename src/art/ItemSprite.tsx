// Code-generated SVG items (GDD 5.4, 18): one silhouette per garment kind on a 48 x 48 grid,
// flat fills, clean outlines. Light vs dark also differs by outline weight (the
// colorblind-safe secondary cue). Dirty items carry smears; worn socks carry smell lines.
// An ItemOutcome (GDD 13.6) draws the payoff look: tint, shape, ruined ring.
import { useId } from 'react';
import type { ItemDef, ItemOutcome } from '../engine';
import { itemColors, ui } from './palette';

/** Sprite size class by dry bulk (GDD 6.2). */
export function spriteSize(bulk: number): 44 | 56 | 72 {
  if (bulk <= 6) return 44;
  if (bulk <= 20) return 56;
  return 72;
}

export type Kind =
  | 'tee' | 'shirt' | 'hoodie' | 'trousers' | 'jeans' | 'jacket' | 'puffer'
  | 'sock' | 'undies' | 'towel' | 'curtain' | 'duvet' | 'sheet' | 'rag';

const PREFIX: [string, Kind][] = [
  ['tee_', 'tee'], ['shirt_', 'shirt'], ['hoodie_', 'hoodie'], ['trousers_', 'trousers'], ['jeans_', 'jeans'],
  ['jacket_', 'jacket'], ['puffer_', 'puffer'], ['sock_', 'sock'], ['undies_', 'undies'], ['towel_', 'towel'],
  ['curtain_', 'curtain'], ['duvet_', 'duvet'], ['sheet_', 'sheet'], ['rag_', 'rag'],
];

export function kindOf(id: string): Kind {
  const hit = PREFIX.find(([p]) => id.startsWith(p));
  if (!hit) throw new Error(`no silhouette for item ${id}`);
  return hit[1];
}

const SOCK = 'M13 6 L22 6 L22 27 L30 32 Q34 39 27 41 L16 41 Q11 40 13 34 Z';

/** Outline of each kind; the outline is also the clip path for stripes, tints and marks. */
const BODY: Record<Kind, string> = {
  tee: 'M16 7 Q24 12 32 7 L43 13 L38 21 L33 18 L33 42 L15 42 L15 18 L10 21 L5 13 Z',
  shirt: 'M17 6 L24 10 L31 6 L43 12 L40 27 L34 25 L34 43 L14 43 L14 25 L8 27 L5 12 Z',
  hoodie: 'M15 10 Q24 1 33 10 L43 16 L41 35 L35 33 L35 44 L13 44 L13 33 L7 35 L5 16 Z',
  trousers: 'M13 4 L35 4 L38 44 L28 44 L24 17 L20 44 L10 44 Z',
  jeans: 'M13 4 L35 4 L38 44 L28 44 L24 17 L20 44 L10 44 Z',
  jacket: 'M16 5 L24 9 L32 5 L43 12 L42 37 L35 36 L35 45 L13 45 L13 36 L6 37 L5 12 Z',
  puffer: 'M14 6 Q24 2 34 6 L45 14 L44 35 L37 34 Q39 40 36 45 L12 45 Q9 40 11 34 L4 35 L3 14 Z',
  sock: `M20 3 L29 3 L29 24 L37 29 Q41 36 34 38 L23 38 Q18 37 20 31 Z ${SOCK}`,
  undies: 'M7 14 L41 14 L39 24 Q30 27 27 37 L21 37 Q18 27 9 24 Z',
  towel: 'M6 12 Q24 10 42 12 L42 38 Q24 40 6 38 Z',
  curtain: 'M8 9 L40 9 Q43 26 42 44 L6 44 Q5 26 8 9 Z',
  duvet: 'M5 10 Q24 4 43 10 Q47 24 43 38 Q24 44 5 38 Q1 24 5 10 Z',
  sheet: 'M6 15 L10 15 L10 6 L32 6 L32 15 L42 15 L42 41 L6 41 Z',
  rag: 'M8 10 L14 8 L20 11 L27 8 L34 10 L40 8 L39 16 L41 23 L38 30 L40 38 L33 39 L27 37 L20 40 L13 38 L7 39 L9 31 L6 24 L9 17 Z',
};

/** Seams, collars, pockets and folds, drawn thin over the fill. */
const DETAIL: Record<Kind, string> = {
  tee: 'M19 9 Q24 14 29 9',
  shirt: 'M17 6 L21 13 L24 10 L27 13 L31 6 M24 10 L24 43',
  hoodie: 'M19 11 Q24 17 29 11 M17 33 L31 33 L33 41 L15 41 Z',
  trousers: 'M13 9 L35 9 M24 9 L24 17',
  jeans: 'M13 9 L35 9 M24 9 L24 17 M15 9 Q17 15 21 13 M33 9 Q31 15 27 13',
  jacket: 'M24 9 L24 45 M16 5 L20 14 L24 9 L28 14 L32 5 M15 30 L21 30 M27 30 L33 30',
  puffer: 'M4 20 Q24 17 44 20 M4 27 Q24 24 44 27 M11 34 Q24 31 37 34 M12 40 Q24 38 36 40 M24 5 L24 45',
  sock: 'M13 11 L22 11',
  undies: 'M7 18 L41 18',
  towel: 'M6 30 Q24 32 42 30 M6 34 Q24 36 42 34',
  curtain: 'M14 9 Q12 26 13 44 M21 9 Q19 26 20 44 M28 9 Q30 26 29 44 M35 9 Q37 26 36 44',
  duvet: 'M3 24 Q24 21 45 24 M24 7 Q22 24 24 41',
  sheet: 'M6 23 L42 23 M6 32 L42 32 M10 15 L32 15',
  rag: 'M12 14 L16 18 M30 13 L33 17 M14 32 L18 29 M31 33 L35 30',
};

/** The curtain hangs from rings, drawn above the outline. */
const CURTAIN_RINGS = [11, 18, 25, 32, 39];

const TINT_FILL: Partial<Record<ItemOutcome['tint'], string>> = {
  pink: ui.bleedPink,
  greyBlue: ui.dyeGreyBlue,
};

interface Props {
  def: ItemDef;
  size: number;
  outcome?: ItemOutcome;
  className?: string;
}

export function ItemSprite({ def, size, outcome, className }: Props) {
  const kind = kindOf(def.id);
  const colors = itemColors[def.id] ?? { fill: '#CCCCCC' };
  const tintFill = outcome ? TINT_FILL[outcome.tint] : undefined;
  const fill = tintFill ?? colors.fill;
  const dark = def.tier === 'dark';
  const clip = `clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const lost = outcome?.shape === 'lost';
  const stretched = outcome?.shape === 'stretched';

  // A lost underwear leaves only an empty peg (drawn by the clothesline); a lost pair of
  // socks leaves one lone sock (GDD 11, 13.6).
  if (lost && kind === 'undies') {
    return <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="item-sprite" />;
  }
  const body = lost && kind === 'sock' ? SOCK : BODY[kind];
  const classes = ['item-sprite', stretched && 'stretched', className].filter(Boolean).join(' ');

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={classes} style={{ overflow: 'visible' }}>
      <defs>
        <clipPath id={clip}><path d={body} /></clipPath>
      </defs>
      {outcome?.ruined && <circle className="ruined-ring" cx="24" cy="24" r="26" fill="none" stroke={ui.accent} strokeWidth="2.5" />}
      {kind === 'curtain' && (
        <g fill="none" stroke={ui.outline} strokeWidth="1.5">
          {CURTAIN_RINGS.map((x) => <circle key={x} cx={x} cy="7" r="2.2" />)}
        </g>
      )}
      <path d={body} fill={fill} />
      <g clipPath={`url(#${clip})`}>
        {colors.stripe && !tintFill && (
          <g stroke={colors.stripe} strokeWidth="2.5">
            {[10, 17, 24, 31, 38].map((x) => <line key={x} x1={x} y1="0" x2={x} y2="48" />)}
          </g>
        )}
        {def.hygiene === 'dirty' && (
          // Dirty items read as dirty before washing (GDD 5.4).
          <g fill={ui.dirtMark} opacity="0.55">
            <ellipse cx="17" cy="30" rx="6" ry="3.5" transform="rotate(-20 17 30)" />
            <ellipse cx="31" cy="19" rx="4" ry="2.5" transform="rotate(15 31 19)" />
            <circle cx="28" cy="35" r="1.8" />
          </g>
        )}
        {outcome?.tint === 'smudged' && (
          <g fill={ui.smudgeGrey} opacity="0.6">
            <ellipse cx="18" cy="22" rx="10" ry="6" /><ellipse cx="31" cy="34" rx="9" ry="5" /><ellipse cx="33" cy="14" rx="5" ry="3" />
          </g>
        )}
        {outcome?.tint === 'stained' && (
          <g fill={ui.stain} opacity="0.85">
            <path d="M15 22 q3 -4 6 0 q2 4 -2 5 q-5 1 -4 -5 Z" />
            <circle cx="30" cy="32" r="3.2" /><circle cx="27" cy="17" r="2.4" /><circle cx="20" cy="36" r="1.8" />
          </g>
        )}
        {outcome?.tint === 'lint' && (
          <g fill="#FFFFFF">
            {[[16, 18], [28, 22], [21, 30], [32, 34], [18, 38], [26, 13], [35, 16], [12, 27]].map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" />
            ))}
          </g>
        )}
      </g>
      <path d={DETAIL[kind]} fill="none" stroke={ui.outline} strokeOpacity="0.55" strokeWidth="1.2"
        strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#${clip})`} />
      <path d={body} fill="none" stroke={ui.outline} strokeWidth={dark ? 3 : 1.5} strokeLinejoin="round" />
      {dark && (
        <path d={body} fill="none" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1"
          strokeLinejoin="round" transform="translate(24 24) scale(0.86) translate(-24 -24)" />
      )}
      {def.id === 'sock_worn_navy' && (
        <g fill="none" stroke={ui.outline} strokeWidth="1.3" strokeLinecap="round" opacity="0.7">
          <path d="M39 15 q-2 -3 0 -6 q2 -3 0 -6" /><path d="M44 17 q-2 -3 0 -6 q2 -3 0 -6" />
        </g>
      )}
    </svg>
  );
}

/** A mesh laundry bag (GDD 5.3, 6.4). Dots show capacity: one filled dot per item inside. */
export function BagSprite({ size, filled, slots, contents = [] }: {
  size: number; filled: number; slots: number; contents?: string[];
}) {
  const clip = `bag-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const body = 'M11 14 Q24 10 37 14 L40 40 Q24 46 8 40 Z';
  const dotXs = [16, 24, 32];
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="item-sprite">
      <defs><clipPath id={clip}><path d={body} /></clipPath></defs>
      <path d={body} fill={ui.bagFill} />
      <g clipPath={`url(#${clip})`} stroke={ui.outline} strokeOpacity="0.3" strokeWidth="0.8">
        {[-8, 0, 8, 16, 24, 32, 40, 48].map((x) => <line key={`a${x}`} x1={x} y1="10" x2={x + 20} y2="48" />)}
        {[-8, 0, 8, 16, 24, 32, 40, 48].map((x) => <line key={`b${x}`} x1={x + 20} y1="10" x2={x} y2="48" />)}
      </g>
      {Array.from({ length: slots }, (_, i) => {
        const x = dotXs[i % 3]!;
        const y = 24 + Math.floor(i / 3) * 9;
        const color = contents[i];
        return i < filled
          ? <circle key={i} cx={x} cy={y} r="3.4" fill={color ?? ui.outline} stroke={ui.outline} strokeWidth="1" />
          : <circle key={i} cx={x} cy={y} r="3" fill="none" stroke={ui.outline} strokeOpacity="0.35" strokeWidth="1" />;
      })}
      <path d={body} fill="none" stroke={ui.outline} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M11 14 Q24 5 37 14" fill="none" stroke={ui.outline} strokeWidth="1.5" />
      <circle cx="24" cy="9" r="1.8" fill={ui.accent} stroke={ui.outline} strokeWidth="1" />
    </svg>
  );
}
