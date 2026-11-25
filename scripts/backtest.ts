/**
 * Offline backtest over data/archive (build it with `npm run build-archive`). Run with `npm run backtest`.
 * It only reads local files and prints tables; nothing here ships with the app.
 *
 * Question: at a given week, how well does each ranking predict what players do over the rest of the season?
 */
import { MIN_GAMES, pointsPerGame, rankByCurrentSeason } from '../src/lib/current'
import { adpOf, DEFAULT_SETTINGS, pickValue, redraftWorth } from '../src/lib/valuation'
import type { Settings } from '../src/types'
import { evaluate, evaluateValue, loadArchives, type Predictor } from './backtestLib'

/** The overall pick whose value is `v` (inverse of pickValue). */
const slotForValue = (v: number) => 1 - Math.log(Math.max(v, 1e-6) / 100) / 0.035

const archives = loadArchives()
const s: Settings = { ...DEFAULT_SETTINGS, superflex: false }
const WEEKS = [5, 8, 11]

const preseason: Predictor = (ps) => new Map(ps.map((p) => [p.id, -adpOf(p, s)]))
const rawPpg: Predictor = (ps) => new Map(ps.flatMap((p) => ((p.stats?.gp ?? 0) >= MIN_GAMES ? [[p.id, pointsPerGame(p, s)!] as const] : [])))
const ranked = (k: number): Predictor => (ps, week) => new Map(rankByCurrentSeason(ps, s, week, { shrinkGames: k }).map((p) => [p.id, -(p.curAdp ?? adpOf(p, s))]))

const rows: [string, Predictor][] = [
  ['preseason ADP only', preseason],
  ['raw ppg only', rawPpg],
  ...[0, 1, 2, 3, 4, 6, 8, 12].map((k): [string, Predictor] => [`ranked, shrink ${k}`, ranked(k)]),
]
console.log(`${archives.map((a) => a.season).join(', ')}; cut weeks ${WEEKS.join(', ')}; Spearman vs rest-of-season ppg (higher is better)`)
for (const [name, predict] of rows) {
  const r = evaluate(archives, predict, WEEKS)
  console.log(`${name.padEnd(22)} rho ${r.rho.toFixed(3)}  (n=${r.n})`)
}

// End-to-end: the value the app shows for this season (blends preseason ADP with the production slot),
// against the pick value of the rest-of-season rank. The scoring function takes a "slot" and converts it
// to value, so we hand it the slot that gives the same worth as the app's redraft value.
const worthAsSlot = (opts: { shrinkGames: number; softPpg: number }) => (ps: Parameters<Predictor>[0], week: number) =>
  new Map(
    rankByCurrentSeason(ps, s, week, opts).flatMap((p) => {
      if (p.stats == null) return []
      const w = redraftWorth(p, s)
      // invert pickValue to the slot that has the same value
      return [[p.id, slotForValue(w)] as const]
    }),
  )
const SHRINKS = [0, 2, 3, 4, 6]
console.log('\nEnd-to-end redraft value: RMSE vs. value of the rest-of-season rank (lower is better)')
console.log(['soft/shrink', ...SHRINKS.map(String)].join('\t'))
for (const soft of [0, 0.5, 0.75, 1, 1.5, 2, 3, 4]) {
  const cells = SHRINKS.map((k) => evaluateValue(archives, worthAsSlot({ shrinkGames: k, softPpg: soft }), WEEKS, pickValue).rmse.toFixed(2))
  console.log([String(soft), ...cells].join('\t'))
}

// Joint grid: shrink x blur x the largest weight production gets in the redraft blend (the app uses 0.7).
const worthWith = (opts: { shrinkGames: number; softPpg: number }, wMax: number, fullGames: number) => (ps: Parameters<Predictor>[0], week: number) =>
  new Map(
    rankByCurrentSeason(ps, s, week, opts).flatMap((p) => {
      if (p.stats == null) return []
      const w = p.curAdp == null ? 0 : wMax * Math.min(1, p.stats.gp / fullGames)
      const worth = (1 - w) * pickValue(adpOf(p, s)) + w * pickValue(Math.max(1, p.curAdp ?? 1))
      return [[p.id, slotForValue(worth)] as const]
    }),
  )
console.log('\nJoint grid, end-to-end RMSE (rows: production weight cap / games for full weight; columns: shrink,blur)')
const combos: [number, number][] = [[0, 0], [0, 0.75], [0, 2], [3, 0], [3, 0.75], [3, 2]]
console.log(['wMax,games', ...combos.map(([k, b]) => `k${k},b${b}`)].join('\t'))
for (const [wMax, fullGames] of [[0.4, 8], [0.55, 8], [0.7, 8], [0.85, 8], [1, 8], [0.7, 4], [0.7, 12], [0.85, 12]] as const) {
  const cells = combos.map(([k, b]) => evaluateValue(archives, worthWith({ shrinkGames: k, softPpg: b }, wMax, fullGames), WEEKS, pickValue).rmse.toFixed(2))
  console.log([`${wMax},${fullGames}`, ...cells].join('\t'))
}
