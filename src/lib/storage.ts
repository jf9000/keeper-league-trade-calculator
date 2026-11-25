import type { Settings } from '../types'
import { DEFAULT_SETTINGS } from './valuation'

const SETTINGS_KEY = 'ktc-settings'
const MODE_KEY = 'ktc-mode'
const LEAGUE_KEY = 'ktc-league'

export type Mode = 'sleeper' | 'manual'

// localStorage can be missing or throw (private windows, blocked site data), so every access is guarded.
function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

export const loadSettings = (): Settings => ({
  ...DEFAULT_SETTINGS,
  ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}),
  // The win-now slider is gone; a value saved by an older version is ignored.
  redraftWeight: DEFAULT_SETTINGS.redraftWeight,
})
export const saveSettings = (s: Settings) => write(SETTINGS_KEY, s)
export const loadMode = (): Mode | null => read<Mode>(MODE_KEY)
export const saveMode = (m: Mode) => write(MODE_KEY, m)
/** The Sleeper league the user picked, and who they are in it. Rosters are re-fetched live, never stored. */
export interface SavedLeague {
  leagueId: string
  userId: string
  name: string
}
export const loadLeague = (): SavedLeague | null => {
  const l = read<Partial<SavedLeague>>(LEAGUE_KEY)
  return l && typeof l.leagueId === 'string' && typeof l.userId === 'string'
    ? { leagueId: l.leagueId, userId: l.userId, name: typeof l.name === 'string' ? l.name : '' }
    : null
}
export const saveLeague = (l: SavedLeague) => write(LEAGUE_KEY, l)

export const loadString =(key: string): string => read<string>(key) ?? ''
export const saveString = (key: string, v: string) => write(key, v)

const SETTINGS_OPEN_KEY = 'ktc-settings-open'
/** Whether the league settings are expanded; collapsed to their summary until the user opens them. */
export const loadSettingsOpen = (): boolean => read<boolean>(SETTINGS_OPEN_KEY) === true
export const saveSettingsOpen = (open: boolean) => write(SETTINGS_OPEN_KEY, open)
