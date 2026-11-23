import type { Player, PlayersFile, Settings } from '../types'
import { rankByCurrentSeason } from './current'
import { UNDRAFTED_ADP, keeperWorth, redraftShare, redraftWorth } from './valuation'

/** How many weekly snapshots public/history.json keeps. */
export const MAX_SNAPSHOTS = 10

/** [adp, superflex adp or null, ppr total, half-ppr total, standard total, games played]. */
export type SnapRow = [number, number | null, number, number, number, number]

/** The market and production numbers from one players.json refresh, keyed by player ID. */
export interface Snapshot {
  /** ISO timestamp of the players.json this was taken from. */
  at: string
  /** Weeks of current-season stats included (0 in the offseason). */
  through: number
  rows: Record<string, SnapRow>
}

export interface HistoryFile {
  snapshots: Snapshot[]
}

const r1 = (n: number) => Math.round(n * 10) / 10
const day = (iso: string) => iso.slice(0, 10)

export function makeSnapshot(file: PlayersFile): Snapshot {
  const rows: Record<string, SnapRow> = {}
  for (const p of file.players) {
    const st = p.stats
    rows[p.id] = [p.adp, p.sfAdp, r1(st?.ppr ?? 0), r1(st?.half ?? 0), r1(st?.std ?? 0), st?.gp ?? 0]
  }
  return { at: file.generatedAt, through: file.statsThrough ?? 0, rows }
}

/**
 * Adds a snapshot, keeping the newest MAX_SNAPSHOTS. Two refreshes on the same UTC day collapse into
 * the later one, so re-running the data build never piles up duplicates.
 */
export function appendSnapshot(history: HistoryFile | null, snap: Snapshot): HistoryFile {
  const list = [...(history?.snapshots ?? [])]
  const last = list[list.length - 1]
  if (last && day(last.at) === day(snap.at)) list[list.length - 1] = snap
  else list.push(snap)
  return { snapshots: list.sort((a, b) => a.at.localeCompare(b.at)).slice(-MAX_SNAPSHOTS) }
}

/** A snapshot is usable only when it has the shape the app expects (the file is fetched, so check it). */
export function parseHistory(raw: unknown): HistoryFile | null {
  const snaps = (raw as HistoryFile | null)?.snapshots
  if (!Array.isArray(snaps)) return null
  const ok = snaps.filter(
    (s) => s && typeof s.at === 'string' && typeof s.through === 'number' && s.rows && typeof s.rows === 'object',
  )
  return { snapshots: ok }
}

/** The players as they stood at a snapshot: today's identities with that snapshot's ADP and production. */
export function playersAt(current: readonly Player[], snap: Snapshot): Player[] {
  const out: Player[] = []
  for (const p of current) {
    const row = snap.rows[p.id]
    if (!row) continue
    const [adp, sfAdp, ppr, half, std, gp] = row
    // Injury status isn't snapshotted, so history compares players on market and production alone.
    const { stats: _stats, curAdp: _cur, inj: _inj, ...base } = p
    out.push({ ...base, adp, sfAdp, ...(gp > 0 ? { stats: { gp, ppr, half, std } } : {}) })
  }
  return out
}

/**
 * What the market would pay for a player, with no keeper cost attached: this season's worth and his
 * keeper worth blended by the win-now slider (`redraftWeight`), on the draft-pick-value scale.
 */
export function marketValue(p: Player, s: Settings): number {
  const r = redraftShare(s)
  return r * redraftWorth(p, s) + (1 - r) * keeperWorth(p, s)
}

export interface Trend {
  /** Market value at each snapshot, oldest first (NaN where the player wasn't in that snapshot). */
  series: number[]
  now: number
  /** Change since the previous snapshot, and since the oldest one. Positive = value rising. */
  week: number
  total: number
}

export interface Trends {
  /** The date of each point in the series. */
  dates: string[]
  byId: Map<string, Trend>
}

/**
 * Every player's market value across the snapshots, under the league's scoring and format. If the app's
 * players.json is newer than the last snapshot, it's added as the final point.
 */
export function buildTrends(file: PlayersFile, history: HistoryFile, s: Settings): Trends {
  const snaps = [...history.snapshots]
  const last = snaps[snaps.length - 1]
  if (!last || day(last.at) !== day(file.generatedAt)) snaps.push(makeSnapshot(file))

  const perSnap = snaps.map((snap) => {
    const ranked = rankByCurrentSeason(playersAt(file.players, snap), s, snap.through)
    return new Map(ranked.map((p) => [p.id, marketValue(p, s)] as const))
  })
  const byId = new Map<string, Trend>()
  for (const p of file.players) {
    const series = perSnap.map((m) => m.get(p.id) ?? NaN)
    const now = series[series.length - 1]!
    if (Number.isNaN(now)) continue
    const prev = series.length > 1 ? series[series.length - 2]! : NaN
    const first = series.find((v) => !Number.isNaN(v))!
    byId.set(p.id, {
      series,
      now,
      week: Number.isNaN(prev) ? 0 : now - prev,
      total: now - first,
    })
  }
  return { dates: snaps.map((x) => x.at), byId }
}

/** Biggest movers by the change since the previous snapshot, skipping players nobody drafts or plays. */
export function movers(
  trends: Trends,
  players: readonly Player[],
  count: number,
): { risers: { player: Player; trend: Trend }[]; fallers: { player: Player; trend: Trend }[] } {
  const rows = players
    .filter((p) => p.adp < UNDRAFTED_ADP || (p.stats?.gp ?? 0) > 0)
    .flatMap((player) => {
      const trend = trends.byId.get(player.id)
      return trend && Math.abs(trend.week) >= 0.5 ? [{ player, trend }] : []
    })
  return {
    risers: rows
      .filter((r) => r.trend.week > 0)
      .sort((a, b) => b.trend.week - a.trend.week)
      .slice(0, count),
    fallers: rows
      .filter((r) => r.trend.week < 0)
      .sort((a, b) => a.trend.week - b.trend.week)
      .slice(0, count),
  }
}
