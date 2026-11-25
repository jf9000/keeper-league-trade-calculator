import { useId, type ReactNode } from 'react'
import { STANCE_OPTIONS, type Stance } from '../lib/valuation'

interface Props {
  value: Stance
  onChange: (stance: Stance) => void
  /** Accessible name, e.g. "Team 1 outlook". */
  ariaLabel: string
  /** Shown above the scale, beside the chosen outlook's name. */
  label: ReactNode
}

/** An outlook's value as a form field. Balanced, which has no stance, is "balanced". */
export const stanceValue = (stance: Stance): string => stance ?? 'balanced'

/** The outlook for a field value; anything unrecognised is balanced. */
export const stanceFromValue = (value: string): Stance => STANCE_OPTIONS.find((o) => stanceValue(o.stance) === value)?.stance ?? null

/**
 * Picks a team's outlook on a five-stop scale, from selling everything to all in. Balanced is the middle stop and
 * starts selected; only the chosen stop is highlighted. Each stop is a radio button, so a tap picks it and the
 * arrow keys move along the scale. Only the chosen name and the two ends are written out, so it fits a phone.
 */
export function StanceSelect({ value, onChange, ariaLabel, label }: Props) {
  const name = useId()
  const chosen = STANCE_OPTIONS.findIndex((o) => o.stance === value)

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-3 text-sm text-mut">
        {label}
        <span aria-hidden="true" className="font-bold text-tx">
          {STANCE_OPTIONS[chosen]?.label}
        </span>
      </div>
      <div role="radiogroup" aria-label={ariaLabel} className="flex">
        {STANCE_OPTIONS.map((o, i) => (
          <label key={o.label} title={o.label} className="group relative flex h-10 flex-1 cursor-pointer items-center justify-center">
            {/* The track between stops, drawn as two halves, one in each stop. */}
            {i > 0 && <span aria-hidden="true" className="absolute left-0 h-1 w-1/2 bg-bd" />}
            {i < STANCE_OPTIONS.length - 1 && <span aria-hidden="true" className="absolute right-0 h-1 w-1/2 bg-bd" />}
            <input
              type="radio"
              name={name}
              value={stanceValue(o.stance)}
              checked={i === chosen}
              onChange={(e) => onChange(stanceFromValue(e.target.value))}
              aria-label={o.label}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={`relative rounded-full transition-all duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ac motion-reduce:transition-none ${
                i === chosen
                  ? 'h-5 w-5 border-[5px] border-ac bg-card shadow-sm'
                  : 'h-3 w-3 border-2 border-node-bd bg-node group-hover:scale-125 group-hover:border-ac'
              }`}
            />
          </label>
        ))}
      </div>
      <div aria-hidden="true" className="flex justify-between gap-3 text-xs text-mut">
        <span>Sell</span>
        <span>Win-now</span>
      </div>
    </div>
  )
}
