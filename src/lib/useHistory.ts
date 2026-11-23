import { useEffect, useState } from 'react'
import { parseHistory, type HistoryFile } from './history'

/** Loads public/history.json (weekly value snapshots) once, when a screen that needs it mounts. A missing file means no history yet. */
export function useHistory(): { status: 'loading' | 'ready'; history: HistoryFile | null } {
  const [state, setState] = useState<{ status: 'loading' | 'ready'; history: HistoryFile | null }>({ status: 'loading', history: null })
  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`${import.meta.env.BASE_URL}history.json`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: unknown) => setState({ status: 'ready', history: parseHistory(raw) }))
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setState({ status: 'ready', history: null })
      })
    return () => ctrl.abort()
  }, [])
  return state
}
