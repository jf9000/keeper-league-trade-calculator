import { describe, expect, it } from 'vitest'
import type { Player } from '../src/types'
import {
  estimateMissingQbSf,
  estimateQbSfAdp,
  flipMflName,
  mflFcount,
  mflRows,
  normPos,
  normTeam,
  normalizeName,
  parseFfc,
  parseMflAdp,
  parseMflPlayers,
  validatePlayers,
} from './adp'
import { assertAllowedUrl } from './http'

describe('names and teams', () => {
  it('flips MFL "Last, First" names', () => {
    expect(flipMflName("Chase, Ja'Marr")).toBe("Ja'Marr Chase")
    expect(flipMflName('Harrison Jr., Marvin')).toBe('Marvin Harrison Jr.')
    expect(flipMflName('Madonna')).toBe('Madonna')
  })
  it('normalizes names for cross-source matching', () => {
    expect(normalizeName('Kenneth Walker III')).toBe('kenneth walker')
    expect(normalizeName("Ja'Marr Chase")).toBe('jamarr chase')
    expect(normalizeName(flipMflName('Harrison Jr., Marvin'))).toBe(normalizeName('Marvin Harrison'))
    expect(normalizeName('Amon-Ra St. Brown')).toBe('amonra st brown')
  })
  it('maps MFL and FFC team codes to Sleeper’s', () => {
    expect(['KCC', 'GBP', 'SFO', 'TBB', 'NEP', 'NOS', 'LVR', 'JAC', 'WSH'].map(normTeam)).toEqual([
      'KC', 'GB', 'SF', 'TB', 'NE', 'NO', 'LV', 'JAX', 'WAS',
    ])
    expect(normTeam('cin')).toBe('CIN')
    expect(normTeam(undefined)).toBe('')
  })
  it('picks the closest league size MFL supports', () => {
    expect([8, 9, 10, 12, 13, 15, 20, 4].map(mflFcount)).toEqual([8, 8, 10, 12, 12, 14, 16, 8])
  })
})

describe('MFL parsing', () => {
  const adpJson = {
    adp: {
      player: [
        { id: '1', averagePick: '2.12' },
        { id: '2', averagePick: 'nope' },
        { id: '3', averagePick: '-4' },
        { id: '4', averagePick: '10.5' },
        'junk',
      ],
    },
  }
  it('keeps valid ADP rows and drops malformed ones', () => {
    expect(parseMflAdp(adpJson)).toEqual([
      { id: '1', adp: 2.12 },
      { id: '4', adp: 10.5 },
    ])
  })
  it('accepts a single result that MFL sends as a bare object', () => {
    expect(parseMflAdp({ adp: { player: { id: '9', averagePick: '5.0' } } })).toEqual([{ id: '9', adp: 5 }])
  })
  it('survives unexpected shapes', () => {
    expect(parseMflAdp(null)).toEqual([])
    expect(parseMflAdp({ adp: 'oops' })).toEqual([])
    expect(parseMflPlayers({ players: null }).size).toBe(0)
  })
  it('joins ADP to player info, flips names, and keeps skill positions, kickers and defenses', () => {
    const players = parseMflPlayers({
      players: {
        player: [
          { id: '1', name: 'Gibbs, Jahmyr', position: 'RB', team: 'DET' },
          { id: '4', name: 'Allen, Josh', position: 'QB', team: 'BUF' },
          { id: '5', name: 'Buffalo Bills', position: 'Def', team: 'BUF' },
          { id: '7', name: 'Aubrey, Brandon', position: 'PK', team: 'DAL' },
          { id: '8', name: 'Dallas, Team Kicker', position: 'TMPK', team: 'DAL' },
          { id: '6', name: 'Parsons, Micah', position: 'LB', team: 'GBP' },
        ],
      },
    })
    const rows = mflRows(
      [
        { id: '1', adp: 2.1 },
        { id: '4', adp: 24 },
        { id: '5', adp: 150 },
        { id: '7', adp: 100 },
        { id: '8', adp: 190 },
        { id: '6', adp: 90 },
        { id: '99', adp: 3 },
      ],
      players,
    )
    expect(rows).toEqual([
      { name: 'Jahmyr Gibbs', position: 'RB', team: 'DET', adp: 2.1 },
      { name: 'Josh Allen', position: 'QB', team: 'BUF', adp: 24 },
      { name: 'Buffalo Bills', position: 'DEF', team: 'BUF', adp: 150 },
      { name: 'Brandon Aubrey', position: 'K', team: 'DAL', adp: 100 },
    ])
  })
})

describe('parseFfc', () => {
  it('keeps fantasy positions with valid ADP and normalizes teams and K/D/ST labels', () => {
    const rows = parseFfc({
      players: [
        { name: 'Ja’Marr Chase', position: 'WR', team: 'CIN', adp: 1.5 },
        { name: 'Some Kicker', position: 'PK', team: 'DAL', adp: 150 },
        { name: 'Denver Defense', position: 'DEF', team: 'DEN', adp: 120 },
        { name: 'A Punter', position: 'P', team: 'DAL', adp: 160 },
        { name: 'Trevor X', position: 'QB', team: 'JAC', adp: 0 },
        { name: 'Travis Hunter', position: 'WR', team: 'JAC', adp: 30 },
      ],
    })
    expect(rows.map((r) => [r.name, r.position, r.team])).toEqual([
      ['Ja’Marr Chase', 'WR', 'CIN'],
      ['Some Kicker', 'K', 'DAL'],
      ['Denver Defense', 'DEF', 'DEN'],
      ['Travis Hunter', 'WR', 'JAX'],
    ])
  })
})

