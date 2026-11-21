import { describe, expect, it } from 'vitest'
import { describeSfSource } from './sfSource'

describe('describeSfSource', () => {
  it('explains real superflex drafts with some QBs estimated', () => {
    expect(describeSfSource('ffc-2qb:2026 (+21 QBs estimated)', 2026)).toBe(
      'Superflex QB ADP comes from Fantasy Football Calculator’s 2026 superflex drafts. 21 QBs missing from them are estimated.',
    )
  })
  it('says nothing when every QB came from real superflex drafts', () => {
    expect(describeSfSource('ffc-2qb:2026', 2026)).toBeNull()
  })
  it('explains a fully estimated source from a previous season', () => {
    expect(describeSfSource('estimated:2025', 2026)).toBe(
      'Superflex QB ADP is estimated from 2025’s superflex drafts, since there are no 2026 ones yet.',
    )
  })
  it('says nothing for no source or an unknown one', () => {
    expect(describeSfSource('none', 2026)).toBeNull()
    expect(describeSfSource(undefined, 2026)).toBeNull()
  })
})
