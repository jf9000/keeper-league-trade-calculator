import { pointsPerGame } from '../lib/current'
import { STANCE_SHIFT, itemValue, roundSlot, sumItemValues, type EvalItem, type Stance } from '../lib/valuation'
import type { Asset, Player, Settings } from '../types'
import { gamesNote } from '../lib/availability'
import { InjuryBadge } from './InjuryBadge'
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
  /** Settings as this team sees them (its stance already applied to the win-now slider). */
  settings: Settings
  stance: Stance
  /** Hide the Contending / Rebuilding toggle (for your own team, which just follows the league slider). */
  hideOutlook?: boolean
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
  hideOutlook = false,
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
  const ppg = (p: Player) => pointsPerGame(p, s)
  const handlePick = (h: Hit) =>
    onAdd(
      h.k === 'pick'
        ? { t: 'k', year: h.year, round: h.round }
        : { t: 'p', id: h.player.id, keeperRound: defaultRound(h.player) },
    )

  return (
    <section className="rounded-xl border border-bd bg-card p-4">
      <h2 className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[15px] font-semibold">
        {/* On phones the team picker gets the whole first line, so a long team name isn't squeezed. */}
        <span className="flex min-w-0 basis-full items-center gap-2 min-[480px]:basis-auto">
          <select
            aria-label={`Team ${index + 1}`}
            className="min-w-0 flex-1 font-semibold min-[480px]:max-w-[16rem] min-[480px]:flex-none"
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
        {items.length > 0 && (
          <span className="ml-auto shrink-0 text-base font-semibold text-tx">Value {sumItemValues(items, s).toFixed(1)}</span>
        )}
      </h2>
      {hideOutlook && (
        // An invisible toggle button gives this row exactly the height of the toggle row on the other side.
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-mut">
          <span>Outlook determined by slider value above</span>
          <button type="button" tabIndex={-1} aria-hidden="true" className="invisible !px-0 !py-2 text-sm">
            &nbsp;
          </button>
        </div>
      )}
      {!hideOutlook && (
        <div role="group" aria-label={`Team ${index + 1} outlook`} className="mb-3 flex flex-wrap items-center gap-2 text-sm text-mut">
          <span>Outlook</span>
          {(['contending', 'rebuilding'] as const).map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={stance === o}
              title={
                o === 'contending'
                  ? `Going for this season: pushes this team ${STANCE_SHIFT} points toward winning now`
                  : `Building for next year: pushes this team ${STANCE_SHIFT} points toward the future`
              }
              className={`!px-3 !py-2 text-sm capitalize ${stance === o ? 'primary' : ''}`}
              onClick={() => onStance(stance === o ? null : o)}
            >
              {o}
            </button>
          ))}
        </div>
      )}
      {note && <div className="mb-3 text-sm text-mut">{note}</div>}
      <div className="mb-1">
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
      {items.length === 0 && <div className="py-3 text-[15px] text-mut">Add a player or draft pick above.</div>}
      {items.map((it, k) => {
        const a = it.asset
        const removeLabel = a.t === 'p' && it.player ? `Remove ${it.player.name}` : 'Remove pick'
        // The value and the remove button share the first row, so the button doesn't add a row of its own.
        const valueAndRemove = (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-lg font-bold">{itemValue(it, s).toFixed(1)}</span>
            <button
              type="button"
              aria-label={removeLabel}
              className="!inline-flex !h-10 !w-10 items-center justify-center !p-0 text-mut"
              onClick={() => onRemove(k)}
            >
              ✕
            </button>
          </div>
        )
        return (
          <div
            key={a.t === 'p' ? a.id : `${a.year}-${a.round}-${k}`}
            className="flex flex-col gap-2 border-t border-bd py-3.5"
          >
            {a.t === 'p' && it.player ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5 font-semibold">
                    <span className={`${chip} ${POS_COLOR[it.player.pos]}`}>{POS_LABEL[it.player.pos]}</span>
                    {it.player.name}
                    <span className={`${chip} text-mut`}>{it.player.team}</span>
                    <InjuryBadge player={it.player} />
                  </div>
                  {valueAndRemove}
                </div>
                <div className="text-[15px] text-tx">
                  <span className="text-mut">Redraft</span> <b>{(it.redraft ?? 0).toFixed(1)}</b>
                  <span className="text-mut"> · Keeper </span>
                  <b>{it.value.toFixed(1)}</b>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px] text-mut">
                  <span>
                    {it.player.age != null && `Age ${it.player.age} · `}ADP {adp(it.player).toFixed(1)}
                    {ppg(it.player) !== null && ` · ${ppg(it.player)!.toFixed(1)} ppg this season `}
                    {ppg(it.player) !== null && it.player.curAdp != null && (
                      <span className="whitespace-nowrap">(≈ ADP {it.player.curAdp.toFixed(1)})</span>
                    )}
                  </span>
                  <label className="flex flex-row items-center gap-2 text-[15px]">
                    Keeper rd
                    <select
                      className="!px-2 !py-1.5 text-[15px]"
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
                {gamesNote(it.player, through) && <div className="text-sm text-te">{gamesNote(it.player, through)}: production is discounted</div>}
                {it.note && <div className="text-sm text-bad">{it.note}</div>}
              </>
            ) : a.t === 'k' ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <span className={`${chip} text-mut`}>PICK</span>
                    {a.year} Round {a.round}
                  </div>
                  {valueAndRemove}
                </div>
                <div className="text-[15px] text-mut">
                  ≈ pick {Math.round(roundSlot(a.round, s))}
                  {a.year > years[0]! ? ' · future discount' : ''}
                </div>
              </>
            ) : null}
          </div>
        )
      })}
    </section>
  )
}
