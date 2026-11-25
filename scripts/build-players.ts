/**
 * Builds public/players.json: fantasy-relevant NFL players with ADP and Sleeper IDs.
 *
 *   npm run build-players -- [--season 2026] [--teams 12] [--source mfl|ffc] [--out public/players.json] [--refresh]
 *
 * ADP sources, tried in order unless --source says otherwise (first with 100+ players wins):
 *   1. MyFantasyLeague's public ADP export  (documented API, real drafts, current season)
 *   2. Fantasy Football Calculator, this season
 *   3. Fantasy Football Calculator, previous season
 * Sleeper IDs come from Sleeper's player database, matched by normalized name + position.
 *
 * This runs offline on your machine and ships static JSON. The app never calls MFL from the browser
 * (MFL's terms forbid that), and every request here goes through scripts/http.ts.
 */
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { MIN_GAMES } from '../src/lib/current'
import { parseAge } from '../src/lib/age'
import { parseInjury } from '../src/lib/availability'
import { appendSnapshot, makeSnapshot, parseHistory } from '../src/lib/history'
import { UNDRAFTED_ADP, seasonFor } from '../src/lib/valuation'
import type { Player, PlayerStats, PlayersFile, Pos } from '../src/types'
import {
  MIN_PLAYERS,
  POSITIONS,
  estimateMissingQbSf,
  estimateQbSfAdp,
  mflFcount,
  mflRows,
  normTeam,
  normalizeName,
  parseFfc,
  parseMflAdp,
  parseMflPlayers,
  slug,
  validatePlayers,
  type AdpRow,
} from './adp'
import { fetchJson } from './http'
import { parseByes } from './schedule'
import { indexSleeper, loadSleeperPlayers, pickSleeper, surnameKey, uniqueOnly } from './sleeperIds'
import { MIN_WEEK_PLAYERS, parseWeek, sumWeeks } from './stats'

type Source = 'mfl' | 'ffc'
const SOURCE_LABEL: Record<Source, string> = { mfl: 'MyFantasyLeague', ffc: 'Fantasy Football Calculator' }

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const flag = (name: string) => process.argv.includes(`--${name}`)
const round1 = (n: number) => Math.round(n * 10) / 10

// ---- ADP sources ------------------------------------------------------------------------------

async function fetchMfl(season: number, teams: number): Promise<AdpRow[]> {
  const base = `https://api.myfantasyleague.com/${season}/export`
  // Redraft (N), real drafts (not mocks), PPR leagues of this size; ignore players picked in <5% of drafts.
  const adpUrl = `${base}?TYPE=adp&PERIOD=ALL&FCOUNT=${mflFcount(teams)}&IS_PPR=1&IS_KEEPER=N&IS_MOCK=0&CUTOFF=5&JSON=1`
  const adp = parseMflAdp(await fetchJson(adpUrl))
  if (!adp.length) return []
  // Ask only for the players we need rather than MFL's whole database (their docs ask us to go easy on it).
  const ids = adp.map((a) => a.id).join(',')
  const players = parseMflPlayers(await fetchJson(`${base}?TYPE=players&PLAYERS=${ids}&JSON=1`))
  return mflRows(adp, players)
}

async function fetchFfc(format: 'ppr' | '2qb', season: number, teams: number): Promise<AdpRow[]> {
  const url = `https://fantasyfootballcalculator.com/api/v1/adp/${format}?teams=${teams}&year=${season}&position=all`
  return parseFfc(await fetchJson(url))
}

async function pickAdp(requestedSeason: number | undefined, requestedSource: Source | undefined, teams: number) {
  const now = seasonFor()
  const all: { source: Source; season: number }[] = [
    { source: 'mfl', season: now },
    { source: 'ffc', season: now },
    { source: 'ffc', season: now - 1 },
  ]
  const candidates = all.filter(
    (c) => (!requestedSource || c.source === requestedSource) && (!requestedSeason || c.season === requestedSeason),
  )
  if (requestedSeason && requestedSource && !candidates.length) candidates.push({ source: requestedSource, season: requestedSeason })
  if (!candidates.length) throw new Error('No ADP source matches those --season/--source options.')

  for (const c of candidates) {
    try {
      const rows = c.source === 'mfl' ? await fetchMfl(c.season, teams) : await fetchFfc('ppr', c.season, teams)
      if (rows.length >= MIN_PLAYERS) return { ...c, rows }
      console.warn(`  ! ${SOURCE_LABEL[c.source]} ${c.season}: only ${rows.length} players (need ${MIN_PLAYERS}+), trying next source`)
    } catch (e) {
      console.warn(`  ! ${SOURCE_LABEL[c.source]} ${c.season} failed: ${(e as Error).message}`)
    }
  }
  throw new Error('No source had enough ADP data. Try again later, or pass --season / --source.')
}

/**
 * Superflex ADP, in order of preference: real superflex-format drafts for the same season (FFC "2QB"),
 * else QB ADP estimated from the previous season's superflex drafts, else none.
 */
