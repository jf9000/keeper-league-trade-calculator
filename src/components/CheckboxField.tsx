interface Props {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

/**
 * A checkbox laid out like the other settings fields: a blank line where their labels sit, then a box the
 * same height as their inputs, so it lines up with them in the settings grid.
 */
export function CheckboxField({ label, checked, onChange }: Props) {
  return (
    <label className="flex flex-col gap-[3px] text-xs text-mut">
      <span aria-hidden="true" className="invisible">
        &nbsp;
      </span>
      <span className="flex items-center gap-2 rounded-lg border border-bd bg-card px-2.5 py-[7px] text-[15px] text-tx">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </span>
    </label>
  )
}