describe('normPos', () => {
  it('maps kicker and defense labels from the sources', () => {
    expect(['PK', 'K', 'Def', 'DEF', 'DST', 'qb'].map(normPos)).toEqual(['K', 'K', 'DEF', 'DEF', 'DEF', 'QB'])
  })
})

describe('estimateQbSfAdp', () => {
  it('gives the n-th best QB the n-th best superflex slot from the reference season', () => {
    const est = estimateQbSfAdp(
      [
        { key: 'b', adp: 40 },
        { key: 'a', adp: 25 },
        { key: 'c', adp: 60 },
      ],
      [8, 1.7, 3],
    )
    expect(est.get('a')).toBe(1.7)
    expect(est.get('b')).toBe(3)
    expect(est.get('c')).toBe(8)
  })
  it('never moves a QB later than his regular ADP', () => {
    expect(estimateQbSfAdp([{ key: 'a', adp: 2 }], [5]).get('a')).toBe(2)
  })
  it('gives no estimate to QBs beyond the reference list', () => {
    const est = estimateQbSfAdp(
      [
        { key: 'a', adp: 10 },
        { key: 'b', adp: 20 },
      ],
      [3],
    )
    expect(est.has('b')).toBe(false)
  })
})

describe('estimateMissingQbSf', () => {
  const qbs = [
    { key: 'a', adp: 10 },
    { key: 'b', adp: 20 },
    { key: 'c', adp: 40 },
    { key: 'd', adp: 50 },
    { key: 'e', adp: 100 },
  ]
  it('scales regular ADP by the median superflex/regular ratio of QBs that have both', () => {
    // known ratios: 0.2, 0.2, 0.5 → median 0.2
    const est = estimateMissingQbSf(qbs, new Map([['a', 2], ['b', 4], ['c', 20]]))
    expect(est.get('d')).toBeCloseTo(10)
    expect(est.get('e')).toBeCloseTo(20)
    expect(est.has('a')).toBe(false)
  })
  it('never lands later than the regular ADP', () => {
    const est = estimateMissingQbSf(qbs, new Map([['a', 12], ['b', 24], ['c', 48]])) // ratios all 1.2
    expect(est.get('d')).toBe(50)
  })
  it('estimates nothing when fewer than three QBs have both numbers', () => {
    expect(estimateMissingQbSf(qbs, new Map([['a', 2], ['b', 4]])).size).toBe(0)
  })
})

describe('validatePlayers', () => {
  const mk = (i: number, pos: Player['pos'], adp = i + 1): Player => ({
    id: String(i), sleeperId: String(i), name: `P${i}`, pos, team: 'XXX', adp, sfAdp: null,
  })
  const good = Array.from({ length: 120 }, (_, i) => mk(i, (['QB', 'RB', 'WR', 'TE'] as const)[i % 4]!))
  it('accepts a healthy list', () => {
    expect(validatePlayers(good)).toEqual([])
  })
  it('rejects a near-empty list', () => {
    expect(validatePlayers(good.slice(0, 2)).join()).toMatch(/only 2 players/)
  })
  it('rejects duplicates and implausible numbers', () => {
    const bad = [...good, { ...good[0]!, name: 'Dupe' }, { ...mk(500, 'RB'), adp: Number.NaN }]
    const problems = validatePlayers(bad).join('|')
    expect(problems).toMatch(/duplicate id 0/)
    expect(problems).toMatch(/implausible ADP/)
  })
  it('rejects a board with no early picks', () => {
    const shifted = good.map((p) => ({ ...p, adp: p.adp + 100 }))
    expect(validatePlayers(shifted).join()).toMatch(/top 15/)
  })
})

describe('assertAllowedUrl', () => {
  it('allows the three known HTTPS hosts', () => {
    for (const u of [
      'https://api.myfantasyleague.com/2026/export?TYPE=adp',
      'https://fantasyfootballcalculator.com/api/v1/adp/ppr',
      'https://api.sleeper.app/v1/players/nfl',
    ]) {
      expect(() => assertAllowedUrl(u)).not.toThrow()
    }
  })
  it('refuses plain HTTP, unknown hosts, and look-alikes', () => {
    expect(() => assertAllowedUrl('http://api.sleeper.app/v1/players/nfl')).toThrow(/non-HTTPS/)
    expect(() => assertAllowedUrl('https://evil.example.com/x')).toThrow(/unlisted host/)
    expect(() => assertAllowedUrl('https://api.sleeper.app.evil.com/x')).toThrow(/unlisted host/)
    expect(() => assertAllowedUrl('https://api.myfantasyleague.com@evil.com/x')).toThrow(/unlisted host/)
  })
})
