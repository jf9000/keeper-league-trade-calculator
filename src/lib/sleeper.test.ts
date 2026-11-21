import { describe, expect, it } from 'vitest'
import {
  buildTeams,
  draftRoundsFromPicks,
  isKeeperLeague,
  leagueToSettings,
  ownedPicks,
  pickMainDraft,
  scoringFromRec,
  type SleeperLeague,
} from './sleeper'

describe('buildTeams', () => {
  const users = [
    { user_id: 'u1', display_name: 'Jack', metadata: { team_name: 'Gridiron Gang' } },
    { user_id: 'u2', display_name: 'Sam', metadata: null },
    { user_id: 'u3', display_name: 'Pat' },
  ]
  it('prefers the team name, then the display name, then "Team N"', () => {
    const teams = buildTeams(
      [
        { roster_id: 1, owner_id: 'u1', players: ['a'] },
        { roster_id: 2, owner_id: 'u2', players: ['b', 'c'] },
        { roster_id: 3, owner_id: 'u3', players: ['d'] },
        { roster_id: 4, owner_id: null, players: ['e'] },
        { roster_id: 5, owner_id: 'gone', players: ['f'] },
      ],
      users,
    )
    expect(teams.map((t) => t.name)).toEqual(['Gridiron Gang', 'Sam', 'Pat', 'Team 4', 'Team 5'])
  })
  it('keeps owner IDs and tolerates a null player list', () => {
    const [t] = buildTeams([{ roster_id: 7, owner_id: 'u1', players: null }], users)
    expect(t).toMatchObject({ rosterId: 7, ownerId: 'u1', playerIds: [] })
  })
  it('sorts by roster ID', () => {
    const teams = buildTeams(
      [
        { roster_id: 3, owner_id: 'u1', players: [] },
        { roster_id: 1, owner_id: 'u2', players: [] },
      ],
      users,
    )
    expect(teams.map((t) => t.rosterId)).toEqual([1, 3])
  })
  it('ignores a blank team name', () => {
    const [t] = buildTeams([{ roster_id: 1, owner_id: 'u4', players: [] }], [
      { user_id: 'u4', display_name: 'Lee', metadata: { team_name: '   ' } },
    ])
    expect(t!.name).toBe('Lee')
  })
})

const league = (over: Partial<SleeperLeague> = {}): SleeperLeague => ({
  league_id: '1',
  name: 'Test',
  season: '2026',
  status: 'in_season',
  total_rosters: 12,
  roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BN'],
  scoring_settings: { rec: 1 },
  settings: { type: 1, max_keepers: 3, draft_rounds: 15 },
  ...over,
})

describe('pickMainDraft', () => {
  const draft = (draft_id: string, status: string, rounds?: number) => ({ draft_id, status, settings: { rounds } })
  it('picks the longest completed draft, skipping short rookie drafts', () => {
    const drafts = [draft('rookie', 'complete', 4), draft('main', 'complete', 15), draft('older', 'complete', 12)]
    expect(pickMainDraft(drafts)?.draft_id).toBe('main')
  })
  it('ignores drafts that are not finished', () => {
    expect(pickMainDraft([draft('live', 'drafting', 15), draft('soon', 'pre_draft', 15)])).toBeUndefined()
  })
  it('returns undefined when there are no full-length drafts', () => {
    expect(pickMainDraft([draft('rookie', 'complete', 4), draft('nosettings', 'complete')])).toBeUndefined()
    expect(pickMainDraft([])).toBeUndefined()
  })
})

describe('draftRoundsFromPicks', () => {
  it('maps each drafted player to his round and skips malformed picks', () => {
    const rounds = draftRoundsFromPicks([
      { player_id: '4046', round: 1 },
      { player_id: '6794', round: 9 },
      { player_id: null, round: 2 },
      { player_id: '1', round: 0 },
      { player_id: '2' },
    ])
    expect([...rounds]).toEqual([
      ['4046', 1],
      ['6794', 9],
    ])
  })
})

