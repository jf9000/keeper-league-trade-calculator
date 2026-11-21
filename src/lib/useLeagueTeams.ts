import { useEffect, useState } from 'react'
import { getLeagueDraft, getLeagueTeams, getRosterPositions, getTradedPicks, type LeagueTeam, type TradedPick } from './sleeper'

export interface LeagueTeamsState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  teams: LeagueTeam[]
  /** Round each player was drafted in this league (his keeper cost); null when there's no usable draft. */
  draftRounds: ReadonlyMap<string, number> | null
  /** The league's lineup layout from Sleeper (QB, RB, FLEX, BN, …); null when unavailable. */
  rosterPositions: readonly string[] | null
  /** Draft picks that changed hands; null when Sleeper couldn't say, so pick ownership is unknown. */
  tradedPicks: readonly TradedPick[] | null
}

const IDLE: LeagueTeamsState = { status: 'idle', teams: [], draftRounds: null, rosterPositions: null, tradedPicks: null }

/** Fetches rosters, draft results and lineup layout for a Sleeper league every time it mounts (rosters change, so they're never cached). */
export function useLeagueTeams(leagueId: string | null): LeagueTeamsState {
  const [state, setState] = useState<LeagueTeamsState & { forLeague: string | null }>({ ...IDLE, forLeague: null })

  useEffect(() => {
    if (!leagueId) return
    const ctrl = new AbortController()
    setState({ ...IDLE, status: 'loading', forLeague: leagueId })
    Promise.all([
      getLeagueTeams(leagueId, ctrl.signal),
      getLeagueDraft(leagueId, ctrl.signal),
      getRosterPositions(leagueId, ctrl.signal),
      getTradedPicks(leagueId, ctrl.signal),
    ])
      .then(([teams, draftRounds, rosterPositions, tradedPicks]) =>
        setState({ status: 'ready', teams, draftRounds, rosterPositions, tradedPicks, forLeague: leagueId }),
      )
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setState({ ...IDLE, status: 'error', forLeague: leagueId })
      })
    return () => ctrl.abort()
  }, [leagueId])

  // Ignore stale results from a previously selected league.
  if (!leagueId) return IDLE
  if (state.forLeague !== leagueId) return { ...IDLE, status: 'loading' }
  const { forLeague: _forLeague, ...rest } = state
  return rest
}
