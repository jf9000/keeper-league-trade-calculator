interface Props {
  /** League name or "Manual mode". */
  name: string
  hasLeague: boolean
  onClick: () => void
}

/** The current league, as a pill that goes back to the league picker. */
export function LeagueButton({ name, hasLeague, onClick }: Props) {
  return (
    <button type="button" onClick={onClick} className="flex max-w-full items-center gap-2 rounded-full px-3.5 py-1.5 text-sm">
      <span className="truncate font-semibold">{name}</span>
      <span className="shrink-0 text-ac">{hasLeague ? 'Change' : 'Select league'}</span>
    </button>
  )
}
