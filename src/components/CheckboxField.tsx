interface Props {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  /** Take only the width the label needs, instead of filling its grid cell. */
  fit?: boolean
}

/**
 * A checkbox styled like the other settings inputs: the same 34px height, bottom-aligned in the settings grid
 * so it sits level with the number fields and dropdown beside it.
 */
export function CheckboxField({ label, checked, onChange, fit = false }: Props) {
  return (
    <label
      className={`flex h-[34px] cursor-pointer items-center gap-2 self-end rounded-lg border border-bd bg-card px-2.5 text-[15px] text-tx ${
        fit ? 'w-fit' : ''
      }`}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
