import type { Asset, Scoring, Settings } from '../types'
import { DEFAULT_SETTINGS, LIMITS, clamp, type Stance } from './valuation'

/** Everything needed to reproduce a trade's grade on someone else's screen. */
export interface SharedTrade {
  assets: [Asset[], Asset[]]
  /** Sleeper roster ID picked for each side, or null for a generic team. */
  rosters: [number | null, number | null]
  stance: [Stance, Stance]
  settings: Settings
  /** The Sleeper league the trade was made in; null for manual mode. */
  leagueId: string | null
}

/** A real trade has a handful of assets per side. Links are untrusted input, so anything bigger is refused. */
export const MAX_ASSETS_PER_SIDE = 40
const MAX_QUERY_LENGTH = 4000

const SCORINGS: readonly Scoring[] = ['ppr', 'half', 'std']
const STANCE_CODE: Record<string, Stance> = { s: 'sell', r: 'rebuilding', n: null, c: 'contending', w: 'allin' }
const enc = encodeURIComponent

const encodeAssets = (list: Asset[]) =>
  list.map((a) => (a.t === 'p' ? `p:${enc(a.id)}:${a.keeperRound}` : `k:${a.year}:${a.round}`)).join(',')

const stanceCode = (s: Stance) => (s === 'sell' ? 's' : s === 'rebuilding' ? 'r' : s === 'contending' ? 'c' : s === 'allin' ? 'w' : 'n')

/**
 * Serialises a trade as a compact query string (no leading "?"). Plain `key=value` pairs joined with `&`;
 * assets are `p:<playerId>:<keeperRound>` or `k:<year>:<round>`, comma-separated.
 */
export function encodeTrade(t: SharedTrade): string {
  const s = t.settings
  const parts = [
    `a=${encodeAssets(t.assets[0])}`,
    `b=${encodeAssets(t.assets[1])}`,
    `r=${t.rosters[0] ?? ''}:${t.rosters[1] ?? ''}`,
    `o=${stanceCode(t.stance[0])}${stanceCode(t.stance[1])}`,
    `s=${[s.teams, s.keepers, s.rounds, s.scoring, s.superflex ? 1 : 0, s.oneQb ? 1 : 0, s.flex, s.redraftWeight].join(':')}`,
  ]
  if (t.leagueId) parts.push(`l=${enc(t.leagueId)}`)
  return parts.join('&')
}

const int = (v: string | undefined, lo: number, hi: number): number | null => {
  const n = Number(v)
  return v !== undefined && v !== '' && Number.isFinite(n) ? clamp(Math.round(n), lo, hi) : null
}

function decodeAssets(raw: string | undefined, rounds: number): Asset[] | null {
  if (!raw) return []
  const items = raw.split(',')
  if (items.length > MAX_ASSETS_PER_SIDE) return null
  const out: Asset[] = []
  for (const item of items) {
    const [kind, x, y] = item.split(':')
    if (kind === 'p' && x) {
      const round = int(y, 1, rounds)
      if (round === null) return null
      let id: string
      try {
        id = decodeURIComponent(x)
      } catch {
        return null
      }
      out.push({ t: 'p', id, keeperRound: round })
    } else if (kind === 'k') {
      const year = int(x, 2000, 2100)
      const round = int(y, 1, rounds)
      if (year === null || round === null) return null
      out.push({ t: 'k', year, round })
    } else return null
  }
  return out
}

/** Parses what `encodeTrade` wrote. Returns null for anything malformed rather than guessing. */
export function decodeTrade(query: string): SharedTrade | null {
  if (query.length > MAX_QUERY_LENGTH) return null
  const kv = new Map<string, string>()
  for (const part of query.replace(/^\?/, '').split('&')) {
    const i = part.indexOf('=')
    if (i > 0) kv.set(part.slice(0, i), part.slice(i + 1))
  }
  const sp = kv.get('s')?.split(':')
  if (!sp || sp.length < 8) return null
  const teams = int(sp[0], LIMITS.teams.min, LIMITS.teams.max)
  const keepers = int(sp[1], LIMITS.keepers.min, LIMITS.keepers.max)
  const rounds = int(sp[2], LIMITS.rounds.min, LIMITS.rounds.max)
  const flex = int(sp[6], LIMITS.flex.min, LIMITS.flex.max)
  const scoring = SCORINGS.find((x) => x === sp[3])
  if (teams === null || keepers === null || rounds === null || flex === null || !scoring) return null
  const settings: Settings = { teams, keepers, rounds, scoring, superflex: sp[4] === '1', oneQb: sp[5] === '1', flex, redraftWeight: DEFAULT_SETTINGS.redraftWeight }

  const a = decodeAssets(kv.get('a'), rounds)
  const b = decodeAssets(kv.get('b'), rounds)
  if (!a || !b) return null

  const [r1, r2] = (kv.get('r') ?? ':').split(':')
  const o = kv.get('o') ?? 'nn'
  let leagueId: string | null = null
  const l = kv.get('l')
  if (l) {
    try {
      leagueId = decodeURIComponent(l)
    } catch {
      return null
    }
  }
  return {
    assets: [a, b],
    rosters: [int(r1, 1, 1000), int(r2, 1, 1000)],
    stance: [STANCE_CODE[o[0] ?? 'n'] ?? null, STANCE_CODE[o[1] ?? 'n'] ?? null],
    settings,
    leagueId,
  }
}
