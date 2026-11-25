import type { Player, Pos } from '../types'

export const POS_LIST: readonly Pos[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

/** A starting-lineup slot, as the positions allowed to fill it. */
export type Slot = readonly Pos[]

const FLEX: Slot = ['RB', 'WR', 'TE']
const SUPERFLEX: Slot = ['QB', 'RB', 'WR', 'TE']

const isPos = (p: string): p is Pos => (POS_LIST as readonly string[]).includes(p)
/** Sleeper's flex-type slot names, all of which count toward the flex setting. */
const isFlexName = (p: string) => p === 'FLEX' || p === 'WRRB_FLEX' || p === 'REC_FLEX'

/** How many flex spots (FLEX, WRRB_FLEX, REC_FLEX) a Sleeper `roster_positions` list has. */
export const countFlex = (positions: readonly string[]): number => positions.filter(isFlexName).length

/**
 * The starting slots for a league. Position-specific slots (including K and DEF) come from the
 * league's own `roster_positions` when known, otherwise a typical lineup; the flex and superflex
 * spots follow the settings so editing them takes effect. Bench, IR and taxi spots are ignored.
 */
export function buildSlots(
  positions: readonly string[] | null | undefined,
  s: { flex: number; superflex: boolean },
): Slot[] {
  const known = positions?.length ? positions : null
  const fixed: Slot[] = known
    ? known.filter(isPos).map((p) => [p] as Slot)
    : [['QB'], ['RB'], ['RB'], ['WR'], ['WR'], ['TE']]
  const superflexSpots = known ? Math.max(1, known.filter((p) => p === 'SUPER_FLEX').length) : 1
  return [
    ...fixed,
    ...Array.from({ length: s.flex }, () => FLEX),
    ...(s.superflex ? Array.from({ length: superflexSpots }, () => SUPERFLEX) : []),
  ]
}

export function slotLabel(slot: Slot): string {
  if (slot.length === 1) return slot[0] === 'DEF' ? 'D/ST' : slot[0]!
  return slot.includes('QB') ? 'SUPERFLEX' : 'FLEX'
}

export interface Starter {
  player: Player
  slot: number
  strength: number
}

/**
 * The strongest lineup a roster can field. Position-specific slots fill first, then the flex slots
 * (narrowest first) take the best players left, so a flex spot never steals a dedicated starter.
 */
export function bestLineup(players: readonly Player[], slots: readonly Slot[], strength: (p: Player) => number): Starter[] {
  const order = slots.map((_, i) => i).sort((a, b) => slots[a]!.length - slots[b]!.length)
  const taken = new Set<string>()
  const out: Starter[] = []
  for (const i of order) {
    let best: Player | undefined
    for (const p of players) {
      if (taken.has(p.id) || !slots[i]!.includes(p.pos)) continue
      if (!best || strength(p) > strength(best)) best = p
    }
    if (best) {
      taken.add(best.id)
      out.push({ player: best, slot: i, strength: strength(best) })
    }
  }
  return out
}

export const lineupTotal = (lineup: readonly Starter[]) => lineup.reduce((t, s) => t + s.strength, 0)

/**
 * How many of a superflex league's QB spots (QB and superflex) a roster has no QB for. Anyone else in the
 * superflex scores far less. Always 0 without a superflex spot. Pass only the players who could really start.
 */
export function openQbSpots(players: readonly Player[], slots: readonly Slot[]): number {
  const spots = slots.filter((slot) => slot.includes('QB'))
  if (!spots.some((slot) => slot.length > 1)) return 0
  return Math.max(0, spots.length - players.filter((p) => p.pos === 'QB').length)
}

/** Starter strength summed by position (a flex starter counts toward his own position). */
export function lineupByPos(lineup: readonly Starter[]): Record<Pos, number> {
  const out: Record<Pos, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }
  for (const s of lineup) out[s.player.pos] += s.strength
  return out
}
