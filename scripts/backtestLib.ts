/** Shared pieces for offline backtests over data/archive: rebuilding players as of a week, and scoring predictions. */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Player } from '../src/types'
import { UNDRAFTED_ADP } from '../src/lib/valuation'
import { lineTotals, parseArchive, type ArchiveFile, type ArchivePlayer } from './archive'

export function loadArchives(dir = 'data/archive'): ArchiveFile[] {
  return readdirSync(resolve(dir))
    .filter((f) => f.endsWith('.json'))
    .map((f) => parseArchive(JSON.parse(readFileSync(resolve(dir, f), 'utf8'))))
    .filter((a): a is ArchiveFile => a !== null)
    .sort((a, b) => a.season - b.season)
}

/** The player as the app would have seen him after `week` weeks: preseason ADP and season-to-date stats. */
export function playerAsOf(id: string, p: ArchivePlayer, week: number): Player {
  const { gp, pts } = lineTotals(p, 0, week, 0)
  const half = lineTotals(p, 0, week, 1).pts
  const std = lineTotals(p, 0, week, 2).pts
  return {
    id,
    sleeperId: id,
    name: p.name,
    pos: p.pos,
    team: 'XXX',
    adp: p.adp ?? UNDRAFTED_ADP,
    sfAdp: p.sfAdp ?? null,
    ...(p.age !== undefined ? { age: p.age } : {}),
    ...(gp > 0 ? { stats: { gp, ppr: pts, half, std } } : {}),
  }
}

export function playersAsOf(a: ArchiveFile, week: number): Player[] {
  return Object.entries(a.players).map(([id, p]) => playerAsOf(id, p, week))
}

/** Spearman rank correlation (ties get average ranks). */
export function spearman(a: readonly number[], b: readonly number[]): number {
  const rank = (v: readonly number[]) => {
    const order = v.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0])
    const r = new Array<number>(v.length)
    for (let i = 0; i < order.length; ) {
      let j = i
      while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j++
      for (let k = i; k <= j; k++) r[order[k]![1]] = (i + j) / 2
      i = j + 1
    }
    return r
  }
  const ra = rank(a)
  const rb = rank(b)
  const n = a.length
  if (n < 3) return NaN
  const ma = ra.reduce((x, y) => x + y, 0) / n
  const mb = rb.reduce((x, y) => x + y, 0) / n
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    num += (ra[i]! - ma) * (rb[i]! - mb)
    da += (ra[i]! - ma) ** 2
    db += (rb[i]! - mb) ** 2
  }
  return da && db ? num / Math.sqrt(da * db) : NaN
}

/** A prediction: given players as of `week`, a score per player where higher means "will produce more". */
export type Predictor = (players: Player[], week: number) => Map<string, number>

/** Rest-of-season PPR points per game for a player, or null with fewer than `minGames` games left to judge. */
export function futurePpg(p: ArchivePlayer, week: number, minGames = 3): number | null {
  const { gp, pts } = lineTotals(p, week, p.w.length, 0)
  return gp >= minGames ? pts / gp : null
}

export interface Score {
  /** Mean per-position Spearman across seasons and cut weeks, weighted by sample size. */
  rho: number
  n: number
}

/**
 * Scores a predictor: at each cut week of each season, correlate its scores with what players did over the
 * rest of the season, within each position (so positional scoring differences don't matter), and average.
 * Only players who had played at least `minGames` by the cut week are judged, matching who gets a production rank.
 */
export function evaluate(archives: readonly ArchiveFile[], predict: Predictor, weeks: readonly number[], minGames = 4): Score {
  let sum = 0
  let n = 0
  for (const a of archives) {
    for (const week of weeks) {
      if (week >= a.weeks - 2) continue
      const players = playersAsOf(a, week)
      const scores = predict(players, week)
      for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
        const xs: number[] = []
        const ys: number[] = []
        for (const p of players) {
          if (p.pos !== pos || (p.stats?.gp ?? 0) < minGames) continue
          const y = futurePpg(a.players[p.id]!, week)
          const x = scores.get(p.id)
          if (y === null || x === undefined) continue
          xs.push(x)
          ys.push(y)
        }
        const r = spearman(xs, ys)
        if (!Number.isNaN(r) && xs.length >= 8) {
          sum += r * xs.length
          n += xs.length
        }
      }
    }
  }
  return { rho: n ? sum / n : NaN, n }
}

/**
 * Value-scale score for rank-to-slot mappings. At each cut week, the "answer" for a player is the draft slot
 * his rest-of-season production would earn at his position (n-th best future ppg gets the n-th best preseason
 * slot there), as a pick value. A mapping is scored by the root-mean-square gap between its slot's pick value
 * and that answer, over players with enough games before and after the cut. Lower is better.
 */
export function evaluateValue(
  archives: readonly ArchiveFile[],
  slotOf: (players: Player[], week: number) => Map<string, number>,
  weeks: readonly number[],
  pickValue: (slot: number) => number,
  minGames = 4,
): { rmse: number; n: number } {
  let sq = 0
  let n = 0
  for (const a of archives) {
    for (const week of weeks) {
      if (week >= a.weeks - 2) continue
      const players = playersAsOf(a, week)
      const slots = slotOf(players, week)
      for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
        const pre = players.filter((p) => p.pos === pos && p.adp < 400).map((p) => p.adp).sort((x, y) => x - y)
        const judged = players
          .filter((p) => p.pos === pos && (p.stats?.gp ?? 0) >= minGames)
          .flatMap((p) => {
            const y = futurePpg(a.players[p.id]!, week)
            return y === null ? [] : [{ id: p.id, y }]
          })
          .sort((x, y) => y.y - x.y)
        judged.forEach((j, i) => {
          const target = pre[i]
          const got = slots.get(j.id)
          if (target === undefined || got === undefined) return
          sq += (pickValue(got) - pickValue(target)) ** 2
          n++
        })
      }
    }
  }
  return { rmse: n ? Math.sqrt(sq / n) : NaN, n }
}
