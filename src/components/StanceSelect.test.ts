import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EMPTY_TRADE } from '../lib/trade'
import { STANCE_OPTIONS, type Stance } from '../lib/valuation'
import { HintTip } from './HintTip'
import { StanceSelect, stanceFromValue, stanceValue } from './StanceSelect'

const render = (value: Stance) =>
  renderToStaticMarkup(createElement(StanceSelect, { value, onChange: () => {}, ariaLabel: 'Team 1 outlook', label: 'Outlook' }))

/** Each radio's name and whether it is the checked one, in order. */
const options = (value: Stance): [string, boolean][] =>
  [...render(value).matchAll(/<input([^>]*)>/g)].map((m) => [/aria-label="([^"]*)"/.exec(m[1]!)![1]!, /\bchecked=/.test(m[1]!)])

describe('StanceSelect', () => {
  it('is a radio group with the five outlooks in order, from selling to all in', () => {
    expect(render(null)).toContain('role="radiogroup" aria-label="Team 1 outlook"')
    expect(render(null).match(/type="radio"/g)).toHaveLength(5)
    expect(options(null).map(([label]) => label)).toEqual(['Sell it all', 'Rebuilding', 'Balanced', 'Contending', 'Victory or death'])
  })

  it('has balanced selected by default, and a new trade starts that way', () => {
    expect(options(null)).toEqual([
      ['Sell it all', false],
      ['Rebuilding', false],
      ['Balanced', true],
      ['Contending', false],
      ['Victory or death', false],
    ])
    expect(EMPTY_TRADE.stance).toEqual([null, null])
  })

  it('selects only the chosen outlook, and writes its name out', () => {
    for (const [stance, label] of [['sell', 'Sell it all'], ['rebuilding', 'Rebuilding'], ['contending', 'Contending'], ['allin', 'Victory or death']] as const) {
      expect(options(stance).filter(([, on]) => on)).toEqual([[label, true]])
      expect(render(stance)).toContain(`>${label}</span>`)
    }
  })

  it('maps every outlook to a field value and back, and treats anything else as balanced', () => {
    for (const { stance } of STANCE_OPTIONS) expect(stanceFromValue(stanceValue(stance))).toBe(stance)
    expect(new Set(STANCE_OPTIONS.map((o) => stanceValue(o.stance))).size).toBe(5) // values are distinct
    expect(stanceFromValue('nonsense')).toBeNull()
  })

  it('labels the ends Sell and Win-now, and names an end outlook in full only when it is chosen', () => {
    const text = (stance: Stance) => [...render(stance).matchAll(/>([^<>]+)<\/span>/g)].map((m) => m[1])
    expect(text(null)).toEqual(['Balanced', 'Sell', 'Win-now'])
    expect(text('sell')).toEqual(['Sell it all', 'Sell', 'Win-now'])
    expect(text('allin')).toEqual(['Victory or death', 'Sell', 'Win-now'])
  })

  it('shows no percentages', () => {
    expect(render(null)).not.toContain('%')
  })
})

describe('HintTip', () => {
  const html = renderToStaticMarkup(createElement(HintTip, { label: 'About outlook', text: 'Keepers matter less as you become more aggressive' }))
  it('carries the tooltip text and describes its button by it', () => {
    expect(html).toContain('Keepers matter less as you become more aggressive')
    expect(html).toContain('role="tooltip"')
    const m = /id="([^"]+)"[^>]*role="tooltip"|role="tooltip"[^>]*id="([^"]+)"/.exec(html)
    const tipId = m?.[1] ?? m?.[2]
    expect(tipId).toBeTruthy()
    expect(html).toContain(`aria-describedby="${tipId}"`)
  })
  it('animates in on hover and keyboard focus', () => {
    expect(html).toContain('group-hover:opacity-100')
    expect(html).toContain('group-focus-within:opacity-100')
    expect(html).toContain('motion-reduce:')
  })
})
