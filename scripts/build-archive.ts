/**
 * Builds data/archive/<season>.json for past seasons, used only to fit and backtest the model offline.
 *
 *   npm run build-archive -- [--seasons 2021,2022,2023,2024,2025] [--out data/archive]
 *
 * Weekly production and usage come from Sleeper's stats endpoint; preseason ADP from Fantasy Football
 * Calculator (the same two sources as build-players), matched to Sleeper IDs the same way. The output is
 * committed static JSON that nothing in the app reads, and every request goes through scripts/http.ts.
 */
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { MIN_PLAYERS, normalizeName, parseFfc, type AdpRow } from './adp'
import { ARCHIVE_POSITIONS, MIN_ARCHIVE_POINTS, ageOnSeasonStart, type ArchiveFile, type ArchivePlayer, type ArchivePos } from './archive'
import { fetchJson } from './http'
import { indexSleeper, loadSleeperPlayers, pickSleeper, surnameKey, uniqueOnly } from './sleeperIds'
import { MIN_WEEK_PLAYERS, parseWeekLines, type WeekLine } from './stats'

const MAX_WEEKS = 18
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function fetchWeeks(season: number): Promise<Map<string, WeekLine>[]> {
  const weeks: Map<string, WeekLine>[] = []
  for (let w = 1; w <= MAX_WEEKS; w++) {
    const week = parseWeekLines(await fetchJson(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${w}`))
    if (week.size < MIN_WEEK_PLAYERS) break
    weeks.push(week)
    await sleep(250) // be gentle with a free public API
  }
  return weeks
}

type AdpFormat = 'ppr' | '2qb' | 'standard' | 'half-ppr'
/** Which archive field each FFC format fills. */
const ADP_FIELD = { ppr: 'adp', '2qb': 'sfAdp', standard: 'adpStd', 'half-ppr': 'adpHalf' } as const

async function fetchAdp(format: AdpFormat, season: number): Promise<AdpRow[]> {
  const rows = parseFfc(await fetchJson(`https://fantasyfootballcalculator.com/api/v1/adp/${format}?teams=12&year=${season}&position=all`))
  await sleep(500)
  return rows
}

async function main() {
  const seasons = (arg('seasons') ?? '2021,2022,2023,2024,2025').split(',').map(Number)
  const outDir = resolve(arg('out') ?? 'data/archive')
  await mkdir(outDir, { recursive: true })
  const sleeperAll = await loadSleeperPlayers(false)
  const sleeper = indexSleeper(sleeperAll)

  for (const season of seasons) {
    console.log(`Season ${season}…`)
    const weeks = await fetchWeeks(season)
    if (!weeks.length) {
      console.warn('  no stats found, skipping')
      continue
    }

    // Preseason ADP by Sleeper ID (rows that can't be matched are simply left out).
    const adpById = new Map<string, Partial<Record<(typeof ADP_FIELD)[AdpFormat], number>>>()
    let unmatched = 0
    for (const format of Object.keys(ADP_FIELD) as AdpFormat[]) {
      let rows: AdpRow[] = []
      try {
        rows = await fetchAdp(format, season)
      } catch (e) {
        console.warn(`  ! ${format} ADP unavailable: ${(e as Error).message}`)
      }
      if (rows.length < MIN_PLAYERS) continue
      for (const r of rows) {
        const key = `${normalizeName(r.name)}|${r.position}`
        const m =
          pickSleeper(sleeper.byNamePos.get(key), r.team) ??
          uniqueOnly(sleeper.bySurname.get(surnameKey(r.name, r.team, r.position)))
        if (!m) {
          unmatched++
          continue
        }
        const cur = adpById.get(m.player_id) ?? {}
        adpById.set(m.player_id, { ...cur, [ADP_FIELD[format]]: r.adp })
      }
    }

    const players: Record<string, ArchivePlayer> = {}
    const ids = new Set<string>()
    for (const wk of weeks) for (const id of wk.keys()) ids.add(id)
    for (const id of ids) {
      const sp = sleeperAll[id]
      if (!sp?.position || !ARCHIVE_POSITIONS.has(sp.position)) continue
      const w = weeks.map((wk) => wk.get(id) ?? null)
      const total = w.reduce((t, l) => t + (l ? l[0] : 0), 0)
      const adp = adpById.get(id)
      if (total < MIN_ARCHIVE_POINTS && !adp) continue
      const age = ageOnSeasonStart(sp.birth_date, season)
      players[id] = {
        pos: sp.position as ArchivePos,
        name: sp.full_name ?? `${sp.first_name ?? ''} ${sp.last_name ?? ''}`.trim(),
        ...(age !== undefined ? { age } : {}),
        ...(adp?.adp !== undefined ? { adp: Math.round(adp.adp * 10) / 10 } : {}),
        ...(adp?.sfAdp !== undefined ? { sfAdp: Math.round(adp.sfAdp * 10) / 10 } : {}),
        ...(adp?.adpStd !== undefined ? { adpStd: Math.round(adp.adpStd * 10) / 10 } : {}),
        ...(adp?.adpHalf !== undefined ? { adpHalf: Math.round(adp.adpHalf * 10) / 10 } : {}),
        w,
      }
    }
    const file: ArchiveFile = { season, weeks: weeks.length, players }
    const path = resolve(outDir, `${season}.json`)
    await writeFile(`${path}.tmp`, JSON.stringify(file) + '\n')
    await rename(`${path}.tmp`, path)
    const n = Object.keys(players).length
    const withAdp = Object.values(players).filter((p) => p.adp !== undefined).length
    console.log(`  ${weeks.length} weeks, ${n} players (${withAdp} with ADP, ${unmatched} ADP rows unmatched) -> ${path}`)
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
