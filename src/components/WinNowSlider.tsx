import { useId } from 'react'
import { LIMITS } from '../lib/valuation'
import { WinNowInfo } from './WinNowInfo'

interface Props {
  /** Percent (0–100) of a trade's value that comes from this season. */
  value: number
  onChange: (n: number) => void
}

/** A plain-language read of where the slider sits. */
export function winNowLabel(n: number): string {
  if (n <= 10) return 'Oof'
  if (n <= 35) return 'Hard rebuild'
  if (n < 50) return 'Soft rebuild'
  if (n <= 70) return 'Contending'
  if (n <= 85) return 'Really goin for it'
  return 'Win or die'
}

/** Rebuilding / Contending slider: how much of a trade's value comes from this season vs. future keepers. */
export function WinNowSlider({ value, onChange }: Props) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5 text-[13px] text-mut">
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-[15px] font-semibold text-tx">
          Rebuilding / Contending
        </label>
        <WinNowInfo />
      </div>
      <input
        id={id}
        type="range"
        min={LIMITS.redraftWeight.min}
        max={LIMITS.redraftWeight.max}
        step={5}
        value={value}
        aria-valuetext={`${value}%, ${winNowLabel(value)}`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="flex items-center justify-between gap-3">
        <span>Rebuilding</span>
        <span className="text-center text-[15px] font-semibold text-tx">
          {value}% · {winNowLabel(value)}
        </span>
        <span>Contending</span>
      </div>
    </div>
  )
}
