import { useMemo, useState } from 'react'
import { Collapsible } from '../components/Collapsible'
import { InjuryBadge } from '../components/InjuryBadge'
import { LeagueGate } from '../components/LeagueGate'
import { POS_COLOR, POS_LABEL } from '../components/pos'
import type { LeagueCtx } from '../lib/context'
import { POS_LIST, slotLabel } from '../lib/lineup'
import { rankTeams } from '../lib/rankings'

interface Props {
  ctx: LeagueCtx
  onChangeLeague: () => void
}

const SHOWN = POS_LIST.filter((p) => p !== 'K' && p !== 'DEF')

export function Rankings({ ctx, onChangeLeague }: Props) {
  return (
    <LeagueGate ctx={ctx} what="Power rankings" onChangeLeague={onChangeLeague}>
      <Table ctx={ctx} />
    </LeagueGate>
  )
}

function Table({ ctx }: { ctx: LeagueCtx }) {
  const { teams, mine, byId, s, slots, costs, years } = ctx
  const [open, setOpen] = useState<number | null>(null)
  const ranks = useMemo(() => {
    const rosters = new Map(teams.map((t) => [t.rosterId, ctx.rosterOf(t)] as const))
    return rankTeams(teams, rosters, byId, s, slots, years[0], costs, ctx.picksOf)
  }, [teams, byId, s, slots, costs, years, ctx.owned])
  const best = Math.max(1, ...ranks.map((r) => r.now))
  const bestLater = Math.max(1, ...ranks.map((r) => r.later))

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-mut">
        Teams ranked by the lineup they could start this season and the keepers they could hold for next, blended by
        your win-now slider ({s.redraftWeight}% this season). Position ranks compare starters at each position.
      </p>
      <div className="overflow-x-auto rounded-xl border border-bd bg-card">
        <table className="w-full min-w-[560px] border-collapse text-[15px]">
          <thead>
            <tr className="border-b border-bd text-left text-xs text-mut">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Team</th>
              <th className="px-3 py-2 text-right font-medium">Score</th>
              <th className="px-3 py-2 text-right font-medium">Lineup</th>
              <th className="px-3 py-2 text-right font-medium">Keepers</th>
              {SHOWN.map((p) => (
                <th key={p} className={`px-2 py-2 text-center font-medium ${POS_COLOR[p]}`}>
                  {POS_LABEL[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ranks.map((r) => {
              const isOpen = open === r.team.rosterId
              const isMine = mine?.rosterId === r.team.rosterId
              return (
                <RowGroup key={r.team.rosterId}>
                  <tr
                    className={`cursor-pointer border-b border-bd hover:bg-chip ${isMine ? 'bg-chip' : ''}`}
                    onClick={() => setOpen(isOpen ? null : r.team.rosterId)}
                  >
                    <td className="px-3 py-2.5 font-bold">{r.rank}</td>
                    <td className="max-w-[14rem] px-3 py-2.5">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        className="!w-full !border-0 !bg-transparent !p-0 text-left font-semibold"
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpen(isOpen ? null : r.team.rosterId)
                        }}
                      >
                        <span className="block truncate">
                          {r.team.name}
                          {isMine ? ' (you)' : ''}
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold">{r.score.toFixed(0)}</td>
                    <td className="px-3 py-2.5 text-right text-mut">{((r.now / best) * 100).toFixed(0)}%</td>
                    <td className="px-3 py-2.5 text-right text-mut">{((r.later / bestLater) * 100).toFixed(0)}%</td>
                    {SHOWN.map((p) => (
                      <td key={p} className={`px-2 py-2.5 text-center ${r.posRank[p] <= 3 ? 'font-bold text-good' : r.posRank[p] > (teams.length * 2) / 3 ? 'text-bad' : 'text-mut'}`}>
                        {r.posRank[p]}
                      </td>
                    ))}
                  </tr>
                    <tr>
                      <td colSpan={5 + SHOWN.length} className="p-0">
                        <Collapsible open={isOpen}>
                        <div className="border-b border-bd px-3 py-3">
                        <div className="grid grid-cols-1 gap-4 min-[640px]:grid-cols-2">
                          <div>
                            <div className="mb-1 text-xs text-mut">Best lineup</div>
                            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                              {r.starters.map((st) => (
                                <li key={st.player.id} className="flex items-center gap-2">
                                  <span className="w-[4.5rem] shrink-0 text-xs text-mut">{slotLabel(slots[st.slot]!)}</span>
                                  <span className={`text-[11px] font-bold ${POS_COLOR[st.player.pos]}`}>{POS_LABEL[st.player.pos]}</span>
                                  {st.player.name}
                                  <InjuryBadge player={st.player} />
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <div className="mb-1 text-xs text-mut">Projected keepers</div>
                            {r.keepers.length === 0 ? (
                              <p className="m-0 text-sm text-mut">None worth keeping.</p>
                            ) : (
                              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                                {r.keepers.map((k) => (
                                  <li key={k.player!.id} className="flex items-center gap-2">
                                    <span className={`text-[11px] font-bold ${POS_COLOR[k.player!.pos]}`}>{POS_LABEL[k.player!.pos]}</span>
                                    {k.player!.name}
                                    <InjuryBadge player={k.player!} />
                                    <span className="ml-auto text-mut">Rd {k.round} · +{k.value.toFixed(1)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                        </div>
                        </Collapsible>
                      </td>
                    </tr>
                </RowGroup>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Groups a row with its detail row without adding a wrapper element inside <tbody>. */
const RowGroup = ({ children }: { children: React.ReactNode }) => <>{children}</>
