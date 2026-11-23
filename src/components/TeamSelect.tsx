import type { LeagueTeam } from '../lib/sleeper'

interface Props {
  label: string
  teams: readonly LeagueTeam[]
  value: number | null
  onChange: (rosterId: number | null) => void
  mineId?: number
  /** Adds an "all teams" choice that maps to null. */
  allLabel?: string
}

export function TeamSelect({ label, teams, value, onChange, mineId, allLabel }: Props) {
  return (
    <label className="flex flex-col gap-[3px] text-xs text-mut">
      {label}
      <select
        className="text-[15px] text-tx"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      >
        {allLabel && <option value="">{allLabel}</option>}
        {teams.map((t) => (
          <option key={t.rosterId} value={t.rosterId}>
            {t.name}
            {t.rosterId === mineId ? ' (you)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
