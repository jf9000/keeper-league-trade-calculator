import { describe, expect, it } from 'vitest'
import type { Player, Pos, Settings } from '../types'
import {
  INJURY_FACTOR,
  availability,
  availabilityAdjusted,
  gamesNote,
  gamesPossible,
  injuryFactor,
  parseInjury,
} from './availability'
import { rankByCurrentSeason } from './current'
import { availabilityNotes } from './notes'
import { DEFAULT_SETTINGS, redraftWorth } from './valuation'

const s: Settings = { ...DEFAULT_SETTINGS, scoring: 'ppr', superflex: false }
const mk = (id: string, pos: Pos, adp: number, ppg: number | null, gp = 8, inj?: Player['inj']): Player => ({
  id,
  sleeperId: id,
  name: id,
  pos,
  team: 'XXX',
  adp,
  sfAdp: null,
  ...(ppg === null ? {} : { stats: { gp, ppr: ppg * gp, half: ppg * gp, std: ppg * gp } }),
  ...(inj ? { inj } : {}),
})

describe('parseInjury', () => {
  it('maps Sleeper designations and ignores healthy players', () => {
    expect(parseInjury('Questionable')).toBe('Questionable')
    expect(parseInjury('Out')).toBe('Out')
    expect(parseInjury('IR')).toBe('IR')
    expect(parseInjury(null, 'Injured Reserve')).toBe('IR')
    expect(parseInjury('PUP')).toBe('PUP')
    expect(parseInjury('Sus')).toBe('Susp')
    expect(parseInjury(null, 'Active')).toBeUndefined()
    expect(parseInjury('NA')).toBeUndefined()
    expect(parseInjury(null, null)).toBeUndefined()
  })
})

describe('availability', () => {
  it('is the share of possible games played, allowing for a bye', () => {
    expect(gamesPossible(11)).toBe(10)
    expect(availability(mk('a', 'QB', 10, 20, 4), 11)).toBeCloseTo(0.4)
    expect(availability(mk('a', 'QB', 10, 20, 11), 11)).toBe(1)
  })
  it('is 1 when the number of weeks or the stats are unknown', () => {
    expect(availability(mk('a', 'QB', 10, 20, 4))).toBe(1)
    expect(availability(mk('a', 'QB', 10, null), 11)).toBe(1)
  })
  it('scales points per game down for missed games', () => {
    expect(availabilityAdjusted(20, 1)).toBe(20)
    expect(availabilityAdjusted(20, 0.4)).toBeCloseTo(14)
  })
  it('notes missed games only when they are many', () => {
    expect(gamesNote(mk('a', 'QB', 10, 20, 4), 11)).toBe('Played 4 of 10 games')
    expect(gamesNote(mk('a', 'QB', 10, 20, 9), 11)).toBeNull()
    expect(gamesNote(mk('a', 'QB', 10, 20, 1), 2)).toBeNull()
  })
})

describe('ranking with missed games', () => {
  const cur = (ps: Player[], through?: number) => new Map(rankByCurrentSeason(ps, s, through, { shrinkGames: 0, softPpg: 0 }).map((p) => [p.id, p.curAdp]))
  const hot = mk('hot', 'QB', 40, 20, 4)
  const steady = mk('steady', 'QB', 20, 15, 10)

  it('ranks a hot short stretch above a full season when games missed are unknown', () => {
    const out = cur([hot, steady])
    expect(out.get('hot')).toBe(20)
    expect(out.get('steady')).toBe(40)
  })

  it('ranks the player who has played the games first once missed games count', () => {
    const out = cur([hot, steady], 11)
    expect(out.get('steady')).toBe(20)
    expect(out.get('hot')).toBe(40)
  })
})

describe('injuries in value', () => {
  it('discounts this-season value by the designation', () => {
    const healthy = redraftWorth(mk('a', 'RB', 10, null), s)
    for (const [inj, f] of Object.entries(INJURY_FACTOR)) {
      expect(redraftWorth(mk('a', 'RB', 10, null, 8, inj as Player['inj']), s)).toBeCloseTo(healthy * f)
    }
    expect(injuryFactor(mk('a', 'RB', 10, null))).toBe(1)
  })
})

describe('availabilityNotes', () => {
  const hurt = mk('hurt', 'QB', 10, 20, 9, 'IR')
  const missed = mk('missed', 'WR', 10, 20, 3)
  const fine = mk('fine', 'RB', 10, 15, 10)
  const players = new Map([hurt, missed, fine].map((p) => [p.id, p]))
  const asset = (id: string) => ({ t: 'p' as const, id, keeperRound: 5 })
  const notes = (sent: string[], incoming: string[], through = 11) =>
    availabilityNotes({ sent: sent.map(asset), incoming: incoming.map(asset), players, through })

  it('warns about an injured player arriving, and says keeper value is unaffected on IR', () => {
    const [n] = notes([], ['hurt'])
    expect(n).toContain('hurt is injured reserve')
    expect(n).toContain('keeper value is unaffected')
  })

  it('warns about an injured player being sent away', () => {
    expect(notes(['hurt'], [])[0]).toContain('sending hurt')
  })

  it('flags a healthy player who has missed a lot of games, on either side', () => {
    expect(notes([], ['missed'])[0]).toContain('missed (3 of 10 games)')
    expect(notes(['missed'], [])[0]).toContain('counts for less on your side')
  })

  it('says nothing about healthy, available players', () => {
    expect(notes(['fine'], ['fine'])).toEqual([])
  })

  it('does not call out missed games when the weeks played are unknown', () => {
    expect(notes([], ['missed'], 0)).toEqual([])
  })
})
