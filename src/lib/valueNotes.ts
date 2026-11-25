import { ageFactor } from './age'
import { injuryFactor } from './availability'
import { pointsPerGame } from './current'
import { nameList, pickSlotFor, pickValue, projectedNextAdp, type EvalItem } from './valuation'
import type { Injury, Player, Settings } from '../types'

/** Short plain-language readings of a player's redraft and keeper values, shaped by the league's settings. */

export interface ValueNotes {
  redraft: string
  /** How an injury cuts what he does for a lineup this season, or null when he's healthy. */
  availability: string | null
  keeper: string
}

/** Same player and bracket always read the same way, but different players vary, so a list doesn't repeat itself. */
function pick<T>(options: readonly T[], seed: string): T {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return options[h % options.length]!
}

/** The draft round whose slot a redraft value is worth (inverse of `pickValue`), or null when it's worth almost nothing. */
export function worthRound(value: number, teams: number): number | null {
  if (value < 1) return null
  const slot = pickSlotFor(value)
  return Math.max(1, Math.ceil(slot / teams))
}

const ordinal = (n: number) => `round ${n}`

function redraftLine(name: string, v: number, s: Settings, seed: string): string {
  const r = worthRound(v, s.teams)
  if (r === null || v < 3) {
    return pick(
      [`${name} has little redraft value.`, `${name} wouldn’t be drafted for his play this season.`, `${name} is barely a redraft pick.`],
      seed,
    )
  }
  if (r === 1 && v >= pickValue(Math.max(2, Math.round(s.teams / 3)))) {
    return pick(
      [
        `${name} is a top pick: elite this season.`,
        `${name} would go among the first picks in a redraft.`,
        `${name} is a premium, first-tier redraft pick.`,
      ],
      seed,
    )
  }
  if (r <= 2) {
    return pick(
      [
        `${name} is a valuable early-round pick.`,
        `${name} would go in the first two rounds of a redraft.`,
        `${name} is worth an early pick this season.`,
      ],
      seed,
    )
  }
  if (r <= 5) {
    return pick(
      [
        `${name} is a solid mid-round pick.`,
        `${name} is worth about a ${ordinal(r)} pick this season.`,
        `${name} would be drafted around ${ordinal(r)}.`,
      ],
      seed,
    )
  }
  if (r <= 9) {
    return pick(
      [`${name} is a late-middle-round pick.`, `${name} is worth about a ${ordinal(r)} pick.`, `${name} is a depth-level redraft pick.`],
      seed,
    )
  }
  return pick([`${name} is a late-round flier.`, `${name} is only worth a very late pick.`, `${name} is a deep-bench redraft pick.`], seed)
}

/** Folds a clause into the end of a sentence: "X is a pick." + ", especially in superflex" -> "X is a pick, especially in superflex." */
const fold = (sentence: string, clause: string | null) => (clause ? sentence.replace(/\.$/, `${clause}.`) : sentence)

/** A clause about the league settings or his situation that explains the number, worded for a high or low value. */
function redraftClause(it: EvalItem, s: Settings, high: boolean, seed: string): string | null {
  const p = it.player!
  if (p.pos === 'K' || p.pos === 'DEF') return ', scaled down because they’re easy to replace'
  if (p.pos === 'QB' && s.superflex) {
    return high
      ? pick([', especially in superflex', ', and superflex pushes QBs even higher', ', a price superflex drives up'], seed)
      : pick([', even with superflex lifting QBs', ', though superflex keeps QBs in demand'], seed)
  }
  const ppg = pointsPerGame(p, s)
  if (ppg !== null && p.curAdp != null) return high ? `, backed by ${ppg.toFixed(1)} ppg this season` : `, with ${ppg.toFixed(1)} ppg this season factored in`
  // Scoring is only mentioned when receptions score, and only for the players it helps.
  if (s.scoring !== 'std' && (p.pos === 'WR' || p.pos === 'TE' || p.pos === 'RB')) {
    return s.scoring === 'ppr' ? ', with PPR lifting pass-catchers' : ', with half-PPR scoring helping pass-catchers'
  }
  return null
}

/** The notes show in parentheses, so they drop the closing period. */
const noStop = (sentence: string) => sentence.replace(/\.$/, '')

/** How many rounds cheaper the round he costs is than the round he projects as next year (0 or less: no real bargain). */
function roundsSaved(it: EvalItem, round: number, s: Settings): number {
  const eq = Math.max(1, Math.ceil(Math.round(projectedNextAdp(it.player!, s)) / s.teams)) // whole pick first, like the label
  return round - eq
}

