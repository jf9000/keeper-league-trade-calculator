/**
 * Fits the per-position age curves in src/lib/ageCurves.ts from data/archive. Run with `npm run fit-age`
 * (add `--write` to overwrite the file; without it only the diagnostics are printed). Offline only.
 *
 * For each pair of consecutive seasons, a player's value in a season is the pick value of the slot his
 * full-season production rank earns at his position. His retention is next season's value over this season's
 * (0 when he barely plays), pooled by position and age (each age shares data with the ages beside it), then
 * made non-increasing after the peak and expressed relative to ages 24-26.
 */
import { writeFileSync } from 'node:fs'
import { pickValue } from '../src/lib/valuation'
import { lineTotals, type ArchiveFile } from './archive'
import { loadArchives } from './backtestLib'

const POS = ['QB', 'RB', 'WR', 'TE'] as const
export const FIRST_AGE = 22
export const LAST_AGE = 38
/** A season counts toward a player's value only with at least this many games. */
const MIN_GAMES_VALUED = 8
/** Fewer games than this next season counts as having dropped out (value 0). */
const MIN_GAMES_NEXT = 6
/** Ages pooled on each side of the one being estimated. */
const WINDOW = 1
/** Ages whose retention sets the reference "prime" level. */
const REF_FROM = 24
const REF_TO = 26
/** The hand-tuned curve counts as this many player-seasons of evidence when blended with the data. */
const PRIOR_WEIGHT = 60
const FLOOR = 0.2

/** The hand-tuned curve this replaces, used where the archive has too little data. */
const PRIOR: Record<string, { from: number; perYear: number }> = {
  RB: { from: 27, perYear: 0.08 },
  WR: { from: 30, perYear: 0.07 },
  TE: { from: 30, perYear: 0.07 },
  QB: { from: 35, perYear: 0.06 },
}
const priorFactor = (pos: string, age: number) => {
  const d = PRIOR[pos]!
  return age < d.from ? 1 : Math.max(FLOOR, 1 - d.perYear * (age - d.from + 1))
}

/** Season value per player: pick value of the slot his production rank earns at his position. */
export function seasonValues(a: ArchiveFile): Map<string, { v: number; age?: number; pos: string }> {
  const out = new Map<string, { v: number; age?: number; pos: string }>()
  for (const pos of POS) {
    const all = Object.entries(a.players).filter(([, p]) => p.pos === pos)
    const slots = all.flatMap(([, p]) => (p.adp !== undefined ? [p.adp] : [])).sort((x, y) => x - y)
    const ranked = all
      .map(([id, p]) => ({ id, p, t: lineTotals(p) }))
      .filter((x) => x.t.gp >= MIN_GAMES_VALUED)
      .sort((x, y) => y.t.pts / y.t.gp - x.t.pts / x.t.gp)
    ranked.forEach(({ id, p }, i) => {
      const slot = slots[i]
      out.set(id, { v: slot === undefined ? 0 : pickValue(slot), age: p.age, pos })
    })
  }
  return out
}

export interface AgeFit {
  /** Retention by age, as a share of the best age's retention (capped at 1). */
  curve: Record<string, number[]>
  diag: { pos: string; age: number; n: number; ratio: number; smoothed: number }[]
}

export function fitAgeCurves(archives: readonly ArchiveFile[], holdOut?: number): AgeFit {
  const sums = new Map<string, { now: number; next: number; n: number }>()
  for (let i = 0; i + 1 < archives.length; i++) {
    const a = archives[i]!
    const b = archives[i + 1]!
    if (b.season !== a.season + 1 || a.season === holdOut) continue
    const va = seasonValues(a)
    const vb = seasonValues(b)
    for (const [id, x] of va) {
      if (x.age === undefined || x.v <= 0) continue
      const bp = b.players[id]
      const nextGames = bp ? lineTotals(bp).gp : 0
      const next = nextGames >= MIN_GAMES_NEXT ? (vb.get(id)?.v ?? 0) : 0
      const key = `${x.pos}|${x.age}`
      const s = sums.get(key) ?? { now: 0, next: 0, n: 0 }
      sums.set(key, { now: s.now + x.v, next: s.next + next, n: s.n + 1 })
    }
  }

  const curve: Record<string, number[]> = {}
  const diag: AgeFit['diag'] = []
  for (const pos of POS) {
    const ages = Array.from({ length: LAST_AGE - FIRST_AGE + 1 }, (_, i) => FIRST_AGE + i)
    const pooled = ages.map((age) => {
      let now = 0
      let next = 0
      let n = 0
      for (let d = -WINDOW; d <= WINDOW; d++) {
        const s = sums.get(`${pos}|${age + d}`)
        if (s) {
          now += s.now
          next += s.next
          n += s.n
        }
      }
      return { age, n, ratio: now > 0 ? next / now : NaN }
    })
    // Reference: how much value players aged 24-26 keep, so growth by younger players doesn't count as a prime.
    let refNow = 0
    let refNext = 0
    for (let age = REF_FROM; age <= REF_TO; age++) {
      const s = sums.get(`${pos}|${age}`)
      if (s) {
        refNow += s.now
        refNext += s.next
      }
    }
    const ref = refNow > 0 ? refNext / refNow : 1
    // From 27 on: the data's retention relative to the reference where there's enough of it, else the hand-tuned
    // curve; never rising with age, and never below FLOOR.
    let run = 1
    const smoothed = ages.map((age, i) => {
      if (age < REF_TO + 1) return 1
      const prior = priorFactor(pos, age)
      const n = pooled[i]!.n
      const f = n > 0 && !Number.isNaN(pooled[i]!.ratio) ? (n * Math.min(1, pooled[i]!.ratio / ref) + PRIOR_WEIGHT * prior) / (n + PRIOR_WEIGHT) : prior
      run = Math.min(run, Math.max(FLOOR, f))
      return run
    })
    curve[pos] = smoothed.map((v) => Math.round(v * 100) / 100)
    pooled.forEach((x, i) => diag.push({ pos, age: x.age, n: x.n, ratio: x.ratio, smoothed: curve[pos]![i]! }))
  }
  return { curve, diag }
}

