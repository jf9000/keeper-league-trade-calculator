import { pointsPerGame } from '../lib/current'
import { STANCE_SHIFT, itemValue, roundSlot, sumItemValues, type EvalItem, type Stance } from '../lib/valuation'
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
  /** Settings as this team sees them (its stance already applied to the redraft weight). */
  settings: Settings
  stance: Stance
  onStance: (stance: Stance) => void
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
  stance,
  onStance,
  years,
  pickAvailable,
  adp,
  defaultRound,
  onAdd,
  onRemove,
  onKeeperRound,
}: Props) {
  const ppg = (p: Player) => pointsPerGame(p, s)
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
        <span className="shrink-0 text-base font-semibold text-tx">{items.length ? `Value ${sumItemValues(items, s).toFixed(1)}` : ''}</span>
      </h2>
      <div role="group" aria-label={`Team ${index + 1} outlook`} className="mb-2 flex flex-wrap items-center gap-2 text-sm text-mut">
        <span>Outlook</span>
        {(['contending', 'rebuilding'] as const).map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={stance === o}
            title={
              o === 'contending'
                ? `Going for this season: raises the redraft weight by ${STANCE_SHIFT} points for this team`
                : `Building for next year: lowers the redraft weight by ${STANCE_SHIFT} points for this team`
            }
            className={`!px-2.5 !py-1 text-sm capitalize ${stance === o ? 'primary' : ''}`}
            onClick={() => onStance(stance === o ? null : o)}
          >
            {o}
          </button>
        ))}
      </div>
      {note && <div className="mb-2 text-sm text-mut">{note}</div>}
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
      {items.length === 0 && <div className="py-2.5 text-[15px] text-mut">Add a player or draft pick above.</div>}
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
                <div className="col-start-2 row-start-1 text-right text-lg font-bold">{itemValue(it, s).toFixed(1)}</div>
                <div className="col-span-full text-[15px] text-tx">
                  <span className="text-mut">Redraft</span> <b>{(it.redraft ?? 0).toFixed(1)}</b>
                  <span className="text-mut"> · Keeper </span>
                  <b>{it.value.toFixed(1)}</b>
                </div>
                <div className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-mut">
                  <span>
                    ADP {adp(it.player).toFixed(1)}
                    {ppg(it.player) !== null &&
                      ` · ${ppg(it.player)!.toFixed(1)} ppg this season${it.player.curAdp != null ? ` (≈ ADP ${it.player.curAdp.toFixed(1)})` : ''}`}
                  </span>
                  <label className="flex flex-row items-center gap-1 text-[15px]">
                    Keeper rd
                    <select
                      className="!p-1 text-[15px]"
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
                {it.note && <div className="col-span-full text-sm text-bad">{it.note}</div>}
              </>
            ) : a.t === 'k' ? (
              <>
                <div className="flex items-center gap-1.5 font-semibold">
                  <span className={`${chip} text-mut`}>PICK</span>
                  {a.year} Round {a.round}
                </div>
                <div className="col-start-2 row-start-1 text-right text-lg font-bold">{itemValue(it, s).toFixed(1)}</div>
                <div className="text-[15px] text-mut">
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
