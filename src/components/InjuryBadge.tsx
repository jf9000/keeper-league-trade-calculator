import { INJURY_FACTOR, INJURY_LABEL, INJURY_TAG } from '../lib/availability'
import type { Player } from '../types'

/** A small chip showing a player's injury designation (IR, OUT, D, Q…); nothing for a healthy player. */
export function InjuryBadge({ player }: { player: Pick<Player, 'inj'> }) {
  const inj = player.inj
  if (!inj) return null
  const serious = INJURY_FACTOR[inj] <= 0.7
  return (
    <span
      title={`Listed as ${INJURY_LABEL[inj]}. Updated with the weekly data refresh.`}
      className={`rounded bg-chip px-1.5 text-[11px] font-bold ${serious ? 'text-bad' : 'text-warn'}`}
    >
      {INJURY_TAG[inj]}
    </span>
  )
}
