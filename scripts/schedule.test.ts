import { describe, expect, it } from 'vitest'
import { parseByes } from './schedule'

/** 32 teams over 4 weeks: team i has its bye in week (i % 4) + 1, and the 24 others pair up. */
function league() {
  const games: { week: number; home: string; away: string }[] = []
  for (let week = 1; week <= 4; week++) {
    const playing = Array.from({ length: 32 }, (_, i) => i).filter((i) => i % 4 !== week - 1)
    for (let k = 0; k < playing.length; k += 2) games.push({ week, home: `T${playing[k]}`, away: `T${playing[k + 1]}` })
  }
  return games
}

describe('parseByes', () => {
  it('finds each team’s one missing week', () => {
    const byes = parseByes(league())
    expect(Object.keys(byes)).toHaveLength(32)
    expect(byes.T0).toBe(1)
    expect(byes.T5).toBe(2)
    expect(byes.T30).toBe(3)
    expect(byes.T31).toBe(4)
  })

  it('returns nothing for a partial schedule, ambiguous byes, or junk', () => {
    expect(parseByes(league().slice(0, 5))).toEqual({})
    expect(parseByes(league().filter((g) => !(g.week === 2 && (g.home === 'T4' || g.away === 'T4'))))).toEqual({}) // two teams lose a game
    expect(parseByes(null)).toEqual({})
    expect(parseByes([{ week: 'x' }])).toEqual({})
  })
})
