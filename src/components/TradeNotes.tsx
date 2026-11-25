interface Props {
  names: readonly [string, string]
  /** Caveats for each team's grade, drawn from its own roster. */
  notes: readonly [string[], string[]]
}

/** What the trade means for each team's roster, with each team named once. Renders nothing when there's nothing to say. */
export function TradeNotes({ names, notes }: Props) {
  const noted = ([0, 1] as const).filter((i) => notes[i].length > 0)
  if (noted.length === 0) return null
  return (
    <section aria-label="Notes on the grade" className="card mb-4 p-4">
      <h2 className="m-0 mb-3 text-[15px] font-bold">Notes on the grade</h2>
      <div className="grid gap-x-6 gap-y-4 min-[760px]:grid-cols-2">
        {noted.map((i) => (
          <div key={i}>
            <div className="mb-1.5 flex items-center gap-2 text-[15px] font-semibold">
              <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${i === 0 ? 'bg-ac' : 'bg-ac2'}`} />
              <span className="min-w-0 break-words">{names[i]}</span>
            </div>
            <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-sm leading-snug text-mut">
              {notes[i].map((text, k) => (
                <li key={k}>{text}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
