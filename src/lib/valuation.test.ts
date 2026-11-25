import { describe, expect, it } from 'vitest'
import type { Asset, Player, Settings } from '../types'
import {
  DEFAULT_SETTINGS,
  adpOf,
  clampAssets,
  defaultKeeperRound,
  evalSide,
  pickValue,
  pickYears,
  roundSlot,
  seasonFor,
  evalTeam,
  evalTrade,
  gradeFor,
  judgeTrade,
  sumValues,
  itemValue,
  keeperWorth,
  redraftShare,
  settingsFor,
  STANCE_SHIFT,
  weightFor,
  type Stance,
  redraftWorth,
  sumItemValues,
  KD_ADP_OFFSET,
  KD_STRENGTH_SCALE,
  lineupStrength,
  CURRENT_WEIGHT_KEEPER,
} from './valuation'
import { FORMAT_ADP } from './formatAdp'
import type { Slot } from './lineup'

const S: Settings = { ...DEFAULT_SETTINGS, teams: 12, keepers: 2, rounds: 17, scoring: 'ppr', superflex: false, oneQb: true, redraftWeight: 0 }

const mk = (id: string, pos: Player['pos'], adp: number, sfAdp: number | null = null): Player => ({
  id,
  sleeperId: null,
  name: id,
  pos,
  team: 'XXX',
  adp,
  sfAdp,
})
const roster = (...ps: Player[]) => new Map(ps.map((p) => [p.id, p]))
const keep = (id: string, keeperRound: number): Asset => ({ t: 'p', id, keeperRound })
const pick = (year: number, round: number): Asset => ({ t: 'k', year, round })

describe('seasonFor / pickYears', () => {
  it('treats Jan and Feb as the previous season', () => {
    expect(seasonFor(new Date(2026, 0, 15))).toBe(2025)
    expect(seasonFor(new Date(2026, 1, 28))).toBe(2025)
  })
  it('uses the calendar year from March on', () => {
    expect(seasonFor(new Date(2026, 2, 1))).toBe(2026)
    expect(seasonFor(new Date(2026, 10, 21))).toBe(2026)
  })
  it('lists the next three draft years', () => {
    expect(pickYears(2026)).toEqual([2027, 2028, 2029])
  })
})

describe('pickValue / roundSlot', () => {
  it('is 100 for the first pick and decays monotonically', () => {
    expect(pickValue(1)).toBe(100)
    expect(pickValue(2)).toBeLessThan(pickValue(1))
    expect(pickValue(50)).toBeLessThan(pickValue(10))
    expect(pickValue(24)).toBeCloseTo(100 * Math.exp(-0.035 * 23), 10)
  })
  it('puts a round slot in the middle of the round', () => {
    expect(roundSlot(1, S)).toBe(6)
    expect(roundSlot(2, S)).toBe(18)
    expect(roundSlot(3, { teams: 10 })).toBe(25)
  })
})

describe('adpOf', () => {
  it('uses the standard ADP by default', () => {
    expect(adpOf(mk('a', 'QB', 30, 5), S)).toBe(30)
  })
  it('uses superflex ADP only when superflex is on and the player has one', () => {
    const sf = { ...S, superflex: true }
    expect(adpOf(mk('a', 'QB', 30, 5), sf)).toBe(5)
    expect(adpOf(mk('b', 'RB', 30), sf)).toBe(30)
  })
  it('adjusts by position under no-PPR scoring', () => {
    const std = { ...S, scoring: 'std' as const }
    for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
      expect(adpOf(mk('x', pos, 20), std)).toBeCloseTo(20 * FORMAT_ADP.std[pos])
    }
    expect(adpOf(mk('rb', 'RB', 20), std)).toBeLessThan(20) // backs go earlier without PPR
    expect(adpOf(mk('wr', 'WR', 20), std)).toBeGreaterThan(20) // receivers later
    expect(adpOf(mk('k', 'K', 100), std)).toBe(100) // kickers and defenses are untouched
  })
  it('adjusts half-PPR by a smaller amount than standard, and leaves PPR alone', () => {
    const half = { ...S, scoring: 'half' as const }
    const std = { ...S, scoring: 'std' as const }
    expect(adpOf(mk('rb', 'RB', 20), half)).toBeCloseTo(20 * FORMAT_ADP.half.RB)
    expect(Math.abs(adpOf(mk('rb', 'RB', 20), half) - 20)).toBeLessThan(Math.abs(adpOf(mk('rb', 'RB', 20), std) - 20))
    expect(adpOf(mk('rb', 'RB', 20), { ...S, scoring: 'ppr' as const })).toBe(20)
  })
  it('never goes below 1', () => {
    expect(adpOf(mk('rb', 'RB', 0.5), S)).toBe(1)
  })
})

