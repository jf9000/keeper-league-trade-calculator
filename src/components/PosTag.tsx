import type { Pos } from '../types'
import { POS_LABEL, POS_TINT } from './pos'

/** A player's position on its color. `tile` is the large square that leads a player card. */
export function PosTag({ pos, tile = false }: { pos: Pos; tile?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-bold ${POS_TINT[pos]} ${
        tile ? 'h-10 w-10 rounded-xl text-[13px]' : 'rounded-md px-1.5 text-[11px]'
      }`}
    >
      {POS_LABEL[pos]}
    </span>
  )
}
