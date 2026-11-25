import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TABS, hrefFor, type Tab } from '../lib/route'
import type { Theme } from '../lib/theme'
import { FootballLock } from './FootballLock'
import { InfoButton } from './InfoButton'
import { ThemeToggle } from './ThemeToggle'

interface Props {
  tab: Tab
  theme: Theme
  onTheme: (t: Theme) => void
}

/** The bar across the top: title, the tabs that split the app into its sections, and the theme switch. */
export function AppHeader({ tab, theme, onTheme }: Props) {
  const listRef = useRef<HTMLUListElement>(null)
  // Position of the sliding highlight behind the active tab; null until it has been measured.
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
      // The list item is what's positioned against the list, so measure it rather than the link inside.
      const el = list.querySelector<HTMLElement>('[aria-current="page"]')?.parentElement
      setBar(el ? { left: el.offsetLeft, width: el.offsetWidth } : null)
    }
    measure()
    // Slide only for changes after the first paint, so the highlight doesn't swoop in from the left on load.
    const raf = requestAnimationFrame(() => setAnimate(true))
    // The tabs change size when the bar appears on a wider window, and when the web font arrives.
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    list.querySelectorAll('a').forEach((a) => observer.observe(a))
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [tab])

  return (
    <header className="mb-4 border-b border-bd bg-card">
      <div className="mx-auto flex max-w-[980px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* A plain link to the bare site URL (no hash), so it always loads the homepage fresh. */}
          <a href={import.meta.env.BASE_URL} aria-label="Keeper League Trade Calculator home" className="flex min-w-0 items-center gap-2.5 text-inherit no-underline">
            <FootballLock className="h-9 w-9 shrink-0" />
            <div className="min-w-0">
              <h1 className="m-0 text-base leading-tight font-extrabold tracking-tight">Keeper League Trade Calculator</h1>
              <p className="m-0 text-xs text-mut">Not redraft. Not dynasty. Keeper.</p>
            </div>
          </a>
          <InfoButton />
        </div>
        {/* On a wide screen the tabs sit between the title and the theme switch; narrower, they get their own line. */}
        <div className="flex shrink-0 min-[900px]:order-last">
          <ThemeToggle theme={theme} onChange={onTheme} />
        </div>
        <nav aria-label="Sections" className="hidden basis-full min-[560px]:block min-[900px]:basis-auto">
          <ul ref={listRef} className="relative m-0 flex w-fit list-none gap-0.5 rounded-xl bg-chip p-1">
            {bar && (
              <li
                aria-hidden="true"
                className={`pointer-events-none absolute top-1 bottom-1 left-0 rounded-lg bg-raised shadow-sm motion-reduce:transition-none ${
                  animate ? 'transition-[transform,width] duration-300 ease-out' : ''
                }`}
                style={{ width: bar.width, transform: `translateX(${bar.left}px)` }}
              />
            )}
            {TABS.map((t) => (
              <li key={t.id}>
                <a
                  href={hrefFor(t.id)}
                  aria-current={tab === t.id ? 'page' : undefined}
                  className={`relative block rounded-lg px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap no-underline transition-colors duration-200 ${
                    tab === t.id ? 'text-ac' : 'text-mut hover:text-tx'
                  }`}
                >
                  {t.short}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Narrow screens: the tab bar is replaced by a button showing the current section, which opens a side menu. */}
        <div className="basis-full min-[560px]:hidden">
          <button
            ref={menuButton}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="inline-flex items-center gap-2 border-0 bg-chip px-3 py-2 text-sm font-semibold text-ac"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            {current?.short}
          </button>
        </div>
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
              className="!inline-flex !h-9 !w-9 shrink-0 items-center justify-center !rounded-full !border-0 !bg-chip !p-0 text-mut hover:!bg-ac-fill hover:!text-white"
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
