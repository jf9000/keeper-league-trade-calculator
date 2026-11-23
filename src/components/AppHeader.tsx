import { TABS, hrefFor, type Tab } from '../lib/route'
import type { Theme } from '../lib/theme'
import { FootballLock } from './FootballLock'
import { InfoButton } from './InfoButton'
import { ThemeToggle } from './ThemeToggle'

interface Props {
  tab: Tab
  /** League name or "Manual mode". */
  subtitle: string
  hasLeague: boolean
  onChangeLeague: () => void
  theme: Theme
  onTheme: (t: Theme) => void
}

/** Title, league and theme controls, and the tab bar that splits the app into its sections. */
export function AppHeader({ tab, subtitle, hasLeague, onChangeLeague, theme, onTheme }: Props) {
  return (
    <header className="mb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {/* A plain link to the bare site URL (no hash), so it always loads the homepage fresh. */}
          <a href={import.meta.env.BASE_URL} aria-label="Keeper League Trade Calculator home" className="flex min-w-0 items-center gap-2 text-inherit no-underline">
            <FootballLock className="h-8 w-8 shrink-0 min-[480px]:h-9 min-[480px]:w-9" />
            <h1 className="m-0 text-base leading-tight font-bold min-[480px]:text-xl">Keeper League Trade Calculator</h1>
          </a>
          <InfoButton />
        </div>
        <ThemeToggle theme={theme} onChange={onTheme} />
      </div>
      <p className="m-0 mt-1 text-[15px] text-mut italic">Not redraft. Not dynasty. Keeper.</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[15px] text-mut">{subtitle}</span>
        <button onClick={onChangeLeague} className="!inline-flex w-36 shrink-0 items-center justify-center gap-1.5 text-sm">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          {hasLeague ? 'Change league' : 'Select league'}
        </button>
      </div>
      <nav aria-label="Sections" className="-mx-4 mt-3 overflow-x-auto border-b border-bd px-4">
        <ul className="m-0 flex list-none gap-1 p-0">
          {TABS.map((t) => (
            <li key={t.id}>
              <a
                href={hrefFor(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`block border-b-2 px-3 py-2.5 text-[15px] font-semibold whitespace-nowrap no-underline ${
                  tab === t.id ? 'border-ac text-ac' : 'border-transparent text-mut hover:text-tx'
                }`}
              >
                {t.short}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
