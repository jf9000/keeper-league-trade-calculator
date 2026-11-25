import { describe, expect, it } from 'vitest'
import type { Player } from '../types'
import { findTrades, type FinderArgs } from './finder'
import { buildSlots } from './lineup'
import type { LeagueTeam } from './sleeper'
import { DEFAULT_SETTINGS, evalTrade, gradeFor } from './valuation'

const S = { ...DEFAULT_SETTINGS, superflex: false, flex: 1, redraftWeight: 50, teams: 4, keepers: 3 }
const mk = (id: string, pos: Player['pos'], adp: number): Player => ({ id, sleeperId: id, name: id, pos, team: 'X', adp, sfAdp: null })
const team = (rosterId: number): LeagueTeam => ({ rosterId, ownerId: String(rosterId), name: `T${rosterId}`, playerIds: [] })

// Each team is deep at one position and thin at another, so swaps can help both sides.
const A = [mk('a-rb1', 'RB', 6), mk('a-rb2', 'RB', 9), mk('a-rb3', 'RB', 14), mk('a-wr1', 'WR', 70), mk('a-qb', 'QB', 40), mk('a-te', 'TE', 60)]
const B = [mk('b-wr1', 'WR', 7), mk('b-wr2', 'WR', 10), mk('b-wr3', 'WR', 15), mk('b-rb1', 'RB', 75), mk('b-qb', 'QB', 45), mk('b-te', 'TE', 65)]
const byId = new Map([...A, ...B].map((p) => [p.id, p]))
const rosters = new Map([
  [1, A],
  [2, B],
])
const slots = buildSlots(null, S)
const FAIR = ['B', 'B+', 'A-', 'A', 'A+']

const args = (over: Partial<FinderArgs> = {}): FinderArgs => ({
  me: team(1),
  partners: [team(2)],
  rosterOf: (t) => rosters.get(t.rosterId) ?? [],
  picksOf: () => undefined,
  byId,
  s: S,
  firstPickYear: 2027,
  slots,
  want: [],
  sell: [],
  mode: 'win-win',
  ...over,
})

describe('findTrades', () => {
  it('only returns win-win offers that grade B or better for both teams', async () => {
    for (const o of await findTrades(args())) {
      expect(FAIR).toContain(o.gradeMine)
      expect(FAIR).toContain(o.gradeTheirs)
      const mine = o.mine.gets - o.mine.gives
      const theirs = o.theirs.gets - o.theirs.gives
      expect(Math.min(mine, theirs)).toBeGreaterThanOrEqual(1)
      // The smaller gain is at least 40% of the larger, so the win is shared.
      expect(Math.min(mine, theirs) / Math.max(mine, theirs)).toBeGreaterThanOrEqual(0.4)
    }
  })

  it('in best-for-me mode the other team still gets at least 80% of what it gives up', async () => {
    for (const o of await findTrades(args({ mode: 'best-for-me' }))) {
      expect(o.theirs.gets).toBeGreaterThanOrEqual(0.8 * o.theirs.gives)
      expect(o.mine.gets).toBeGreaterThan(o.mine.gives)
    }
  })

  it('grades each offer exactly as the calculator would', async () => {
    const offers = await findTrades(args({ mode: 'best-for-me' }))
    expect(offers.length).toBeGreaterThan(0)
    for (const o of offers) {
      const [m, t] = evalTrade(o.give, o.get, A, B, byId, S, 2027, undefined, slots, [undefined, undefined])
      expect(gradeFor(m.gets, m.gives)).toBe(o.gradeMine)
      expect(gradeFor(t.gets, t.gives)).toBe(o.gradeTheirs)
    }
  })

  it('honors the position filter', async () => {
    for (const o of await findTrades(args({ mode: 'best-for-me', want: ['TE'] }))) {
      expect(o.get.some((a) => a.t === 'p' && byId.get(a.id)!.pos === 'TE')).toBe(true)
    }
  })

  it('only offers trades that send a position you want to sell', async () => {
    const offers = await findTrades(args({ mode: 'best-for-me', sell: ['RB'] }))
    expect(offers.length).toBeGreaterThan(0)
    for (const o of offers) {
      expect(o.give.some((a) => a.t === 'p' && byId.get(a.id)!.pos === 'RB')).toBe(true)
    }
  })

  it('never trades with yourself and sorts best first', async () => {
    const offers = await findTrades(args({ partners: [team(1), team(2)], mode: 'best-for-me' }))
    expect(offers.every((o) => o.partner.rosterId !== 1)).toBe(true)
    const scores = offers.map((o) => o.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
  })

  it('grades offers with each outlook applied', async () => {
    const stances = ['contending', 'rebuilding'] as const
    const offers = await findTrades(args({ mode: 'best-for-me', stances }))
    for (const o of offers) {
      const [m, t] = evalTrade(o.give, o.get, A, B, byId, S, 2027, undefined, slots, [undefined, undefined], stances)
      expect(gradeFor(m.gets, m.gives)).toBe(o.gradeMine)
      expect(gradeFor(t.gets, t.gives)).toBe(o.gradeTheirs)
    }
  })

  it('stops when aborted', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    expect(await findTrades(args(), undefined, ctrl.signal)).toEqual([])
  })
})
