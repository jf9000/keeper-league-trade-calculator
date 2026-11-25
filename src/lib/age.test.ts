import { describe, expect, it, vi } from 'vitest'
import type { Player, Pos, Settings } from '../types'
import { ageFactor, parseAge } from './age'
import { ageNotes } from './notes'
import { DEFAULT_SETTINGS, keeperWorth, redraftWorth } from './valuation'

// Wording varies between visits, so these tests pin each note to its side's first phrasing.
vi.mock('./phrase', () => ({ phrase: <T>(options: readonly T[], _seed: string, side = 0) => options[side]! }))

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
  it('does nothing in the prime, or when age is unknown', () => {
    for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
      expect(ageFactor(mk('a', pos, 10, 24))).toBe(1)
      expect(ageFactor(mk('a', pos, 10, 22))).toBe(1)
      expect(ageFactor(mk('a', pos, 10))).toBe(1)
    }
    expect(ageFactor(mk('a', 'RB', 10, 18))).toBe(1) // younger than the table starts
  })

  it('never rises with age and stays within (0, 1]', () => {
    for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
      let prev = 1
      for (let age = 20; age <= 45; age++) {
        const f = ageFactor(mk('a', pos, 10, age))
        expect(f).toBeLessThanOrEqual(prev)
        expect(f).toBeGreaterThan(0)
        prev = f
      }
    }
  })

  it('runs backs down before receivers and receivers before quarterbacks', () => {
    expect(ageFactor(mk('a', 'RB', 10, 30))).toBeLessThan(ageFactor(mk('a', 'WR', 10, 30)))
    expect(ageFactor(mk('a', 'WR', 10, 33))).toBeLessThan(ageFactor(mk('a', 'QB', 10, 33)))
  })

  it('holds the last value for ages past the end of the table', () => {
    expect(ageFactor(mk('a', 'RB', 10, 50))).toBe(ageFactor(mk('a', 'RB', 10, 40)))
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
    expect(keeperWorth(old, s)).toBeCloseTo(keeperWorth(young, s) * ageFactor(old))
    expect(ageFactor(old)).toBeLessThan(1)
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
    expect(n).toContain('old is getting older (31 y/o)')
    expect(n).toContain('discounted for age')
  })

  it('mentions an older player being sent away', () => {
    expect(ageNotes({ sent: [asset('old')], incoming: [], players })[0]).toContain('on your side')
  })

  it('says nothing about young players', () => {
    expect(ageNotes({ sent: [asset('young')], incoming: [asset('young')], players })).toEqual([])
  })
})
