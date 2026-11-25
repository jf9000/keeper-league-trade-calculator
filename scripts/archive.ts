/**
 * The format of data/archive/<season>.json: one past season's weekly production, usage and preseason ADP, kept
 * in the repo (not shipped) so the model's constants can be fitted and backtested offline. Pure helpers only.
 */
import type { Pos } from '../src/types'
import type { WeekLine } from './stats'

export type ArchivePos = Extract<Pos, 'QB' | 'RB' | 'WR' | 'TE'>
export const ARCHIVE_POSITIONS: ReadonlySet<string> = new Set<ArchivePos>(['QB', 'RB', 'WR', 'TE'])

export interface ArchivePlayer {
  pos: ArchivePos
  name: string
  /** Age in whole years on September 1 of the season, when known. */
  age?: number
  /** Preseason ADP in a 12-team PPR draft and in superflex, when the player was drafted. */
  adp?: number
  sfAdp?: number
  /** Preseason ADP in 12-team standard and half-PPR drafts, when the player was drafted there. */
  adpStd?: number
  adpHalf?: number
  /** One entry per regular-season week; null where he didn't play. */
  w: (WeekLine | null)[]
}

export interface ArchiveFile {
  season: number
  /** Regular-season weeks with data. */
  weeks: number
  players: Record<string, ArchivePlayer>
}

/** Players below this season total (PPR) who also went undrafted are left out as noise. */
export const MIN_ARCHIVE_POINTS = 25

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Reads an archive file, dropping anything malformed; null when the file isn't an archive at all. */
export function parseArchive(raw: unknown): ArchiveFile | null {
  const f = raw as Partial<ArchiveFile> | null
  if (!f || !isNum(f.season) || !isNum(f.weeks) || !f.players || typeof f.players !== 'object') return null
  const players: Record<string, ArchivePlayer> = {}
  for (const [id, p] of Object.entries(f.players)) {
    if (!p || !ARCHIVE_POSITIONS.has(p.pos) || !Array.isArray(p.w)) continue
    const w = p.w.map((l) => (Array.isArray(l) && l.length === 9 && l.every(isNum) ? (l as WeekLine) : null))
    players[id] = { ...p, w }
  }
  return { season: f.season, weeks: f.weeks, players }
}

/** Games played, and points per game in a scoring format (0 = ppr, 1 = half, 2 = std), over a range of weeks. */
export function lineTotals(p: ArchivePlayer, from = 0, to = p.w.length, fmt: 0 | 1 | 2 = 0): { gp: number; pts: number } {
  let gp = 0
  let pts = 0
  for (let i = from; i < Math.min(to, p.w.length); i++) {
    const l = p.w[i]
    if (!l) continue
    gp++
    pts += l[fmt]
  }
  return { gp, pts }
}

/** Age on September 1 of `season` from a birth date (YYYY-MM-DD), or undefined if unusable. */
export function ageOnSeasonStart(birthDate: string | null | undefined, season: number): number | undefined {
  if (!birthDate) return undefined
  const born = new Date(`${birthDate}T00:00:00Z`)
  if (Number.isNaN(born.getTime())) return undefined
  const start = new Date(Date.UTC(season, 8, 1))
  let years = start.getUTCFullYear() - born.getUTCFullYear()
  if (start.getUTCMonth() < born.getUTCMonth() || (start.getUTCMonth() === born.getUTCMonth() && start.getUTCDate() < born.getUTCDate())) years--
  return years >= 18 && years <= 50 ? years : undefined
}
