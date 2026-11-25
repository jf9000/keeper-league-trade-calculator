/** Matching ADP rows to Sleeper's player database. Shared by the players and archive builds. */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { POSITIONS, normTeam, normalizeName } from './adp'
import { fetchJson } from './http'

export interface SleeperPlayer {
  player_id: string
  full_name?: string
  first_name?: string
  last_name?: string
  position?: string | null
  team?: string | null
  active?: boolean
  status?: string | null
  age?: number | null
  birth_date?: string | null
  injury_status?: string | null
  search_rank?: number
}

/** Sleeper asks clients to fetch its ~10 MB player dump at most once a day, so it's cached on disk. */
export async function loadSleeperPlayers(refresh: boolean): Promise<Record<string, SleeperPlayer>> {
  const cache = resolve('.cache/sleeper-players.json')
  if (!refresh) {
    try {
      const age = Date.now() - (await stat(cache)).mtimeMs
      if (age < 24 * 60 * 60 * 1000) {
        console.log('  Using cached Sleeper players (under 24h old; --refresh to refetch)')
        return JSON.parse(await readFile(cache, 'utf8')) as Record<string, SleeperPlayer>
      }
    } catch {
      /* no usable cache */
    }
  }
  const data = await fetchJson<Record<string, SleeperPlayer>>('https://api.sleeper.app/v1/players/nfl', { maxBytes: 60_000_000 })
  await mkdir(dirname(cache), { recursive: true })
  await writeFile(cache, JSON.stringify(data))
  return data
}

/**
 * `byNamePos` is the strict lookup; `byName` covers players whose position differs between
 * sources (e.g. Travis Hunter is WR in ADP lists but CB in Sleeper).
 */
export function indexSleeper(all: Record<string, SleeperPlayer>) {
  const byNamePos = new Map<string, SleeperPlayer[]>()
  const byName = new Map<string, SleeperPlayer[]>()
  const bySurname = new Map<string, SleeperPlayer[]>()
  const push = (m: Map<string, SleeperPlayer[]>, k: string, p: SleeperPlayer) => m.set(k, [...(m.get(k) ?? []), p])
  for (const p of Object.values(all)) {
    if (!p.position) continue
    const name = normalizeName(p.full_name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`)
    if (POSITIONS.has(p.position)) push(byNamePos, `${name}|${p.position}`, p)
    if (p.active) push(byName, name, p)
    // Nicknames differ between sources (Kenneth/Kenny, Matthew/Matt), so also index by surname + team + position.
    if (p.active && p.team && p.last_name) push(bySurname, `${normalizeName(p.last_name)}|${normTeam(p.team)}|${p.position}`, p)
  }
  return { byNamePos, byName, bySurname }
}

/** The surname key used by `bySurname`: the last word of a normalized name. */
export const surnameKey = (name: string, team: string, pos: string) => `${normalizeName(name).split(' ').pop()}|${team}|${pos}`

export const uniqueOnly = (cands: SleeperPlayer[] | undefined) => (cands?.length === 1 ? cands[0] : undefined)

/** Among same-name candidates prefer matching team, then active, then Sleeper's own ranking. */
export function pickSleeper(cands: SleeperPlayer[] | undefined, team: string): SleeperPlayer | undefined {
  if (!cands?.length) return undefined
  const score = (p: SleeperPlayer) =>
    (normTeam(p.team) === team ? 0 : 1_000_000) + (p.active ? 0 : 100_000) + (p.search_rank ?? 99_999)
  return [...cands].sort((a, b) => score(a) - score(b))[0]
}