describe('defaultKeeperRound', () => {
  it('is ADP divided by league size, rounded up and clamped', () => {
    expect(defaultKeeperRound(mk('a', 'WR', 2), S)).toBe(1)
    expect(defaultKeeperRound(mk('a', 'WR', 13), S)).toBe(2)
    expect(defaultKeeperRound(mk('a', 'WR', 500), S)).toBe(17)
  })
  it('uses the league draft round instead of ADP when draft results are known', () => {
    const costs = new Map([['a', 9], ['b', 40]])
    expect(defaultKeeperRound(mk('a', 'WR', 2), S, costs)).toBe(9)
    expect(defaultKeeperRound(mk('b', 'WR', 2), S, costs)).toBe(17) // clamped to the league's rounds
  })
  it('charges undrafted players the last round when draft results are known', () => {
    expect(defaultKeeperRound(mk('waiver', 'WR', 2), S, new Map([['a', 3]]))).toBe(17)
  })
})

describe('lineupStrength', () => {
  it('is the pick value of ADP for skill positions', () => {
    expect(lineupStrength(S)(mk('a', 'RB', 10))).toBeCloseTo(pickValue(10))
  })
  it('measures kickers and D/ST from the last rounds, scaled down, so they are not worthless', () => {
    const k = lineupStrength(S)(mk('k', 'K', 100))
    expect(k).toBeCloseTo(KD_STRENGTH_SCALE * pickValue(100 - KD_ADP_OFFSET))
    expect(k).toBeGreaterThan(pickValue(100) * 3) // raw ADP would make him look ~worthless
    expect(k).toBeLessThan(pickValue(10)) // but far below a real starter
  })
  it('ranks a better kicker above a worse one', () => {
    expect(lineupStrength(S)(mk('a', 'K', 100))).toBeGreaterThan(lineupStrength(S)(mk('b', 'K', 160)))
  })
})

describe('evalSide: picks', () => {
  it('values a pick at its round slot', () => {
    const [it] = evalSide([pick(2027, 3)], roster(), S, 2027)
    expect(it!.value).toBeCloseTo(pickValue(roundSlot(3, S)))
  })
  it('discounts picks beyond the first upcoming year by 15%', () => {
    const [now] = evalSide([pick(2027, 3)], roster(), S, 2027)
    const [later] = evalSide([pick(2028, 3)], roster(), S, 2027)
    expect(later!.value).toBeCloseTo(now!.value * 0.85)
  })
})

describe('evalSide: players', () => {
  it('values a keeper as surplus over the round it costs', () => {
    const p = mk('wr', 'WR', 5)
    const [it] = evalSide([keep('wr', 8)], roster(p), S, 2027)
    expect(it!.value).toBeCloseTo(pickValue(5) - pickValue(roundSlot(8, S)))
    expect(it!.note).toBe('')
  })
  it('floors surplus at zero and explains why', () => {
    const p = mk('wr', 'WR', 100)
    const [it] = evalSide([keep('wr', 1)], roster(p), S, 2027)
    expect(it!.value).toBe(0)
    expect(it!.note).toMatch(/No surplus/)
  })
  it('skips assets whose player is missing from the data', () => {
    expect(evalSide([keep('ghost', 3)], roster(), S, 2027)).toEqual([])
  })
  it('keeps only the best QB when oneQb is on', () => {
    const a = mk('qb1', 'QB', 10)
    const b = mk('qb2', 'QB', 12)
    const items = evalSide([keep('qb2', 10), keep('qb1', 10)], roster(a, b), S, 2027)
    const byId = Object.fromEntries(items.map((i) => [i.player!.id, i]))
    expect(byId.qb1!.value).toBeGreaterThan(0)
    expect(byId.qb2!.value).toBe(0)
    expect(byId.qb2!.note).toMatch(/Extra QB/)
  })
  it('allows several QBs when oneQb is off (up to the keeper limit)', () => {
    const a = mk('qb1', 'QB', 10)
    const b = mk('qb2', 'QB', 12)
    const items = evalSide([keep('qb1', 10), keep('qb2', 10)], roster(a, b), { ...S, oneQb: false }, 2027)
    expect(items.every((i) => i.value > 0)).toBe(true)
  })
  it('discounts keepers over the limit to 25%, lowest value first', () => {
    const ps = [mk('a', 'RB', 3), mk('b', 'RB', 6), mk('c', 'RB', 9)]
    const s = { ...S, keepers: 2, oneQb: false }
    const items = evalSide(ps.map((p) => keep(p.id, 15)), roster(...ps), s, 2027)
    const full = (p: Player) => pickValue(adpOf(p, s)) - pickValue(roundSlot(15, s))
    const byId = Object.fromEntries(items.map((i) => [i.player!.id, i]))
    expect(byId.a!.value).toBeCloseTo(full(ps[0]!))
    expect(byId.b!.value).toBeCloseTo(full(ps[1]!))
    expect(byId.c!.value).toBeCloseTo(full(ps[2]!) * 0.25)
    expect(byId.c!.note).toMatch(/Over keeper limit/)
  })
  it('does not count picks against the keeper limit', () => {
    const p = mk('a', 'RB', 3)
    const items = evalSide([pick(2027, 1), pick(2027, 2), pick(2027, 3), keep('a', 15)], roster(p), { ...S, keepers: 1 }, 2027)
    expect(items.find((i) => i.player)!.note).toBe('')
  })
})

