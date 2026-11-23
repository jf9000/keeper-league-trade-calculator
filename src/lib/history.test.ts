import { describe, expect, it } from 'vitest'
import type { Player, PlayersFile } from '../types'
import { MAX_SNAPSHOTS, appendSnapshot, buildTrends, makeSnapshot, movers, parseHistory, playersAt } from './history'
import { DEFAULT_SETTINGS } from './valuation'

const S = { ...DEFAULT_SETTINGS, superflex: false }

const mk = (id: string, pos: Player['pos'], adp: number, ppr = 0, gp = 0): Player => ({
  id,
  sleeperId: id,
  name: id,
  pos,
  team: 'XXX',
  adp,
  sfAdp: null,
  ...(gp ? { stats: { gp, ppr, half: ppr, std: ppr } } : {}),
})
const file = (at: string, players: Player[]): PlayersFile => ({ generatedAt: at, season: 2026, source: 't', statsThrough: 8, players })

describe('snapshots', () => {
  it('captures adp and production per player', () => {
    const snap = makeSnapshot(file('2026-11-20T00:00:00Z', [mk('a', 'RB', 5, 120.44, 8)]))
    expect(snap.rows.a).toEqual([5, null, 120.4, 120.4, 120.4, 8])
  })

  it('collapses refreshes from the same day and keeps only the newest few', () => {
    let h = appendSnapshot(null, makeSnapshot(file('2026-01-01T01:00:00Z', [mk('a', 'RB', 5)])))
    h = appendSnapshot(h, makeSnapshot(file('2026-01-01T09:00:00Z', [mk('a', 'RB', 6)])))
    expect(h.snapshots).toHaveLength(1)
    expect(h.snapshots[0]!.rows.a![0]).toBe(6)
    for (let d = 2; d < 20; d++) {
      h = appendSnapshot(h, makeSnapshot(file(`2026-01-${String(d).padStart(2, '0')}T00:00:00Z`, [mk('a', 'RB', 5)])))
    }
    expect(h.snapshots).toHaveLength(MAX_SNAPSHOTS)
    expect(h.snapshots.at(-1)!.at.startsWith('2026-01-19')).toBe(true)
  })

  it('ignores malformed history files', () => {
    expect(parseHistory(null)).toBeNull()
    expect(parseHistory({ snapshots: 'x' })).toBeNull()
    expect(parseHistory({ snapshots: [{ nope: 1 }, makeSnapshot(file('2026-01-01T00:00:00Z', []))] })!.snapshots).toHaveLength(1)
  })

  it('rebuilds players as they stood then, dropping anyone not listed', () => {
    const snap = makeSnapshot(file('2026-01-01T00:00:00Z', [mk('a', 'RB', 5, 100, 8)]))
    const out = playersAt([mk('a', 'RB', 2, 200, 9), mk('b', 'WR', 3)], snap)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 'a', adp: 5, stats: { gp: 8, ppr: 100 } })
  })
})

describe('trends', () => {
  const before = file('2026-11-16T00:00:00Z', [mk('up', 'WR', 60, 50, 8), mk('down', 'WR', 20, 130, 8), mk('flat', 'RB', 10)])
  const after = file('2026-11-23T00:00:00Z', [mk('up', 'WR', 25, 150, 9), mk('down', 'WR', 45, 70, 9), mk('flat', 'RB', 10)])
  const history = appendSnapshot(appendSnapshot(null, makeSnapshot(before)), makeSnapshot(after))

  it('shows rising and falling values since the previous snapshot', () => {
    const t = buildTrends(after, history, S)
    expect(t.dates).toHaveLength(2)
    expect(t.byId.get('up')!.week).toBeGreaterThan(0)
    expect(t.byId.get('down')!.week).toBeLessThan(0)
    expect(t.byId.get('flat')!.week).toBe(0)
  })

  it('lists movers, biggest first, and skips unchanged players', () => {
    const t = buildTrends(after, history, S)
    const m = movers(t, after.players, 5)
    expect(m.risers.map((r) => r.player.id)).toEqual(['up'])
    expect(m.fallers.map((r) => r.player.id)).toEqual(['down'])
  })

  it('adds the current file as a point when history is behind it', () => {
    const stale = appendSnapshot(null, makeSnapshot(before))
    const t = buildTrends(after, stale, S)
    expect(t.dates).toHaveLength(2)
    expect(t.byId.get('up')!.week).toBeGreaterThan(0)
  })
})
