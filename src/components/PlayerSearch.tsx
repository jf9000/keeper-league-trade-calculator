import { useMemo, useState } from 'react'
import { adpOf, roundSlot } from '../lib/valuation'
import type { Player, Settings } from '../types'
import { POS_COLOR, POS_LABEL } from './pos'

/** Extra words that find a position, so "kicker" or "defense" works as well as "K" or "DEF". */
const POS_ALIASES: Record<Player['pos'], string> = { QB: '', RB: '', WR: '', TE: '', K: 'kicker', DEF: 'd/st dst defense' }

export type Hit = { k: 'pick'; year: number; round: number } | { k: 'player'; player: Player }

interface Props {
  label: string
  players: readonly Player[]
  /** Player IDs already in the trade (either side); hidden from results. */
  used: ReadonlySet<string>
  settings: Settings
  years: readonly number[]
  /** Hides picks this team doesn't own (or has already added); omit to offer every pick. */
  pickAvailable?: (year: number, round: number) => boolean
  onPick: (hit: Hit) => void
}

/** Search box for players, or draft picks when the query starts with a digit (e.g. "2027 3"). */
export function PlayerSearch({ label, players, used, settings: s, years, pickAvailable, onPick }: Props) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [cur, setCur] = useState(0)

  const hits = useMemo<Hit[]>(() => {
    const query = q.trim().toLowerCase()
    if (!query) return []
    const toks = query.split(/\s+/)
    if (/^\d/.test(query)) {
      const out: { year: number; round: number }[] = []
      for (const year of years)
        for (let round = 1; round <= s.rounds; round++) {
          if (pickAvailable && !pickAvailable(year, round)) continue
          const ys = String(year)
          const rs = String(round)
          if (toks.every((t) => ys.startsWith(t) || (/^\d{1,2}$/.test(t) && rs.startsWith(t)) || 'round'.startsWith(t)))
            out.push({ year, round })
        }
      const exact = (h: { round: number }) => (toks.some((t) => String(h.round) === t) ? 0 : 1)
      return out
        .sort((a, b) => exact(a) - exact(b) || a.year - b.year || a.round - b.round)
        .slice(0, 24)
        .map((h) => ({ k: 'pick', ...h }))
    }
    const starts = (p: Player) => (p.name.toLowerCase().startsWith(query) ? 0 : 1)
    return players
      .filter((p) => !used.has(p.id) && toks.every((t) => `${p.name} ${p.pos} ${p.team} ${POS_ALIASES[p.pos]}`.toLowerCase().includes(t)))
      .sort((a, b) => starts(a) - starts(b) || adpOf(a, s) - adpOf(b, s))
      .slice(0, 8)
      .map((player) => ({ k: 'player', player }))
  }, [q, players, used, s, years, pickAvailable])

  const choose = (h: Hit | undefined) => {
    if (!h) return
    onPick(h)
    setQ('')
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        type="text"
        className="w-full"
        placeholder="Search players, or type a year for picks…"
        autoComplete="off"
        aria-label={label}
        role="combobox"
        aria-expanded={open && q.trim() !== ''}
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setCur(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            setCur((c) => Math.min(hits.length - 1, c + 1))
            e.preventDefault()
          } else if (e.key === 'ArrowUp') {
            setCur((c) => Math.max(0, c - 1))
            e.preventDefault()
          } else if (e.key === 'Enter') {
            choose(hits[cur])
            e.preventDefault()
          } else if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && q.trim() !== '' && (
        <ul
          role="listbox"
          className="absolute inset-x-0 top-full z-10 mt-0.5 max-h-[300px] list-none overflow-auto rounded-lg border border-bd bg-card p-1 shadow-xl"
        >
          {hits.length === 0 && <li className="p-2 text-mut">No matches</li>}
          {hits.map((h, i) => (
            <li
              key={h.k === 'pick' ? `${h.year}-${h.round}` : h.player.id}
              role="option"
              aria-selected={i === cur}
              className={`flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-chip ${i === cur ? 'bg-chip' : ''}`}
              // mousedown (not click) so the input's blur doesn't close the list first
              onMouseDown={(e) => {
                e.preventDefault()
                choose(h)
              }}
            >
              {h.k === 'pick' ? (
                <>
                  <span className="rounded bg-chip px-1.5 text-[11px] font-bold text-mut">PICK</span>
                  {h.year} Round {h.round}
                  <small className="ml-auto text-mut">
                    ≈ pick {Math.round(roundSlot(h.round, s))}
                    {h.year > years[0]! ? ' · future discount' : ''}
                  </small>
                </>
              ) : (
                <>
                  <span className={`rounded bg-chip px-1.5 text-[11px] font-bold ${POS_COLOR[h.player.pos]}`}>{POS_LABEL[h.player.pos]}</span>
                  {h.player.name}
                  <small className="ml-auto text-mut">
                    {h.player.team} · ADP {adpOf(h.player, s).toFixed(1)}
                  </small>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