describe('sumValues', () => {
  it('adds up item values', () => {
    expect(sumValues([])).toBe(0)
    const items = evalSide([pick(2027, 1), pick(2027, 2)], roster(), S, 2027)
    expect(sumValues(items)).toBeCloseTo(pickValue(6) + pickValue(18))
  })
})

describe('clampAssets', () => {
  it('pulls keeper rounds and pick rounds into range', () => {
    const out = clampAssets([keep('a', 17), pick(2027, 16), pick(2027, 3)], 10)
    expect(out).toEqual([keep('a', 10), pick(2027, 10), pick(2027, 3)])
  })
})

describe('gradeFor', () => {
  it('gives a B to a fair trade (under a 10% gap) and to nothing-vs-nothing', () => {
    expect(gradeFor(100, 95)).toBe('B')
    expect(gradeFor(95, 100)).toBe('B')
    expect(gradeFor(0, 0)).toBe('B')
  })
  it('grades the winning side A+ to B+ by how lopsided it is', () => {
    expect(gradeFor(4, 1)).toBe('A+')
    expect(gradeFor(2.3, 1)).toBe('A')
    expect(gradeFor(2, 1)).toBe('A-')
    expect(gradeFor(1.25, 1)).toBe('B+')
  })
  it('grades the losing side B- down to F', () => {
    expect(gradeFor(1, 1.25)).toBe('B-')
    expect(gradeFor(1, 1.5)).toBe('C+')
    expect(gradeFor(1, 2)).toBe('C')
    expect(gradeFor(1, 2.5)).toBe('C-')
    expect(gradeFor(1, 2.8)).toBe('D+')
    expect(gradeFor(1, 3.3)).toBe('D')
    expect(gradeFor(1, 4)).toBe('D-')
    expect(gradeFor(1, 10)).toBe('F')
  })
  it('handles one-sided trades', () => {
    expect(gradeFor(5, 0)).toBe('A+')
    expect(gradeFor(0, 5)).toBe('F')
  })
  it('is scale-invariant', () => {
    expect(gradeFor(40, 10)).toBe(gradeFor(4, 1))
  })
})

describe('judgeTrade (no rosters: each team receives what the other sends)', () => {
  const generic = (g1: number, g2: number) => judgeTrade({ gets: g1, gives: g2 }, { gets: g2, gives: g1 })
  it('prompts when nothing has been added', () => {
    expect(generic(0, 0)).toEqual({ message: 'Add assets to start', winner: null, share1: 50, grade1: null, grade2: null })
  })
  it('calls near-equal sides fair, B for both', () => {
    expect(generic(100, 95)).toMatchObject({ message: 'Fair trade', winner: null, grade1: 'B', grade2: 'B' })
  })
  it('names the winner and the margin, with a grade for each team', () => {
    expect(generic(80, 40)).toMatchObject({ message: 'Team 1 wins by 40.0', winner: 1, grade1: 'A-', grade2: 'C' })
    expect(generic(10, 30)).toMatchObject({ message: 'Team 2 wins by 20.0', winner: 2 })
  })
  it('uses roster names in the headline when given', () => {
    const v = judgeTrade({ gets: 80, gives: 40 }, { gets: 40, gives: 80 }, ['Dynasty Dan', 'Team 2'])
    expect(v.message).toBe('Dynasty Dan wins by 40.0')
  })
  it('reports the share of the value Team 1 receives', () => {
    expect(generic(75, 25).share1).toBe(75)
  })
  it('handles a one-sided trade', () => {
    expect(generic(50, 0)).toMatchObject({ winner: 1, share1: 100, grade1: 'A+', grade2: 'F' })
  })
  it('can report a trade that helps both rosters', () => {
    const v = judgeTrade({ gets: 30, gives: 10 }, { gets: 25, gives: 10 })
    expect(v.message).toBe('Both teams come out ahead')
    expect(v.winner).toBeNull()
    expect([v.grade1, v.grade2]).toEqual(['A+', 'A'])
  })
  it('can report a trade that hurts both rosters', () => {
    expect(judgeTrade({ gets: 5, gives: 20 }, { gets: 4, gives: 20 }).message).toBe('Both teams give up value')
  })
})

