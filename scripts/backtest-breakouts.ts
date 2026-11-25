/**
 * Tests, offline, how much weight this season's production should get when projecting a player's value next season
 * (the app uses `CURRENT_WEIGHT_KEEPER`, scaled up over the first 8 games), and whether breakouts need a different weight than everyone
 * else. Run with `npm run backtest-breakouts`. Reads data/archive; prints tables only.
 *
 * Target: the player's value the following season (the pick value of the slot his full-season production rank
 * earns, 0 if he barely plays). Prediction: age factor x a blend of the value at his preseason ADP and the value
 * at his production slot, with production weight w. A breakout is a player drafted 60th or later (or undrafted)
 * who is producing like a top-30 pick at his position.
 */
import { ageFactor } from '../src/lib/age'
import { rankByCurrentSeason } from '../src/lib/current'
import { DEFAULT_SETTINGS, adpOf, pickValue } from '../src/lib/valuation'
import { lineTotals } from './archive'
import { loadArchives, playersAsOf } from './backtestLib'
import { seasonValues } from './fit-age'

const s = { ...DEFAULT_SETTINGS, superflex: false }
const archives = loadArchives()
const WEIGHTS = [0, 0.2, 0.4, 0.6, 0.8, 1]

interface Row {
  group: string
  adpV: number
  curV: number
  gp: number
  ageF: number
  next: number
}
const rows: Row[] = []
for (let k = 0; k + 1 < archives.length; k++) {
  const a = archives[k]!
  const b = archives[k + 1]!
  if (b.season !== a.season + 1) continue
  const nextVals = seasonValues(b)
  for (const week of [5, 8, 11]) {
    if (week >= a.weeks - 2) continue
    for (const p of rankByCurrentSeason(playersAsOf(a, week), s, week)) {
      if (p.curAdp == null || (p.stats?.gp ?? 0) < 4) continue
      const adp = adpOf(p, s)
      const bp = b.players[p.id]
      const next = bp && lineTotals(bp).gp >= 6 ? (nextVals.get(p.id)?.v ?? 0) : 0
      const breakout = adp >= 60 && p.curAdp <= 30
      const young = (p.age ?? 99) <= 25
      rows.push({
        group: breakout ? (young ? 'breakout, 25 or younger' : 'breakout, 26+') : 'everyone else',
        adpV: pickValue(adp),
        curV: pickValue(Math.max(1, p.curAdp)),
        gp: p.stats!.gp,
        ageF: ageFactor(p),
        next,
      })
    }
  }
}

const predict = (r: Row, w: number) => r.ageF * ((1 - w * Math.min(1, r.gp / 8)) * r.adpV + w * Math.min(1, r.gp / 8) * r.curV)
const groups = ['breakout, 25 or younger', 'breakout, 26+', 'everyone else']
console.log(`${rows.length} player-weeks. Next-season value vs prediction by production weight (RMSE; mean error, + = underpredicted)`)
console.log(['group', 'n', ...WEIGHTS.map((w) => `w=${w}`)].join('\t'))
for (const g of [...groups, 'all']) {
  const rs = g === 'all' ? rows : rows.filter((r) => r.group === g)
  if (!rs.length) continue
  const cells = WEIGHTS.map((w) => {
    const err = rs.map((r) => r.next - predict(r, w))
    const rmse = Math.sqrt(err.reduce((t, x) => t + x * x, 0) / err.length)
    const bias = err.reduce((t, x) => t + x, 0) / err.length
    return `${rmse.toFixed(1)}; ${bias >= 0 ? '+' : ''}${bias.toFixed(1)}`
  })
  console.log([g, rs.length, ...cells].join('\t'))
}
const best = (rs: Row[]) => {
  let bw = 0
  let be = Infinity
  for (let w = 0; w <= 1.0001; w += 0.05) {
    const e = rs.reduce((t, r) => t + (r.next - predict(r, w)) ** 2, 0)
    if (e < be) {
      be = e
      bw = w
    }
  }
  return bw
}
console.log('\nBest production weight (lowest squared error, step 0.05):')
for (const g of [...groups, 'all']) console.log(`  ${g}: ${best(g === 'all' ? rows : rows.filter((r) => r.group === g)).toFixed(2)}`)
