/** Pure helpers for turning Sleeper's weekly stats into season totals. No network, no file access. */
import type { PlayerStats } from '../src/types'

/** A week with fewer scored players than this is still being played (or hasn't started), so it's left out. */
export const MIN_WEEK_PLAYERS = 200

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/**
 * One week of Sleeper stats as points by player ID (team defenses are keyed by team abbreviation).
 * Team aggregates ("TEAM_…") and rows without scoring or a game played are skipped.
 */
export function parseWeek(json: unknown): Map<string, PlayerStats> {
  const out = new Map<string, PlayerStats>()
  if (!isRec(json)) return out
  for (const [id, row] of Object.entries(json)) {
    if (id.startsWith('TEAM_') || !isRec(row)) continue
    const ppr = num(row.pts_ppr)
    const gp = num(row.gp)
    if (ppr === undefined || !gp || gp <= 0) continue
    out.set(id, { gp, ppr, half: num(row.pts_half_ppr) ?? ppr, std: num(row.pts_std) ?? ppr })
  }
  return out
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Adds weekly stats into season totals per player. */
export function sumWeeks(weeks: readonly ReadonlyMap<string, PlayerStats>[]): Map<string, PlayerStats> {
  const totals = new Map<string, PlayerStats>()
  for (const week of weeks) {
    for (const [id, s] of week) {
      const t = totals.get(id) ?? { gp: 0, ppr: 0, half: 0, std: 0 }
      totals.set(id, { gp: t.gp + s.gp, ppr: t.ppr + s.ppr, half: t.half + s.half, std: t.std + s.std })
    }
  }
  return new Map([...totals].map(([id, t]) => [id, { gp: t.gp, ppr: round1(t.ppr), half: round1(t.half), std: round1(t.std) }]))
}

/**
 * One player's week with usage: [ppr, half, std, offensive snaps, team offensive snaps, targets, rush attempts,
 * red-zone targets, red-zone rush attempts]. Missing usage fields are 0.
 */
export type WeekLine = [number, number, number, number, number, number, number, number, number]

/** Like `parseWeek`, but keeps the usage fields the archive and the usage model need. */
export function parseWeekLines(json: unknown): Map<string, WeekLine> {
  const out = new Map<string, WeekLine>()
  if (!isRec(json)) return out
  for (const [id, row] of Object.entries(json)) {
    if (id.startsWith('TEAM_') || !isRec(row)) continue
    const ppr = num(row.pts_ppr)
    const gp = num(row.gp)
    if (ppr === undefined || !gp || gp <= 0) continue
    out.set(id, [
      round1(ppr),
      round1(num(row.pts_half_ppr) ?? ppr),
      round1(num(row.pts_std) ?? ppr),
      num(row.off_snp) ?? 0,
      num(row.tm_off_snp) ?? 0,
      num(row.rec_tgt) ?? 0,
      num(row.rush_att) ?? 0,
      num(row.rec_rz_tgt) ?? 0,
      num(row.rush_rz_att) ?? 0,
    ])
  }
  return out
}