describe('evalTeam / evalTrade (roster-aware)', () => {
  const s: Settings = { ...S, keepers: 2, oneQb: true }
  const rb = (id: string, adp: number) => mk(id, 'RB', adp)
  const players = (...ps: Player[]) => new Map(ps.map((p) => [p.id, p]))

  it('matches valuing the traded assets alone when the roster is empty', () => {
    const a = rb('a', 5)
    const b = rb('b', 9)
    const all = players(a, b)
    const sent = [keep('a', 10), pick(2027, 4)]
    const incoming = [keep('b', 12)]
    const t = evalTeam(sent, incoming, [], all, s, 2027)
    expect(t.gives).toBeCloseTo(sumValues(evalSide(sent, all, s, 2027)))
    expect(t.gets).toBeCloseTo(sumValues(evalSide(incoming, all, s, 2027)))
  })

  it('values an incoming keeper only by what it adds over the roster’s existing keepers', () => {
    const stars = [rb('s1', 2), rb('s2', 3)]
    const incomingRb = rb('x', 20)
    const all = players(...stars, incomingRb)
    const incoming = [keep('x', 8)]
    const empty = evalTeam([], incoming, [], all, s, 2027)
    const stacked = evalTeam([], incoming, stars, all, s, 2027)
    // Roster already fills both keeper slots with better surplus, so the newcomer is heavily discounted.
    expect(stacked.gets).toBeLessThan(empty.gets)
    expect(stacked.gets).toBeGreaterThan(0)
  })

  it('costs less to send a keeper when a comparable one remains on the roster', () => {
    const a = rb('a', 3)
    const backup = rb('b', 4)
    const all = players(a, backup)
    const sent = [keep('a', 10)]
    const alone = evalTeam(sent, [], [], all, s, 2027)
    const withDepth = evalTeam(sent, [], [backup], all, s, 2027)
    expect(withDepth.gives).toBeCloseTo(alone.gives) // two keeper slots: the backup was already kept
    // With a single keeper slot the backup was sitting discounted; once `a` leaves he steps up to full value.
    const oneSlot = { ...s, keepers: 1 }
    const tight = evalTeam(sent, [], [backup], all, oneSlot, 2027)
    const aloneOneSlot = evalTeam(sent, [], [], all, oneSlot, 2027)
    expect(tight.gives).toBeLessThan(aloneOneSlot.gives)
  })

  it('applies the one-QB rule across the roster: a second QB is worth nothing to a QB-rich team', () => {
    const qb1 = mk('qb1', 'QB', 5)
    const qb2 = mk('qb2', 'QB', 6)
    const all = players(qb1, qb2)
    const needy = evalTeam([], [keep('qb2', 5)], [], all, s, 2027)
    const stocked = evalTeam([], [keep('qb2', 5)], [qb1], all, s, 2027)
    expect(needy.gets).toBeGreaterThan(0)
    expect(stocked.gets).toBeLessThan(needy.gets)
  })

  it('prices rostered players at their league draft round rather than their ADP round', () => {
    // A steal: ADP 5 (round 1 by ADP) but drafted in round 14. With one keeper slot, his huge surplus
    // fills it, so an incoming keeper is discounted. Priced by ADP he'd have almost no surplus.
    const steal = rb('steal', 5)
    const incomingRb = rb('x', 10)
    const all = players(steal, incomingRb)
    const oneSlot = { ...s, keepers: 1 }
    const incoming = [keep('x', 8)]
    const byAdp = evalTeam([], incoming, [steal], all, oneSlot, 2027)
    const byDraft = evalTeam([], incoming, [steal], all, oneSlot, 2027, new Map([['steal', 14]]))
    expect(byDraft.gets).toBeLessThan(byAdp.gets)
    expect(byDraft.gets).toBeGreaterThan(0)
  })

  describe('roster needs (lineup slots)', () => {
    const qb1 = mk('qb1', 'QB', 5)
    const qb2 = mk('qb2', 'QB', 12)
    const all = players(qb1, qb2)
    const costs = new Map([['qb1', 9]]) // qb1 is a big keeper steal, so qb2 can't be the one kept
    const incoming = [keep('qb2', 5)]
    const sf: Slot[] = [['QB'], ['QB', 'RB', 'WR', 'TE']]
    const oneQbSlot: Slot[] = [['QB']]

    it('values a second QB who can’t be kept when he would start in a superflex slot', () => {
      const withSf = evalTeam([], incoming, [qb1], all, s, 2027, costs, sf)
      expect(withSf.later!.gets).toBe(0) // not a keeper
      expect(withSf.now!.gets).toBeGreaterThan(0) // but he starts this season
      const half = evalTeam([], incoming, [qb1], all, { ...s, redraftWeight: 50 }, 2027, costs, sf)
      expect(half.gets).toBeCloseTo(0.5 * half.now!.gets) // not a keeper, so only the redraft half counts
    })

    it('gives that same second QB no value when he would sit behind the starter', () => {
      const noSf = evalTeam([], incoming, [qb1], all, s, 2027, costs, oneQbSlot)
      expect(noSf.now!.gets).toBe(0)
      expect(noSf.gets).toBe(0)
    })

    it('values a player more to a team with a hole at his position than to one that is stacked', () => {
      const rb1 = mk('rb1', 'RB', 8)
      const rbIn = mk('rbin', 'RB', 20)
      const pool = players(rb1, rbIn)
      const slots: Slot[] = [['RB']]
      const blended = { ...s, redraftWeight: 50 } // totals only reflect lineup needs once redraft value counts
      const incomingRb = [keep('rbin', 6)]
      const hole = evalTeam([], incomingRb, [mk('wr', 'WR', 9)], players(rb1, rbIn, mk('wr', 'WR', 9)), blended, 2027, undefined, slots)
      const stacked = evalTeam([], incomingRb, [rb1], pool, blended, 2027, undefined, slots)
      expect(hole.now!.gets).toBeGreaterThan(stacked.now!.gets)
      expect(hole.gets).toBeGreaterThan(stacked.gets)
    })

    it('counts the lineup a team loses when it sends a starter', () => {
      const t = evalTeam([keep('qb1', 9)], [], [qb1, qb2], all, s, 2027, costs, oneQbSlot)
      // qb2 steps in, so the lineup only drops from qb1's strength to qb2's.
      expect(t.now!.gives).toBeGreaterThan(0)
      expect(t.now!.gives).toBeLessThan(pickValue(5))
    })

    it('values a kicker to a team that has none but little to one that already has a good one', () => {
      const kSlots: Slot[] = [['K']]
      const blendedK = { ...s, redraftWeight: 50 }
      const newK = mk('newk', 'K', 100)
      const oldK = mk('oldk', 'K', 98)
      const pool = players(newK, oldK)
      const noK = evalTeam([], [keep('newk', 17)], [mk('rb', 'RB', 20)], players(newK, mk('rb', 'RB', 20)), blendedK, 2027, undefined, kSlots)
      const hasK = evalTeam([], [keep('newk', 17)], [oldK], pool, blendedK, 2027, undefined, kSlots)
      expect(noK.now!.gets).toBeGreaterThan(0)
      expect(hasK.now!.gets).toBe(0) // he'd sit behind the better kicker
      expect(noK.gets).toBeGreaterThan(hasK.gets)
    })

    it('values each player on his own redraft worth without slots or without a roster', () => {
      const alone = redraftWorth(qb2, s)
      expect(evalTeam([], incoming, [qb1], all, s, 2027, costs).now!.gets).toBeCloseTo(alone)
      expect(evalTeam([], incoming, [], all, s, 2027, costs, sf).now!.gets).toBeCloseTo(alone)
    })
  })

  it('ignores rostered players that have no ADP data', () => {
    const a = rb('a', 5)
    const all = players(a)
    const ghost = mk('ghost', 'WR', 5) // on the roster but missing from the player map
    const t = evalTeam([keep('a', 10)], [], [ghost], all, s, 2027)
    expect(t.gives).toBeCloseTo(evalTeam([keep('a', 10)], [], [], all, s, 2027).gives)
  })

  it('is symmetric with no rosters and consistent with judgeTrade', () => {
    const a = rb('a', 5)
    const b = rb('b', 30)
    const all = players(a, b)
    const [t1, t2] = evalTrade([keep('a', 10)], [keep('b', 3)], [], [], all, s, 2027)
    expect(t1.gets).toBeCloseTo(t2.gives)
    expect(t2.gets).toBeCloseTo(t1.gives)
    const v = judgeTrade(t1, t2)
    expect(v.grade1).not.toBeNull()
  })

  it('discounts what a trade is worth to a team that already has keepers to displace', () => {
    // Each team swaps a cheap keeper (ADP 15/16 kept in round 10) but already holds two other keepers
    // with surplus. With the keeper limit at 2, the newcomer pushes one of them into the discounted
    // slot, so he adds less than his standalone surplus, and sending him away costs less than that too.
    const mineStars = [rb('m1', 2), rb('m2', 3)]
    const theirStars = [rb('t1', 4), rb('t2', 5)]
    const spareMine = rb('sm', 15)
    const spareTheirs = rb('st', 16)
    const all = players(...mineStars, ...theirStars, spareMine, spareTheirs)
    const sentMine = [keep('sm', 10)]
    const sentTheirs = [keep('st', 10)]
    const [r1, r2] = evalTrade(sentMine, sentTheirs, [...mineStars, spareMine], [...theirStars, spareTheirs], all, s, 2027)
    const [g1, g2] = evalTrade(sentMine, sentTheirs, [], [], all, s, 2027)
    expect(g1.gets).toBeGreaterThan(0)
    expect(r1.gets).toBeLessThan(g1.gets)
    expect(r2.gets).toBeLessThan(g2.gets)
    expect(r1.gives).toBeLessThan(g1.gives)
    expect(r2.gives).toBeLessThan(g2.gives)
  })
})

