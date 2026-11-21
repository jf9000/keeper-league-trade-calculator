/** Pure helpers for turning ADP feeds into players.json rows. No network, no file access. */
import type { Player, Pos } from '../src/types'

export const POSITIONS: ReadonlySet<string> = new Set<Pos>(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])

/** Sources label kickers "PK" and defenses "Def" or "DST"; everything is stored as K and DEF. */
export function normPos(raw: string): string {
  const p = raw.trim().toUpperCase()
  return p === 'PK' ? 'K' : p === 'DST' ? 'DEF' : p
}

/** An ADP list with fewer players than this is treated as "not enough data yet". */
export const MIN_PLAYERS = 100

export interface AdpRow {
  name: string
  position: string
  team: string
  adp: number
}

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
/** MFL returns a bare object instead of a one-element array when there is a single result. */
const asArray = (v: unknown): unknown[] => (v == null ? [] : Array.isArray(v) ? v : [v])
const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')

// Sources disagree on a few team codes. Everything is mapped to Sleeper's codes.
const TEAM_ALIASES: Record<string, string> = {
  JAC: 'JAX', LA: 'LAR', WSH: 'WAS', ARZ: 'ARI', BLT: 'BAL', CLV: 'CLE', HST: 'HOU', SD: 'LAC', SDC: 'LAC',
  STL: 'LAR', OAK: 'LV', LVR: 'LV', KCC: 'KC', GBP: 'GB', SFO: 'SF', TBB: 'TB', NEP: 'NE', NOS: 'NO',
}
export const normTeam = (t: string | null | undefined): string =>
  t ? (TEAM_ALIASES[t.toUpperCase()] ?? t.toUpperCase()) : ''

/** "Kenneth Walker III" → "kenneth walker", "Ja'Marr Chase" → "jamarr chase". */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.'’`-]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const slug = (name: string, pos: string) => `${normalizeName(name).replace(/ /g, '-')}-${pos.toLowerCase()}`

/** MFL writes names "Last, First" ("Harrison Jr., Marvin"). */
export function flipMflName(name: string): string {
  const i = name.indexOf(',')
  return i < 0 ? name.trim() : `${name.slice(i + 1).trim()} ${name.slice(0, i).trim()}`.trim()
}

/** MFL only accepts these league sizes; use the closest one. */
export function mflFcount(teams: number): 8 | 10 | 12 | 14 | 16 {
  const sizes = [8, 10, 12, 14, 16] as const
  return sizes.reduce((best, n) => (Math.abs(n - teams) < Math.abs(best - teams) ? n : best))
}

export function parseMflAdp(json: unknown): { id: string; adp: number }[] {
  const adp = isRec(json) && isRec(json.adp) ? json.adp : undefined
  const out: { id: string; adp: number }[] = []
  for (const p of asArray(adp?.player)) {
    if (!isRec(p)) continue
    const id = str(p.id)
    const value = Number(p.averagePick)
    if (id && Number.isFinite(value) && value > 0) out.push({ id, adp: value })
  }
  return out
}

export function parseMflPlayers(json: unknown): Map<string, { name: string; position: string; team: string }> {
  const players = isRec(json) && isRec(json.players) ? json.players : undefined
  const out = new Map<string, { name: string; position: string; team: string }>()
  for (const p of asArray(players?.player)) {
    if (!isRec(p)) continue
    const id = str(p.id)
    if (id) out.set(id, { name: flipMflName(str(p.name)), position: str(p.position), team: normTeam(str(p.team)) })
  }
  return out
}

/** Joins MFL ADP to MFL player info, keeping only fantasy positions (including K and D/ST) with a name. */
export function mflRows(
  adp: readonly { id: string; adp: number }[],
  players: ReadonlyMap<string, { name: string; position: string; team: string }>,
): AdpRow[] {
  const rows: AdpRow[] = []
  for (const a of adp) {
    const p = players.get(a.id)
    const position = p ? normPos(p.position) : ''
    if (p && p.name && POSITIONS.has(position)) rows.push({ ...p, position, adp: a.adp })
  }
  return rows
}

