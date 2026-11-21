import { useEffect, useMemo, useState } from 'react'
import type { Player, PlayersFile } from '../types'

export interface PlayersState {
  status: 'loading' | 'ready' | 'error'
  file: PlayersFile | null
  byId: ReadonlyMap<string, Player>
}

/** Loads the generated players.json (see scripts/build-players.ts). */
export function usePlayers(): PlayersState {
  const [file, setFile] = useState<PlayersFile | null>(null)
  const [status, setStatus] = useState<PlayersState['status']>('loading')

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`${import.meta.env.BASE_URL}players.json`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<PlayersFile>
      })
      .then((f) => {
        setFile(f)
        setStatus('ready')
      })
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setStatus('error')
      })
    return () => ctrl.abort()
  }, [])

  const byId = useMemo(() => new Map((file?.players ?? []).map((p) => [p.id, p])), [file])
  return { status, file, byId }
}
