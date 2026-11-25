import type { Pos, Settings } from '../types'
import { POS_LIST, bestLineup, lineupByPos, lineupTotal, type Slot, type Starter } from './lineup'
import type { LeagueTeam } from './sleeper'
import {
  defaultKeeperRound,
  evalSide,
  lineupStrength,
  redraftShare,
  sumValues,
  type EvalItem,
  type KeeperCosts,
  type PickCounts,
} from './valuation'
import type { Asset, Player } from '../types'

export interface TeamRank {
  team: LeagueTeam
  /** Strength of the best starting lineup the roster can field (this season). */
  now: number
  /** Total keeper surplus of the best legal set of keepers (next season). */
  later: number
  /** `now` and `later` each as a share of the league's best, blended by the balanced win-now share (`redraftWeight`); 0–100. */
  score: number
  rank: number
  starters: Starter[]
  /** The roster's players that would be kept, best first. */
  keepers: EvalItem[]
  byPos: Record<Pos, number>
  posRank: Record<Pos, number>
}

/** The players a team would keep: chosen by the keeper optimiser, so within limits and with a pick available. */
export const keptItems = (items: readonly EvalItem[]): EvalItem[] =>
  items.filter((i) => i.player && !i.blocked && i.value > 0).sort((a, b) => b.value - a.value)

/** Every rostered player as a keeper candidate at his keeper cost (an override round wins over the default). */
export function rosterAssets(
  roster: readonly Player[],
  s: Settings,
  costs?: KeeperCosts,
  overrides?: ReadonlyMap<string, number>,
): Asset[] {
  return roster.map((p) => ({ t: 'p', id: p.id, keeperRound: overrides?.get(p.id) ?? defaultKeeperRound(p, s, costs) }))
}

/**
 * Ranks every team in the league by this season's lineup and next season's keepers. Each is scaled to the
 * league's best so the two (which sit on different scales) can be blended.
 */
export function rankTeams(
  teams: readonly LeagueTeam[],
  rosters: ReadonlyMap<number, readonly Player[]>,
  byId: ReadonlyMap<string, Player>,
  s: Settings,
  slots: readonly Slot[],
  firstPickYear: number,
  costs?: KeeperCosts,
  picks?: (t: LeagueTeam) => PickCounts | undefined,
): TeamRank[] {
  const strength = lineupStrength(s)
  const rows = teams.map((team) => {
    const roster = rosters.get(team.rosterId) ?? []
    const starters = bestLineup(roster, slots, strength)
    const items = evalSide(rosterAssets(roster, s, costs), byId, s, firstPickYear, picks?.(team))
    return {
      team,
      now: lineupTotal(starters),
      later: sumValues(items),
      starters,
      keepers: keptItems(items),
      byPos: lineupByPos(starters),
    }
  })
  const maxNow = Math.max(1, ...rows.map((r) => r.now))
  const maxLater = Math.max(1, ...rows.map((r) => r.later))
  const r = redraftShare(s)
  return rows
    .map((row) => ({
      ...row,
      score: 100 * (r * (row.now / maxNow) + (1 - r) * (row.later / maxLater)),
      rank: 0,
      posRank: Object.fromEntries(
        POS_LIST.map((pos) => [pos, 1 + rows.filter((o) => o.byPos[pos] > row.byPos[pos]).length]),
      ) as Record<Pos, number>,
    }))
    .sort((a, b) => b.score - a.score)
    .map((row, i) => ({ ...row, rank: i + 1 }))
}
