import { roundSlot, sumValues, type EvalItem } from '../lib/valuation'
import type { Asset, Player, Settings } from '../types'
import { PlayerSearch, type Hit } from './PlayerSearch'
import { POS_COLOR, POS_LABEL } from './pos'

export interface TeamOption {
  key: string
  label: string
}

interface Props {
  index: 0 | 1
  options: TeamOption[]
  selected: string
  onSelect: (key: string) => void
  /** Shown under the picker, e.g. how many rostered players have no ADP data. */
  note?: string
  items: EvalItem[]
  /** Players this team can send: its roster when one is selected, otherwise everyone. */
  players: readonly Player[]
  used: ReadonlySet<string>
  settings: Settings
  years: readonly number[]
  /** Whether this team still has a pick to send in that year and round; omit to allow any. */
  pickAvailable?: (year: number, round: number) => boolean
  adp: (p: Player) => number
  defaultRound: (p: Player) => number
  onAdd: (a: Asset) => void
  onRemove: (assetIndex: number) => void
  onKeeperRound: (assetIndex: number, round: number) => void
}

const chip = 'rounded bg-chip px-1.5 text-[11px] font-bold'

export function TeamColumn({
  index,
  options,
  selected,
  onSelect,
  note,
  items,
  players,
  used,
  settings: s,
  years,
  pickAvailable,
  adp,
  defaultRound,
  onAdd,
  onRemove,
  onKeeperRound,
}: Props) {
  const handlePick = (h: Hit) =>
    onAdd(
      h.k === 'pick'
        ? { t: 'k', year: h.year, round: h.round }
        : { t: 'p', id: h.player.id, keeperRound: defaultRound(h.player) },
    )

  return (
    <section className="rounded-xl border border-bd bg-card p-3">
      <h2 className="mb-2 flex items-center justify-between gap-2 text-[15px] font-semibold">
        <span className="flex min-w-0 items-center gap-2">
          <select
            aria-label={`Team ${index + 1}`}
            className="min-w-0 max-w-full font-semibold"
            value={selected}
            onChange={(e) => onSelect(e.target.value)}
          >
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="shrink-0">sends</span>
        </span>
        <span className="shrink-0 text-[13px] font-normal text-mut">{items.length ? `Value ${sumValues(items).toFixed(1)}` : ''}</span>
      </h2>
      {note && <div className="mb-2 text-xs text-mut">{note}</div>}
      <div className="mb-2">
        <PlayerSearch
          label={`Search players or draft picks for Team ${index + 1}`}
          players={players}
          used={used}
          settings={s}
          years={years}
          pickAvailable={pickAvailable}
          onPick={handlePick}
        />
      </div>
      {items.length === 0 && <div className="py-2.5 text-[13px] text-mut">Add a player or draft pick above.</div>}
      {items.map((it, k) => {
        const a = it.asset
        const remove = (label: string) => (
          <button
            className="col-start-2 row-start-2 justify-self-end !px-2 !py-0.5 text-mut"
            aria-label={label}
            onClick={() => onRemove(k)}
          >
            ✕
          </button>
        )
        return (
          <div
            key={a.t === 'p' ? a.id : `${a.year}-${a.round}-${k}`}
            className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-0.5 border-t border-bd py-[9px]"
          >
            {a.t === 'p' && it.player ? (
              <>
                <div className="flex flex-wrap items-center gap-1.5 font-semibold">
                  <span className={`${chip} ${POS_COLOR[it.player.pos]}`}>{POS_LABEL[it.player.pos]}</span>
                  {it.player.name}
                  <span className={`${chip} text-mut`}>{it.player.team}</span>
                </div>
                <div className="col-start-2 row-start-1 text-right font-bold">{it.value.toFixed(1)}</div>
                <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-mut">
                  <span>ADP {adp(it.player).toFixed(1)}</span>
                  <label className="flex flex-row items-center gap-1 text-[13px]">
                    Keeper rd
                    <select
                      className="!p-1 text-[13px]"
                      value={a.keeperRound}
                      onChange={(e) => onKeeperRound(k, +e.target.value)}
                    >
                      {Array.from({ length: s.rounds }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {remove(`Remove ${it.player.name}`)}
                {it.note && <div className="col-span-full text-xs text-bad">{it.note}</div>}
              </>
            ) : a.t === 'k' ? (
              <>
                <div className="flex items-center gap-1.5 font-semibold">
                  <span className={`${chip} text-mut`}>PICK</span>
                  {a.year} Round {a.round}
                </div>
                <div className="col-start-2 row-start-1 text-right font-bold">{it.value.toFixed(1)}</div>
                <div className="text-[13px] text-mut">
                  ≈ pick {Math.round(roundSlot(a.round, s))}
                  {a.year > years[0]! ? ' · future discount' : ''}
                </div>
                {remove('Remove pick')}
              </>
            ) : null}
          </div>
        )
      })}
    </section>
  )
}
