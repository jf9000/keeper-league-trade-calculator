import { useMemo, useState } from 'react'
import { adpLabel } from '../lib/adpLabel'
import { InjuryBadge } from '../components/InjuryBadge'
import { LeagueGate } from '../components/LeagueGate'
import { PosTag } from '../components/PosTag'
import { TeamSelect } from '../components/TeamSelect'
import { gamesNote } from '../lib/availability'
import { pointsPerGame } from '../lib/current'
import type { LeagueCtx } from '../lib/context'
import { keptItems, rosterAssets } from '../lib/rankings'
import { adpOf, evalSide, sumValues, type EvalItem } from '../lib/valuation'

interface Props {
  ctx: LeagueCtx
  onChangeLeague: () => void
}

const chip = 'rounded bg-chip px-1.5 text-[11px] font-bold'

export function Keepers({ ctx, onChangeLeague }: Props) {
  return (
    <LeagueGate ctx={ctx} what="The keeper board" onChangeLeague={onChangeLeague}>
      <Board ctx={ctx} />
    </LeagueGate>
  )
}

function Board({ ctx }: { ctx: LeagueCtx }) {
  const { s, teams, mine, byId, costs, years } = ctx
  const [pick, setPick] = useState<number | null>(null)
  const team = teams.find((t) => t.rosterId === (pick ?? mine?.rosterId ?? teams[0]?.rosterId))
  // Keeper rounds changed by hand, per team, so switching teams doesn't mix them up.
  const [overrides, setOverrides] = useState<Record<number, Record<string, number>>>({})
  const teamOverrides = team ? overrides[team.rosterId] : undefined
  const overrideMap = useMemo(() => new Map(Object.entries(teamOverrides ?? {})), [teamOverrides])

  const roster = useMemo(() => ctx.rosterOf(team), [team, byId])
  const picks = ctx.picksOf(team)
  const items = useMemo(
    () => evalSide(rosterAssets(roster, s, costs, overrideMap), byId, s, years[0], picks),
    [roster, s, costs, overrideMap, byId, years, picks],
  )
  if (!team) return <p className="text-mut">This league has no rosters yet.</p>

  const kept = keptItems(items)
  const keptSet = new Set(kept)
  const rest = items.filter((i) => i.player && !keptSet.has(i)).sort((a, b) => (b.surplus ?? 0) - (a.surplus ?? 0))
  const total = sumValues(kept)
  const missing = team.playerIds.length - roster.length

  const setRound = (id: string, round: number) =>
    setOverrides((o) => ({ ...o, [team.rosterId]: { ...(o[team.rosterId] ?? {}), [id]: round } }))
  const edited = Object.keys(teamOverrides ?? {}).length > 0

  const row = (it: EvalItem, isKept: boolean) => {
    const p = it.player!
    const a = it.asset
    const ppg = pointsPerGame(p, s)
    return (
      <li key={p.id} className="flex flex-col gap-1.5 border-t border-bd py-3 first:border-t-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 font-semibold">
            <PosTag pos={p.pos} />
            {p.name}
            <span className={`${chip} text-mut`}>{p.team}</span>
            <InjuryBadge player={p} />
          </div>
          <span className={`shrink-0 text-lg font-bold ${isKept ? 'text-good' : 'text-mut'}`}>
            {isKept ? `+${it.value.toFixed(1)}` : (it.surplus ?? 0) > 0 ? `(${(it.surplus ?? 0).toFixed(1)})` : '0'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[15px] text-mut">
          <span>
            {p.age != null && `Age ${p.age} · `}ADP {adpLabel(adpOf(p, s))}
            {ppg !== null && ` · ${ppg.toFixed(1)} ppg`}
            {gamesNote(p, ctx.statsThrough) && ` · ${gamesNote(p, ctx.statsThrough)}`}
          </span>
          <label className="flex items-center gap-2">
            Keeper rd
            <select
              className="!px-2 !py-1 text-[15px]"
              value={a.t === 'p' ? a.keeperRound : 1}
              onChange={(e) => setRound(p.id, +e.target.value)}
            >
              {Array.from({ length: s.rounds }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          {!isKept && it.note && <span className="text-bad">{it.note}</span>}
        </div>
      </li>
    )
  }

  // Rounds where the team has no pick (traded away), since a keeper costing that round can't be used.
  const noPickRounds = picks ? Array.from({ length: s.rounds }, (_, i) => i + 1).filter((r) => (picks.get(r) ?? 0) === 0) : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-[20rem]">
          <TeamSelect label="Team" teams={teams} value={team.rosterId} onChange={(id) => setPick(id)} mineId={mine?.rosterId} />
        </div>
        {edited && (
          <button type="button" onClick={() => setOverrides((o) => ({ ...o, [team.rosterId]: {} }))}>
            Reset keeper rounds
          </button>
        )}
      </div>

      <section className="card p-4" aria-label="Recommended keepers">
        <h2 className="m-0 mb-1 text-[15px] font-semibold">
          Recommended keepers ({kept.length} of {s.keepers})
        </h2>
        <p className="m-0 mb-2 text-sm text-mut">
          The best set within your keeper limit{s.oneQb ? ', one QB' : ''}
          {picks ? ' and the picks this team owns' : ''}. Total keeper value {total.toFixed(1)}.
        </p>
        {kept.length === 0 ? (
          <p className="m-0 py-2 text-mut">No player on this roster is worth keeping at his cost.</p>
        ) : (
          <ul className="m-0 list-none p-0">{kept.map((i) => row(i, true))}</ul>
        )}
        {noPickRounds.length > 0 && noPickRounds.length < s.rounds && (
          <p className="mt-2 mb-0 text-sm text-mut">
            No pick in round{noPickRounds.length === 1 ? '' : 's'} {noPickRounds.join(', ')}, so a keeper who costs
            {noPickRounds.length === 1 ? ' that round' : ' one of those rounds'} can’t be used.
          </p>
        )}
        {missing > 0 && <p className="mt-2 mb-0 text-sm text-mut">{missing} rostered players have no ADP data and aren’t valued.</p>}
      </section>

      <section className="card p-4" aria-label="Not kept">
        <h2 className="m-0 mb-1 text-[15px] font-semibold">Not kept</h2>
        <p className="m-0 mb-2 text-sm text-mut">
          The number in brackets is the surplus a player would add if he could be kept. Change a keeper round to see how
          a different cost changes the picks.
        </p>
        <ul className="m-0 list-none p-0">{rest.map((i) => row(i, false))}</ul>
        {rest.length === 0 && <p className="m-0 py-2 text-mut">Everyone on the roster is a keeper.</p>}
      </section>
    </div>
  )
}
