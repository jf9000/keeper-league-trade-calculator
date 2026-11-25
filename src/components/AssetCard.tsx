import { useId, useState, type ReactNode } from 'react'
import { adpSlot, ordinal } from '../lib/adpLabel'
import { gamesNote } from '../lib/availability'
import { pointsPerGame } from '../lib/current'
import { itemValue, roundSlot, type EvalItem } from '../lib/valuation'
import { valueNotes } from '../lib/valueNotes'
import type { Player, Settings } from '../types'
import { Chevron, Collapsible } from './Collapsible'
import { InjuryBadge } from './InjuryBadge'
import { PosTag } from './PosTag'

const card = 'flex flex-col gap-3 rounded-2xl border border-bd p-3'

/** The top row every card shares: a tile, a name with a line under it, the value and the remove button. */
function CardHead({
  tile,
  title,
  detail,
  value,
  removeLabel,
  onRemove,
}: {
  tile: ReactNode
  title: string
  detail: ReactNode
  value: number
  removeLabel: string
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2.5">
      {tile}
      <div className="min-w-0 flex-1">
        <div className="text-[15px] leading-snug font-bold break-words">{title}</div>
        <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-mut">{detail}</div>
      </div>
      <span className="shrink-0 text-xl font-extrabold tracking-tight">{value.toFixed(1)}</span>
      <button
        type="button"
        aria-label={removeLabel}
        className="-mr-1.5 inline-flex h-10 w-9 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-mut hover:bg-chip hover:text-tx"
        onClick={onRemove}
      >
        ✕
      </button>
    </div>
  )
}

function Stat({ label, value, title }: { label: string; value: string; title: string }) {
  return (
    // The number reads first on screen, while the label still comes first for screen readers.
    <div title={title} className="flex min-w-0 flex-col-reverse">
      <dt className="text-[11px] text-mut">{label}</dt>
      <dd className="m-0 text-[15px] font-bold">{value}</dd>
    </div>
  )
}

interface PlayerProps {
  item: EvalItem & { player: Player }
  keeperRound: number
  /** Settings as the team sending him sees them. */
  settings: Settings
  adp: number
  /** Weeks of current-season stats in the data, to flag players who have missed games. */
  through?: number
  onRemove: () => void
  onKeeperRound: (round: number) => void
}

/** One player in a trade: who he is, his numbers side by side, and the reasoning behind them on request. */
export function PlayerCard({ item, keeperRound, settings: s, adp, through, onRemove, onKeeperRound }: PlayerProps) {
  const [why, setWhy] = useState(false)
  const whyId = useId()
  const p = item.player
  const notes = valueNotes(item, keeperRound, s)
  const ppg = pointsPerGame(p, s)
  return (
    <article aria-label={p.name} className={card}>
      <CardHead
        tile={<PosTag pos={p.pos} tile />}
        title={p.name}
        detail={
          <>
            <span>
              {p.team}
              {p.age != null && ` · Age ${p.age}`}
            </span>
            <InjuryBadge player={p} />
          </>
        }
        value={itemValue(item, s)}
        removeLabel={`Remove ${p.name}`}
        onRemove={onRemove}
      />
      <dl className="m-0 grid auto-cols-fr grid-flow-col rounded-xl bg-soft py-2 text-center">
        <Stat label="Redraft" value={(item.redraft ?? 0).toFixed(1)} title="Redraft value: what he’s worth this season" />
        {notes?.availability && <Stat label="ROS" value={(item.current ?? 0).toFixed(1)} title="Rest-of-season value, allowing for his injury" />}
        <Stat label="Keeper" value={item.value.toFixed(1)} title="Keeper value: what he’s worth beyond what he costs to keep" />
        <Stat label="PPG" value={ppg === null ? '–' : ppg.toFixed(1)} title="Points per game this season" />
        <Stat label="ADP" value={ordinal(adpSlot(adp, 1).overall)} title="Preseason average draft position, as an overall pick" />
      </dl>
      {gamesNote(p, through) && <div className="text-[13px] text-warn">Production is discounted due to missed games</div>}
      {item.note && item.blocked !== 'no-surplus' && <div className="text-[13px] text-bad">{item.note}</div>}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-mut">
          <label className="flex items-center gap-2">
            Keeper round
            <select className="px-2 py-1 font-semibold" value={keeperRound} onChange={(e) => onKeeperRound(+e.target.value)}>
              {Array.from({ length: s.rounds }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          {notes && (
            <button
              type="button"
              aria-expanded={why}
              aria-controls={whyId}
              onClick={() => setWhy((o) => !o)}
              className="group flex items-center gap-1 border-0 bg-transparent px-1 py-1.5 font-semibold text-ac"
            >
              Why this value?
              <Chevron open={why} />
            </button>
          )}
        </div>
        {notes && (
          <Collapsible open={why} id={whyId}>
            <dl className="m-0 flex flex-col gap-2 pt-2.5 text-sm">
              {[
                ['Redraft', notes.redraft],
                ['Rest of season', notes.availability],
                ['Keeper', notes.keeper],
              ].map(
                ([label, text]) =>
                  text && (
                    <div key={label}>
                      <dt className="font-semibold">{label}</dt>
                      <dd className="m-0 text-mut">{text}.</dd>
                    </div>
                  ),
              )}
            </dl>
          </Collapsible>
        )}
      </div>
    </article>
  )
}

interface PickProps {
  year: number
  round: number
  value: number
  settings: Settings
  /** Whether it's beyond the next draft, and so discounted. */
  future: boolean
  onRemove: () => void
}

/** A draft pick in a trade. */
export function PickCard({ year, round, value, settings: s, future, onRemove }: PickProps) {
  return (
    <article aria-label={`${year} round ${round} pick`} className={card}>
      <CardHead
        tile={
          <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chip text-[13px] font-bold">
            R{round}
          </span>
        }
        title={`${year} Round ${round}`}
        detail={
          <span>
            Draft pick · ≈ pick {Math.round(roundSlot(round, s))}
            {future ? ' · future discount' : ''}
          </span>
        }
        value={value}
        removeLabel="Remove pick"
        onRemove={onRemove}
      />
    </article>
  )
}
