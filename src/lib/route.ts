import { useEffect, useState } from 'react'

export const TABS = [
  { id: 'calculator', label: 'Trade calculator', short: 'Calculator' },
  { id: 'finder', label: 'Trade finder', short: 'Finder' },
  { id: 'keepers', label: 'Keeper board', short: 'Keepers' },
  { id: 'watchlist', label: 'Watchlist', short: 'Watchlist' },
  { id: 'rankings', label: 'Power rankings', short: 'Rankings' },
] as const

export type Tab = (typeof TABS)[number]['id']

/** The bare site URL (no hash) is the homepage: the Sleeper username screen. */
export type Route = Tab | 'home'

/** True for the bare site URL, with nothing after the "#" but a slash. */
export const isHomeHash = (hash: string): boolean => hash.replace(/^#\/?/, '') === ''

/** The tab a location hash points at ("#/keepers" or "#/calculator?a=…"); the calculator when it's none. */
export function tabFromHash(hash: string): Tab {
  const id = hash.replace(/^#\/?/, '').split('?')[0]
  return TABS.find((t) => t.id === id)?.id ?? 'calculator'
}

/** The query string after "?" in a hash, without the "?". */
export const queryFromHash = (hash: string): string => {
  const i = hash.indexOf('?')
  return i >= 0 ? hash.slice(i + 1) : ''
}

export const hrefFor = (tab: Tab) => `#/${tab}`

const routeFromHash = (hash: string): Route => (isHomeHash(hash) ? 'home' : tabFromHash(hash))

/** The current route, following the hash so the back button and links work. */
export function useRoute(): Route {
  const [tab, setTab] = useState<Route>(() => routeFromHash(window.location.hash))
  useEffect(() => {
    const on = () => setTab(routeFromHash(window.location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return tab
}

export function goTo(tab: Tab) {
  window.location.hash = hrefFor(tab)
}

/** Back to the bare site URL, dropping any hash. */
export function goHome() {
  window.history.pushState(null, '', window.location.pathname + window.location.search)
  window.dispatchEvent(new Event('hashchange'))
}
