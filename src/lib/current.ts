import type { Player, Pos, Settings } from '../types'
import { UNDRAFTED_ADP, adpOf } from './valuation'

/** A player needs at least this many games this season to be ranked on his production. */
export const MIN_GAMES = 4

/** Fantasy points per game this season in the league's scoring format, or null with no usable stats. */
export function pointsPerGame(p: Player, s: Pick<Settings, 'scoring'>): number | null {
  const st = p.stats
  return st && st.gp > 0 ? st[s.scoring] / st.gp : null
}

/**
 * Ranks players by this season's production and expresses each rank as an ADP.
 *
 * Within each position, the n-th best producer takes the ADP slot of the n-th best player at that
 * position in preseason ADP. That puts current production on the same scale as ADP, including how much
 * the market values each position (superflex QBs, scoring format), so the two can be blended. Players with
 * too few games get no rank and keep their preseason ADP. Undrafted placeholders don't take up slots.
 *
 * Returns copies with `curAdp` set; the input isn't changed.
 */
export function rankByCurrentSeason(players: readonly Player[], s: Settings): Player[] {
  const byPos = new Map<Pos, Player[]>()
  for (const p of players) byPos.set(p.pos, [...(byPos.get(p.pos) ?? []), p])

  const curAdp = new Map<string, number>()
  for (const group of byPos.values()) {
    const slots = group
      .filter((p) => p.adp < UNDRAFTED_ADP)
      .map((p) => adpOf(p, s))
      .sort((a, b) => a - b)
    group
      .filter((p) => (p.stats?.gp ?? 0) >= MIN_GAMES)
      .sort((a, b) => pointsPerGame(b, s)! - pointsPerGame(a, s)!)
      .forEach((p, i) => {
        const slot = slots[i]
        if (slot !== undefined) curAdp.set(p.id, slot)
      })
  }
  return players.map((p) => (curAdp.has(p.id) ? { ...p, curAdp: curAdp.get(p.id) } : p))
}
