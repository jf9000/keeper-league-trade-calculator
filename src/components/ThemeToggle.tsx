import { THEMES, type Theme } from '../lib/theme'

const LABEL: Record<Theme, string> = { light: 'Light', dark: 'Dark' }

interface Props {
  theme: Theme
  onChange: (t: Theme) => void
}

/** Light / Dark switch. The right one is pre-selected from the device setting. */
export function ThemeToggle({ theme, onChange }: Props) {
  return (
    <div role="group" aria-label="Color theme" className="flex w-36 shrink-0 overflow-hidden rounded-lg border border-bd">
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={theme === t}
          className={`!flex-1 !rounded-none !border-0 !px-2.5 !py-1 text-[13px] ${theme === t ? 'primary' : '!bg-transparent text-mut'}`}
          onClick={() => onChange(t)}
        >
          {LABEL[t]}
        </button>
      ))}
    </div>
  )
}
