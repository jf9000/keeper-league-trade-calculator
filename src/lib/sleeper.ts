import type { Scoring, Settings } from '../types'
import { countFlex } from './lineup'
import { LIMITS, clamp } from './valuation'

/**
 * Minimal client for Sleeper's public, read-only API (no key needed).
 * Docs: https://docs.sleeper.com
 */
const BASE = 'https://api.sleeper.app/v1'

/** A league draft shorter than this is assumed to be a rookie-only draft, not the full draft. */
const MIN_FULL_DRAFT_ROUNDS = 10

export class SleeperError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'SleeperError'
  }
}

export interface SleeperUser {
  user_id: string
  username: string
  display_name: string
  avatar: string | null
}

export interface SleeperLeague {
  league_id: string
  name: string
  season: string
  status: 'pre_draft' | 'drafting' | 'in_season' | 'complete'
  total_rosters: number
  roster_positions: string[]
  scoring_settings: Record<string, number>
  settings: {
    /** 0 = redraft, 1 = keeper, 2 = dynasty */
    type?: number
    max_keepers?: number
    draft_rounds?: number
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { signal })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new SleeperError('Could not reach Sleeper. Check your connection and try again.')
  }
  if (!res.ok) throw new SleeperError(`Sleeper returned an error (${res.status}).`, res.status)
  return (await res.json()) as T
}

/** Looks up a user by username. Resolves to null if the user doesn't exist. */
export async function getUser(username: string, signal?: AbortSignal): Promise<SleeperUser | null> {
  const name = username.trim()
  if (!name) return null
  try {
    // Sleeper answers 200 with a `null` body (or 404 in some cases) for unknown users.
    return (await getJson<SleeperUser | null>(`/user/${encodeURIComponent(name)}`, signal)) ?? null
  } catch (e) {
    if (e instanceof SleeperError && e.status === 404) return null
    throw e
  }
}

/** All NFL leagues a user belongs to in a given season. */
export async function getUserLeagues(
  userId: string,
  season: number,
  signal?: AbortSignal,
): Promise<SleeperLeague[]> {
  return (await getJson<SleeperLeague[] | null>(`/user/${userId}/leagues/nfl/${season}`, signal)) ?? []
}

export interface SleeperRoster {
  roster_id: number
  owner_id: string | null
  /** Sleeper player IDs on the roster (starters, bench, IR, taxi). */
  players: string[] | null
}

export interface SleeperLeagueUser {
  user_id: string
  display_name: string
  metadata?: { team_name?: string } | null
}

/** One franchise in a league, ready for a team dropdown. */
export interface LeagueTeam {
  rosterId: number
  ownerId: string | null
  /** Team name if the owner set one, otherwise their display name. */
  name: string
  playerIds: string[]
}

export const getRosters = async (leagueId: string, signal?: AbortSignal) =>
  (await getJson<SleeperRoster[] | null>(`/league/${encodeURIComponent(leagueId)}/rosters`, signal)) ?? []

export const getLeagueUsers = async (leagueId: string, signal?: AbortSignal) =>
  (await getJson<SleeperLeagueUser[] | null>(`/league/${encodeURIComponent(leagueId)}/users`, signal)) ?? []

/** Joins rosters to their owners. Unowned rosters get a "Team N" name. Sorted by roster ID. */
export function buildTeams(rosters: readonly SleeperRoster[], users: readonly SleeperLeagueUser[]): LeagueTeam[] {
  const byUser = new Map(users.map((u) => [u.user_id, u]))
  return rosters
    .map((r) => {
      const owner = r.owner_id ? byUser.get(r.owner_id) : undefined
      const name = owner?.metadata?.team_name?.trim() || owner?.display_name || `Team ${r.roster_id}`
      return { rosterId: r.roster_id, ownerId: r.owner_id ?? null, name, playerIds: r.players ?? [] }
    })
    .sort((a, b) => a.rosterId - b.rosterId)
}

/** Current rosters for every team in a league. */
export async function getLeagueTeams(leagueId: string, signal?: AbortSignal): Promise<LeagueTeam[]> {
  const [rosters, users] = await Promise.all([getRosters(leagueId, signal), getLeagueUsers(leagueId, signal)])
  return buildTeams(rosters, users)
}

/** The league's starting-lineup layout (e.g. QB, RB, FLEX, SUPER_FLEX, BN), or null if it can't be fetched. */
export async function getRosterPositions(leagueId: string, signal?: AbortSignal): Promise<string[] | null> {
  try {
    const league = await getJson<Pick<SleeperLeague, 'roster_positions'> | null>(`/league/${encodeURIComponent(leagueId)}`, signal)
    return league?.roster_positions?.length ? league.roster_positions : null
  } catch (e) {
    if (e instanceof SleeperError) return null
    throw e
  }
}

/** One traded draft pick: `roster_id` is who originally held it, `owner_id` who holds it now. */
export interface TradedPick {
  season: string
  round: number
  roster_id: number
  owner_id: number
}

