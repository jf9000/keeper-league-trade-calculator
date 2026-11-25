/** Pure helper for turning Sleeper's season schedule into bye weeks. No network, no file access. */

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A real schedule has all 32 teams; anything with fewer is partial, so no byes are claimed. */
export const NFL_TEAMS = 32

/**
 * Each team's bye week: the one regular-season week between the first and last it has no game. Returns an empty
 * object when the schedule is partial (fewer than 32 teams) or a team's bye isn't unambiguous.
 */
export function parseByes(json: unknown): Record<string, number> {
  if (!Array.isArray(json)) return {}
  const playing = new Map<number, Set<string>>()
  const teams = new Set<string>()
  for (const g of json) {
    if (!isRec(g) || typeof g.week !== 'number' || typeof g.home !== 'string' || typeof g.away !== 'string') continue
    teams.add(g.home).add(g.away)
    const wk = playing.get(g.week) ?? new Set<string>()
    wk.add(g.home).add(g.away)
    playing.set(g.week, wk)
  }
  if (teams.size < NFL_TEAMS) return {}
  const weeks = [...playing.keys()].sort((a, b) => a - b)
  const byes: Record<string, number> = {}
  for (const t of teams) {
    const off = weeks.filter((w) => !playing.get(w)!.has(t))
    if (off.length !== 1) return {} // a bye is exactly one missing week; anything else means bad data
    byes[t] = off[0]!
  }
  return byes
}
