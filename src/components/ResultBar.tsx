import type { Grade, TeamTrade, Verdict } from '../lib/valuation'

interface Props {
  names: readonly [string, string]
  trades: readonly [TeamTrade, TeamTrade]
  verdict: Verdict
  /** Caveats for each team's grade, drawn from its own roster. */
  notes: readonly [string[], string[]]
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
        <div className="text-[15px] text-mut">
          gets {trade.gets.toFixed(1)} · gives {trade.gives.toFixed(1)}
        </div>
      </div>
    </div>
  )
}

export function ResultBar({ names, trades, verdict, notes }: Props) {
  const noted = ([0, 1] as const).filter((i) => notes[i].length > 0)
  return (
    <div className="sticky bottom-0 -mx-3.5 border-t border-bd bg-card px-3.5 pt-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))]">
      <div className="flex h-3 overflow-hidden rounded-md bg-chip" role="img" aria-label={verdict.message}>
        <i className="block bg-ac transition-[width] duration-200" style={{ width: `${verdict.share1}%` }} />
        <i className="block bg-ac2 transition-[width] duration-200" style={{ width: `${100 - verdict.share1}%` }} />
      </div>
      <div className="mt-2 mb-1.5 grid grid-cols-2 gap-3">
        <TeamCell name={names[0]} trade={trades[0]} grade={verdict.grade1} align="left" />
        <TeamCell name={names[1]} trade={trades[1]} grade={verdict.grade2} align="right" />
      </div>
      <div className="text-center text-lg font-bold">{verdict.message}</div>
      {noted.length > 0 && (
        <ul className="m-0 mt-2 grid max-h-[26vh] list-none gap-x-4 gap-y-1.5 overflow-y-auto p-0 text-sm text-mut min-[760px]:grid-cols-2">
          {noted.flatMap((i) =>
            notes[i].map((text, k) => (
              <li key={`${i}-${k}`}>
                <b className="text-tx">{names[i]}:</b> {text}
              </li>
            )),
          )}
        </ul>
      )}
    </div>
  )
}
