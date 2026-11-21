import { describe, expect, it } from 'vitest'
import type { Player } from '../types'
import { bestLineup, buildSlots, countFlex, lineupByPos, lineupTotal, slotLabel } from './lineup'

const mk = (id: string, pos: Player['pos'], strength: number): Player => ({
  id,
  sleeperId: null,
  name: id,
  pos,
  team: 'XXX',
  adp: strength, // the tests use ADP as the strength directly
  sfAdp: null,
})
const strength = (p: Player) => p.adp

describe('countFlex', () => {
  it('counts every flex-type slot but not superflex', () => {
    expect(countFlex(['QB', 'FLEX', 'REC_FLEX', 'WRRB_FLEX', 'SUPER_FLEX', 'BN'])).toBe(3)
    expect(countFlex(['QB', 'RB', 'BN'])).toBe(0)
  })
})

describe('buildSlots', () => {
  const league = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'K', 'DEF', 'BN', 'BN', 'IR', 'TAXI']
  const labels = (slots: readonly (readonly string[])[]) => slots.map((s) => slotLabel(s as never))

  it('takes position slots, including K and D/ST, from the league and ignores bench, IR and taxi', () => {
    expect(labels(buildSlots(league, { flex: 1, superflex: true }))).toEqual([
      'QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'K', 'D/ST', 'FLEX', 'SUPERFLEX',
    ])
  })
  it('follows the flex setting rather than the league’s flex entries', () => {
    expect(labels(buildSlots(league, { flex: 3, superflex: false }))).toEqual([
      'QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'K', 'D/ST', 'FLEX', 'FLEX', 'FLEX',
    ])
    expect(buildSlots(league, { flex: 0, superflex: false })).toHaveLength(8)
  })
  it('keeps a league’s multiple superflex slots', () => {
    expect(buildSlots(['QB', 'SUPER_FLEX', 'SUPER_FLEX'], { flex: 0, superflex: true })).toHaveLength(3)
  })
  it('falls back to a typical lineup with no K or D/ST when the league’s layout is unknown', () => {
    expect(labels(buildSlots(null, { flex: 1, superflex: false }))).toEqual(['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX'])
    expect(labels(buildSlots(undefined, { flex: 2, superflex: true }))).toEqual([
      'QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'SUPERFLEX',
    ])
  })
})

describe('bestLineup', () => {
  const slots = [['RB'], ['RB'], ['WR'], ['RB', 'WR', 'TE']] as const

  it('fills dedicated slots first, then flex with the best players left', () => {
    const roster = [mk('rb1', 'RB', 90), mk('rb2', 'RB', 80), mk('rb3', 'RB', 70), mk('wr1', 'WR', 60), mk('wr2', 'WR', 50)]
    const lineup = bestLineup(roster, slots, strength)
    expect(lineup.map((s) => s.player.id).sort()).toEqual(['rb1', 'rb2', 'rb3', 'wr1'])
    expect(lineupTotal(lineup)).toBe(300)
  })

  it('never uses a flex slot on a player who is better used at his own position', () => {
    // wr1 is the only WR, so WR must take him; flex then goes to the best remaining RB.
    const lineup = bestLineup([mk('wr1', 'WR', 99), mk('rb1', 'RB', 10), mk('rb2', 'RB', 9), mk('rb3', 'RB', 8)], slots, strength)
    expect(lineup.find((s) => s.player.id === 'wr1')).toBeDefined()
    expect(lineupTotal(lineup)).toBe(99 + 10 + 9 + 8)
  })

  it('leaves a slot empty when no eligible player is left', () => {
    const lineup = bestLineup([mk('rb1', 'RB', 90)], slots, strength)
    expect(lineup).toHaveLength(1)
  })

  it('does not field a QB at a position slot', () => {
    expect(bestLineup([mk('qb', 'QB', 99)], [['RB'], ['WR']], strength)).toEqual([])
  })
})

describe('lineupByPos', () => {
  it('sums starter strength by each starter’s own position', () => {
    const lineup = bestLineup([mk('rb1', 'RB', 90), mk('rb2', 'RB', 80), mk('wr1', 'WR', 60)], [['RB'], ['RB', 'WR']], strength)
    expect(lineupByPos(lineup)).toEqual({ QB: 0, RB: 170, WR: 0, TE: 0, K: 0, DEF: 0 })
  })
  it('counts kickers and defenses at their own positions', () => {
    const lineup = bestLineup([mk('k1', 'K', 20), mk('d1', 'DEF', 15)], [['K'], ['DEF']], strength)
    expect(lineupByPos(lineup)).toMatchObject({ K: 20, DEF: 15 })
  })
})
