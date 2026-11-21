import { describe, expect, it } from 'vitest'
import type { Asset, Player, Pos, Settings } from '../types'
import type { Slot } from './lineup'
import { teamNotes, type NoteArgs } from './notes'
import { DEFAULT_SETTINGS, evalTeam, type Stance } from './valuation'

const s: Settings = { ...DEFAULT_SETTINGS, teams: 12, keepers: 2, rounds: 17, scoring: 'ppr', superflex: false, oneQb: true }
const mk = (id: string, pos: Player['pos'], adp: number): Player => ({
  id, sleeperId: null, name: id, pos, team: 'XXX', adp, sfAdp: null,
})
const keep = (id: string, keeperRound: number): Asset => ({ t: 'p', id, keeperRound })
const byId = (...ps: Player[]) => new Map(ps.map((p) => [p.id, p]))
const strengths = (qb: number, rb: number, wr: number, te: number, k = 0, def = 0): Record<Pos, number> => ({
  QB: qb, RB: rb, WR: wr, TE: te, K: k, DEF: def,
})

/** Builds the args the way the calculator does: the trade comes from evalTeam with the same slots. */
function notesFor(opts: {
  roster: Player[]
  extra?: Player[]
  sent: Asset[]
  incoming: Asset[]
  slots: Slot[]
  others: Record<Pos, number>[]
  costs?: Map<string, number>
  picks?: Map<number, number>
  stance?: Stance
}) {
  const players = byId(...opts.roster, ...(opts.extra ?? []))
  const trade = evalTeam(opts.sent, opts.incoming, opts.roster, players, s, 2027, opts.costs, opts.slots, opts.picks)
  const args: NoteArgs = {
    trade, sent: opts.sent, incoming: opts.incoming, roster: opts.roster, others: opts.others,
    players, s, slots: opts.slots, firstPickYear: 2027, costs: opts.costs, picks: opts.picks, stance: opts.stance,
  }
  return teamNotes(args)
}

describe('teamNotes: the same trade reads differently for different rosters', () => {
  const slots: Slot[] = [['QB'], ['RB'], ['WR'], ['WR'], ['TE']]
  const eleven = Array.from({ length: 11 }, () => strengths(40, 8, 60, 25))
  const bench = mk('wr3', 'WR', 30) // a bench WR with plenty of keeper surplus
  const incomingRb = mk('rbin', 'RB', 60)
  const sent = [keep('wr3', 14)]
  const incoming = [keep('rbin', 14)]
  const core = [mk('qb1', 'QB', 25), mk('wr1', 'WR', 10), mk('wr2', 'WR', 15), mk('te1', 'TE', 40)]

  it('a team with no RB gets a win-now caveat that names its weak RB group', () => {
    const notes = notesFor({ roster: [...core, bench], extra: [incomingRb], sent, incoming, slots, others: eleven })
    expect(notes[0]).toMatch(/losing trade long-term/)
    expect(notes[0]).toMatch(/RB group moves from 12th to 1st of 12, patching a weak spot/)
    expect(notes[0]).toMatch(/win now/)
  })

  it('a contending team is told the trade is worth it, a rebuilding team that it probably is not', () => {
    const args = { roster: [...core, bench], extra: [incomingRb], sent, incoming, slots, others: eleven }
    expect(notesFor({ ...args, stance: 'contending' })[0]).toMatch(/Since you’re contending, it may be worth it\./)
    expect(notesFor({ ...args, stance: 'rebuilding' })[0]).toMatch(/Since you’re rebuilding, it’s probably not worth it\./)
    expect(notesFor({ ...args, stance: 'rebuilding' })[0]).not.toMatch(/win now/)
  })

  it('a team already set at RB gets a different note for the same trade', () => {
    const rb1 = mk('rb1', 'RB', 8)
    const notes = notesFor({ roster: [...core, rb1, bench], extra: [incomingRb], sent, incoming, slots, others: eleven })
    expect(notes.join(' ')).toMatch(/give up keeper value without improving your lineup/)
    expect(notes.join(' ')).not.toMatch(/win now/)
  })

  it('warns when a trade that is good for keepers would hollow out a position', () => {
    // Sending the only TE for an RB the team can't start.
    const te = mk('te1', 'TE', 12)
    const rbAdd = mk('rbadd', 'RB', 150)
    const roster = [mk('qb1', 'QB', 25), mk('rb1', 'RB', 8), mk('wr1', 'WR', 10), mk('wr2', 'WR', 15), te]
    const notes = notesFor({
      roster, extra: [rbAdd], sent: [keep('te1', 17)], incoming: [keep('rbadd', 5)], slots,
      others: Array.from({ length: 11 }, () => strengths(40, 8, 60, 20)),
    })
    expect(notes[0]).toMatch(/TE group drops from \d+(st|nd|rd|th) to \d+(st|nd|rd|th) of 12/)
  })
})

describe('teamNotes: players who can’t be kept', () => {
  const costs = new Map([['qb1', 9]])
  const qb1 = mk('qb1', 'QB', 5)
  const qb2 = mk('qb2', 'QB', 12)
  const rb1 = mk('rb1', 'RB', 20)
  const others = Array.from({ length: 11 }, () => strengths(40, 20, 40, 20))
  const base = { roster: [qb1, rb1], extra: [qb2], sent: [] as Asset[], incoming: [keep('qb2', 5)], others, costs }

  it('calls a second QB a this-season rental when he would start at superflex', () => {
    const notes = notesFor({ ...base, slots: [['QB'], ['RB'], ['QB', 'RB', 'WR', 'TE']] })
    expect(notes.join(' ')).toMatch(/qb2 wouldn’t be a keeper for you \(you already have a better QB to keep\)/)
    expect(notes.join(' ')).toMatch(/this-season rental: he’d start at SUPERFLEX/)
  })

  it('says he adds little when he would not start', () => {
    const notes = notesFor({ ...base, slots: [['QB'], ['RB']] })
    expect(notes.join(' ')).toMatch(/wouldn’t start for you either, so he adds little/)
  })
})

