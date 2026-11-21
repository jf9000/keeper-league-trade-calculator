import type { Asset, Player, Settings } from '../types'
import { bestLineup, lineupTotal, type Slot } from './lineup'

export const DEFAULT_SETTINGS: Settings = {
  teams: 12,
  keepers: 2,
  rounds: 17,
  scoring: 'ppr',
  superflex: true,
  oneQb: true,
  flex: 2,
}

/** Allowed ranges for numeric settings. */
export const LIMITS = {
  teams: { min: 4, max: 32 },
  keepers: { min: 1, max: 15 },
  rounds: { min: 5, max: 30 },
  flex: { min: 0, max: 6 },
} as const

/** Value multiplier applied to picks beyond the first upcoming draft year. */
export const FUTURE_PICK_DISCOUNT = 0.85
/** Value multiplier applied to keepers beyond the league's keeper limit. */
export const OVER_LIMIT_DISCOUNT = 0.25
/**
 * How much of a starting-lineup change (this season) counts toward a trade's value, next to
 * long-term keeper value. Below 1 because keeper value is what lasts.
 */
export const WIN_NOW_WEIGHT = 0.5
/** Trades closer than this (as a fraction of the larger side) count as fair. */
export const FAIR_THRESHOLD = 0.1

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** The NFL season "in progress": Jan–Feb still belong to the previous season. */
export function seasonFor(date: Date = new Date()): number {
  return date.getMonth() < 2 ? date.getFullYear() - 1 : date.getFullYear()
}

/** The three upcoming draft years that picks can be traded for. */
export function pickYears(season: number): [number, number, number] {
  return [season + 1, season + 2, season + 3]
}

/** Effective ADP for a player under the given settings. */
export function adpOf(p: Player, s: Settings): number {
  let a = s.superflex && p.sfAdp ? p.sfAdp : p.adp
  if (s.scoring === 'std') {
    if (p.pos === 'RB') a *= 0.95
    else if (p.pos === 'WR' || p.pos === 'TE') a *= 1.08
  }
  return Math.max(1, a)
}

/** Round each player was drafted in the loaded league, by player ID. */
export type KeeperCosts = ReadonlyMap<string, number>

/**
 * The round a player costs to keep. With a league's draft results, that's the round he was drafted
 * in (undrafted players cost the last round). Without them, it's estimated from ADP.
 */
export function defaultKeeperRound(p: Player, s: Settings, costs?: KeeperCosts): number {
  if (costs) return clamp(costs.get(p.id) ?? s.rounds, 1, s.rounds)
  return clamp(Math.ceil(adpOf(p, s) / s.teams), 1, s.rounds)
}

/** Value of the nth overall pick: exponential decay from 100. */
export const pickValue = (n: number) => 100 * Math.exp(-0.035 * (n - 1))

/** Middle-of-the-round overall pick number for a round. */
export const roundSlot = (round: number, s: Pick<Settings, 'teams'>) =>
  (round - 1) * s.teams + s.teams / 2

/** How many picks a team owns in each round of the upcoming draft (round → count). */
export type PickCounts = ReadonlyMap<number, number>

export interface EvalItem {
  asset: Asset
  player?: Player
  /** Raw surplus for player assets (before QB / keeper-limit adjustments). */
  surplus?: number
  /** The round it costs to keep a player. */
  round?: number
  value: number
  note: string
  /** Why a player wouldn't be kept at full value, if so. */
  blocked?: 'no-surplus' | 'extra-qb' | 'over-limit' | 'no-pick' | 'pick-taken'
}

/** Search budget for the keeper optimizer; real rosters finish far below it. */
const KEEPER_SEARCH_LIMIT = 200_000

/**
 * The best set of keepers: most total surplus, within the keeper limit, one QB (if that rule is on),
 * and no more keepers in a round than the team has picks in it (unlimited when `picks` is unknown).
 * Greedy by surplus isn't always right, since a better keeper can use up the only pick another needs
 * and block a combination worth more, so this searches with pruning and starts from the greedy answer.
 */
