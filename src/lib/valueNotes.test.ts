import { describe, expect, it } from 'vitest'
import type { Player, Settings } from '../types'
import { DEFAULT_SETTINGS, evalSide, itemValue } from './valuation'
import { valueNotes, worthRound } from './valueNotes'

const s: Settings = { ...DEFAULT_SETTINGS, teams: 12, keepers: 2, rounds: 17, scoring: 'ppr', superflex: false, oneQb: false }
const mk = (id: string, pos: Player['pos'], adp: number, sfAdp: number | null = null): Player => ({
  id, sleeperId: null, name: `Player ${id}`, pos, team: 'XXX', adp, sfAdp,
})
const notes = (p: Player, round: number, st: Settings = s) => {
  const [it] = evalSide([{ t: 'p', id: p.id, keeperRound: round }], new Map([[p.id, p]]), st, 2027)
  return valueNotes(it!, round, st)!
}

describe('valueNotes', () => {
  it('maps a redraft value back to the round it is worth', () => {
    expect(worthRound(100, 12)).toBe(1)
    expect(worthRound(0.2, 12)).toBeNull()
    expect(worthRound(30, 12)).toBeGreaterThan(worthRound(80, 12)!)
  })

  it('calls an early pick valuable and a late one a flier', () => {
    expect(notes(mk('a', 'RB', 8), 1).redraft).toMatch(/top pick|first picks|premium|early|first two rounds/i)
    expect(notes(mk('b', 'WR', 190), 17).redraft).toMatch(/late|flier|bench|little|barely|wouldn’t/i)
  })

  it('says a keeper costing about his worth has little surplus', () => {
    const p = mk('c', 'RB', 30) // ADP 30 ~ round 3
    expect(notes(p, 3).keeper).toMatch(/about what|little surplus|saves almost nothing|costs more|no keeper surplus/i)
  })

  it('calls a cheap keeper a steal', () => {
    expect(notes(mk('d', 'RB', 6), 14).keeper).toMatch(/steal|big bargain|worth far more/i)
  })

  it('mentions superflex for QBs only when superflex is on', () => {
    const qb = mk('e', 'QB', 40, 15)
    expect(notes(qb, 4, { ...s, superflex: true }).redraft).toMatch(/superflex/i)
    expect(notes(qb, 4, { ...s, superflex: false }).redraft).not.toMatch(/superflex|one[- ]QB|only one/i)
  })

  it('only mentions PPR when receptions score', () => {
    const wr = mk('g', 'WR', 20)
    expect(notes(wr, 2, { ...s, scoring: 'ppr' }).redraft).toMatch(/PPR/)
    expect(notes(wr, 2, { ...s, scoring: 'half' }).redraft).toMatch(/half-PPR/)
    expect(notes(wr, 2, { ...s, scoring: 'std' }).redraft).not.toMatch(/PPR/i)
  })

  it('reads the same for the same player every time', () => {
    const p = mk('f', 'WR', 20)
    expect(notes(p, 2)).toEqual(notes(p, 2))
  })

  it('reads an injured star as a first-round pick, with the injury only in the availability line', () => {
    const healthy = mk('same', 'WR', 7)
    const hurt: Player = { ...healthy, inj: 'IR', weeksLeft: 6 }
    expect(notes(hurt, 1).redraft).toBe(notes(healthy, 1).redraft) // same wording: the injury doesn't touch it
    expect(notes(hurt, 1).redraft).not.toMatch(/little|barely|wouldn’t|injur/i)
    expect(notes(healthy, 1).availability).toBeNull()
    expect(notes(hurt, 1).availability).toBe('Player same is on injured reserve and is expected to miss extended time, so he adds very little to a lineup this season')
  })

  it('describes injuries in general terms, never with weeks or percentages', () => {
    const line = (inj: Player['inj'], weeksLeft?: number) =>
      notes({ ...mk('x', 'RB', 20), inj, ...(weeksLeft === undefined ? {} : { weeksLeft }) }, 2).availability!
    expect(line('Questionable', 6)).toBe('Player x is questionable and usually plays, so it barely changes his value this season')
    expect(line('Doubtful', 6)).toBe('Player x is doubtful and is likely to miss time, so he adds a little less to a lineup this season')
    expect(line('Out', 6)).toBe('Player x is out and is expected to miss time, so he adds less to a lineup this season')
    expect(line('PUP', 6)).toMatch(/PUP list.*extended time/)
    expect(line('Susp', 6)).toMatch(/suspended.*expected to miss time/)
    for (const inj of ['IR', 'PUP', 'Out', 'Susp', 'Doubtful', 'Questionable'] as const) {
      for (const weeks of [undefined, 1, 6, 15]) expect(line(inj, weeks)).not.toMatch(/\d/) // no numbers at all
    }
  })

  it('keeps the headline value injury-adjusted but the keeper side alone', () => {
    const healthy = mk('h2', 'RB', 7)
    const hurt: Player = { ...mk('h2', 'RB', 7), inj: 'IR', weeksLeft: 6 }
    const val = (p: Player) => {
      const [it] = evalSide([{ t: 'p', id: p.id, keeperRound: 8 }], new Map([[p.id, p]]), s, 2027)
      return { it: it!, total: itemValue(it!, s) }
    }
    expect(val(hurt).it.value).toBeCloseTo(val(healthy).it.value) // keeper unchanged
    expect(val(hurt).it.redraft).toBeCloseTo(val(healthy).it.redraft!) // draft value unchanged
    expect(val(hurt).total).toBeLessThan(val(healthy).total) // but he counts for less now
  })

  describe('keeper wording in rounds', () => {
    const withProduction = (id: string, adp: number, curAdp: number, age: number): Player => ({
      ...mk(id, 'WR', adp),
      age,
      curAdp,
      stats: { gp: 10, ppr: 176, half: 176, std: 176 },
    })

    it('calls a late-round keeper who projects five or more rounds earlier a big bargain, and says which round', () => {
      // preseason ADP 111, producing like a 39th pick, kept in round 11: projects as about a round 5 pick
      const text = notes(withProduction('g', 111, 39, 23), 11).keeper
      expect(text).toMatch(/steal|big bargain/i)
      expect(text).toMatch(/round 5 pick/)
      expect(text).toMatch(/round 11/)
    })

    it('calls a gain of one or two rounds small, and three or four a good keeper', () => {
      const small = notes(withProduction('s', 60, 60, 24), 6).keeper // projects round 5, costs round 6
      expect(small).toMatch(/small bargain|costs a bit less/i)
      const good = notes(withProduction('m', 60, 60, 24), 8).keeper // projects round 5, costs round 8
      expect(good).toMatch(/good keeper|undersells/i)
    })

    it('says there is little surplus when he projects in the round he costs, even with a small surplus', () => {
      // pick 62 is in round 6 and a round 6 keeper costs pick 66: slightly cheaper, but not a round cheaper
      expect(notes(withProduction('e', 62, 62, 24), 6).keeper).toMatch(/about what|little surplus|saves almost nothing/i)
    })

    it('does not let rounding error move a pick across a round boundary', () => {
      // pick 60 is the last pick of round 5, so a round 6 keeper saves exactly one round
      expect(notes(withProduction('b', 60, 60, 24), 6).keeper).toMatch(/small bargain|costs a bit less/i)
    })

    it('mentions age only after a bargain, never on a line about little or no surplus', () => {
      const old = (id: string, adp: number, curAdp: number) => ({ ...withProduction(id, adp, curAdp, 31), age: 31 })
      // a bargain for an older player: the age clause follows
      expect(notes(old('a', 111, 39), 11).keeper).toMatch(/steal|big bargain|good keeper|undersells/i)
      expect(notes(old('a', 111, 39), 11).keeper).toMatch(/, though age discounts him \(31 y\/o\)/)
      // costs about what he's worth: no "though"
      expect(notes(old('b', 62, 62), 6).keeper).not.toMatch(/though|age/i)
      // no surplus at all: no "though" either
      expect(notes(old('c', 30, 30), 1).keeper).not.toMatch(/though|age/i)
    })
  })
})
