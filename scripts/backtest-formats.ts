/**
 * Re-checks the tunable constants in every league format: PPR, half-PPR and standard, each in 1QB and superflex.
 * Run with `npm run backtest-formats`. Offline only; reads data/archive.
 *
 * For each format and each candidate setting it reports two things, averaged over the archive's seasons and cut
 * weeks (5, 8, 11):
 *   rho - Spearman correlation, within position, between the production ranking and rest-of-season points
 *   err - RMSE of the value estimate against the value of the rest-of-season rank, at the best overall scale
 *         (so only the shape of the curve is judged; trades compare ratios)
 * Higher rho and lower err are better. A setting is only worth changing for a format if it clearly beats the
 * shipped one there.
 */
import { rankByCurrentSeason } from '../src/lib/current'
import { FORMAT_ADP } from '../src/lib/formatAdp'
import { DEFAULT_SETTINGS, adpOf, pickValue } from '../src/lib/valuation'
import type { Scoring, Settings } from '../src/types'
import { lineTotals } from './archive'
import { loadArchives, playersAsOf, spearman } from './backtestLib'

const archives = loadArchives()
const WEEKS = [5, 8, 11]
const FMT: Record<Scoring, 0 | 1 | 2> = { ppr: 0, half: 1, std: 2 }

interface Cfg {
  shrink: number
  soft: number
  /** Use the real standard / half-PPR ADP from the archive instead of PPR ADP times the fitted multiplier. */
  real?: boolean
}
/** The constants as shipped. */
const SHIPPED: Cfg = { shrink: 1, soft: 1.5 }

function score(s: Settings, cfg: Cfg): { rho: number; err: number } {
  const fi = FMT[s.scoring]
  let rhoSum = 0
  let rhoN = 0
  const preds: number[] = []
  const tgts: number[] = []
  for (const a of archives) {
    for (const week of WEEKS) {
      if (week >= a.weeks - 2) continue
      const base = playersAsOf(a, week).map((p) => {
        let q = s.superflex && p.adp >= 400 && p.sfAdp != null ? { ...p, adp: 399 } : p
        if (cfg.real && s.scoring !== 'ppr') {
          const ap = a.players[p.id]!
          const real = s.scoring === 'std' ? ap.adpStd : ap.adpHalf
          // adpOf multiplies by the fitted shift, so divide it out to land exactly on the real ADP.
          if (real !== undefined) q = { ...q, adp: real / FORMAT_ADP[s.scoring === 'std' ? 'std' : 'half'][ap.pos], sfAdp: null }
        }
        return q
      })
      const ranked = rankByCurrentSeason(base, s, week, { shrinkGames: cfg.shrink, softPpg: cfg.soft })
      for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
        const pre = base
          .filter((p) => p.pos === pos && p.adp < 400)
          .map((p) => adpOf(p, s))
          .sort((x, y) => x - y)
        const judged = ranked
          .filter((p) => p.pos === pos && (p.stats?.gp ?? 0) >= 4)
          .flatMap((p) => {
            const t = lineTotals(a.players[p.id]!, week, a.players[p.id]!.w.length, fi)
            return t.gp >= 3 ? [{ p, y: t.pts / t.gp }] : []
          })
        const xs = judged.map(({ p }) => -(p.curAdp ?? adpOf(p, s)))
        const r = spearman(xs, judged.map((j) => j.y))
        if (!Number.isNaN(r) && judged.length >= 8) {
          rhoSum += r * judged.length
          rhoN += judged.length
        }
        const byFuture = [...judged].sort((x, y) => y.y - x.y)
        byFuture.forEach(({ p }, i) => {
          const slot = pre[i]
          if (slot === undefined) return
          const w = p.curAdp == null ? 0 : 0.7 * Math.min(1, p.stats!.gp / 8)
          preds.push((1 - w) * pickValue(adpOf(p, s)) + w * pickValue(Math.max(1, p.curAdp ?? 1)))
          tgts.push(pickValue(slot))
        })
      }
    }
  }
  const k = preds.reduce((t, x, i) => t + x * tgts[i]!, 0) / preds.reduce((t, x) => t + x * x, 0)
  const err = Math.sqrt(preds.reduce((t, x, i) => t + (k * x - tgts[i]!) ** 2, 0) / preds.length)
  return { rho: rhoN ? rhoSum / rhoN : NaN, err }
}

const FORMATS: [string, Settings][] = []
for (const scoring of ['ppr', 'half', 'std'] as const) {
  for (const superflex of [false, true]) {
    FORMATS.push([`${scoring}${superflex ? ' SF' : ' 1QB'}`, { ...DEFAULT_SETTINGS, scoring, superflex }])
  }
}

const variants: [string, Partial<Cfg>][] = [
  ['shipped', {}],
  ['shrink 0', { shrink: 0 }],
  ['shrink 3', { shrink: 3 }],
  ['blur 0', { soft: 0 }],
  ['blur 3', { soft: 3 }],
  ['real format ADP', { real: true }],
]

console.log('rho (higher is better) / err (lower is better)')
console.log(['setting', ...FORMATS.map(([n]) => n)].join('\t'))
for (const [name, patch] of variants) {
  const cells = FORMATS.map(([, s]) => {
    const r = score(s, { ...SHIPPED, ...patch })
    return `${r.rho.toFixed(3)} / ${r.err.toFixed(1)}`
  })
  console.log([name, ...cells].join('\t'))
}