/**
 * For each held-out pair (season -> season + 1), predicts every 27+ player's next-season value as
 * this-season value x (that position's 24-26 retention in the held-out pair) x an age factor, and sums the squared
 * error. Both curves get the same per-position scale, so only their shapes compete.
 */
function holdOutCheck(archives: readonly ArchiveFile[], season: number) {
  const a = archives.find((x) => x.season === season)!
  const b = archives.find((x) => x.season === season + 1)!
  const fit = fitAgeCurves(archives, season)
  const va = seasonValues(a)
  const vb = seasonValues(b)
  const sse = { fitted: 0, prior: 0, flat: 0 }
  let n = 0
  for (const pos of POS) {
    let refNow = 0
    let refNext = 0
    const old: { v: number; next: number; age: number }[] = []
    for (const [id, x] of va) {
      if (x.pos !== pos || x.age === undefined || x.v <= 0) continue
      const bp = b.players[id]
      const next = bp && lineTotals(bp).gp >= MIN_GAMES_NEXT ? (vb.get(id)?.v ?? 0) : 0
      if (x.age >= REF_FROM && x.age <= REF_TO) {
        refNow += x.v
        refNext += next
      } else if (x.age > REF_TO) old.push({ v: x.v, next, age: x.age })
    }
    if (!refNow) continue
    const scale = refNext / refNow
    for (const o of old) {
      const at = Math.min(o.age, LAST_AGE)
      sse.fitted += (o.next - o.v * scale * (fit.curve[pos]![at - FIRST_AGE] ?? 1)) ** 2
      sse.prior += (o.next - o.v * scale * priorFactor(pos, o.age)) ** 2
      sse.flat += (o.next - o.v * scale) ** 2
      n++
    }
  }
  return { sse, n }
}

if (process.argv[1]?.endsWith('fit-age.ts') && process.argv.includes('--check')) {
  const archives = loadArchives()
  const total = { fitted: 0, prior: 0, flat: 0 }
  let n = 0
  for (const season of archives.slice(0, -1).map((x) => x.season)) {
    const r = holdOutCheck(archives, season)
    total.fitted += r.sse.fitted
    total.prior += r.sse.prior
    total.flat += r.sse.flat
    n += r.n
    console.log(`${season}->${season + 1}: fitted ${Math.sqrt(r.sse.fitted / r.n).toFixed(2)}  hand-tuned ${Math.sqrt(r.sse.prior / r.n).toFixed(2)}  no age effect ${Math.sqrt(r.sse.flat / r.n).toFixed(2)}  (n=${r.n})`)
  }
  console.log(`
Held-out RMSE over ${n} player-seasons: fitted ${Math.sqrt(total.fitted / n).toFixed(3)}, hand-tuned ${Math.sqrt(total.prior / n).toFixed(3)}, no age effect ${Math.sqrt(total.flat / n).toFixed(3)}`)
} else if (process.argv[1]?.endsWith('fit-age.ts')) {
  const archives = loadArchives()
  const fit = fitAgeCurves(archives)
  for (const pos of POS) {
    console.log(`\n${pos}: age  n  raw-ratio  final`)
    for (const d of fit.diag.filter((x) => x.pos === pos && x.n > 0)) {
      console.log(`  ${d.age}  ${String(d.n).padStart(3)}  ${Number.isNaN(d.ratio) ? '  -  ' : d.ratio.toFixed(2)}  ${d.smoothed.toFixed(2)}`)
    }
  }
  if (process.argv.includes('--write')) {
    const rows = POS.map((pos) => `  ${pos}: [${fit.curve[pos]!.join(', ')}],`).join('\n')
    writeFileSync(
      'src/lib/ageCurves.ts',
      `// Generated by scripts/fit-age.ts from data/archive (${archives[0]!.season}-${archives[archives.length - 1]!.season}). Do not edit by hand.\n` +
        `// Share of keeper value kept at each age, starting at FIRST_AGE, relative to ages 24-26.\n` +
        `export const FIRST_AGE = ${FIRST_AGE}\nexport const AGE_CURVE: Record<'QB' | 'RB' | 'WR' | 'TE', readonly number[]> = {\n${rows}\n}\n`,
    )
    console.log('\nWrote src/lib/ageCurves.ts')
  }
}