describe('teamNotes: kickers and D/ST', () => {
  const slots: Slot[] = [['QB'], ['RB'], ['K'], ['DEF']]
  const base = [mk('qb1', 'QB', 25), mk('rb1', 'RB', 20), mk('def1', 'DEF', 150)]
  // Every other team has a decent kicker (lineup strength 8); this team has none.
  const others = Array.from({ length: 11 }, () => strengths(40, 30, 0, 0, 8, 8))

  it('a team with no kicker is told a good one fills a weak spot', () => {
    const pick: Asset = { t: 'k', year: 2027, round: 8 }
    const notes = notesFor({ roster: base, extra: [mk('k1', 'K', 100)], sent: [pick], incoming: [keep('k1', 17)], slots, others })
    expect(notes.join(' ')).toMatch(/kicker group moves from 12th to \d+(st|nd|rd|th) of 12, patching a weak spot/)
  })

  it('does not call a K or D/ST a keeper rental', () => {
    const notes = notesFor({ roster: base, extra: [mk('k1', 'K', 100)], sent: [], incoming: [keep('k1', 17)], slots, others })
    expect(notes.join(' ')).not.toMatch(/rental|wouldn’t be a keeper/)
  })
})

describe('teamNotes: keepers and the picks they need', () => {
  const slots: Slot[] = [['RB'], ['RB'], ['WR']]
  const others = Array.from({ length: 11 }, () => strengths(0, 40, 40, 0))
  const x = mk('Xavier', 'RB', 12) // drafted in round 5
  const costs = new Map([['Xavier', 5]])
  const own = (...rounds: number[]) => new Map(rounds.map((r): [number, number] => [r, 1]))
  const pick = (round: number, year = 2027): Asset => ({ t: 'k', year, round })
  const base = { roster: [x, mk('w1', 'WR', 30)], slots, others, costs }

  it('says which keeper you lose when you trade away the pick he needs', () => {
    const notes = notesFor({ ...base, sent: [pick(5)], incoming: [], picks: own(5, 9) })
    expect(notes[0]).toBe('Trading away your round 5 pick means you can no longer keep Xavier.')
  })

  it('says nothing about keepers when the traded pick isn’t one anyone needs', () => {
    const notes = notesFor({ ...base, sent: [pick(9)], incoming: [], picks: own(5, 9) })
    expect(notes.join(' ')).not.toMatch(/keep Xavier/)
  })

  it('says which keeper a received pick unlocks', () => {
    const notes = notesFor({ ...base, sent: [], incoming: [pick(5)], picks: own(4) })
    expect(notes[0]).toBe('The round 5 pick you’re getting lets you keep Xavier, which you couldn’t before.')
  })

  it('explains that a better incoming keeper takes the pick of a worse one', () => {
    const better = mk('Bailey', 'RB', 3)
    const notes = notesFor({ ...base, extra: [better], sent: [], incoming: [{ t: 'p', id: 'Bailey', keeperRound: 5 }], picks: own(5) })
    expect(notes[0]).toBe('Bailey would use your round 5 pick as a keeper, so Xavier can no longer be kept with it.')
  })

  it('tells you an incoming player can’t be kept because you have no pick in his round', () => {
    const incoming = mk('Casey', 'RB', 6)
    const notes = notesFor({
      ...base, extra: [incoming], sent: [], incoming: [{ t: 'p', id: 'Casey', keeperRound: 7 }], picks: own(5),
    })
    expect(notes.join(' ')).toMatch(/Casey wouldn’t be a keeper for you \(you have no round 7 pick to keep him with\)/)
  })

  it('says a competing incoming player is blocked by the keeper already using the pick', () => {
    const incoming = mk('Dana', 'RB', 40)
    const notes = notesFor({
      ...base, extra: [incoming], sent: [], incoming: [{ t: 'p', id: 'Dana', keeperRound: 5 }], picks: own(5),
    })
    expect(notes.join(' ')).toMatch(/Dana wouldn’t be a keeper for you \(your round 5 pick is already used on Xavier, a better keeper\)/)
  })

  it('has no keeper-pick notes when pick ownership is unknown', () => {
    const notes = notesFor({ ...base, sent: [pick(5)], incoming: [] })
    expect(notes.join(' ')).not.toMatch(/round 5 pick means|lets you keep/)
  })

  it('reports at most three notes', () => {
    const notes = notesFor({ ...base, sent: [pick(5)], incoming: [], picks: own(5) })
    expect(notes.length).toBeLessThanOrEqual(3)
  })
})

describe('teamNotes: edge cases', () => {
  it('says nothing without a roster to judge against', () => {
    expect(notesFor({ roster: [], sent: [], incoming: [keep('x', 5)], extra: [mk('x', 'RB', 10)], slots: [['RB']], others: [] })).toEqual([])
  })
  it('says nothing for an empty trade', () => {
    expect(notesFor({ roster: [mk('a', 'RB', 10)], sent: [], incoming: [], slots: [['RB']], others: [] })).toEqual([])
  })
})
