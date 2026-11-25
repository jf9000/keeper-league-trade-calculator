import type { Player, Pos, Settings } from '../types'
import { availability, availabilityAdjusted } from './availability'
import { UNDRAFTED_ADP, adpOf } from './valuation'

/** A player needs at least this many games this season to be ranked on his production. */
export const MIN_GAMES = 4

/**
 * How many games' worth of preseason expectation each player's production is blended with when ranking.
 * Backtested on 2021-2025 (scripts/backtest.ts): 1 improves both rank order and the value the app shows, while
 * 3-4 improves rank order further but makes the shown value slightly worse, since value already blends in ADP.
 */
export const SHRINK_GAMES = 1

/** Fantasy points per game this season in the league's scoring format, or null with no usable stats. */
export function pointsPerGame(p: Player, s: Pick<Settings, 'scoring'>): number | null {
  const st = p.stats
  return st && st.gp > 0 ? st[s.scoring] / st.gp : null
}

/**
 * How far apart (in points per game) two players' scores must be before we're fairly sure one is really
 * better. Ranks are blurred by this much, so near-ties land on near-equal slots instead of one jumping
 * several slots on a rounding error. 0 gives plain ranks. Backtested: more blur keeps lowering value error
 * (it also hedges toward the middle), so this is a moderate pick, not an optimum.
 */
export const SOFT_PPG = 1.5

export interface RankOptions {
  /** Games' worth of preseason expectation blended into each score (default `SHRINK_GAMES`). */
  shrinkGames?: number
  /** Blur, in points per game, applied to ranks (default `SOFT_PPG`). */
  softPpg?: number
}

/** Chance (0-1) that a player whose score is `diff` ppg lower is really the better one, as a smooth logistic. */
const beats = (diff: number, soft: number) => (soft <= 0 ? (diff > 0 ? 1 : diff < 0 ? 0 : 0.5) : 1 / (1 + Math.exp(-(1.702 * diff) / soft)))

/** `slots` read at a fractional index, stepping linearly between neighbours; undefined past the end. */
function slotAt(slots: readonly number[], f: number): number | undefined {
  const lo = Math.max(0, Math.floor(f))
  if (Math.round(f) >= slots.length) return undefined
  const a = slots[lo]!
  const b = slots[Math.min(lo + 1, slots.length - 1)]!
  return a + (b - a) * Math.min(1, Math.max(0, f - lo))
}

/**
 * Ranks players by this season's production and expresses each rank as an ADP.
 *
 * Within each position, the n-th best producer takes the ADP slot of the n-th best player at that
 * position in preseason ADP. That puts current production on the same scale as ADP, including how much
 * the market values each position (superflex QBs, scoring format), so the two can be blended. Players with
 * too few games get no rank and keep their preseason ADP. Undrafted placeholders don't take up slots.
 *
 * Production is ranked on points per game scaled down for missed games (see `availabilityAdjusted`), using
 * `through`, the weeks of stats in the data, to know how many games were possible. Each score is then pulled
 * toward what his preseason rank would produce (see `SHRINK_GAMES`), and ranks are blurred by `SOFT_PPG` so a
 * 0.1-point gap doesn't cost whole draft slots: a player's rank is the expected number of players above him,
 * and his slot is read between the two neighbouring slots.
 *
 * Returns copies with `curAdp` set; the input isn't changed.
 */
export function rankByCurrentSeason(
  players: readonly Player[],
  s: Settings,
  through?: number,
  opts: RankOptions = {},
): Player[] {
  const shrinkGames = opts.shrinkGames ?? SHRINK_GAMES
  const soft = opts.softPpg ?? SOFT_PPG
  const score = (p: Player) => availabilityAdjusted(pointsPerGame(p, s)!, availability(p, through))
  const byPos = new Map<Pos, Player[]>()
  for (const p of players) byPos.set(p.pos, [...(byPos.get(p.pos) ?? []), p])

  const curAdp = new Map<string, number>()
  for (const group of byPos.values()) {
    const drafted = group.filter((p) => p.adp < UNDRAFTED_ADP)
    const slots = drafted.map((p) => adpOf(p, s)).sort((a, b) => a - b)
    const producers = group.filter((p) => (p.stats?.gp ?? 0) >= MIN_GAMES)

    // What each preseason rank "should" produce: the score at that rank among this season's producers.
    // A player's own score is pulled toward it by `shrinkGames` games' worth, so a short hot or cold
    // stretch moves his rank less than a long one.
    const curve = producers.map(score).sort((a, b) => b - a)
    const preRank = new Map(
      [...drafted].sort((a, b) => adpOf(a, s) - adpOf(b, s)).map((p, i) => [p.id, i] as const),
    )
    const shrunk = producers.map((p) => {
      const expected = curve[Math.min(preRank.get(p.id) ?? curve.length - 1, curve.length - 1)]!
      const gp = p.stats!.gp
      return (gp * score(p) + shrinkGames * expected) / (gp + shrinkGames)
    })
    producers.forEach((p, i) => {
      let above = 0
      for (let j = 0; j < producers.length; j++) if (j !== i) above += beats(shrunk[j]! - shrunk[i]!, soft)
      const slot = slotAt(slots, above)
      if (slot !== undefined) curAdp.set(p.id, slot)
    })
  }
  return players.map((p) => (curAdp.has(p.id) ? { ...p, curAdp: curAdp.get(p.id) } : p))
}
