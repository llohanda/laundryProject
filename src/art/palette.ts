// Palette (GDD 18). Item colors are placeholders until the art pass in M7.
export const ui = {
  teal: '#26B3AE',
  panel: '#0B4F55',
  accent: '#FF8F85',
  outline: '#073A40',
  bleedPink: '#E5338F',
  dyeGreyBlue: '#7A8FA8',
  smudgeGrey: '#6E6E6E',
} as const;

export interface ItemColors { fill: string; stripe?: string; }

const WHITE = '#FFFFFF';
const BLACK = '#26282B';
const NAVY = '#1F2D5C';

export const itemColors: Record<string, ItemColors> = {
  tee_white: { fill: WHITE },
  tee_mint: { fill: '#BDEBD3' },
  tee_beige: { fill: '#E9DCC6' },
  tee_black: { fill: BLACK },
  tee_grey: { fill: '#80868C' },
  tee_red: { fill: '#E0302A' },
  shirt_white: { fill: WHITE },
  shirt_pastel_yellow: { fill: '#F7E58F' },
  shirt_pastel_blue: { fill: '#BCD7F2' },
  shirt_black: { fill: BLACK },
  shirt_navy: { fill: NAVY },
  shirt_striped: { fill: NAVY, stripe: WHITE },
  trousers_black: { fill: BLACK },
  hoodie_white: { fill: WHITE },
  hoodie_navy: { fill: NAVY },
  jeans_blue: { fill: '#3B5C9E' },
  jeans_lightwash: { fill: '#8DAED6' },
  jacket_white: { fill: '#F2F2EE' },
  jacket_navy: { fill: NAVY },
  puffer_navy: { fill: NAVY },
  towel_white: { fill: WHITE },
  towel_pastel: { fill: '#F5C7D1' },
  towel_navy: { fill: NAVY },
  towel_red: { fill: '#D92B2B' },
  curtain_dark: { fill: '#3A3F4B' },
  duvet_white: { fill: WHITE },
  sheet_white: { fill: WHITE },
  sheet_dark: { fill: '#33404F' },
  rag_grey: { fill: '#9A9A9A' },
  rag_blue: { fill: '#5A7DB5' },
  rag_white: { fill: '#F4F4F0' },
  sock_white: { fill: WHITE },
  sock_black: { fill: BLACK },
  sock_worn_navy: { fill: NAVY },
  undies_white: { fill: WHITE },
  undies_black: { fill: BLACK },
};
