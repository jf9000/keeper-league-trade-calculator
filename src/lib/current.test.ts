import { describe, expect, it } from 'vitest'
import type { Player, Pos, Settings } from '../types'
import { MIN_GAMES, pointsPerGame, rankByCurrentSeason } from './current'
import { DEFAULT_SETTINGS, UNDRAFTED_ADP } from './valuation'

const s: Settings = { ...DEFAULT_SETTINGS, scoring: 'ppr', superflex: false }
const mk = (id: string, pos: Pos, adp: number, ppg: number | null, gp = 8, sfAdp: number | null = null): Player => ({
  id,
  sleeperId: id,
  name: id,
  pos,
  team: 'XXX',
  adp,
  sfAdp,
  ...(ppg === null ? {} : { stats: { gp, ppr: ppg * gp, half: ppg * gp * 0.9, std: ppg * gp * 0.8 } }),
})
const cur = (ps: Player[], settings = s) => new Map(rankByCurrentSeason(ps, settings).map((p) => [p.id, p.curAdp]))

describe('pointsPerGame', () => {
  it('divides season points by games in the league scoring', () => {
    const p = mk('a', 'RB', 10, 20, 5)
    expect(pointsPerGame(p, s)).toBeCloseTo(20)
    expect(pointsPerGame(p, { scoring: 'std' })).toBeCloseTo(16)
  })
  it('is null without stats or games', () => {
    expect(pointsPerGame(mk('a', 'RB', 10, null), s)).toBeNull()
    expect(pointsPerGame({ ...mk('a', 'RB', 10, 5), stats: { gp: 0, ppr: 0, half: 0, std: 0 } }, s)).toBeNull()
  })
})

describe('rankByCurrentSeason', () => {
  it('gives the n-th best producer at a position the n-th best ADP slot at that position', () => {
    const out = cur([mk('late', 'RB', 10, 5), mk('mid', 'RB', 30, 15), mk('top', 'RB', 50, 25)])
    expect(out.get('top')).toBe(10)
    expect(out.get('mid')).toBe(30)
    expect(out.get('late')).toBe(50)
  })

  it('ranks each position against its own ADP slots', () => {
    const out = cur([mk('qb', 'QB', 40, 20), mk('rb', 'RB', 3, 5), mk('rb2', 'RB', 6, 4)])
    expect(out.get('qb')).toBe(40) // the only QB takes the best QB slot
    expect(out.get('rb')).toBe(3)
  })

  it('leaves players with too few games unranked, and not taking a slot', () => {
    const out = cur([mk('rookie', 'RB', 10, 30, MIN_GAMES - 1), mk('vet', 'RB', 20, 10), mk('other', 'RB', 40, 8)])
    expect(out.get('rookie')).toBeUndefined()
    expect(out.get('vet')).toBe(10)
    expect(out.get('other')).toBe(20)
  })

  it('leaves players without stats unranked', () => {
    expect(cur([mk('a', 'RB', 10, null)]).get('a')).toBeUndefined()
  })

  it('does not let undrafted placeholders take ADP slots, but does rank them', () => {
    const out = cur([mk('drafted', 'RB', 15, 6), mk('breakout', 'RB', UNDRAFTED_ADP, 22)])
    expect(out.get('breakout')).toBe(15) // the best real RB slot, not the placeholder
    expect(out.get('drafted')).toBeUndefined() // only one real slot, and the breakout took it
  })

  it('follows the scoring format when ranking', () => {
    // a catches more passes (better in PPR), b scores more without them
    const a: Player = { ...mk('a', 'WR', 10, null), stats: { gp: 8, ppr: 160, half: 130, std: 100 } }
    const b: Player = { ...mk('b', 'WR', 30, null), stats: { gp: 8, ppr: 130, half: 125, std: 120 } }
    expect(cur([a, b], { ...s, scoring: 'ppr' }).get('a')).toBe(10)
    expect(cur([a, b], { ...s, scoring: 'std' }).get('b')).toBeCloseTo(10 * 1.08) // standard scoring shifts WR ADP slots
  })

  it('uses superflex ADP slots for QBs in a superflex league', () => {
    const qbs = [mk('q1', 'QB', 40, 25, 8, 4), mk('q2', 'QB', 60, 18, 8, 15)]
    expect(cur(qbs, { ...s, superflex: true }).get('q1')).toBe(4)
    expect(cur(qbs, { ...s, superflex: false }).get('q1')).toBe(40)
  })

  it('does not change its input', () => {
    const input = [mk('a', 'RB', 10, 20)]
    rankByCurrentSeason(input, s)
    expect(input[0]!.curAdp).toBeUndefined()
  })
})
