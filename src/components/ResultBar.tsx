import type { Grade, TeamTrade, Verdict } from '../lib/valuation'

interface Props {
  names: readonly [string, string]
  trades: readonly [TeamTrade, TeamTrade]
  verdict: Verdict
}

const GRADE_COLOR: Record<string, string> = {
  A: 'text-good',
  B: 'text-ac',
  C: 'text-te',
  D: 'text-bad',
  F: 'text-bad',
}

function GradeBadge({ team, grade }: { team: string; grade: Grade | null }) {
  if (!grade) return null
  return (
    <span
      aria-label={`${team} grade ${grade}`}
      className={`inline-flex min-w-[2.6rem] justify-center rounded-lg bg-chip px-2 py-0.5 text-lg font-extrabold ${GRADE_COLOR[grade[0]!]}`}
    >
      {grade}
    </span>
  )
}

function TeamCell({ name, trade, grade, align }: { name: string; trade: TeamTrade; grade: Grade | null; align: 'left' | 'right' }) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <GradeBadge team={name} grade={grade} />
      <div className="min-w-0">
        <div className="truncate text-base font-semibold text-tx">{name}</div>
        {/* Stacked on phones so the numbers never wrap mid-phrase; side by side once there's room. */}
        <div className="flex flex-col text-[15px] leading-snug text-mut min-[480px]:flex-row min-[480px]:gap-1.5">
          <span className="whitespace-nowrap">gets {trade.gets.toFixed(1)}</span>
          <span aria-hidden="true" className="hidden min-[480px]:inline">
            ·
          </span>
          <span className="whitespace-nowrap">gives {trade.gives.toFixed(1)}</span>
        </div>
      </div>
    </div>
  )
}

export function ResultBar({ names, trades, verdict }: Props) {
  return (
    <div className="sticky bottom-0 w-full rounded-t-xl border border-b-0 border-bd bg-card px-4 pt-3.5 pb-[calc(14px+env(safe-area-inset-bottom,0px))]">
      <div className="flex h-3 overflow-hidden rounded-md bg-chip" role="img" aria-label={verdict.message}>
        <i className="block bg-ac transition-[width] duration-200" style={{ width: `${verdict.share1}%` }} />
        <i className="block bg-ac2 transition-[width] duration-200" style={{ width: `${100 - verdict.share1}%` }} />
      </div>
      <div className="mt-3 mb-2 grid grid-cols-2 gap-3">
        <TeamCell name={names[0]} trade={trades[0]} grade={verdict.grade1} align="left" />
        <TeamCell name={names[1]} trade={trades[1]} grade={verdict.grade2} align="right" />
      </div>
      <div className="text-center text-lg font-bold">{verdict.message}</div>
    </div>
  )
}