describe('keepers need a pick in their round', () => {
  const rb = (id: string, adp: number) => mk(id, 'RB', adp)
  const picks = (...rounds: number[]) => new Map(rounds.map((r): [number, number] => [r, 1]))
  const surplusAt = (adp: number, round: number) => pickValue(adp) - pickValue(roundSlot(round, S))

  it('discounts a keeper whose round the team has no pick in', () => {
    const all = roster(rb('a', 10))
    const [with5] = evalSide([keep('a', 5)], all, S, 2027, picks(5))
    const [without5] = evalSide([keep('a', 5)], all, S, 2027, picks(4, 6))
    expect(with5!.value).toBeCloseTo(surplusAt(10, 5))
    expect(without5!.blocked).toBe('no-pick')
    expect(without5!.value).toBeCloseTo(surplusAt(10, 5) * 0.25)
  })

  it('ignores pick ownership when it is unknown', () => {
    const [item] = evalSide([keep('a', 5)], roster(rb('a', 10)), S, 2027)
    expect(item!.blocked).toBeUndefined()
  })

  it('lets only the best keeper use a round’s single pick', () => {
    const all = roster(rb('a', 10), rb('b', 20))
    const [a, b] = evalSide([keep('a', 5), keep('b', 5)], all, S, 2027, picks(5))
    expect(a!.blocked).toBeUndefined()
    expect(b!.blocked).toBe('pick-taken')
    expect(b!.value).toBeCloseTo(surplusAt(20, 5) * 0.25)
  })

  it('keeps both when the team owns two picks in that round', () => {
    const all = roster(rb('a', 10), rb('b', 20))
    const two = new Map([[5, 2]])
    const items = evalSide([keep('a', 5), keep('b', 5)], all, S, 2027, two)
    expect(items.every((i) => !i.blocked)).toBe(true)
  })

  it('finds the best combination, not just the best single keeper', () => {
    // QB1 and the RB both need the round 5 pick; QB2 needs round 6. With one QB allowed, taking QB1 first
    // would block both others, but RB + QB2 is worth more.
    const qb1 = mk('qb1', 'QB', 3)
    const qb2 = mk('qb2', 'QB', 8)
    const rb1 = rb('rb1', 5)
    const all = roster(qb1, qb2, rb1)
    const items = evalSide([keep('qb1', 5), keep('rb1', 5), keep('qb2', 6)], all, S, 2027, picks(5, 6))
    const by = (id: string) => items.find((i) => i.player!.id === id)!
    expect(by('rb1').blocked).toBeUndefined()
    expect(by('qb2').blocked).toBeUndefined()
    expect(by('qb1').value).toBe(0) // the extra QB
  })

  describe('evalTeam: trading picks and players that use them', () => {
    const x = rb('x', 10) // drafted in round 5, so he costs a round 5 pick
    const all = roster(x)
    const costs = new Map([['x', 5]])
    const pickAsset = (round: number, year = 2027): Asset => ({ t: 'k', year, round })
    const run = (sent: Asset[], incoming: Asset[], p?: Map<number, number>, rosterPlayers: Player[] = [x]) =>
      evalTeam(sent, incoming, rosterPlayers, all, S, 2027, costs, undefined, p)
    const lostSurplus = surplusAt(10, 5) * 0.75

    it('charges for the keeper you lose access to when you trade away his pick', () => {
      const has = picks(5)
      const withAccess = run([pickAsset(5)], [], has)
      const unaware = run([pickAsset(5)], [])
      expect(withAccess.gives - unaware.gives).toBeCloseTo(lostSurplus)
    })

    it('does not charge when the pick traded away isn’t one a keeper needs', () => {
      const has = picks(5, 9)
      expect(run([pickAsset(9)], [], has).gives).toBeCloseTo(run([pickAsset(9)], []).gives)
    })

    it('credits a pick that lets you keep a player you otherwise couldn’t', () => {
      const lacks = picks(4)
      const withAccess = run([], [pickAsset(5)], lacks)
      const unaware = run([], [pickAsset(5)])
      expect(withAccess.gets - unaware.gets).toBeCloseTo(lostSurplus)
    })

    it('ignores picks from later drafts, which can’t be used to keep anyone this year', () => {
      const lacks = picks(4)
      expect(run([], [pickAsset(5, 2028)], lacks).gets).toBeCloseTo(run([], [pickAsset(5, 2028)]).gets)
    })

    it('discounts an incoming player the team has no pick to keep', () => {
      const incomingY = keep('y', 7)
      const both = roster(x, rb('y', 12))
      const call = (p?: Map<number, number>) => evalTeam([], [incomingY], [], both, S, 2027, costs, undefined, p).gets
      expect(call(picks(7))).toBeCloseTo(surplusAt(12, 7))
      expect(call(picks(4))).toBeCloseTo(surplusAt(12, 7) * 0.25)
    })

    it('lets an incoming keeper take the pick from a worse keeper already on the roster', () => {
      const better = rb('better', 4)
      const both = roster(x, better)
      const t = evalTeam([], [keep('better', 5)], [x], both, S, 2027, costs, undefined, picks(5))
      // better takes round 5; x is pushed out, so the team gains less than better's standalone surplus.
      expect(t.gets).toBeCloseTo(surplusAt(4, 5) - lostSurplus)
    })
  })
})