function chooseKeepers(cands: readonly EvalItem[], s: Settings, picks?: PickCounts): Set<EvalItem> {
  const sorted = [...cands].sort((a, b) => b.surplus! - a.surplus!)
  const n = sorted.length
  const prefix = [0]
  for (const c of sorted) prefix.push(prefix[prefix.length - 1]! + c.surplus!)

  const usedInRound = new Map<number, number>()
  const cur: number[] = []
  let best = -1
  let bestSet: number[] = []
  let nodes = 0

  const go = (i: number, total: number, hasQb: boolean) => {
    if (++nodes > KEEPER_SEARCH_LIMIT) return
    const room = s.keepers - cur.length
    if (i >= n || room <= 0) {
      if (total > best) {
        best = total
        bestSet = [...cur]
      }
      return
    }
    if (total + prefix[Math.min(n, i + room)]! - prefix[i]! <= best) return
    const it = sorted[i]!
    const round = it.round!
    const cap = picks ? (picks.get(round) ?? 0) : Infinity
    const isQb = s.oneQb && it.player!.pos === 'QB'
    if ((usedInRound.get(round) ?? 0) < cap && !(isQb && hasQb)) {
      usedInRound.set(round, (usedInRound.get(round) ?? 0) + 1)
      cur.push(i)
      go(i + 1, total + it.surplus!, hasQb || isQb)
      cur.pop()
      usedInRound.set(round, usedInRound.get(round)! - 1)
    }
    go(i + 1, total, hasQb)
  }
  go(0, 0, false)
  return new Set(bestSet.map((i) => sorted[i]!))
}

/**
 * Values one side of a trade. A pick is worth the pick value of its slot
 * (discounted for future years). A player is worth his surplus: value at
 * ADP minus the value of the round it costs to keep him. Then league rules
 * decide who can actually be kept: the keeper limit, one QB (optionally), and, when `picks`
 * (the team's picks in the upcoming draft) is given, a pick in the round each keeper costs, with
 * keepers competing for the same pick. Players who can't be kept keep a fraction of their value
 * (a QB beyond the first keeps none).
 */
export function evalSide(
  assets: Asset[],
  players: ReadonlyMap<string, Player>,
  s: Settings,
  firstPickYear: number,
  picks?: PickCounts,
): EvalItem[] {
  const items: EvalItem[] = []
  for (const asset of assets) {
    if (asset.t === 'k') {
      const discount = asset.year > firstPickYear ? FUTURE_PICK_DISCOUNT : 1
      items.push({ asset, value: pickValue(roundSlot(asset.round, s)) * discount, note: '' })
      continue
    }
    const player = players.get(asset.id)
    if (!player) continue // stale asset (player no longer in data)
    const surplus = Math.max(0, pickValue(adpOf(player, s)) - pickValue(roundSlot(asset.keeperRound, s)))
    items.push({
      asset,
      player,
      surplus,
      round: asset.keeperRound,
      value: surplus,
      note: surplus === 0 ? 'No surplus: costs more than he’s worth' : '',
      blocked: surplus === 0 ? 'no-surplus' : undefined,
    })
  }

  const candidates = items.filter((i) => i.player && i.surplus! > 0)
  const chosen = chooseKeepers(candidates, s, picks)
  // The one QB that counts: the one being kept, or else the best one on the roster.
  const qbs = candidates.filter((i) => i.player!.pos === 'QB').sort((a, b) => b.surplus! - a.surplus!)
  const theQb = qbs.find((i) => chosen.has(i)) ?? qbs[0]

  for (const i of candidates) {
    if (chosen.has(i)) continue
    if (s.oneQb && i.player!.pos === 'QB' && i !== theQb) {
      i.value = 0
      i.note = 'Extra QB: only one can be kept'
      i.blocked = 'extra-qb'
      continue
    }
    i.value = i.surplus! * OVER_LIMIT_DISCOUNT
    const round = i.round!
    const cap = picks ? (picks.get(round) ?? 0) : Infinity
    const taken = [...chosen].filter((c) => c.round === round).length
    if (cap === 0) {
      i.note = `No round ${round} pick: can’t be kept this year`
      i.blocked = 'no-pick'
    } else if (taken >= cap) {
      i.note = `Round ${round} pick goes to a better keeper`
      i.blocked = 'pick-taken'
    } else {
      i.note = 'Over keeper limit: heavily discounted'
      i.blocked = 'over-limit'
    }
  }
  return items
}

export const sumValues = (items: readonly EvalItem[]) => items.reduce((t, i) => t + i.value, 0)

/** Re-clamp assets after the league's round count changes. */
export function clampAssets(assets: Asset[], rounds: number): Asset[] {
  return assets.map((a) =>
    a.t === 'p'
      ? { ...a, keeperRound: clamp(a.keeperRound, 1, rounds) }
      : { ...a, round: clamp(a.round, 1, rounds) },
  )
}

export interface Flow {
  gets: number
  gives: number
}

/**
 * What one team receives and gives up, in value that accounts for its own roster.
 * With a roster and lineup, `gets`/`gives` blend long-term keeper value (`later`) with this season's
 * lineup strength (`now`, weighted by WIN_NOW_WEIGHT); otherwise they are just keeper value.
 */
