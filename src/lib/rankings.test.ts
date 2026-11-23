import { describe, expect, it } from 'vitest'
import type { Player } from '../types'
import { buildSlots } from './lineup'
import { rankTeams, rosterAssets } from './rankings'
import type { LeagueTeam } from './sleeper'
import { DEFAULT_SETTINGS } from './valuation'

const S = { ...DEFAULT_SETTINGS, superflex: false, flex: 1, redraftWeight: 50, teams: 2 }
const mk = (id: string, pos: Player['pos'], adp: number): Player => ({ id, sleeperId: id, name: id, pos, team: 'X', adp, sfAdp: null })
const team = (rosterId: number): LeagueTeam => ({ rosterId, ownerId: String(rosterId), name: `T${rosterId}`, playerIds: [] })

describe('rankTeams', () => {
  const strong = [mk('s-qb', 'QB', 5), mk('s-rb', 'RB', 3), mk('s-wr', 'WR', 4), mk('s-te', 'TE', 20)]
  const weak = [mk('w-qb', 'QB', 90), mk('w-rb', 'RB', 100), mk('w-wr', 'WR', 110), mk('w-te', 'TE', 130)]
  const byId = new Map([...strong, ...weak].map((p) => [p.id, p]))
  const slots = buildSlots(null, S)
  const rosters = new Map([
    [1, weak],
    [2, strong],
  ])

  it('ranks the stronger roster first and gives every team position ranks', () => {
    const r = rankTeams([team(1), team(2)], rosters, byId, S, slots, 2027)
    expect(r.map((x) => x.team.rosterId)).toEqual([2, 1])
    expect(r.map((x) => x.rank)).toEqual([1, 2])
    expect(r[0]!.score).toBeGreaterThan(r[1]!.score)
    expect(r[0]!.posRank.QB).toBe(1)
    expect(r[1]!.posRank.QB).toBe(2)
  })

  it('projects keepers within the keeper limit', () => {
    const cheap = new Map(strong.map((p) => [p.id, 17]))
    const r = rankTeams([team(2)], new Map([[2, strong]]), byId, S, slots, 2027, cheap)
    expect(r[0]!.keepers.length).toBeLessThanOrEqual(S.keepers)
    expect(r[0]!.keepers.length).toBeGreaterThan(0)
  })

  it('builds keeper assets at the default cost unless overridden', () => {
    const a = rosterAssets([mk('p', 'RB', 30)], S, undefined, new Map([['p', 3]]))
    expect(a).toEqual([{ t: 'p', id: 'p', keeperRound: 3 }])
  })
})