function keeperLine(name: string, it: EvalItem, round: number, s: Settings, seed: string): string {
  const v = it.value
  // Who is ahead of him, when something blocks him from being kept.
  const ahead = nameList(it.keptInstead ?? [])
  const one = (it.keptInstead?.length ?? 0) === 1
  switch (it.blocked) {
    case 'no-surplus':
      return pick(
        [
          `${name} costs more than he’s worth to keep.`,
          `Keeping ${name} in round ${round} costs more than he’d be redrafted as.`,
          `${name} has no keeper surplus at round ${round}.`,
        ],
        seed,
      )
    case 'extra-qb':
      return pick([`${name} can’t be kept alongside ${ahead}.`, `One-QB rule: ${ahead} ranks ahead of ${name} for the QB spot.`], seed)
    case 'over-limit':
      return pick(
        [
          `Only ${s.keepers} keeper${s.keepers === 1 ? '' : 's'} each, and ${ahead} ${one ? 'ranks' : 'rank'} ahead, so ${name}’s value is cut.`,
          `${name} is outside the ${s.keepers}-keeper limit behind ${ahead}, so he’s discounted.`,
        ],
        seed,
      )
    case 'no-pick':
      return pick([`There’s no round ${round} pick to keep ${name} with.`, `${name} can’t be kept without a round ${round} pick.`], seed)
    case 'pick-taken':
      return pick(
        [
          `${ahead} already ${one ? 'uses' : 'use'} the round ${round} pick.`,
          `Round ${round} is spoken for by ${ahead}, so ${name} loses keeper value.`,
        ],
        seed,
      )
  }
  // The size of the bargain in rounds: the round he projects as next year against the round he costs. Rounds are what
  // people think in, and raw value understates late-round gains because late picks are worth so little.
  const saved = roundsSaved(it, round, s)
  const eq = round - saved
  if (v < 1 || saved <= 0) {
    return pick(
      [
        `${name} costs about what he’d be redrafted as.`,
        `Round ${round} is about what ${name} is worth, so there’s little surplus.`,
        `Keeping ${name} saves almost nothing over drafting him.`,
      ],
      seed,
    )
  }
  if (saved <= 2) {
    return pick(
      [
        `Keeping ${name} in round ${round} is a small bargain: he projects as about a round ${eq} pick.`,
        `${name} costs a bit less than he’s worth: about a round ${eq} pick, kept in round ${round}.`,
      ],
      seed,
    )
  }
  if (saved <= 4) {
    return pick(
      [
        `${name} is a good keeper: he projects as about a round ${eq} pick and costs round ${round}.`,
        `Round ${round} undersells ${name}, who projects as about a round ${eq} pick.`,
      ],
      seed,
    )
  }
  return pick(
    [
      `${name} is a steal at round ${round}: he projects as about a round ${eq} pick.`,
      `Keeping ${name} in round ${round} is a big bargain: he projects as about a round ${eq} pick.`,
    ],
    seed,
  )
}

/**
 * Age is only mentioned after a bargain ("..., though age discounts him"). On a line that already says there's little
 * or no surplus, "though" contradicts the sentence, and the age discount is already in the number.
 */
function keeperClause(it: EvalItem, round: number, s: Settings): string | null {
  const p = it.player!
  if (it.blocked || ageFactor(p) >= 1 || it.value < 1 || roundsSaved(it, round, s) <= 0) return null
  return `, though age discounts him${p.age != null ? ` (${p.age} y/o)` : ''}`
}

const STATUS: Record<Injury, string> = {
  IR: 'is on injured reserve',
  PUP: 'is on the PUP list',
  Out: 'is out',
  Susp: 'is suspended',
  Doubtful: 'is doubtful',
  Questionable: 'is questionable',
}
const OUTLOOK: Record<Injury, string> = {
  IR: 'expected to miss extended time',
  PUP: 'expected to miss extended time',
  Out: 'expected to miss time',
  Susp: 'expected to miss time',
  Doubtful: 'likely to miss time',
  Questionable: 'usually plays',
}

/**
 * What an injury does to a player's value in a lineup this season, in general terms (no weeks or percentages, which
 * are estimates). It's separate from his redraft value, which is where he'd be taken, and from his keeper value,
 * which looks to next season: neither changes.
 */
export function availabilityLine(p: Player): string | null {
  const f = injuryFactor(p)
  if (!p.inj || f >= 1) return null
  const effect =
    p.inj === 'Questionable'
      ? 'it barely changes his value'
      : p.inj === 'Doubtful'
        ? 'he adds a little less to a lineup'
        : f < 0.3
          ? 'he adds very little to a lineup'
          : 'he adds less to a lineup'
  return `${p.name} ${STATUS[p.inj]} and ${p.inj === 'Questionable' ? '' : 'is '}${OUTLOOK[p.inj]}, so ${effect} this season`
}

/** Redraft and keeper readings for a player asset, or null for anything else. */
export function valueNotes(it: EvalItem, keeperRound: number, s: Settings): ValueNotes | null {
  const p = it.player
  if (!p) return null
  const name = p.name
  const v = it.redraft ?? 0
  const high = (worthRound(v, s.teams) ?? 99) <= 5
  return {
    redraft: noStop(fold(redraftLine(name, v, s, `${p.id}r`), redraftClause(it, s, high, `${p.id}c`))),
    keeper: noStop(fold(keeperLine(name, it, keeperRound, s, `${p.id}k`), keeperClause(it, keeperRound, s))),
    availability: availabilityLine(p),
  }
}
