import { useEffect, useRef, useState } from 'react'
import { InjuryBadge } from '../components/InjuryBadge'
import { LeagueGate } from '../components/LeagueGate'
import { PosTag } from '../components/PosTag'
import { TeamSelect } from '../components/TeamSelect'
import type { LeagueCtx } from '../lib/context'
import { findTrades, type FinderMode, type Offer } from '../lib/finder'
import { rosterKey, type TradeState } from '../lib/trade'
import { type Stance } from '../lib/valuation'
import { StanceSelect } from '../components/StanceSelect'
import type { Asset, Pos } from '../types'

interface Props {
  ctx: LeagueCtx
  onChangeLeague: () => void
  onOpenTrade: (t: TradeState) => void
}

const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`

const POSITIONS: Pos[] = ['QB', 'RB', 'WR', 'TE']

const MODES: { id: FinderMode; label: string; hint: string }[] = [
  { id: 'win-win', label: 'Win-win', hint: 'Both teams come out ahead by a meaningful and similar amount, and grade B or better.' },
  { id: 'best-for-me', label: 'Best for me', hint: 'The most you can get while the other team still gets at least 80% of what it gives up.' },
]

export function Finder({ ctx, onChangeLeague, onOpenTrade }: Props) {
  return (
    <LeagueGate ctx={ctx} what="The trade finder" onChangeLeague={onChangeLeague}>
      <Search ctx={ctx} onOpenTrade={onOpenTrade} />
    </LeagueGate>
  )
}

function Search({ ctx, onOpenTrade }: { ctx: LeagueCtx; onOpenTrade: (t: TradeState) => void }) {
  const { teams, mine, byId, s } = ctx
  const [meId, setMeId] = useState<number | null>(null)
  const [partnerId, setPartnerId] = useState<number | null>(null)
  const [want, setWant] = useState<Pos[]>([])
  const [sell, setSell] = useState<Pos[]>([])
  const [mode, setMode] = useState<FinderMode>('win-win')
  const [stance, setStance] = useState<[Stance, Stance]>([null, null])
  const [offers, setOffers] = useState<Offer[] | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])
  // Results were computed with the settings at the time, so a settings change makes them stale.
  const [cleared, setCleared] = useState(false)
  const offersRef = useRef(offers)
  offersRef.current = offers
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    abort.current?.abort()
    setProgress(null)
    if (offersRef.current) setCleared(true)
    setOffers(null)
  }, [s])

  const me = teams.find((t) => t.rosterId === (meId ?? mine?.rosterId ?? teams[0]?.rosterId))
  if (!me) return <p className="text-mut">This league has no rosters yet.</p>
  const stances = stance
  const busy = progress !== null

  async function run() {
    abort.current?.abort()
    const ctrl = (abort.current = new AbortController())
    setOffers(null)
    setCleared(false)
    setProgress(0)
    const result = await findTrades(
      {
        me: me!,
        partners: teams.filter((t) => (partnerId === null ? true : t.rosterId === partnerId) && t.rosterId !== me!.rosterId),
        rosterOf: ctx.rosterOf,
        picksOf: ctx.picksOf,
        byId,
        s,
        firstPickYear: ctx.years[0],
        costs: ctx.costs,
        slots: ctx.slots,
        want,
        sell,
        mode,
        stances,
      },
      (done, total) => setProgress(total === 0 ? 1 : done / total),
      ctrl.signal,
    )
    if (ctrl.signal.aborted) return
    setOffers(result)
    setProgress(null)
  }

  const label = (a: Asset) => (a.t === 'k' ? `${a.year} round ${a.round} pick` : (byId.get(a.id)?.name ?? 'Unknown'))
  const chips = (list: Asset[]) =>
    list.map((a, i) => {
      const p = a.t === 'p' ? byId.get(a.id) : undefined
      return (
        <li key={i} className="flex items-center gap-1.5">
          {p && <PosTag pos={p.pos} />}
          <span className="font-semibold">{label(a)}</span>
          {p && <InjuryBadge player={p} />}
        </li>
      )
    })

  const open = (o: Offer) =>
    onOpenTrade({
      assets: [o.give, o.get],
      choice: [rosterKey(me.rosterId), rosterKey(o.partner.rosterId)],
      stance: stances,
    })

  const stanceRow = (i: 0 | 1, who: string) => (
    <StanceSelect
      label={<span>{who}</span>}
      ariaLabel={who}
      value={stance[i]}
      onChange={(next) => setStance((c) => (i === 0 ? [next, c[1]] : [c[0], next]))}
    />
  )

  /** A row of position toggles; none picked means any position. */
  const positionRow = (label: string, picked: Pos[], setPicked: (fn: (p: Pos[]) => Pos[]) => void) => (
    <div role="group" aria-label={label} className="mt-3 flex flex-wrap items-center gap-2 text-sm text-mut">
      <span className="w-24 shrink-0">{label}</span>
      {POSITIONS.map((pos) => (
        <button
          key={pos}
          type="button"
          aria-pressed={picked.includes(pos)}
          className={`!px-3 !py-1.5 text-sm ${picked.includes(pos) ? 'primary' : ''}`}
          onClick={() => setPicked((w) => (w.includes(pos) ? w.filter((x) => x !== pos) : [...w, pos]))}
        >
          {pos}
        </button>
      ))}
      <span>{picked.length === 0 ? '(any position)' : ''}</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-4">
        <p className="m-0 mb-3 text-sm text-mut">
          Searches 1-for-1, 2-for-1 and 1-for-2 player swaps between your team and the rest of the league, using the
          same grading as the calculator, and lists the ones that work.
        </p>
        <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2">
          <TeamSelect label="Your team" teams={teams} value={me.rosterId} onChange={(id) => setMeId(id)} mineId={mine?.rosterId} />
          <TeamSelect
            label="Trade with"
            teams={teams.filter((t) => t.rosterId !== me.rosterId)}
            value={partnerId}
            onChange={setPartnerId}
            allLabel="Any team"
          />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 min-[640px]:grid-cols-2">
          {stanceRow(0, 'Your outlook')}
          {stanceRow(1, 'Their outlook')}
        </div>
        {positionRow('I want to sell', sell, setSell)}
        {positionRow('I want a', want, setWant)}
        <div role="group" aria-label="Search for" className="mt-3 flex flex-wrap items-center gap-2 text-sm text-mut">
          <span>Show</span>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.hint}
              aria-pressed={mode === m.id}
              className={`!px-3 !py-1.5 text-sm ${mode === m.id ? 'primary' : ''}`}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-2 mb-0 text-xs text-mut">{MODES.find((m) => m.id === mode)!.hint}</p>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" className="primary" disabled={busy} onClick={run}>
            {busy ? 'Searching…' : 'Find trades'}
          </button>
          {busy && (
            <>
              <progress className="h-2 flex-1" value={progress ?? 0} max={1} aria-label="Search progress" />
              <button type="button" onClick={() => (abort.current?.abort(), setProgress(null))}>
                Stop
              </button>
            </>
          )}
        </div>
      </section>

      {cleared && !offers && (
        <p role="status" className="m-0 text-sm text-mut">
          Your settings changed, so the earlier results were cleared. Search again to see trades under the new settings.
        </p>
      )}
      {offers && offers.length === 0 && (
        <p className="m-0 text-mut">
          No trades found. Try “Best for me”, a different position, or all teams. A deal only works when it helps both rosters.
        </p>
      )}
      {offers && offers.length > 0 && (
        <ol className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Trade ideas">
          {offers.map((o, i) => (
            <li key={i} className="card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-semibold">with {o.partner.name}</span>
                <span className="shrink-0 text-sm text-mut">
                  You {o.gradeMine} · They {o.gradeTheirs}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs text-mut">You send</div>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">{chips(o.give)}</ul>
                </div>
                <div>
                  <div className="mb-1 text-xs text-mut">You get</div>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">{chips(o.get)}</ul>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="flex flex-col text-sm text-mut">
                  <span>
                    You get {o.mine.gets.toFixed(1)} for {o.mine.gives.toFixed(1)} ({signed(o.mine.gets - o.mine.gives)})
                  </span>
                  <span>
                    They get {o.theirs.gets.toFixed(1)} for {o.theirs.gives.toFixed(1)} ({signed(o.theirs.gets - o.theirs.gives)})
                  </span>
                </span>
                <button type="button" onClick={() => open(o)}>
                  Open in calculator
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
