import type { Player, Pos } from '../types'

/**
 * How a player's keeper value ages. From `from` on, each year of age takes `perYear` off the share of his
 * value he keeps, down to a floor. Before `from`, age doesn't matter. Tunable guesses: running backs fall off
 * first, receivers and tight ends later, quarterbacks last. Kickers and defenses don't age here.
 */
export const AGE_DECLINE: Partial<Record<Pos, { from: number; perYear: number; floor: number }>> = {
  RB: { from: 27, perYear: 0.08, floor: 0.35 },
  WR: { from: 30, perYear: 0.07, floor: 0.35 },
  TE: { from: 30, perYear: 0.07, floor: 0.35 },
  QB: { from: 35, perYear: 0.06, floor: 0.4 },
}

/** Ages outside this range are treated as bad data. */
export const MIN_AGE = 18
export const MAX_AGE = 50

/** The share (0–1) of his keeper value a player keeps at his age; 1 when his age is unknown or hasn't started to matter. */
export function ageFactor(p: Pick<Player, 'pos' | 'age'>): number {
  const d = AGE_DECLINE[p.pos]
  if (!d || p.age == null || p.age < d.from) return 1
  return Math.max(d.floor, 1 - d.perYear * (p.age - d.from + 1))
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