async function pickSuperflex(season: number, qbs: readonly { key: string; adp: number }[], teams: number) {
  const key = (r: AdpRow) => `${normalizeName(r.name)}|${r.position}`
  try {
    const same = await fetchFfc('2qb', season, teams)
    if (same.length >= MIN_PLAYERS) {
      const real = new Map(same.map((r) => [key(r), r.adp]))
      // Real superflex drafts only cover part of the board; fill in QBs they missed.
      const filled = estimateMissingQbSf(qbs, real)
      const source = `ffc-2qb:${season}` + (filled.size ? ` (+${filled.size} QBs estimated)` : '')
      return { map: new Map([...real, ...filled]), source }
    }
    const prev = await fetchFfc('2qb', season - 1, teams)
    if (prev.length >= MIN_PLAYERS) {
      const refQbs = prev.filter((r) => r.position === 'QB').map((r) => r.adp)
      return { map: estimateQbSfAdp(qbs, refQbs), source: `estimated:${season - 1}` }
    }
  } catch (e) {
    console.warn(`  ! superflex ADP unavailable: ${(e as Error).message}`)
  }
  return { map: new Map<string, number>(), source: 'none' }
}

// ---- Current-season production ------------------------------------------------------------------

/** Regular seasons are 18 weeks; stop at the first week that isn't fully played yet. */
const MAX_WEEKS = 18
/** Production below this (PPR points per game) isn't worth adding an undrafted player for. */
const MIN_BREAKOUT_PPG = 6

/**
 * Season-to-date fantasy points from Sleeper's weekly stats (an unofficial but public endpoint), one request
 * per completed week. Returns null if nothing is available (offseason, or the endpoint changed), in which
 * case the build simply carries on with ADP alone.
 */
