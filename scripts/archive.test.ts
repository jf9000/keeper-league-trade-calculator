import { describe, expect, it } from 'vitest'
import { ageOnSeasonStart, lineTotals, parseArchive, type ArchivePlayer } from './archive'

const line = (ppr: number) => [ppr, ppr, ppr, 0, 0, 0, 0, 0, 0] as ArchivePlayer['w'][number]

describe('parseArchive', () => {
  it('keeps good players and drops bad ones and bad lines', () => {
    const f = parseArchive({
      season: 2024,
      weeks: 3,
      players: {
        a: { pos: 'RB', name: 'A', w: [line(10), null, [1, 2]] },
        k: { pos: 'K', name: 'K', w: [] },
        z: { pos: 'WR', name: 'Z' },
      },
    })
    expect(Object.keys(f!.players)).toEqual(['a'])
    expect(f!.players.a!.w).toEqual([line(10), null, null])
  })
  it('rejects non-archives', () => {
    expect(parseArchive(null)).toBeNull()
    expect(parseArchive({ season: 'x' })).toBeNull()
  })
})

describe('lineTotals', () => {
  it('counts games and points over a range, skipping missed weeks', () => {
    const p: ArchivePlayer = { pos: 'WR', name: 'W', w: [line(10), null, line(20), line(5)] }
    expect(lineTotals(p)).toEqual({ gp: 3, pts: 35 })
    expect(lineTotals(p, 1, 3)).toEqual({ gp: 1, pts: 20 })
  })
})

describe('ageOnSeasonStart', () => {
  it('counts whole years on September 1', () => {
    expect(ageOnSeasonStart('1996-09-01', 2024)).toBe(28)
    expect(ageOnSeasonStart('1996-09-02', 2024)).toBe(27)
    expect(ageOnSeasonStart(null, 2024)).toBeUndefined()
    expect(ageOnSeasonStart('nonsense', 2024)).toBeUndefined()
  })
})
