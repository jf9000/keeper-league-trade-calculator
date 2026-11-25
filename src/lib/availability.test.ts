import { describe, expect, it, vi } from 'vitest'
import type { Injury, Player, Pos, Settings } from '../types'
import {
  FANTASY_SEASON_WEEKS,
  INJURY_FACTOR,
  MIN_INJURY_FACTOR,
  availability,
  availabilityAdjusted,
  gamesNote,
  gamesPossible,
  injuryFactor,
  parseInjury,
  weeksLeftAfter,
  withWeeksLeft,
} from './availability'
import { rankByCurrentSeason } from './current'
import { availabilityNotes } from './notes'
import { DEFAULT_SETTINGS, currentWorth, evalSide, keeperWorth, lineupStrength, redraftWorth } from './valuation'

// Wording varies between visits, so these tests pin each note to its side's first phrasing.
vi.mock('./phrase', () => ({ phrase: <T>(options: readonly T[], _seed: string, side = 0) => options[side]! }))

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
    expect(gamesNote(mk('a', 'QB', 10, 20, 4), 11)).toBe('Missed a lot of games')
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
  it('cuts what a player is worth to a lineup, by the designation', () => {
    const healthy = currentWorth(mk('a', 'RB', 10, null), s)
    for (const [inj, f] of Object.entries(INJURY_FACTOR)) {
      expect(currentWorth(mk('a', 'RB', 10, null, 8, inj as Player['inj']), s)).toBeCloseTo(healthy * f)
    }
    expect(injuryFactor(mk('a', 'RB', 10, null))).toBe(1)
  })

  it('leaves redraft value, where he would be drafted, alone', () => {
    const healthy = redraftWorth(mk('a', 'RB', 10, 20), s)
    for (const inj of Object.keys(INJURY_FACTOR) as Injury[]) {
      expect(redraftWorth(mk('a', 'RB', 10, 20, 8, inj), s)).toBe(healthy)
    }
  })

  it('leaves keeper worth alone too', () => {
    expect(keeperWorth(mk('a', 'RB', 10, 20, 8, 'IR'), s)).toBe(keeperWorth(mk('a', 'RB', 10, 20), s))
  })

  it('uses the injury-cut value for a lineup spot, but not for how his redraft value reads', () => {
    const star = mk('star', 'RB', 5, 25, 8, 'IR')
    expect(lineupStrength(s)(star)).toBeLessThan(redraftWorth(star, s) / 2)
    const [item] = evalSide([{ t: 'p', id: 'star', keeperRound: 8 }], new Map([[star.id, star]]), s, 2027)
    expect(item!.redraft).toBeCloseTo(redraftWorth(star, s))
    expect(item!.current).toBeCloseTo(currentWorth(star, s))
    expect(item!.current!).toBeLessThan(item!.redraft!)
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

  it('warns about an injured player arriving, and says to check on him', () => {
    const [n] = notes([], ['hurt'])
    expect(n).toContain('hurt is on injured reserve')
    expect(n).toContain('Check his status before you agree.')
  })

  it('warns about an injured player being sent away', () => {
    expect(notes(['hurt'], [])[0]).toContain('sending hurt')
  })

  it('flags a healthy player who has missed a lot of games, on either side', () => {
    expect(notes([], ['missed'])[0]).toContain('missed has missed a lot of games')
    expect(notes(['missed'], [])[0]).toContain('counts for less on your side')
  })

  it('says nothing about healthy, available players', () => {
    expect(notes(['fine'], ['fine'])).toEqual([])
  })

  it('does not call out missed games when the weeks played are unknown', () => {
    expect(notes([], ['missed'], 0)).toEqual([])
  })
})

describe('injury model with weeks left', () => {
  const hurt = (inj: Injury, weeksLeft?: number) => ({ inj, ...(weeksLeft === undefined ? {} : { weeksLeft }) })

  it('is 1 when healthy and the flat share when the weeks left are unknown', () => {
    expect(injuryFactor({})).toBe(1)
    expect(injuryFactor(hurt('IR'))).toBe(INJURY_FACTOR.IR)
  })

  it('costs the same injury more as the season runs out', () => {
    for (const inj of ['IR', 'Out', 'Doubtful'] as const) {
      expect(injuryFactor(hurt(inj, 3))).toBeLessThan(injuryFactor(hurt(inj, 10)))
    }
  })

  it('costs more for longer designations and keeps a small floor', () => {
    expect(injuryFactor(hurt('Questionable', 6))).toBeGreaterThan(injuryFactor(hurt('Out', 6)))
    expect(injuryFactor(hurt('Out', 6))).toBeGreaterThan(injuryFactor(hurt('IR', 6)))
    expect(injuryFactor(hurt('IR', 1))).toBe(MIN_INJURY_FACTOR)
  })

  it('counts weeks left up to the fantasy final, never below 1', () => {
    expect(weeksLeftAfter(11)).toBe(FANTASY_SEASON_WEEKS - 11)
    expect(weeksLeftAfter(18)).toBe(1)
  })

  it('does not count a bye that is still ahead as a week to play, and ignores one that has passed', () => {
    expect(weeksLeftAfter(11, 13)).toBe(FANTASY_SEASON_WEEKS - 11 - 1)
    expect(weeksLeftAfter(11, 6)).toBe(FANTASY_SEASON_WEEKS - 11)
    expect(weeksLeftAfter(11, undefined)).toBe(FANTASY_SEASON_WEEKS - 11)
    expect(weeksLeftAfter(16, 17)).toBe(1)
  })

  it('takes each injured player’s own team bye into account when stamping', () => {
    const base = { sleeperId: null, adp: 1, sfAdp: null, pos: 'RB' as const, inj: 'Out' as const }
    const file: { statsThrough?: number; byes?: Record<string, number>; players: Player[] } = {
      statsThrough: 11,
      byes: { AAA: 13 },
      players: [
        { ...base, id: 'a', name: 'a', team: 'AAA' },
        { ...base, id: 'b', name: 'b', team: 'BBB' },
      ],
    }
    const out = withWeeksLeft(file)
    expect(out.players[0]!.weeksLeft).toBe(5)
    expect(out.players[1]!.weeksLeft).toBe(6)
  })

  it('stamps weeks left on injured players only, and only when stats exist', () => {
    const base = { sleeperId: null, team: 'X', adp: 1, sfAdp: null, pos: 'RB' as const }
    const file: { statsThrough?: number; players: Player[] } = {
      statsThrough: 11,
      players: [
        { ...base, id: 'a', name: 'a', inj: 'Out' as const },
        { ...base, id: 'b', name: 'b' },
      ],
    }
    const out = withWeeksLeft(file)
    expect(out.players[0]!.weeksLeft).toBe(6)
    expect(out.players[1]!.weeksLeft).toBeUndefined()
    expect(withWeeksLeft({ players: file.players }).players[0]!.weeksLeft).toBeUndefined()
  })
})
