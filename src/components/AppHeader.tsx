import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  const listRef = useRef<HTMLUListElement>(null)
  // Position of the sliding underline under the active tab; null until it has been measured.
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null)
  const [animate, setAnimate] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const current = TABS.find((t) => t.id === tab)

  // The side menu: Escape closes it, the page behind it doesn't scroll, and it closes if the screen grows wide enough for the tab bar.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    const wide = window.matchMedia('(min-width: 560px)')
    const onWide = () => wide.matches && setMenuOpen(false)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    window.addEventListener('keydown', onKey)
    wide.addEventListener('change', onWide)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      wide.removeEventListener('change', onWide)
      menuButton.current?.focus({ preventScroll: true })
    }
  }, [menuOpen])

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const measure = () => {
      const el = list.querySelector<HTMLElement>('[aria-current="page"]')
      setBar(el ? { left: el.offsetLeft, width: el.offsetWidth } : null)
    }
    measure()
    // Slide only for changes after the first paint, so the bar doesn't swoop in from the left on load.
    const raf = requestAnimationFrame(() => setAnimate(true))
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
    }
  }, [tab])

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
      <nav aria-label="Sections" className="-mx-4 mt-3 hidden border-b border-bd px-4 min-[560px]:block">
        <ul ref={listRef} className="relative m-0 flex list-none gap-1 p-0">
          {TABS.map((t) => (
            <li key={t.id}>
              <a
                href={hrefFor(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`block px-3 py-2.5 text-[15px] font-semibold whitespace-nowrap no-underline transition-colors duration-200 ${
                  tab === t.id ? 'text-ac' : 'text-mut hover:text-tx'
                }`}
              >
                {t.short}
              </a>
            </li>
          ))}
          {bar && (
            <li
              aria-hidden="true"
              className={`pointer-events-none absolute bottom-0 left-0 h-0.5 bg-ac motion-reduce:transition-none ${
                animate ? 'transition-[transform,width] duration-300 ease-out' : ''
              }`}
              style={{ width: bar.width, transform: `translateX(${bar.left}px)` }}
            />
          )}
        </ul>
      </nav>

      {/* Narrow screens: the tab bar is replaced by a button showing the current section, which opens a side menu. */}
      <div className="-mx-4 mt-3 border-b border-bd px-4 min-[560px]:hidden">
        <button
          ref={menuButton}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
          className="!inline-flex items-center gap-2 !rounded-none !border-0 !border-b-2 !border-ac !bg-transparent !px-3 !py-2.5 !text-[15px] !font-semibold !text-ac"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          {current?.short}
        </button>
      </div>
      <div className="min-[560px]:hidden">
        <div
          aria-hidden="true"
          onClick={() => setMenuOpen(false)}
          className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 motion-reduce:transition-none ${
            menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Sections"
          inert={!menuOpen}
          className={`fixed inset-y-0 left-0 z-50 flex w-[min(280px,80vw)] flex-col border-r border-bd bg-card shadow-xl transition-transform duration-300 ease-out motion-reduce:transition-none ${
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-bd px-4 py-3">
            <span className="flex min-w-0 items-center gap-2">
              <FootballLock className="h-8 w-8 shrink-0" />
              <span className="text-base leading-tight font-bold">Keeper League Trade Calculator</span>
            </span>
            <button
              ref={closeButton}
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="!inline-flex !h-9 !w-9 shrink-0 items-center justify-center !rounded-full !border-0 !bg-chip !p-0 text-mut hover:!bg-ac hover:!text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <ul className="m-0 flex list-none flex-col gap-0.5 overflow-y-auto py-2">
            {TABS.map((t) => (
              <li key={t.id}>
                <a
                  href={hrefFor(t.id)}
                  aria-current={tab === t.id ? 'page' : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={`block border-l-2 px-3 py-2.5 text-[15px] font-semibold no-underline ${
                    tab === t.id ? 'border-ac bg-chip text-ac' : 'border-transparent text-mut hover:bg-chip hover:text-tx'
                  }`}
                >
                  {t.short}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </header>
  )
}
