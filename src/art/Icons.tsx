// Rulebook icons and tutorial card illustrations (GDD 10.1, 10.2): icons plus at most one caption.
// Items are drawn with the same sprites as in play so the player recognises them.
import type { ReactNode } from 'react';
import { content } from '../content';
import type { ItemOutcome } from '../engine';
import { BagSprite, ItemSprite } from './ItemSprite';
import { ui } from './palette';

function Item({ id, size = 44, outcome }: { id: string; size?: number; outcome?: ItemOutcome }) {
  return <ItemSprite def={content.itemsById[id]!} size={size} outcome={outcome} />;
}

function Drop({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 Q19 12 18 16 A6 6 0 0 1 6 16 Q5 12 12 3 Z" fill="#E0302A" stroke={ui.outline} strokeWidth="1.5" />
    </svg>
  );
}

function Cross({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5 L19 19 M19 5 L5 19" stroke={ui.ringOver} strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

function Arrow({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12 L19 12 M13 6 L19 12 L13 18" stroke={ui.outline} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Two clearly separate groups: light on the left, dark on the right. */
function Apart({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <span className="apart">
      <span className="group light">{left}</span>
      <span className="divider" aria-hidden="true" />
      <span className="group dark">{right}</span>
    </span>
  );
}

/** A drum with the ring zones: light, good (70 to 90%), tight, overfull. */
function DrumZones({ size = 72 }: { size?: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const arc = (from: number, to: number, color: string) => (
    <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="7"
      strokeDasharray={`${(to - from) * c} ${c}`} strokeDashoffset={-from * c} transform="rotate(-90 36 36)" />
  );
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r="24" fill={ui.panel} stroke={ui.outline} strokeWidth="2" />
      {arc(0, 0.7, ui.ringLight)}
      {arc(0.7, 0.9, ui.ringGood)}
      {arc(0.9, 1, ui.ringTight)}
    </svg>
  );
}

/** A dry pile in a filled drum, then the same pile bigger: wet clothes swell. Never says which ones. */
function Swelling() {
  return (
    <svg width="220" height="100" viewBox="0 0 220 100" aria-hidden="true">
      {[{ x: 50, k: 1 }, { x: 170, k: 1.35 }].map(({ x, k }) => (
        <g key={x}>
          <circle cx={x} cy="50" r="42" fill={ui.panel} stroke="#E8F3F2" strokeWidth="5" />
          <g transform={`translate(${x} 54) scale(${k})`} fill="#BCD7F2" stroke={ui.outline} strokeWidth="1.5">
            <ellipse cx="-12" cy="4" rx="14" ry="10" />
            <ellipse cx="12" cy="6" rx="13" ry="9" />
            <ellipse cx="0" cy="-10" rx="15" ry="10" />
          </g>
        </g>
      ))}
      <path d="M100 50 L122 50 M114 42 L122 50 L114 58" stroke={ui.outline} strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

const PINK: ItemOutcome = { shape: 'normal', tint: 'pink', ruined: false, ballooned: false };

/** Rulebook line icons by name (rulebook.json). */
export function RuleIcon({ name }: { name: string }) {
  switch (name) {
    case 'shirt_light': return <Item id="shirt_white" />;
    case 'shirt_dark': return <Item id="shirt_black" />;
    case 'tee_red': return <Item id="tee_red" />;
    case 'drop': return <Drop />;
    case 'drum_zones': return <DrumZones />;
    case 'towel': return <Item id="towel_white" />;
    case 'sheet': return <Item id="sheet_white" />;
    case 'color_groups': return <Apart left={<Item id="tee_white" size={32} />} right={<Item id="tee_black" size={32} />} />;
    case 'rag': return <Item id="rag_grey" />;
    case 'cross': return <Cross />;
    case 'clean_clothes': return <Item id="tee_white" />;
    case 'sock': return <Item id="sock_white" />;
    case 'underwear': return <Item id="undies_white" />;
    case 'bag': return <BagSprite size={44} filled={2} slots={6} contents={['#FFFFFF', '#FFFFFF']} />;
    default: throw new Error(`unknown rulebook icon ${name}`);
  }
}

/** One illustration per tutorial card (cards.json `illustration`). */
export function CardIllustration({ id }: { id: string }) {
  switch (id) {
    case 't1_sort':
      return <Apart left={<><Item id="shirt_white" /><Item id="tee_mint" /></>} right={<><Item id="tee_black" /><Item id="tee_grey" /></>} />;
    case 't1_bleed':
      return <span className="row"><Item id="tee_red" size={56} /><Drop size={32} /><Arrow /><Item id="tee_white" size={56} outcome={PINK} /></span>;
    case 't2_size':
      return <Swelling />;
    case 't3_household':
      return <Apart left={<><Item id="towel_white" /><Item id="sheet_white" /><Item id="tee_white" size={32} /></>}
        right={<><Item id="towel_navy" /><Item id="sheet_dark" /><Item id="tee_black" size={32} /></>} />;
    case 't3_rags':
      return <span className="row"><Item id="rag_grey" size={56} /><Item id="rag_blue" size={44} /><Cross size={36} /><Item id="tee_white" size={56} /></span>;
    case 't4_bags':
      return <span className="row"><Item id="sock_white" /><Item id="undies_white" /><Arrow /><BagSprite size={64} filled={2} slots={6} contents={['#FFFFFF', '#FFFFFF']} /></span>;
    default: throw new Error(`unknown card illustration ${id}`);
  }
}
