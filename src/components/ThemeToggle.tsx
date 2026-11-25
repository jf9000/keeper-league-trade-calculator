import type { Theme } from '../lib/theme'

interface Props {
  theme: Theme
  onChange: (t: Theme) => void
}

/** An icon button that switches between light and dark. The theme starts from the device setting. */
export function ThemeToggle({ theme, onChange }: Props) {
  const next: Theme = theme === 'light' ? 'dark' : 'light'
  const label = `Switch to ${next} theme`
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center p-0"
      onClick={() => onChange(next)}
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {next === 'dark' ? (
          <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        )}
      </svg>
    </button>
  )
}
