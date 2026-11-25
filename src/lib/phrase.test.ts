import { describe, expect, it } from 'vitest'
import { phrase } from './phrase'

describe('phrase', () => {
  const options = ['a', 'b', 'c', 'd', 'e', 'f']
  const seeds = Array.from({ length: 200 }, (_, i) => `seed${i}`)

  it('keeps the two sides on separate options', () => {
    for (const seed of seeds) {
      expect(['a', 'c', 'e']).toContain(phrase(options, seed, 0))
      expect(['b', 'd', 'f']).toContain(phrase(options, seed, 1))
    }
  })

  it('draws on all of a side’s options, and reads the same way each time', () => {
    expect(new Set(seeds.map((seed) => phrase(options, seed, 0))).size).toBe(3)
    expect(phrase(options, 'x', 1)).toBe(phrase(options, 'x', 1))
  })

  it('steps to a different option when one side repeats a kind of note', () => {
    expect(phrase(options, 'x', 0, 1)).not.toBe(phrase(options, 'x', 0, 0))
  })
})