export function parseFfc(json: unknown): AdpRow[] {
  const rows: AdpRow[] = []
  for (const p of asArray(isRec(json) ? json.players : undefined)) {
    if (!isRec(p)) continue
    const adp = Number(p.adp)
    const position = normPos(str(p.position))
    if (str(p.name) && POSITIONS.has(position) && Number.isFinite(adp) && adp > 0) {
      rows.push({ name: str(p.name), position, team: normTeam(str(p.team)), adp })
    }
  }
  return rows
}

/**
 * Estimates superflex ADP for QBs when no superflex drafts exist for the season yet.
 * The n-th best QB in this season's board takes the superflex slot the n-th best QB held in a
 * reference season's superflex drafts (QB1 has gone ~2nd overall in superflex for years), and never
 * later than his regular ADP. QBs beyond the reference list keep no estimate (regular ADP applies).
 */
export function estimateQbSfAdp(
  qbs: readonly { key: string; adp: number }[],
  referenceSfAdps: readonly number[],
): Map<string, number> {
  const ref = [...referenceSfAdps].sort((a, b) => a - b)
  const out = new Map<string, number>()
  ;[...qbs]
    .sort((a, b) => a.adp - b.adp)
    .forEach((qb, i) => {
      const slot = ref[i]
      if (slot !== undefined) out.set(qb.key, Math.min(qb.adp, slot))
    })
  return out
}

/**
 * Superflex drafts only cover part of the board. For QBs missing from them, estimate superflex ADP
 * from the QBs that do have both: scale regular ADP by the median (superflex ÷ regular) ratio, never
 * landing later than the regular ADP. Needs 3+ QBs with both numbers, otherwise estimates nothing.
 */
export function estimateMissingQbSf(
  qbs: readonly { key: string; adp: number }[],
  known: ReadonlyMap<string, number>,
): Map<string, number> {
  const ratios = qbs
    .filter((q) => known.has(q.key))
    .map((q) => known.get(q.key)! / q.adp)
    .sort((a, b) => a - b)
  const out = new Map<string, number>()
  if (ratios.length < 3) return out
  const mid = Math.floor(ratios.length / 2)
  const median = ratios.length % 2 ? ratios[mid]! : (ratios[mid - 1]! + ratios[mid]!) / 2
  for (const q of qbs) if (!known.has(q.key)) out.set(q.key, Math.min(q.adp, q.adp * median))
  return out
}

/** Reasons the output shouldn't be trusted. Empty means it looks sane. */
export function validatePlayers(players: readonly Player[]): string[] {
  const problems: string[] = []
  if (players.length < MIN_PLAYERS) problems.push(`only ${players.length} players (need ${MIN_PLAYERS}+)`)
  const ids = new Set<string>()
  for (const p of players) {
    if (ids.has(p.id)) problems.push(`duplicate id ${p.id}`)
    ids.add(p.id)
    if (!p.name) problems.push(`player ${p.id} has no name`)
    if (!POSITIONS.has(p.pos)) problems.push(`${p.name}: bad position ${p.pos}`)
    if (!Number.isFinite(p.adp) || p.adp <= 0 || p.adp > 500) problems.push(`${p.name}: implausible ADP ${p.adp}`)
    if (p.sfAdp != null && (!Number.isFinite(p.sfAdp) || p.sfAdp <= 0 || p.sfAdp > 500)) {
      problems.push(`${p.name}: implausible superflex ADP ${p.sfAdp}`)
    }
  }
  for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
    if (players.filter((p) => p.pos === pos).length < 8) problems.push(`too few ${pos}s`)
  }
  if (players.length && Math.min(...players.map((p) => p.adp)) > 15) problems.push('no player has an ADP in the top 15')
  return problems
}
