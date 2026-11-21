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

/** Short label for a position chip. */
export const POS_LABEL: Record<Pos, string> = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', DEF: 'D/ST' }
