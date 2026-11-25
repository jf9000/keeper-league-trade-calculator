import type { Asset, Player, Pos, Settings } from '../types'
import type { Slot } from './lineup'
import type { LeagueTeam } from './sleeper'
import {
  defaultKeeperRound,
  evalTrade,
  gradeFor,
  itemValue,
  evalSide,
  type Grade,
  type KeeperCosts,
  type PickCounts,
  type Stance,
  type TeamTrade,
} from './valuation'

export type FinderMode = 'win-win' | 'best-for-me'

export interface Offer {
  partner: LeagueTeam
  /** What you send and what you receive. */
  give: Asset[]
  get: Asset[]
  mine: TeamTrade
  theirs: TeamTrade
  gradeMine: Grade
  gradeTheirs: Grade
  /** Higher is better; the sort key for the current mode. */
  score: number
}

export interface FinderArgs {
  me: LeagueTeam
  partners: readonly LeagueTeam[]
  rosterOf: (t: LeagueTeam) => readonly Player[]
  picksOf: (t: LeagueTeam) => PickCounts | undefined
  byId: ReadonlyMap<string, Player>
  s: Settings
  firstPickYear: number
  costs?: KeeperCosts
  slots: readonly Slot[]
  /** Only offers that bring back at least one player at one of these positions; empty = any. */
  want: readonly Pos[]
  /** Only offers where you send at least one player at one of these positions; empty = any. */
  sell: readonly Pos[]
  mode: FinderMode
  /** Whether your team and the partners are contending or rebuilding, which shifts how each values this season vs. keepers. */
  stances?: readonly [Stance, Stance]
  /** How many offers to keep. */
  limit?: number
}

const ORDER: Grade[] = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+']
const gradeIdx = (g: Grade) => ORDER.indexOf(g)

/** Roster players considered for a swap: the most valuable few, since a deal only works between real assets. */
const POOL = 9
/** Skip pairings whose rough values are further apart than this (as a fraction of the larger side). */
const ROUGH_GAP = 0.3
/** A win-win offer must help each team by at least this many points, so a +0.1 sliver doesn't count as a win. */
const MIN_GAIN = 1
/** ...and the team that gains less must get at least this share of what the other gains, so the win is shared. */
const BALANCE_MIN = 0.4
/** In "best for me", the other team must still get at least this share of what it gives up. */
const PARTNER_FLOOR = 0.8
/** How long to hold the thread before letting the page breathe, in ms. */
const SLICE_MS = 20

const nextTick = () => new Promise<void>((r) => setTimeout(r, 0))

/** Combinations of `k` items from `list` (k is 1 or 2). */
function combos<T>(list: readonly T[], k: 1 | 2): T[][] {
  if (k === 1) return list.map((x) => [x])
  const out: T[][] = []
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) out.push([list[i]!, list[j]!])
  return out
}

/**
 * Searches 1-for-1, 2-for-1 and 1-for-2 player swaps between your team and the others, keeping the ones
 * that grade fairly for both sides, and returns the best few. A win-win offer has to help both teams by a real
 * amount and by similar amounts; "best for me" lets the other team come out a little behind, but not far. Every candidate is run through the same
 * `evalTrade` the calculator uses, so a found offer grades exactly as it would if you built it by hand.
 *
 * Cheap, roster-blind values prune most pairings first, so the full evaluation only runs on plausible ones.
 * The loop yields to the page regularly and stops early when `signal` aborts.
 */
export async function findTrades(
  a: FinderArgs,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Offer[]> {
  const { s } = a
  const rough = (p: Player, round: number) => {
    const [it] = evalSide([{ t: 'p', id: p.id, keeperRound: round }], a.byId, s, a.firstPickYear)
    return it ? itemValue(it, s) : 0
  }
  const asset = (p: Player): Asset => ({ t: 'p', id: p.id, keeperRound: defaultKeeperRound(p, s, a.costs) })
  // `also` keeps players at those positions even when they aren't among the team's most valuable.
  const pool = (t: LeagueTeam, also: readonly Pos[] = []) =>
    a.rosterOf(t)
      .filter((p) => p.pos !== 'K' && p.pos !== 'DEF')
      .map((p) => ({ p, asset: asset(p), v: 0 }))
      .map((x) => ({ ...x, v: rough(x.p, (x.asset as { keeperRound: number }).keeperRound) }))
      .filter((x) => x.v > 1)
      .sort((x, y) => y.v - x.v)
      .filter((x, i) => i < POOL || also.includes(x.p.pos))

  const mine = a.me
  const myRoster = a.rosterOf(mine)
  const myPool = pool(mine, a.sell)
  const shapes: [1 | 2, 1 | 2][] = [[1, 1], [2, 1], [1, 2]]
  const needsFull = a.mode === 'win-win' ? gradeIdx('B') : gradeIdx('B-')

  // Work out the number of rough-pruned pairings up front so progress is honest.
  const jobs: { partner: LeagueTeam; give: typeof myPool; get: typeof myPool }[] = []
  for (const partner of a.partners) {
    if (partner.rosterId === mine.rosterId) continue
    const theirPool = pool(partner)
    for (const [ng, nr] of shapes) {
      for (const give of combos(myPool, ng)) {
        if (a.sell.length && !give.some((x) => a.sell.includes(x.p.pos))) continue
        const gv = give.reduce((t, x) => t + x.v, 0)
        for (const get of combos(theirPool, nr)) {
          if (a.want.length && !get.some((x) => a.want.includes(x.p.pos))) continue
          const rv = get.reduce((t, x) => t + x.v, 0)
          if (Math.abs(gv - rv) / Math.max(gv, rv) > ROUGH_GAP) continue
          jobs.push({ partner, give, get })
        }
      }
    }
  }

  const found: Offer[] = []
  const limit = a.limit ?? 20
  let sliceStart = performance.now()
  for (let i = 0; i < jobs.length; i++) {
    if (signal?.aborted) return []
    const { partner, give, get } = jobs[i]!
    const sent = give.map((x) => x.asset)
    const recv = get.map((x) => x.asset)
    const [mineT, theirsT] = evalTrade(
      sent,
      recv,
      myRoster,
      a.rosterOf(partner),
      a.byId,
      s,
      a.firstPickYear,
      a.costs,
      a.slots,
      [a.picksOf(mine), a.picksOf(partner)],
      a.stances,
    )
    const gm = gradeFor(mineT.gets, mineT.gives)
    const gt = gradeFor(theirsT.gets, theirsT.gives)
    const netMine = mineT.gets - mineT.gives
    const netTheirs = theirsT.gets - theirsT.gives
    const lo = Math.min(netMine, netTheirs)
    const hi = Math.max(netMine, netTheirs)
    const ok =
      a.mode === 'win-win'
        ? gradeIdx(gm) >= needsFull && gradeIdx(gt) >= needsFull && lo >= MIN_GAIN && lo / hi >= BALANCE_MIN
        : gradeIdx(gt) >= needsFull && netMine > 0 && theirsT.gets >= PARTNER_FLOOR * theirsT.gives
    if (ok) {
      found.push({
        partner,
        give: sent,
        get: recv,
        mine: mineT,
        theirs: theirsT,
        gradeMine: gm,
        gradeTheirs: gt,
        score: a.mode === 'win-win' ? Math.min(netMine, netTheirs) : netMine,
      })
    }
    if (performance.now() - sliceStart > SLICE_MS) {
      onProgress?.(i + 1, jobs.length)
      await nextTick()
      sliceStart = performance.now()
    }
  }
  onProgress?.(jobs.length, jobs.length)
  return found.sort((x, y) => y.score - x.score).slice(0, limit)
}
