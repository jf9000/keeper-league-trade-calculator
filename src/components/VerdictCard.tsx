import { useEffect, useState } from 'react'
import type { Grade, TeamTrade, Verdict } from '../lib/valuation'

interface Props {
  names: readonly [string, string]
  trades: readonly [TeamTrade, TeamTrade]
  verdict: Verdict
}

const GRADE_COLOR: Record<string, string> = {
  A: 'bg-good-bg text-good',
  B: 'bg-ac-bg text-ac',
  C: 'bg-warn-bg text-warn',
  D: 'bg-bad-bg text-bad',
  F: 'bg-bad-bg text-bad',
}

function GradeTile({ team, grade, small = false }: { team: string; grade: Grade | null; small?: boolean }) {
  return (
    <span
      role={grade ? 'img' : undefined}
      aria-label={grade ? `${team} grade ${grade}` : undefined}
      aria-hidden={grade ? undefined : true}
      className={`inline-flex shrink-0 items-center justify-center font-extrabold ${
        small ? 'h-9 w-11 rounded-lg text-lg' : 'h-11 w-11 rounded-xl text-xl min-[480px]:h-14 min-[480px]:w-14 min-[480px]:rounded-2xl min-[480px]:text-2xl'
      } ${grade ? GRADE_COLOR[grade[0]!] : 'bg-chip text-mut'}`}
    >
      {grade ?? '–'}
    </span>
  )
}

/** The two sides' shares of the value changing hands, with a mark at the even point. */
function Meter({ verdict }: { verdict: Verdict }) {
  return (
    <div className="relative flex h-2.5 gap-[3px]" role="img" aria-label={verdict.message}>
      <i className="block rounded-full bg-ac transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${verdict.share1}%` }} />
      <i className="block flex-1 rounded-full bg-ac2" />
      <i className="absolute -top-1 left-1/2 block h-[18px] w-0.5 -translate-x-1/2 rounded-full bg-tx" />
    </div>
  )
}

function TeamCell({ name, trade, grade, side }: { name: string; trade: TeamTrade; grade: Grade | null; side: 'left' | 'right' }) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-1.5 min-[400px]:items-center min-[400px]:gap-2.5 min-[640px]:row-start-1 ${
        side === 'right'
          ? 'items-end text-right min-[400px]:flex-row-reverse min-[640px]:col-start-3'
          : 'items-start min-[400px]:flex-row min-[640px]:col-start-1'
      }`}
    >
      <GradeTile team={name} grade={grade} />
      <div className="max-w-full min-w-0">
        <div className="line-clamp-2 leading-tight font-bold break-words">{name}</div>
        {/* Stacked while the cell is narrow so the numbers never wrap mid-phrase. */}
        <div className="flex flex-col text-[13px] leading-snug text-mut">
          <span className="whitespace-nowrap">gets {trade.gets.toFixed(1)}</span>
          <span className="whitespace-nowrap">gives {trade.gives.toFixed(1)}</span>
        </div>
      </div>
    </div>
  )
}

/** The result of the trade: each team's grade, the headline and the meter. */
export function VerdictCard({ names, trades, verdict, cardRef }: Props & { cardRef?: (el: HTMLElement | null) => void }) {
  return (
    <section ref={cardRef} aria-label="Verdict" className="card mt-3 flex flex-col gap-4 p-4 min-[640px]:px-5">
      <div className="grid grid-cols-2 items-center gap-x-3 gap-y-3 min-[640px]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="col-span-2 text-center text-xl leading-tight font-extrabold tracking-tight break-words min-[640px]:col-span-1 min-[640px]:col-start-2 min-[640px]:row-start-1">
          {verdict.message}
        </div>
        <TeamCell name={names[0]} trade={trades[0]} grade={verdict.grade1} side="left" />
        <TeamCell name={names[1]} trade={trades[1]} grade={verdict.grade2} side="right" />
      </div>
      <Meter verdict={verdict} />
    </section>
  )
}

/** A ref for an element, and whether that element is currently scrolled out of view. */
export function useScrolledAway(): [(el: HTMLElement | null) => void, boolean] {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [away, setAway] = useState(false)
  useEffect(() => {
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => setAway(!entries[entries.length - 1]!.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])
  return [setEl, away]
}

/**
 * A short copy of the verdict that rides the bottom of the screen while the card itself is scrolled out of view, so the
 * grades stay in sight while players are added. It repeats the card, so screen readers skip it.
 */
export function VerdictStrip({ names, verdict }: Omit<Props, 'trades'>) {
  return (
    <div aria-hidden="true" className="fade-in pointer-events-none sticky bottom-0 z-10 pt-2 pb-[calc(10px+env(safe-area-inset-bottom,0px))]">
      <div className="card flex flex-col gap-3 p-3 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <GradeTile team={names[0]} grade={verdict.grade1} small />
          <span className="min-w-0 text-center text-[15px] leading-tight font-bold break-words">{verdict.message}</span>
          <GradeTile team={names[1]} grade={verdict.grade2} small />
        </div>
        <Meter verdict={verdict} />
      </div>
    </div>
  )
}
