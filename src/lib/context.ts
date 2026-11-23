import { useMemo } from 'react'
import { rankByCurrentSeason } from './current'
import { buildSlots, type Slot } from './lineup'
import type { PlayersState } from './players'
import { ownedPicks, type LeagueTeam } from './sleeper'
import type { LeagueTeamsState } from './useLeagueTeams'
import { pickYears, seasonFor, type KeeperCosts, type PickCounts } from './valuation'
import type { Player, Settings } from '../types'

/** What every league screen needs, derived once so the tabs agree with each other. */
export interface LeagueCtx {
  s: Settings
  /** Weeks of current-season stats in the data (0 in the offseason); how many games were possible. */
  statsThrough: number
  players: PlayersState
  /** Players with current-season production ranked onto ADP slots for this league's scoring and format. */
  ranked: Player[]
  byId: ReadonlyMap<string, Player>
  /** Rosters of the loaded Sleeper league; empty in manual mode. */
  teams: LeagueTeam[]
  leagueStatus: LeagueTeamsState['status'] | 'none'
  /** Round each player was drafted in (his keeper cost), when the league has a usable draft. */
  costs: KeeperCosts | undefined
  /** Who is "you" in the league, if known. */
  mine: LeagueTeam | undefined
  slots: Slot[]
  years: [number, number, number]
  /** Upcoming-draft pick ownership by year then roster, or null when Sleeper couldn't say. */
  owned: Map<number, Map<number, Map<number, number>>> | null
  /** Which roster owns each rostered player. */
  ownerOf: ReadonlyMap<string, LeagueTeam>
  rosterOf: (t: LeagueTeam | undefined) => Player[]
  picksOf: (t: LeagueTeam | undefined) => PickCounts | undefined
}

export function useLeagueCtx(
  s: Settings,
  players: PlayersState,
  leagueTeams: LeagueTeamsState | null,
  myUserId: string | null,
): LeagueCtx {
  const years = useMemo(() => pickYears(seasonFor()), [])
  const ranked = useMemo(() => rankByCurrentSeason(players.file?.players ?? [], s, players.file?.statsThrough), [players.file, s.scoring, s.superflex])
  const byId = useMemo(() => new Map(ranked.map((p) => [p.id, p])), [ranked])
  const teams = leagueTeams?.teams ?? []
  const slots = useMemo(
    () => buildSlots(leagueTeams?.rosterPositions, s),
    [leagueTeams?.rosterPositions, s.flex, s.superflex],
  )
  const owned = useMemo(() => {
    const traded = leagueTeams?.tradedPicks
    if (!traded || !leagueTeams.teams.length) return null
    const ids = leagueTeams.teams.map((t) => t.rosterId)
    return new Map(years.map((y) => [y, ownedPicks(ids, traded, y, s.rounds)] as const))
  }, [leagueTeams?.tradedPicks, leagueTeams?.teams, years, s.rounds])
  const ownerOf = useMemo(() => {
    const m = new Map<string, LeagueTeam>()
    for (const t of teams) for (const id of t.playerIds) m.set(id, t)
    return m
  }, [teams])

  return {
    s,
    statsThrough: players.file?.statsThrough ?? 0,
    players,
    ranked,
    byId,
    teams,
    leagueStatus: leagueTeams?.status ?? 'none',
    costs: leagueTeams?.draftRounds ?? undefined,
    mine: myUserId ? teams.find((t) => t.ownerId === myUserId) : undefined,
    slots,
    years,
    owned,
    ownerOf,
    rosterOf: (t) => (t ? t.playerIds.flatMap((id) => byId.get(id) ?? []) : []),
    picksOf: (t) => (t ? owned?.get(years[0])?.get(t.rosterId) : undefined),
  }
}
