import { describe, expect, it } from 'vitest'
import type { Player, Pos, Settings } from '../types'
import { AGE_DECLINE, ageFactor, parseAge } from './age'
import { ageNotes } from './notes'
import { DEFAULT_SETTINGS, keeperWorth, redraftWorth } from './valuation'

const s: Settings = { ...DEFAULT_SETTINGS, superflex: false }
const mk = (id: string, pos: Pos, adp: number, age?: number): Player => ({
  id,
  sleeperId: id,
  name: id,
  pos,
  team: 'XXX',
  adp,
  sfAdp: null,
  ...(age === undefined ? {} : { age }),
})

describe('ageFactor', () => {
  it('does nothing before the decline starts, or when age is unknown', () => {
    expect(ageFactor(mk('a', 'RB', 10, 26))).toBe(1)
    expect(ageFactor(mk('a', 'WR', 10, 29))).toBe(1)
    expect(ageFactor(mk('a', 'QB', 10, 34))).toBe(1)
    expect(ageFactor(mk('a', 'RB', 10))).toBe(1)
  })

  it('starts at 27 for RBs, 30 for WRs and TEs, and 35 for QBs', () => {
    expect(ageFactor(mk('a', 'RB', 10, 27))).toBeCloseTo(0.92)
    expect(ageFactor(mk('a', 'WR', 10, 30))).toBeCloseTo(0.93)
    expect(ageFactor(mk('a', 'TE', 10, 30))).toBeCloseTo(0.93)
    expect(ageFactor(mk('a', 'QB', 10, 35))).toBeCloseTo(0.94)
  })

  it('keeps falling each year, and runs backs down faster than receivers', () => {
    expect(ageFactor(mk('a', 'RB', 10, 31))).toBeCloseTo(0.6)
    expect(ageFactor(mk('a', 'WR', 10, 31))).toBeCloseTo(0.86)
    expect(ageFactor(mk('a', 'RB', 10, 29))).toBeLessThan(ageFactor(mk('a', 'RB', 10, 28)))
  })

  it('never drops below the floor', () => {
    expect(ageFactor(mk('a', 'RB', 10, 40))).toBe(AGE_DECLINE.RB!.floor)
    expect(ageFactor(mk('a', 'QB', 10, 45))).toBe(AGE_DECLINE.QB!.floor)
  })

  it('does not age kickers or defenses', () => {
    expect(ageFactor(mk('a', 'K', 200, 40))).toBe(1)
    expect(ageFactor(mk('a', 'DEF', 200, 40))).toBe(1)
  })
})

describe('parseAge', () => {
  const now = new Date('2026-11-23T00:00:00Z')
  it('uses Sleeper age when sensible', () => {
    expect(parseAge(27, null, now)).toBe(27)
    expect(parseAge(27.9, null, now)).toBe(27)
  })
  it('falls back to the birth date, counting whole years', () => {
    expect(parseAge(null, '1999-11-23', now)).toBe(27)
    expect(parseAge(undefined, '1999-11-24', now)).toBe(26)
  })
  it('rejects nonsense', () => {
    expect(parseAge(5, null, now)).toBeUndefined()
    expect(parseAge(null, 'not a date', now)).toBeUndefined()
    expect(parseAge(null, null, now)).toBeUndefined()
  })
})

describe('age in value', () => {
  it('lowers keeper worth for an older back but not this-season worth', () => {
    const young = mk('y', 'RB', 10, 24)
    const old = mk('o', 'RB', 10, 31)
    expect(keeperWorth(old, s)).toBeCloseTo(keeperWorth(young, s) * 0.6)
    expect(redraftWorth(old, s)).toBe(redraftWorth(young, s))
  })
})

describe('ageNotes', () => {
  const old = mk('old', 'RB', 10, 31)
  const young = mk('young', 'RB', 10, 23)
  const players = new Map([old, young].map((p) => [p.id, p]))
  const asset = (id: string) => ({ t: 'p' as const, id, keeperRound: 5 })

  it('mentions an older incoming player with his discount', () => {
    const [n] = ageNotes({ sent: [], incoming: [asset('old')], players })
    expect(n).toContain('old (31, 40% off)')
    expect(n).toContain('discounted for age')
  })

  it('mentions an older player being sent away', () => {
    expect(ageNotes({ sent: [asset('old')], incoming: [], players })[0]).toContain('on your side')
  })

  it('says nothing about young players', () => {
    expect(ageNotes({ sent: [asset('young')], incoming: [asset('young')], players })).toEqual([])
  })
})
