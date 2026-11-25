import { describe, expect, it } from 'vitest'
import { decodeTrade, encodeTrade, type SharedTrade } from './share'
import { DEFAULT_SETTINGS } from './valuation'

const trade: SharedTrade = {
  assets: [
    [
      { t: 'p', id: '9221', keeperRound: 3 },
      { t: 'k', year: 2027, round: 2 },
    ],
    [{ t: 'p', id: 'josh-allen-qb', keeperRound: 1 }],
  ],
  rosters: [4, null],
  stance: ['contending', null],
  settings: { ...DEFAULT_SETTINGS, scoring: 'half', superflex: false },
  leagueId: '1234567890',
}

describe('share links', () => {
  it('round-trips a trade', () => {
    expect(decodeTrade(encodeTrade(trade))).toEqual(trade)
  })

  it('round-trips a manual-mode trade with no league', () => {
    const t: SharedTrade = { ...trade, leagueId: null, rosters: [null, null] }
    expect(decodeTrade(encodeTrade(t))).toEqual(t)
  })

  it('escapes player IDs that contain separators', () => {
    const t: SharedTrade = { ...trade, assets: [[{ t: 'p', id: 'a,b:c&d=e', keeperRound: 2 }], []] }
    expect(decodeTrade(encodeTrade(t))?.assets[0][0]).toEqual({ t: 'p', id: 'a,b:c&d=e', keeperRound: 2 })
  })

  it('accepts a leading ?', () => {
    expect(decodeTrade(`?${encodeTrade(trade)}`)).toEqual(trade)
  })

  it('clamps out-of-range numbers instead of trusting them', () => {
    const q = encodeTrade(trade).replace('s=12:2:17', 's=999:99:99').replace('p:9221:3', 'p:9221:99')
    const out = decodeTrade(q)!
    expect(out.settings.teams).toBe(32)
    expect(out.settings.rounds).toBe(30)
    expect(out.assets[0][0]).toEqual({ t: 'p', id: '9221', keeperRound: 30 })
  })

  it('refuses links with an absurd number of assets or an oversized query', () => {
    const many = Array.from({ length: 41 }, (_, i) => `p:${i}:3`).join(',')
    expect(decodeTrade(encodeTrade(trade).replace(/a=[^&]*/, `a=${many}`))).toBeNull()
    expect(decodeTrade(`${encodeTrade(trade)}&junk=${'x'.repeat(5000)}`)).toBeNull()
  })

  it.each([
    ['empty', ''],
    ['no settings', 'a=p:1:2'],
    ['bad scoring', encodeTrade(trade).replace(':half:', ':bogus:')],
    ['bad asset', encodeTrade(trade).replace('p:9221:3', 'x:9221:3')],
    ['non-numeric round', encodeTrade(trade).replace('p:9221:3', 'p:9221:abc')],
  ])('rejects %s', (_name, q) => {
    expect(decodeTrade(q)).toBeNull()
  })

  it('round-trips every outlook, and keeps old links working', () => {
    for (const stance of ['sell', 'rebuilding', null, 'contending', 'allin'] as const) {
      const t: SharedTrade = { ...trade, stance: [stance, stance === null ? 'allin' : null] }
      expect(decodeTrade(encodeTrade(t))?.stance).toEqual(t.stance)
    }
    // links made before the new outlooks used c, r and n
    const old = encodeTrade(trade).replace(/o=[a-z]{2}/, 'o=rc')
    expect(decodeTrade(old)?.stance).toEqual(['rebuilding', 'contending'])
    expect(decodeTrade(encodeTrade(trade).replace(/o=[a-z]{2}/, 'o=zz'))?.stance).toEqual([null, null])
  })
})