describe('redraft value and keeper value', () => {
  const rb = (id: string, adp: number) => mk(id, 'RB', adp)
  const withWeight = (redraftWeight: number): Settings => ({ ...S, redraftWeight })

  describe('itemValue', () => {
    // ADP 20 costs round 2 to keep: the cost is more than he's worth, so his keeper value is 0.
    const costly = () => evalSide([keep('a', 2)], roster(rb('a', 20)), S, 2027)[0]!

    it('is zero for a costly player when only keeper value counts', () => {
      expect(costly().value).toBe(0)
      expect(itemValue(costly(), withWeight(0))).toBe(0)
    })
    it('is not zero for him once redraft value counts', () => {
      expect(itemValue(costly(), withWeight(50))).toBeCloseTo(0.5 * pickValue(20))
    })
    it('is only redraft value at 100%', () => {
      const cheap = evalSide([keep('a', 10)], roster(rb('a', 20)), S, 2027)[0]!
      expect(itemValue(cheap, withWeight(100))).toBeCloseTo(pickValue(20))
    })
    it('blends the two in proportion', () => {
      const cheap = evalSide([keep('a', 10)], roster(rb('a', 20)), S, 2027)[0]!
      expect(itemValue(cheap, withWeight(25))).toBeCloseTo(0.25 * cheap.redraft! + 0.75 * cheap.value)
    })
    it('gives draft picks only the keeper (future) share', () => {
      const [pickItem] = evalSide([pick(2027, 4)], roster(), S, 2027)
      expect(itemValue(pickItem!, withWeight(50))).toBeCloseTo(0.5 * pickValue(roundSlot(4, S)))
      expect(itemValue(pickItem!, withWeight(100))).toBe(0)
    })
    it('sums a list', () => {
      const items = evalSide([keep('a', 2), pick(2027, 4)], roster(rb('a', 20)), S, 2027)
      const w = withWeight(50)
      expect(sumItemValues(items, w)).toBeCloseTo(itemValue(items[0]!, w) + itemValue(items[1]!, w))
    })
  })

  describe('worth from current-season production', () => {
    const base = { ...rb('a', 100), stats: { gp: 8, ppr: 160, half: 150, std: 140 } }
    it('is just preseason ADP without a current rank', () => {
      expect(keeperWorth(base, S)).toBeCloseTo(pickValue(100))
      expect(redraftWorth(base, S)).toBeCloseTo(pickValue(100))
    })
    it('leans mostly on production for redraft, and less for keepers', () => {
      const hot = { ...base, curAdp: 10 }
      expect(redraftWorth(hot, S)).toBeCloseTo(0.3 * pickValue(100) + 0.7 * pickValue(10))
      expect(keeperWorth(hot, S)).toBeCloseTo((1 - CURRENT_WEIGHT_KEEPER) * pickValue(100) + CURRENT_WEIGHT_KEEPER * pickValue(10))
      expect(redraftWorth(hot, S)).toBeGreaterThan(keeperWorth(hot, S))
    })
    it('trusts production less with fewer games', () => {
      const few = { ...base, curAdp: 10, stats: { ...base.stats, gp: 4 } }
      expect(redraftWorth(few, S)).toBeCloseTo(0.65 * pickValue(100) + 0.35 * pickValue(10))
    })
    it('marks down a player whose production has fallen off', () => {
      const cold = { ...rb('b', 10), curAdp: 100, stats: base.stats }
      expect(redraftWorth(cold, S)).toBeLessThan(pickValue(10))
    })
  })

  describe('evalTeam blends the two', () => {
    const costly = rb('costly', 20)
    const all = roster(costly)
    const sent = [keep('costly', 2)] // costs more than he's worth to keep

    it('a player who is worthless as a keeper still costs the team something to give up', () => {
      expect(evalTeam(sent, [], [], all, withWeight(0), 2027).gives).toBe(0)
      expect(evalTeam(sent, [], [], all, withWeight(50), 2027).gives).toBeCloseTo(0.5 * pickValue(20))
    })
    it('total is the weighted blend of the keeper and redraft sides', () => {
      const t = evalTeam(sent, [keep('costly', 10)], [], all, withWeight(30), 2027)
      expect(t.gets).toBeCloseTo(0.7 * t.later!.gets + 0.3 * t.now!.gets)
      expect(t.gives).toBeCloseTo(0.7 * t.later!.gives + 0.3 * t.now!.gives)
    })
    it('a higher redraft weight favors receiving the better player this season', () => {
      // star: great this season but costs a lot to keep. bargain: weaker, but a cheap keeper.
      const star = rb('star', 5)
      const bargain = rb('bargain', 40)
      const pool = roster(star, bargain)
      const net = (w: number) => {
        const t = evalTeam([keep('bargain', 14)], [keep('star', 1)], [], pool, withWeight(w), 2027)
        return t.gets - t.gives
      }
      expect(net(100)).toBeGreaterThan(net(0))
    })
    it('redraftShare clamps to 0-1', () => {
      expect(redraftShare({ redraftWeight: 150 })).toBe(1)
      expect(redraftShare({ redraftWeight: -5 })).toBe(0)
      expect(redraftShare({ redraftWeight: 40 })).toBeCloseTo(0.4)
    })
  })
})