describe('scoringFromRec', () => {
  it('maps points per reception to a scoring format', () => {
    expect(scoringFromRec(1)).toBe('ppr')
    expect(scoringFromRec(0.5)).toBe('half')
    expect(scoringFromRec(0)).toBe('std')
    expect(scoringFromRec(undefined)).toBe('std')
  })
})

describe('leagueToSettings', () => {
  it('maps teams, scoring, flex spots, keepers and rounds', () => {
    expect(leagueToSettings(league())).toEqual({
      teams: 12,
      scoring: 'ppr',
      superflex: false,
      flex: 1,
      keepers: 3,
      rounds: 15,
    })
  })
  it('counts the league’s flex spots, but not superflex', () => {
    expect(leagueToSettings(league()).flex).toBe(1)
    expect(leagueToSettings(league({ roster_positions: ['QB', 'RB', 'FLEX', 'FLEX', 'REC_FLEX', 'SUPER_FLEX'] })).flex).toBe(3)
    expect(leagueToSettings(league({ roster_positions: ['QB', 'RB', 'WR'] })).flex).toBe(0)
  })
  it('detects superflex from a SUPER_FLEX slot', () => {
    const l = league({ roster_positions: ['QB', 'RB', 'WR', 'SUPER_FLEX', 'BN'] })
    expect(leagueToSettings(l).superflex).toBe(true)
  })
  it('ignores a short draft length (rookie draft) so the default rounds are kept', () => {
    const out = leagueToSettings(league({ settings: { type: 2, max_keepers: 5, draft_rounds: 4 } }))
    expect(out).not.toHaveProperty('rounds')
    expect(out.keepers).toBe(5)
  })
  it('omits keepers and rounds when Sleeper does not provide them', () => {
    const out = leagueToSettings(league({ settings: { type: 0 } }))
    expect(out).not.toHaveProperty('keepers')
    expect(out).not.toHaveProperty('rounds')
  })
  it('clamps values into the calculator’s supported ranges', () => {
    const out = leagueToSettings(league({ total_rosters: 40, settings: { max_keepers: 99, draft_rounds: 45 } }))
    expect(out).toMatchObject({ teams: 32, keepers: 15, rounds: 30 })
  })
})

describe('ownedPicks', () => {
  const pick = (season: string, round: number, roster_id: number, owner_id: number) => ({ season, round, roster_id, owner_id })

  it('gives every roster its own pick in every round', () => {
    const owned = ownedPicks([1, 2], [], 2027, 3)
    expect([...owned.get(1)!]).toEqual([[1, 1], [2, 1], [3, 1]])
    expect([...owned.get(2)!]).toEqual([[1, 1], [2, 1], [3, 1]])
  })

  it('moves a traded pick from its original team to its current owner', () => {
    const owned = ownedPicks([1, 2], [pick('2027', 2, 1, 2)], 2027, 3)
    expect(owned.get(1)!.get(2)).toBe(0)
    expect(owned.get(2)!.get(2)).toBe(2)
  })

  it('ignores other seasons, rounds past the draft, unknown rosters and picks that came home', () => {
    const owned = ownedPicks(
      [1, 2],
      [pick('2028', 1, 1, 2), pick('2027', 9, 1, 2), pick('2027', 1, 1, 99), pick('2027', 3, 2, 2)],
      2027,
      3,
    )
    expect(owned.get(1)!.get(1)).toBe(1)
    expect(owned.get(2)!.get(1)).toBe(1)
    expect(owned.get(2)!.get(3)).toBe(1)
  })
})

describe('isKeeperLeague', () => {
  it('keeps keeper leagues and drops redraft and dynasty ones', () => {
    expect(isKeeperLeague(league({ settings: { type: 1 } }))).toBe(true)
    expect(isKeeperLeague(league({ settings: { type: 0 } }))).toBe(false)
    expect(isKeeperLeague(league({ settings: { type: 2 } }))).toBe(false)
  })
  it('treats a league with no type as not a keeper league', () => {
    expect(isKeeperLeague(league({ settings: {} }))).toBe(false)
  })
})
