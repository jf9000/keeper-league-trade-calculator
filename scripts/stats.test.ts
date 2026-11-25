import { describe, expect, it } from 'vitest'
import { parseWeek, parseWeekLines, sumWeeks } from './stats'

describe('parseWeek', () => {
  const week = {
    '4046': { gp: 1, pts_ppr: 25.5, pts_half_ppr: 23.5, pts_std: 21.5 },
    HOU: { gp: 1, pts_ppr: 12, pts_half_ppr: 12, pts_std: 12 },
    TEAM_CIN: { gp: 1, pts_ppr: 112.5 },
    '8478': { gms_active: 1 }, // no scoring
    '999': { gp: 0, pts_ppr: 3 }, // didn't play
    '555': { gp: 1, pts_ppr: 'lots' },
    junk: 'x',
  }
  it('keeps players and team defenses with scoring and a game played', () => {
    expect([...parseWeek(week).keys()].sort()).toEqual(['4046', 'HOU'])
  })
  it('reads all three scoring formats', () => {
    expect(parseWeek(week).get('4046')).toEqual({ gp: 1, ppr: 25.5, half: 23.5, std: 21.5 })
  })
  it('falls back to PPR points when other formats are missing', () => {
    expect(parseWeek({ a: { gp: 1, pts_ppr: 9 } }).get('a')).toEqual({ gp: 1, ppr: 9, half: 9, std: 9 })
  })
  it('survives unexpected shapes', () => {
    expect(parseWeek(null).size).toBe(0)
    expect(parseWeek([1, 2]).size).toBe(0)
  })
})

describe('sumWeeks', () => {
  it('adds points and games across weeks, rounding to one decimal', () => {
    const w1 = new Map([['a', { gp: 1, ppr: 10.04, half: 9, std: 8 }]])
    const w2 = new Map([
      ['a', { gp: 1, ppr: 20.04, half: 18, std: 16 }],
      ['b', { gp: 1, ppr: 5, half: 5, std: 5 }],
    ])
    const total = sumWeeks([w1, w2])
    expect(total.get('a')).toEqual({ gp: 2, ppr: 30.1, half: 27, std: 24 })
    expect(total.get('b')).toEqual({ gp: 1, ppr: 5, half: 5, std: 5 })
  })
  it('handles no weeks', () => {
    expect(sumWeeks([]).size).toBe(0)
  })
})

describe('parseWeekLines', () => {
  it('keeps points and usage, defaults missing usage to 0, and skips team rows and non-players', () => {
    const out = parseWeekLines({
      '1': { gp: 1, pts_ppr: 19.8, pts_half_ppr: 16.3, pts_std: 12.8, off_snp: 40, tm_off_snp: 65, rec_tgt: 10, rec_rz_tgt: 1 },
      '2': { gp: 1, pts_ppr: 5 },
      '3': { gp: 0, pts_ppr: 9 },
      TEAM_BUF: { gp: 1, pts_ppr: 80 },
    })
    expect([...out.keys()]).toEqual(['1', '2'])
    expect(out.get('1')).toEqual([19.8, 16.3, 12.8, 40, 65, 10, 0, 1, 0])
    expect(out.get('2')).toEqual([5, 5, 5, 0, 0, 0, 0, 0, 0])
  })
})