async function fetchSeasonStats(season: number) {
  const weeks: Map<string, PlayerStats>[] = []
  for (let w = 1; w <= MAX_WEEKS; w++) {
    try {
      const json = await fetchJson(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${w}`)
      const week = parseWeek(json)
      if (week.size < MIN_WEEK_PLAYERS) break
      weeks.push(week)
    } catch (e) {
      console.warn(`  ! Sleeper stats for week ${w} failed: ${(e as Error).message}`)
      break
    }
  }
  return weeks.length ? { totals: sumWeeks(weeks), through: weeks.length } : null
}

/** Bye weeks from Sleeper's schedule; empty if it can't be fetched or isn't a full schedule (the app then ignores byes). */
async function fetchByes(season: number): Promise<Record<string, number>> {
  try {
    return parseByes(await fetchJson(`https://api.sleeper.app/schedule/nfl/regular/${season}`))
  } catch (e) {
    console.warn(`  ! Sleeper schedule unavailable: ${(e as Error).message}`)
    return {}
  }
}

// ---- main -------------------------------------------------------------------------------------

async function main() {
  const teams = Number(arg('teams') ?? 12)
  const requestedSource = arg('source') as Source | undefined
  if (requestedSource && requestedSource !== 'mfl' && requestedSource !== 'ffc') throw new Error('--source must be mfl or ffc')
  const requestedSeason = arg('season') ? Number(arg('season')) : undefined
  const out = resolve(arg('out') ?? 'public/players.json')

  console.log(`Building players (${teams}-team ADP)…`)
  const { source, season, rows } = await pickAdp(requestedSeason, requestedSource, teams)
  console.log(`  Using ${SOURCE_LABEL[source]} ${season} ADP (${rows.length} players)`)

  const rowKey = (r: AdpRow) => `${normalizeName(r.name)}|${r.position}`
  const qbs = rows.filter((r) => r.position === 'QB').map((r) => ({ key: rowKey(r), adp: r.adp }))
  const [sf, sleeperAll] = await Promise.all([pickSuperflex(season, qbs, teams), loadSleeperPlayers(flag('refresh'))])
  const sleeper = indexSleeper(sleeperAll)

  const unmatched: string[] = []
  const players: Player[] = rows.map((r) => {
    const team = r.team
    const match =
      pickSleeper(sleeper.byNamePos.get(rowKey(r)), team) ??
      // Position mismatch: accept a name-only match only when it's on the same team.
      pickSleeper(sleeper.byName.get(normalizeName(r.name))?.filter((p) => normTeam(p.team) === team), team) ??
      // Nickname mismatch: accept a surname match only when exactly one player has it on that team at that position.
      uniqueOnly(sleeper.bySurname.get(surnameKey(r.name, team, r.position)))
    if (!match) unmatched.push(`${r.name} (${r.position}, ${team})`)
    const sfAdp = sf.map.get(rowKey(r))
    return {
      id: match?.player_id ?? slug(r.name, r.position),
      sleeperId: match?.player_id ?? null,
      name: r.name,
      pos: r.position as Pos,
      team: team || normTeam(match?.team) || 'FA',
      adp: round1(r.adp),
      sfAdp: sfAdp == null ? null : round1(sfAdp),
    }
  })
  // Current-season production, attached by Sleeper ID (defenses are keyed by team abbreviation).
  const season_stats = await fetchSeasonStats(season)
  const byes = season_stats ? await fetchByes(season) : {}
  let breakouts = 0
  if (season_stats) {
    const have = new Set(players.map((p) => p.id))
    for (const p of players) {
      const st = season_stats.totals.get(p.id)
      if (st) p.stats = st
    }
    // Players nobody drafted who are producing anyway (waiver pickups) still need a place in the list.
    for (const [id, st] of season_stats.totals) {
      const sp = sleeperAll[id]
      if (have.has(id) || !sp || !POSITIONS.has(sp.position ?? '') || sp.position === 'K' || sp.position === 'DEF') continue
      if (st.gp < MIN_GAMES || st.ppr / st.gp < MIN_BREAKOUT_PPG) continue
      players.push({
        id,
        sleeperId: id,
        name: sp.full_name ?? `${sp.first_name ?? ''} ${sp.last_name ?? ''}`.trim(),
        pos: sp.position as Pos,
        team: normTeam(sp.team) || 'FA',
        adp: UNDRAFTED_ADP,
        sfAdp: null,
        stats: st,
      })
      breakouts++
    }
  }
  // Age feeds keeper value (older backs and receivers are worth less to keep).
  let aged = 0
  for (const p of players) {
    const sp = p.sleeperId ? sleeperAll[p.sleeperId] : undefined
    const age = sp ? parseAge(sp.age, sp.birth_date) : undefined
    if (age !== undefined && p.pos !== 'DEF') {
      p.age = age
      aged++
    }
  }
  // Injury designations only mean something while games are being played, so they're skipped in the offseason.
  let injured = 0
  if (season_stats) {
    for (const p of players) {
      const sp = p.sleeperId ? sleeperAll[p.sleeperId] : undefined
      const inj = sp ? parseInjury(sp.injury_status, sp.status) : undefined
      if (inj) {
        p.inj = inj
        injured++
      }
    }
  }
  players.sort((a, b) => a.adp - b.adp || (b.stats?.ppr ?? 0) - (a.stats?.ppr ?? 0) || a.name.localeCompare(b.name))

  const problems = validatePlayers(players)
  if (problems.length) {
    throw new Error(`Refusing to write ${out}; the data failed validation:\n  - ${problems.slice(0, 10).join('\n  - ')}`)
  }

  const file: PlayersFile = {
    generatedAt: new Date().toISOString(),
    season,
    source: `${SOURCE_LABEL[source]} ADP; Sleeper player IDs`,
    sfSource: sf.source,
    ...(season_stats ? { statsThrough: season_stats.through } : {}),
    ...(Object.keys(byes).length ? { byes } : {}),
    players,
  }
  await mkdir(dirname(out), { recursive: true })
  // Write to a temp file then rename, so a crash can never leave a half-written players.json.
  const tmp = `${out}.tmp`
  await writeFile(tmp, JSON.stringify(file, null, 2) + '\n')
  try {
    await rename(tmp, out)
  } catch (e) {
    // Windows won't replace a file another process (e.g. the dev server) has open. The temp file is already
    // complete and validated, so copy it over in place instead.
    const code = (e as NodeJS.ErrnoException).code
    if (code !== 'EPERM' && code !== 'EBUSY') throw e
    await copyFile(tmp, out)
    await rm(tmp)
  }

  await writeHistory(file, dirname(out))
  console.log(`Wrote ${players.length} players to ${out}`)
  console.log(`  Sleeper IDs matched: ${players.length - unmatched.length}/${players.length}`)
  console.log(`  Ages:                ${aged}/${players.length}`)
  console.log(`  Injury designations: ${injured}`)
  console.log(`  Bye weeks:           ${Object.keys(byes).length ? `${Object.keys(byes).length} teams` : 'none'}`)
  console.log(`  Superflex ADP:       ${players.filter((p) => p.sfAdp != null).length}/${players.length} (${sf.source})`)
  console.log(
    season_stats
      ? `  Season stats:        through week ${season_stats.through} for ${players.filter((p) => p.stats).length} players (${breakouts} undrafted producers added)`
      : '  Season stats:        none available (values use ADP alone)',
  )
  if (unmatched.length) console.warn(`  Unmatched (kept with slug IDs): ${unmatched.join(', ')}`)
}

/** Adds this refresh to history.json (next to players.json) so the app can show who's rising and falling. */
async function writeHistory(file: PlayersFile, dir: string) {
  const path = resolve(dir, 'history.json')
  let existing = null
  try {
    existing = parseHistory(JSON.parse(await readFile(path, 'utf8')))
  } catch {
    /* no history yet */
  }
  const next = appendSnapshot(existing, makeSnapshot(file))
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify(next) + '\n')
  try {
    await rename(tmp, path)
  } catch {
    await copyFile(tmp, path)
    await rm(tmp)
  }
  console.log(`  History:             ${next.snapshots.length} snapshot(s) in ${path}`)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
