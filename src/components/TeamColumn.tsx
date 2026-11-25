import { HintTip } from './HintTip'
import { itemValue, sumItemValues, type EvalItem, type Stance } from '../lib/valuation'
import type { Asset, Player, Settings } from '../types'
import { PickCard, PlayerCard } from './AssetCard'
import { StanceSelect } from './StanceSelect'
import { PlayerSearch, type Hit } from './PlayerSearch'

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
  /** Settings as this team sees them (its stance already applied to its win-now share). */
  settings: Settings
  stance: Stance
  onStance: (stance: Stance) => void
  years: readonly number[]
  /** Weeks of current-season stats in the data, to flag players who have missed games. */
  through?: number
  /** Whether this team still has a pick to send in that year and round; omit to allow any. */
  pickAvailable?: (year: number, round: number) => boolean
  adp: (p: Player) => number
  defaultRound: (p: Player) => number
  onAdd: (a: Asset) => void
  onRemove: (assetIndex: number) => void
  onKeeperRound: (assetIndex: number, round: number) => void
}

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
  through,
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
    // The top edge matches this team's side of the trade meter.
    <section className={`card flex min-w-0 flex-col gap-3 border-t-4 p-3.5 min-[480px]:p-4 ${index === 0 ? 'border-t-ac' : 'border-t-ac2'}`}>
      <div className="flex items-end justify-between gap-3">
        <h2 className="m-0 flex min-w-0 flex-1 flex-col items-start gap-1 text-xs font-medium text-mut">
          <span>Sends</span>
          <select
            aria-label={`Team ${index + 1}`}
            className="w-full max-w-[17rem] text-[16px] font-bold"
            value={selected}
            onChange={(e) => onSelect(e.target.value)}
          >
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </h2>
        <div className="shrink-0 text-right">
          <div className={`text-3xl leading-none font-extrabold tracking-tight ${items.length ? 'text-tx' : 'text-mut'}`}>
            {sumItemValues(items, s).toFixed(1)}
          </div>
          <div className="mt-1 text-xs text-mut">Value</div>
        </div>
      </div>
      <StanceSelect
        label={
          <span className="flex items-center gap-1.5">
            Outlook
            <HintTip label="About outlook" text="Keeper value matters less as you become more aggressive" />
          </span>
        }
        value={stance}
        onChange={onStance}
        ariaLabel={`Team ${index + 1} outlook`}
      />
      {note && <div className="text-sm text-mut">{note}</div>}
      <PlayerSearch
        label={`Search players or draft picks for Team ${index + 1}`}
        players={players}
        used={used}
        settings={s}
        years={years}
        pickAvailable={pickAvailable}
        onPick={handlePick}
      />
      {items.length === 0 && <div className="py-2 text-center text-sm text-mut">Add a player or draft pick above.</div>}
      {items.map((it, k) => {
        const a = it.asset
        if (a.t === 'p') {
          return it.player ? (
            <PlayerCard
              key={a.id}
              item={{ ...it, player: it.player }}
              keeperRound={a.keeperRound}
              settings={s}
              adp={adp(it.player)}
              through={through}
              onRemove={() => onRemove(k)}
              onKeeperRound={(round) => onKeeperRound(k, round)}
            />
          ) : null
        }
        return (
          <PickCard
            key={`${a.year}-${a.round}-${k}`}
            year={a.year}
            round={a.round}
            value={itemValue(it, s)}
            settings={s}
            future={a.year > years[0]!}
            onRemove={() => onRemove(k)}
          />
        )
      })}
    </section>
  )
}