/** Draft picks that have changed hands in this league, or null if they can't be fetched. */
export async function getTradedPicks(leagueId: string, signal?: AbortSignal): Promise<TradedPick[] | null> {
  try {
    return (await getJson<TradedPick[] | null>(`/league/${encodeURIComponent(leagueId)}/traded_picks`, signal)) ?? []
  } catch (e) {
    if (e instanceof SleeperError) return null
    throw e
  }
}

/**
 * Who owns which picks in one draft year, as rosterId → (round → how many). Everyone starts with their
 * own pick in every round; Sleeper's traded-pick list then moves picks between rosters.
 */
export function ownedPicks(
  rosterIds: readonly number[],
  traded: readonly TradedPick[],
  year: number,
  rounds: number,
): Map<number, Map<number, number>> {
  const out = new Map<number, Map<number, number>>()
  for (const id of rosterIds) out.set(id, new Map(Array.from({ length: rounds }, (_, i): [number, number] => [i + 1, 1])))
  for (const t of traded) {
    if (Number(t.season) !== year || !(t.round >= 1 && t.round <= rounds)) continue
    const from = out.get(t.roster_id)
    const to = out.get(t.owner_id)
    if (!from || !to || from === to) continue
    from.set(t.round, Math.max(0, (from.get(t.round) ?? 0) - 1))
    to.set(t.round, (to.get(t.round) ?? 0) + 1)
  }
  return out
}

export interface SleeperDraft {
  draft_id: string
  status: string
  settings?: { rounds?: number } | null
}

export interface SleeperDraftPick {
  player_id?: string | null
  round?: number
}

/** The league's main draft: the longest completed one at full length (a rookie-only draft doesn't count). */
export function pickMainDraft(drafts: readonly SleeperDraft[]): SleeperDraft | undefined {
  const rounds = (d: SleeperDraft) => d.settings?.rounds ?? 0
  return drafts
    .filter((d) => d.status === 'complete' && rounds(d) >= MIN_FULL_DRAFT_ROUNDS)
    .sort((a, b) => rounds(b) - rounds(a))[0]
}

/** Round each player was drafted in, by Sleeper player ID. */
export function draftRoundsFromPicks(picks: readonly SleeperDraftPick[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const p of picks) {
    if (p.player_id && typeof p.round === 'number' && Number.isFinite(p.round) && p.round >= 1) {
      out.set(p.player_id, p.round)
    }
  }
  return out
}

/**
 * Where each player was drafted in this league, which is what he costs to keep.
 * Resolves to null if there is no completed full-length draft or Sleeper can't be reached for it.
 */
export async function getLeagueDraft(leagueId: string, signal?: AbortSignal): Promise<Map<string, number> | null> {
  try {
    const drafts = (await getJson<SleeperDraft[] | null>(`/league/${encodeURIComponent(leagueId)}/drafts`, signal)) ?? []
    const main = pickMainDraft(drafts)
    if (!main) return null
    const picks =
      (await getJson<SleeperDraftPick[] | null>(`/draft/${encodeURIComponent(main.draft_id)}/picks`, signal)) ?? []
    const rounds = draftRoundsFromPicks(picks)
    return rounds.size ? rounds : null
  } catch (e) {
    if (e instanceof SleeperError) return null
    throw e
  }
}

export const leagueTypeLabel = (l: SleeperLeague): string =>
  l.settings.type === 2 ? 'Dynasty' : l.settings.type === 1 ? 'Keeper' : 'Redraft'

export function scoringFromRec(rec: number | undefined): Scoring {
  const r = rec ?? 0
  return r >= 1 ? 'ppr' : r >= 0.5 ? 'half' : 'std'
}

/**
 * Maps a Sleeper league onto calculator settings. Only fields Sleeper actually
 * tells us are returned, so callers can merge over their defaults.
 * `oneQb` has no Sleeper equivalent and is left for the user to decide.
 */
export function leagueToSettings(l: SleeperLeague): Partial<Settings> {
  const out: Partial<Settings> = {
    teams: clamp(l.total_rosters, LIMITS.teams.min, LIMITS.teams.max),
    scoring: scoringFromRec(l.scoring_settings?.rec),
    superflex: (l.roster_positions ?? []).includes('SUPER_FLEX'),
  }
  if (l.roster_positions?.length) out.flex = clamp(countFlex(l.roster_positions), LIMITS.flex.min, LIMITS.flex.max)
  const { max_keepers, draft_rounds } = l.settings ?? {}
  if (max_keepers && max_keepers > 0) out.keepers = clamp(max_keepers, LIMITS.keepers.min, LIMITS.keepers.max)
  // Dynasty and keeper leagues often report their *rookie* draft length here (around 4 rounds).
  // The calculator needs the full-draft length, so a short draft is ignored and the default is kept.
  if (draft_rounds && draft_rounds >= MIN_FULL_DRAFT_ROUNDS) {
    out.rounds = clamp(draft_rounds, LIMITS.rounds.min, LIMITS.rounds.max)
  }
  return out
}