describe('contending and rebuilding', () => {
  const rb = (id: string, adp: number) => mk(id, 'RB', adp)
  const s50: Settings = { ...S, redraftWeight: 50 }

  it('shifts a team’s redraft weight by its stance, within 0-100', () => {
    expect(weightFor(s50, null)).toBe(50)
    expect(weightFor(s50, 'contending')).toBe(50 + STANCE_SHIFT)
    expect(weightFor(s50, 'rebuilding')).toBe(50 - STANCE_SHIFT)
    expect(weightFor({ redraftWeight: 90 }, 'contending')).toBe(100)
    expect(weightFor({ redraftWeight: 10 }, 'rebuilding')).toBe(0)
  })

  it('only changes the redraft weight in a team’s settings', () => {
    expect(settingsFor(s50, 'contending')).toEqual({ ...s50, redraftWeight: 50 + STANCE_SHIFT })
    expect(settingsFor(s50, null)).toEqual(s50)
  })

  // star: far better this season, but costly to keep. bargain: weaker, but a cheap keeper.
  const star = rb('star', 5)
  const bargain = rb('bargain', 40)
  const pool = new Map([star, bargain].map((p) => [p.id, p]))
  const swap = (stances: readonly [Stance, Stance]) =>
    evalTrade([keep('bargain', 14)], [keep('star', 1)], [], [], pool, s50, 2027, undefined, undefined, undefined, stances)
  const net = (t: { gets: number; gives: number }) => t.gets - t.gives

  it('a contending team likes receiving the better player this season more than a rebuilding one does', () => {
    expect(net(swap(['contending', null])[0])).toBeGreaterThan(net(swap([null, null])[0]))
    expect(net(swap([null, null])[0])).toBeGreaterThan(net(swap(['rebuilding', null])[0]))
  })

  it('one team’s stance doesn’t change how the other team sees the trade', () => {
    expect(swap(['contending', null])[1]).toEqual(swap(['rebuilding', null])[1])
    expect(swap([null, 'rebuilding'])[0]).toEqual(swap([null, null])[0])
  })

  it('lets a contender and a rebuilder each come out ahead on the same trade', () => {
    const [contender, rebuilder] = swap(['contending', 'rebuilding'])
    expect(net(contender)).toBeGreaterThan(0) // gets the star
    expect(net(rebuilder)).toBeGreaterThan(-net(contender)) // the rebuilder's loss is smaller than the contender's gain
  })

  it('treats a missing stance list as no stance', () => {
    const none = evalTrade([keep('bargain', 14)], [keep('star', 1)], [], [], pool, s50, 2027)
    expect(none).toEqual(swap([null, null]))
  })
})
