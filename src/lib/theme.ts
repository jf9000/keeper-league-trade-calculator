import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
export const THEMES: readonly Theme[] = ['light', 'dark']

const KEY = 'ktc-theme'

const systemQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)')

/** The device's current preference. */
export const systemTheme = (): Theme => (systemQuery()?.matches ? 'dark' : 'light')

/** The theme the user picked, or null if they never did (then the device's setting decides). */
export function savedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : null
  } catch {
    return null
  }
}

export const loadTheme = (): Theme => savedTheme() ?? systemTheme()

export function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t)
}

/**
 * The active theme and a setter. Until the user picks one it matches the device (and follows it if the
 * device switches); once they pick, that choice is saved and wins.
 */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(loadTheme)
  useEffect(() => applyTheme(theme), [theme])
  useEffect(() => {
    const q = systemQuery()
    if (!q) return
    const on = () => {
      if (!savedTheme()) setTheme(systemTheme())
    }
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  const choose = (t: Theme) => {
    setTheme(t)
    try {
      localStorage.setItem(KEY, t)
    } catch {
      /* ignore */
    }
  }
  return [theme, choose]
}