export interface TeamTrade extends Flow {
  later?: Flow
  now?: Flow
}

/**
 * Kickers and D/ST go in the last rounds, so their raw ADP would make them look worthless even though
 * an empty slot scores nothing. Their lineup strength is measured from where those rounds start and
 * scaled down, since a replacement is always on the waiver wire.
 */
export const KD_ADP_OFFSET = 90
export const KD_STRENGTH_SCALE = 0.15

/** Strength a player adds to a starting lineup: the value of his draft slot. */
export const lineupStrength = (s: Settings) => (p: Player) => {
  const adp = adpOf(p, s)
  return p.pos === 'K' || p.pos === 'DEF'
    ? KD_STRENGTH_SCALE * pickValue(Math.max(1, adp - KD_ADP_OFFSET))
    : pickValue(adp)
}

/** A team's picks in the upcoming draft after giving up `removed` and receiving `added` picks. */
export function adjustPicks(counts: PickCounts, firstPickYear: number, removed: Asset[], added: Asset[]): Map<number, number> {
  const out = new Map(counts)
  for (const a of removed) {
    if (a.t === 'k' && a.year === firstPickYear) out.set(a.round, Math.max(0, (out.get(a.round) ?? 0) - 1))
  }
  for (const a of added) {
    if (a.t === 'k' && a.year === firstPickYear) out.set(a.round, (out.get(a.round) ?? 0) + 1)
  }
  return out
}

/** A team's keepers evaluated at each stage of a trade, with its picks changing along the way. */
export interface KeeperStates {
  before: EvalItem[]
  afterSend: EvalItem[]
  after: EvalItem[]
}

export function keeperStates(
  sent: Asset[],
  incoming: Asset[],
  roster: readonly Player[],
  players: ReadonlyMap<string, Player>,
  s: Settings,
  firstPickYear: number,
  costs?: KeeperCosts,
  picks?: PickCounts,
): KeeperStates {
  const base = new Map<string, Asset>()
  for (const p of roster) base.set(p.id, { t: 'p', id: p.id, keeperRound: defaultKeeperRound(p, s, costs) })
  const sentIds = new Set<string>()
  for (const a of sent) {
    if (a.t !== 'p') continue
    base.set(a.id, a) // the user's keeper round for a traded player wins over the default
    sentIds.add(a.id)
  }
  const remaining = [...base.values()].filter((a) => a.t === 'p' && !sentIds.has(a.id))
  const arriving = incoming.filter((a) => a.t === 'p')
  return {
    before: evalSide([...base.values()], players, s, firstPickYear, picks),
    afterSend: evalSide(remaining, players, s, firstPickYear, picks && adjustPicks(picks, firstPickYear, sent, [])),
    after: evalSide([...remaining, ...arriving], players, s, firstPickYear, picks && adjustPicks(picks, firstPickYear, sent, incoming)),
  }
}

/**
 * Evaluates one team's side of a trade against its whole roster.
 *
 * Keeper rules (the keeper limit, one-QB) apply to everything a team could keep, not just the
 * traded players. So an incoming keeper is worth only what it adds over the team's existing
 * keepers, and an outgoing one costs only what the team loses once the next-best keeper steps in.
 *
 *   gets  = keeper value after the trade − keeper value after just sending players out  (+ picks in)
 *   gives = keeper value before the trade − keeper value after just sending players out (+ picks out)
 *
 * Roster players who aren't part of the trade cost the round they were drafted in (`costs`), or
 * their ADP round when there are no draft results.
 * With an empty roster this reduces to valuing the traded assets on their own.
 *
 * Given the league's starting `slots`, the team's needs count too: the same gets/gives is computed on
 * the best lineup the roster can field, so a player who can't be kept (a second QB) but would start is
 * still worth something this season, and an incoming player at a stacked position adds little.
 */
