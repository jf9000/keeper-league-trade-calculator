import type { Asset } from '../types'
import type { Stance } from './valuation'

/** The trade being built in the calculator. Lives in App so other tabs can open a trade there. */
export interface TradeState {
  assets: [Asset[], Asset[]]
  /** Picked roster per side: "r<rosterId>", "generic", or null for the default. */
  choice: [string | null, string | null]
  stance: [Stance, Stance]
}

export const EMPTY_TRADE: TradeState = { assets: [[], []], choice: [null, null], stance: [null, null] }

export const GENERIC = 'generic'
export const rosterKey = (rosterId: number) => `r${rosterId}`
