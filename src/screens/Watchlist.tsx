import { useMemo, useState } from 'react'
import { InjuryBadge } from '../components/InjuryBadge'
import { POS_COLOR, POS_LABEL } from '../components/pos'
import { pointsPerGame } from '../lib/current'
import type { LeagueCtx } from '../lib/context'
import { buildTrends, movers, type Trend } from '../lib/history'
import { loadWatchlist, saveWatchlist } from '../lib/storage'
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
  const { s, byId, mine, ownerOf, costs } = ctx
  const [ids, setIds] = useState<string[]>(loadWatchlist)
  const [q, setQ] = useState('')
  const { status, history } = useHistory()

  const file = ctx.players.file
  const trends = useMemo(
    () => (file && history && history.snapshots.length > 0 ? buildTrends(file, history, s) : null),
    [file, history, s],
  )
  const hasMovement = !!trends && trends.dates.length > 1

  const update = (next: string[]) => {
    setIds(next)
    saveWatchlist(next)
  }
  const toggle = (id: string) => update(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])

  const hits = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return []
    return ctx.ranked.filter((p) => !ids.includes(p.id) && p.name.toLowerCase().includes(query)).slice(0, 8)
  }, [q, ctx.ranked, ids])

  const watched = ids.flatMap((id) => byId.get(id) ?? [])

  const target = (p: Player) => {
    const owner = ownerOf.get(p.id)
    if (!owner || !mine || owner.rosterId === mine.rosterId) return
    onOpenTrade({
      assets: [[], [{ t: 'p', id: p.id, keeperRound: defaultKeeperRound(p, s, costs) }]],
      choice: [rosterKey(mine.rosterId), rosterKey(owner.rosterId)],
      stance: [null, null],
    })
  }

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

  const playerRow = (p: Player, t: Trend | undefined, action: React.ReactNode) => {
    const ppg = pointsPerGame(p, s)
    const owner = ownerLabel(p)
    return (
      <li key={p.id} className="flex flex-col gap-1.5 border-t border-bd py-3 first:border-t-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 font-semibold">
            <span className={`${chip} ${POS_COLOR[p.pos]}`}>{POS_LABEL[p.pos]}</span>
            {p.name}
            <span className={`${chip} text-mut`}>{p.team}</span>
            <InjuryBadge player={p} />
          </div>
          <div className="flex shrink-0 items-center gap-2">{action}</div>
        </div>
        <div className="text-sm text-mut">
          {owner && <>{owner} · </>}
          ADP {(s.superflex && p.sfAdp ? p.sfAdp : p.adp).toFixed(1)}
          {ppg !== null && ` · ${ppg.toFixed(1)} ppg`}
        </div>
        {trendLine(t)}
      </li>
    )
  }

  const star = (p: Player, on: boolean) => (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${p.name} from watchlist` : `Add ${p.name} to watchlist`}
      title={on ? 'Remove from watchlist' : 'Add to watchlist'}
      className="!px-2.5 !py-1 text-base leading-none"
      onClick={() => toggle(p.id)}
    >
      <span className={on ? 'text-ac2' : 'text-mut'}>{on ? '★' : '☆'}</span>
    </button>
  )

  const mv = trends && file ? movers(trends, ctx.ranked, 6) : null

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-bd bg-card p-4" aria-label="Watchlist">
        <h2 className="m-0 mb-1 text-[15px] font-semibold">Your watchlist</h2>
        <p className="m-0 mb-3 text-sm text-mut">
          Star players you’d like to trade for. In a Sleeper league you’ll see who owns them and can start a trade in one tap.
          The list is saved in this browser.
        </p>
        <div className="relative mb-2">
          <input
            type="text"
            className="w-full"
            placeholder="Search players to add…"
            aria-label="Search players to add to the watchlist"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {hits.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-10 mt-0.5 max-h-[300px] list-none overflow-auto rounded-lg border border-bd bg-card p-1 shadow-xl">
              {hits.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="!flex !w-full items-center gap-2 !border-0 !bg-transparent !p-2 text-left hover:!bg-chip"
                    onClick={() => {
                      toggle(p.id)
                      setQ('')
                    }}
                  >
                    <span className={`${chip} ${POS_COLOR[p.pos]}`}>{POS_LABEL[p.pos]}</span>
                    {p.name}
                    <small className="ml-auto text-mut">{p.team}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {watched.length === 0 ? (
          <p className="m-0 py-3 text-mut">No players yet. Search above, or star a player from the movers below.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {watched.map((p) =>
              playerRow(
                p,
                trends?.byId.get(p.id),
                <>
                  {ownerOf.get(p.id) && mine && ownerOf.get(p.id)!.rosterId !== mine.rosterId && (
                    <button type="button" className="!px-3 !py-1 text-sm" onClick={() => target(p)}>
                      Trade for
                    </button>
                  )}
                  {star(p, true)}
                </>,
              ),
            )}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-bd bg-card p-4" aria-label="Risers and fallers">
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
                    <ul className="m-0 list-none p-0">{list.map(({ player, trend }) => playerRow(player, trend, star(player, ids.includes(player.id))))}</ul>
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