export function evalTeam(
  sent: Asset[],
  incoming: Asset[],
  roster: readonly Player[],
  players: ReadonlyMap<string, Player>,
  s: Settings,
  firstPickYear: number,
  costs?: KeeperCosts,
  slots?: readonly Slot[],
  picks?: PickCounts,
): TeamTrade {
  const k = keeperStates(sent, incoming, roster, players, s, firstPickYear, costs, picks)
  const pickValueOf = (assets: Asset[]) =>
    sumValues(evalSide(assets.filter((a) => a.t === 'k'), players, s, firstPickYear))

  const later: Flow = {
    gets: sumValues(k.after) - sumValues(k.afterSend) + pickValueOf(incoming),
    gives: sumValues(k.before) - sumValues(k.afterSend) + pickValueOf(sent),
  }
  // Without a lineup or a real roster there is nothing to measure needs against.
  if (!slots?.length || !roster.length) return later

  const sentIds = new Set(sent.flatMap((a) => (a.t === 'p' ? [a.id] : [])))
  const strength = lineupStrength(s)
  const lineup = (ps: readonly Player[]) => lineupTotal(bestLineup(ps, slots, strength))
  const staying = roster.filter((p) => !sentIds.has(p.id))
  const arriving = incoming.flatMap((a) => (a.t === 'p' ? (players.get(a.id) ?? []) : []))
  const nowBefore = lineup(roster)
  const nowAfterSend = lineup(staying)
  const nowAfterReceive = lineup([...staying, ...arriving])
  const now: Flow = { gets: nowAfterReceive - nowAfterSend, gives: nowBefore - nowAfterSend }

  return {
    gets: later.gets + WIN_NOW_WEIGHT * now.gets,
    gives: later.gives + WIN_NOW_WEIGHT * now.gives,
    later,
    now,
  }
}

export function evalTrade(
  sent1: Asset[],
  sent2: Asset[],
  roster1: readonly Player[],
  roster2: readonly Player[],
  players: ReadonlyMap<string, Player>,
  s: Settings,
  firstPickYear: number,
  costs?: KeeperCosts,
  slots?: readonly Slot[],
  /** Each team's picks in the upcoming draft; omit for a team whose picks aren't known. */
  picks?: readonly [PickCounts | undefined, PickCounts | undefined],
): [TeamTrade, TeamTrade] {
  return [
    evalTeam(sent1, sent2, roster1, players, s, firstPickYear, costs, slots, picks?.[0]),
    evalTeam(sent2, sent1, roster2, players, s, firstPickYear, costs, slots, picks?.[1]),
  ]
}

export type Grade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D+' | 'D' | 'D-' | 'F'

/**
 * Letter grade for one team from the value it receives vs. gives up.
 * "Fair" (within FAIR_THRESHOLD) is a B. Beyond that, grades step with the log of the
 * ratio, so 2:1 is as lopsided at 4:2 as at 20:10.
 */
export function gradeFor(gets: number, gives: number): Grade {
  const hi = Math.max(gets, gives)
  if (hi <= 0 || (hi - Math.min(gets, gives)) / hi < FAIR_THRESHOLD) return 'B'
  const l = Math.log2(gets / gives) // ±Infinity when one side is zero
  if (l > 0) return l >= 1.5 ? 'A+' : l >= 1.1 ? 'A' : l >= 0.7 ? 'A-' : 'B+'
  const d = -l
  if (d >= 2.5) return 'F'
  if (d >= 2) return 'D-'
  if (d >= 1.7) return 'D'
  if (d >= 1.4) return 'D+'
  if (d >= 1.1) return 'C-'
  if (d >= 0.8) return 'C'
  if (d >= 0.5) return 'C+'
  return 'B-'
}

export interface Verdict {
  message: string
  /** Which team comes out ahead, or null for a fair / empty / mutual trade. */
  winner: 1 | 2 | null
  /** Team 1's share of the total value the two teams receive, 0–100 (50 when empty). */
  share1: number
  grade1: Grade | null
  grade2: Grade | null
}

/** Summarises a trade. `names` are used in the headline (defaults to "Team 1" / "Team 2"). */
export function judgeTrade(
  t1: TeamTrade,
  t2: TeamTrade,
  names: readonly [string, string] = ['Team 1', 'Team 2'],
): Verdict {
  if (t1.gets + t1.gives + t2.gets + t2.gives <= 0) {
    return { message: 'Add assets to start', winner: null, share1: 50, grade1: null, grade2: null }
  }
  const grade1 = gradeFor(t1.gets, t1.gives)
  const grade2 = gradeFor(t2.gets, t2.gives)
  const received = t1.gets + t2.gets
  const share1 = received > 0 ? (t1.gets / received) * 100 : 50
  const net1 = t1.gets - t1.gives
  const net2 = t2.gets - t2.gives

  const base = { share1, grade1, grade2 }
  if (grade1 === 'B' && grade2 === 'B') return { ...base, message: 'Fair trade', winner: null }
  // Rosters can make a trade work for both sides (or neither).
  if (net1 > 0 && net2 > 0) return { ...base, message: 'Both teams come out ahead', winner: null }
  if (net1 < 0 && net2 < 0) return { ...base, message: 'Both teams give up value', winner: null }
  const winner = net1 >= net2 ? 1 : 2
  const margin = Math.abs(net1 - net2) / 2
  return { ...base, message: `${names[winner - 1]} wins by ${margin.toFixed(1)}`, winner }
}
