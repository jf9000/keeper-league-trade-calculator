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

/**
 * Games a player with each designation is expected to miss from now. Tunable guesses (nothing in the archive
 * records injuries to fit them): IR is at least four games and often the season, "Out" is a game or three,
 * "Questionable" usually plays.
 */
export const EXPECTED_WEEKS_OUT: Record<Injury, number> = { IR: 5, PUP: 4, Out: 2, Susp: 2, Doubtful: 1, Questionable: 0.3 }

/** Fantasy championships are usually played in week 17, so that's where "the rest of this season" ends. */
export const FANTASY_SEASON_WEEKS = 17

/** Weeks of fantasy season still to play after `through` weeks of stats (at least 1), not counting a bye week. */
export const weeksLeftAfter = (through: number, bye?: number): number => {
  const left = FANTASY_SEASON_WEEKS - through
  const hasBye = bye !== undefined && bye > through && bye <= FANTASY_SEASON_WEEKS
  return Math.max(1, hasBye ? left - 1 : left)
}

/** Even a long-term injury keeps a sliver of value (he can come back for the playoffs, or be a trade chip). */
export const MIN_INJURY_FACTOR = 0.05

/**
 * The share of this season's value a player keeps given his injury designation (1 when healthy). With the weeks
 * left known, it's the share of the remaining season he's expected to be available, so the same injury costs
 * more late in the year than early. Without them, a flat per-designation share.
 */
export function injuryFactor(p: Pick<Player, 'inj' | 'weeksLeft'>): number {
  if (!p.inj) return 1
  if (p.weeksLeft == null) return INJURY_FACTOR[p.inj]
  return Math.max(MIN_INJURY_FACTOR, 1 - Math.min(1, EXPECTED_WEEKS_OUT[p.inj] / Math.max(1, p.weeksLeft)))
}

/** Stamps each injured player's weeks left in the season (less his team's bye, when known), once, as the data loads. */
export function withWeeksLeft<T extends { statsThrough?: number; byes?: Record<string, number>; players: Player[] }>(file: T): T {
  const through = file.statsThrough
  if (through == null) return file
  return {
    ...file,
    players: file.players.map((p) => (p.inj ? { ...p, weeksLeft: weeksLeftAfter(through, file.byes?.[p.team]) } : p)),
  }
}

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

/** A short flag when a player has missed enough to matter, otherwise null. */
export function gamesNote(p: Pick<Player, 'stats'>, through?: number): string | null {
  if (!through || !p.stats || through < 4) return null
  return availability(p, through) < LOW_AVAILABILITY ? 'Missed a lot of games' : null
}
