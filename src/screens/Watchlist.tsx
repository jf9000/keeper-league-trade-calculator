import { useMemo } from 'react'
import { adpLabel } from '../lib/adpLabel'
import { InjuryBadge } from '../components/InjuryBadge'
import { PosTag } from '../components/PosTag'
import { pointsPerGame } from '../lib/current'
import type { LeagueCtx } from '../lib/context'
import { buildTrends, movers, type Trend } from '../lib/history'
import { defaultKeeperRound } from '../lib/valuation'
import { rosterKey, type TradeState } from '../lib/trade'
import { useHistory } from '../lib/useHistory'
import type { Player } from '../types'

interface Props {
  ctx: LeagueCtx
  onOpenTrade: (t: TradeState) => void
}

const chip = 'rounded bg-chip px-1.5 text-[11px] font-bold'

function Sparkline({ values }: { values: number[] }) {
  const pts = values.filter((v) => !Number.isNaN(v))
  if (pts.length < 2) return null
  const lo = Math.min(...pts)
  const hi = Math.max(...pts)
  const span = hi - lo || 1
  const w = 64
  const h = 20
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (pts.length - 1)) * w).toFixed(1)} ${(h - 2 - ((v - lo) / span) * (h - 4)).toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Value over recent weeks" className="shrink-0 text-ac">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Delta({ v }: { v: number }) {
  if (Math.abs(v) < 0.05) return <span className="text-mut">–</span>
  return (
    <span className={v > 0 ? 'font-semibold text-good' : 'font-semibold text-bad'}>
      {v > 0 ? '▲' : '▼'} {Math.abs(v).toFixed(1)}
    </span>
  )
}

export function Watchlist({ ctx, onOpenTrade }: Props) {
  const { s, mine, ownerOf, costs } = ctx
  const { status, history } = useHistory()

  const file = ctx.players.file
  const trends = useMemo(
    () => (file && history && history.snapshots.length > 0 ? buildTrends(file, history, s) : null),
    [file, history, s],
  )
  const hasMovement = !!trends && trends.dates.length > 1

  /** The team a player could be traded from: another roster than yours. Undefined for free agents and in manual mode. */
  const tradePartner = (p: Player) => {
    const owner = ownerOf.get(p.id)
    return owner && mine && owner.rosterId !== mine.rosterId ? { mine, owner } : undefined
  }

  const tradeFor = (p: Player, { mine, owner }: NonNullable<ReturnType<typeof tradePartner>>) =>
    onOpenTrade({
      assets: [[], [{ t: 'p', id: p.id, keeperRound: defaultKeeperRound(p, s, costs) }]],
      choice: [rosterKey(mine.rosterId), rosterKey(owner.rosterId)],
      stance: [null, null],
    })

  const ownerLabel = (p: Player) => {
    if (ctx.teams.length === 0) return null
    const o = ownerOf.get(p.id)
    return o ? (mine && o.rosterId === mine.rosterId ? 'Your roster' : o.name) : 'Free agent'
  }

  const trendLine = (t: Trend | undefined) =>
    t && hasMovement ? (
      <div className="flex items-center gap-3 text-sm">
        <Sparkline values={t.series} />
        <span className="text-mut">
          Week <Delta v={t.week} />
        </span>
        <span className="text-mut">
          Overall <Delta v={t.total} />
        </span>
      </div>
    ) : null

  const playerRow = (p: Player, t: Trend | undefined) => {
    const ppg = pointsPerGame(p, s)
    const owner = ownerLabel(p)
    const partner = tradePartner(p)
    return (
      <li key={p.id} className="flex flex-col gap-1.5 border-t border-bd py-3 first:border-t-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 font-semibold">
            <PosTag pos={p.pos} />
            {p.name}
            <span className={`${chip} text-mut`}>{p.team}</span>
            <InjuryBadge player={p} />
          </div>
          {partner && (
            <button type="button" className="shrink-0 px-3 py-1 text-sm" onClick={() => tradeFor(p, partner)}>
              Trade for
            </button>
          )}
        </div>
        <div className="text-sm text-mut">
          {owner && <>{owner} · </>}
          ADP {adpLabel(s.superflex && p.sfAdp ? p.sfAdp : p.adp)}
          {ppg !== null && ` · ${ppg.toFixed(1)} ppg`}
        </div>
        {trendLine(t)}
      </li>
    )
  }

  const mv = trends && file ? movers(trends, ctx.ranked, 6) : null

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-4" aria-label="Risers and fallers">
        <h2 className="m-0 mb-1 text-[15px] font-semibold">Risers and fallers</h2>
        {status === 'loading' && <p className="m-0 text-mut">Loading…</p>}
        {status === 'ready' && !hasMovement && (
          <p className="m-0 text-sm text-mut">
            Movement shows up once there are at least two weekly data refreshes. The data refreshes every Tuesday, so
            check back soon.
          </p>
        )}
        {mv && hasMovement && (
          <>
            <p className="m-0 mb-2 text-sm text-mut">
              Change in market value (ADP and this season’s production, in your league’s scoring) since the previous
              weekly refresh.
            </p>
            <div className="grid grid-cols-1 gap-x-6 min-[700px]:grid-cols-2">
              {([['Rising', mv.risers], ['Falling', mv.fallers]] as const).map(([title, list]) => (
                <div key={title}>
                  <h3 className="m-0 mt-2 mb-1 text-sm font-semibold text-mut">{title}</h3>
                  {list.length === 0 ? (
                    <p className="m-0 py-2 text-sm text-mut">No big moves.</p>
                  ) : (
                    <ul className="m-0 list-none p-0">{list.map(({ player, trend }) => playerRow(player, trend))}</ul>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
