import type { Pos } from '../types'

/** Tailwind text color per position (full class names so the compiler sees them). */
export const POS_COLOR: Record<Pos, string> = {
  QB: 'text-qb',
  RB: 'text-rb',
  WR: 'text-wr',
  TE: 'text-te',
  K: 'text-k',
  DEF: 'text-def',
}

/** Tinted background and matching text per position, for tags and tiles. */
export const POS_TINT: Record<Pos, string> = {
  QB: 'bg-qb-bg text-qb',
  RB: 'bg-rb-bg text-rb',
  WR: 'bg-wr-bg text-wr',
  TE: 'bg-te-bg text-te',
  K: 'bg-k-bg text-k',
  DEF: 'bg-def-bg text-def',
}

/** Short label for a position chip. */
export const POS_LABEL: Record<Pos, string> = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', DEF: 'D/ST' }
