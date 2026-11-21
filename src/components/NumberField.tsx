import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { clamp } from '../lib/valuation'

interface Props {
  label: string
  value: number
  min: number
  max: number
  onChange: (n: number) => void
  /** Extra content beside the label, such as an info icon. */
  hint?: ReactNode
}

/**
 * A number input that lets you clear and retype the value.
 *
 * While typing, a value is committed only once it falls inside [min, max]. Intermediate
 * text like the "1" on the way to "17" is left alone: committing it would clamp it up to
 * `min`, overwrite what's being typed, and permanently shrink anything already set
 * relative to it. On blur the text is clamped and committed, or reverted if it isn't a number.
 */
export function NumberField({ label, value, min, max, onChange, hint }: Props) {
  const [text, setText] = useState(String(value))
  const focused = useRef(false)

  // Pick up external changes (league import, reset) but never fight the user mid-typing.
  useEffect(() => {
    if (!focused.current) setText(String(value))
  }, [value])

  const id = useId()

  return (
    <div className="flex flex-col gap-[3px] text-xs text-mut">
      {/* `hint` (e.g. an info icon) sits beside the label, outside it, so clicking it never focuses the input. */}
      <div className="flex items-center gap-1.5">
        <label htmlFor={id}>{label}</label>
        {hint}
      </div>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        onFocus={() => (focused.current = true)}
        onChange={(e) => {
          setText(e.target.value)
          const n = parseInt(e.target.value, 10)
          if (n >= min && n <= max) onChange(n)
        }}
        onBlur={() => {
          focused.current = false
          const n = parseInt(text, 10)
          if (Number.isNaN(n)) return setText(String(value))
          const next = clamp(n, min, max)
          if (next !== value) onChange(next)
          setText(String(next))
        }}
      />
    </div>
  )
}
