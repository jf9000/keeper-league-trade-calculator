import { describe, expect, it } from 'vitest'
import { adpLabel, adpSlot, ordinal } from './adpLabel'

describe('adpLabel', () => {
  it('turns an ADP into a round, pick and overall slot', () => {
    expect(adpSlot(1.9, 12)).toEqual({ round: 1, pick: 2, overall: 2 })
    expect(adpSlot(11.9, 12)).toEqual({ round: 1, pick: 12, overall: 12 })
    expect(adpSlot(12.6, 12)).toEqual({ round: 2, pick: 1, overall: 13 })
    expect(adpSlot(0.2, 12).overall).toBe(1)
  })
  it('words it as an overall pick', () => {
    expect(adpLabel(1.9)).toBe('2nd overall')
    expect(adpLabel(145.2)).toBe('145th overall')
  })
  it('gets ordinals right', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 112].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '112th'])
  })
})
