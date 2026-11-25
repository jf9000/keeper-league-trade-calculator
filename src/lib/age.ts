import type { Player } from '../types'
import { AGE_CURVE, FIRST_AGE } from './ageCurves'

/** Ages outside this range are treated as bad data. */
export const MIN_AGE = 18
export const MAX_AGE = 50

/**
 * The share (0-1) of his keeper value a player keeps at his age; 1 when his age is unknown, before the decline
 * starts, or for kickers and defenses. The curve per position is fitted from past seasons (see
 * scripts/fit-age.ts and src/lib/ageCurves.ts): value kept at each age relative to players aged 24-26.
 */
export function ageFactor(p: Pick<Player, 'pos' | 'age'>): number {
  const curve = p.pos === 'QB' || p.pos === 'RB' || p.pos === 'WR' || p.pos === 'TE' ? AGE_CURVE[p.pos] : undefined
  if (!curve || p.age == null) return 1
  const i = Math.min(curve.length - 1, Math.max(0, p.age - FIRST_AGE))
  return curve[i] ?? 1
}

/** Reads Sleeper's `age`, or works it out from `birth_date`, as whole years on `now`; undefined if neither is usable. */
export function parseAge(age?: number | null, birthDate?: string | null, now: Date = new Date()): number | undefined {
  if (typeof age === 'number' && Number.isFinite(age) && age >= MIN_AGE && age <= MAX_AGE) return Math.floor(age)
  if (birthDate) {
    const born = new Date(`${birthDate}T00:00:00Z`)
    if (!Number.isNaN(born.getTime())) {
      let years = now.getUTCFullYear() - born.getUTCFullYear()
      const hadBirthday =
        now.getUTCMonth() > born.getUTCMonth() ||
        (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() >= born.getUTCDate())
      if (!hadBirthday) years--
      if (years >= MIN_AGE && years <= MAX_AGE) return years
    }
  }
  return undefined
}
