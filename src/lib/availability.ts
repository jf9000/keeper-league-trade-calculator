import type { Injury, Player } from '../types'

/**
 * How much a player's points per game are trusted when he has missed games, 0–1. At 0.5, a player who has
 * played none of the games possible is ranked as if he scored half his per-game rate; one who played them all
 * is ranked on his full rate.
 */
export const AVAIL_PENALTY = 0.5

/**
 * What share of his usual this-season value a player keeps while carrying each injury designation.
 * Tunable guesses: IR means at least four weeks out and often the whole season, while "Questionable" is
 * usually a game-time decision that costs little.
 */
export const INJURY_FACTOR: Record<Injury, number> = {
  IR: 0.25,
  PUP: 0.3,
  Out: 0.6,
  Susp: 0.7,
  Doubtful: 0.85,
  Questionable: 0.95,
}

/** Injuries serious enough to point out in a trade's notes. */
export const SERIOUS_INJURY = 0.85

export const INJURY_LABEL: Record<Injury, string> = {
  IR: 'injured reserve',
  PUP: 'on the PUP list',
  Out: 'out',
  Susp: 'suspended',
  Doubtful: 'doubtful',
  Questionable: 'questionable',
}

/** Short tag for a chip. */
export const INJURY_TAG: Record<Injury, string> = { IR: 'IR', PUP: 'PUP', Out: 'OUT', Susp: 'SUSP', Doubtful: 'D', Questionable: 'Q' }

/** Reads Sleeper's `injury_status` and roster `status` into one designation, or undefined when he's healthy. */
export function parseInjury(injuryStatus?: string | null, status?: string | null): Injury | undefined {
  const norm = (v?: string | null) => (v ?? '').trim().toLowerCase()
  const i = norm(injuryStatus)
  const s = norm(status)
  if (i === 'ir' || i === 'injured reserve' || s === 'injured reserve') return 'IR'
  if (i === 'pup' || i === 'physically unable to perform') return 'PUP'
  if (i === 'out') return 'Out'
  if (i === 'sus' || i === 'suspended' || s === 'suspended') return 'Susp'
  if (i === 'doubtful') return 'Doubtful'
  if (i === 'questionable') return 'Questionable'
  return undefined
}

/** The share of this season's value a player keeps given his injury designation (1 when healthy). */
export const injuryFactor = (p: Pick<Player, 'inj'>): number => (p.inj ? INJURY_FACTOR[p.inj] : 1)

/** Games a player could have played by `through` weeks, allowing for one bye. */
export const gamesPossible = (through: number): number => Math.max(1, through - 1)

/** The share (0–1) of possible games a player has played so far; 1 when it isn't known. */
export function availability(p: Pick<Player, 'stats'>, through?: number): number {
  if (!through || !p.stats) return 1
  return Math.min(1, p.stats.gp / gamesPossible(through))
}

/** Points per game scaled down for missed games, so a hot four-game stretch doesn't outrank a full season. */
export const availabilityAdjusted = (ppg: number, avail: number): number => ppg * (1 - AVAIL_PENALTY * (1 - avail))

/** Below this share of possible games, a player's availability is worth pointing out. */
export const LOW_AVAILABILITY = 0.7

/** "Played 4 of 10 games" when a player has missed enough to matter, otherwise null. */
export function gamesNote(p: Pick<Player, 'stats'>, through?: number): string | null {
  if (!through || !p.stats || through < 4) return null
  const possible = gamesPossible(through)
  return availability(p, through) < LOW_AVAILABILITY ? `Played ${Math.min(p.stats.gp, possible)} of ${possible} games` : null
}
