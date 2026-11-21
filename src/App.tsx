import { useState } from 'react'
import { usePlayers } from './lib/players'
import {
  loadLeague,
  loadMode,
  loadSettings,
  saveLeague,
  saveMode,
  saveSettings,
  type Mode,
  type SavedLeague,
} from './lib/storage'
import { useLeagueTeams } from './lib/useLeagueTeams'
import { DEFAULT_SETTINGS } from './lib/valuation'
import { Calculator } from './screens/Calculator'
import { LeagueSetup } from './screens/LeagueSetup'
import type { Settings } from './types'

export default function App() {
  const players = usePlayers()
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [league, setLeague] = useState<SavedLeague | null>(loadLeague)
  // null = show the setup screen. Returning visitors go straight to the calculator.
  // A saved "sleeper" mode without a saved league (older version) falls back to setup.
  const [mode, setMode] = useState<Mode | null>(() => {
    const m = loadMode()
    return m === 'sleeper' && !loadLeague() ? null : m
  })
  const leagueTeams = useLeagueTeams(mode === 'sleeper' ? (league?.leagueId ?? null) : null)

  const patchSettings = (patch: Partial<Settings>) =>
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      return next
    })

  if (mode === null)
    return (
      <LeagueSetup
        onLeague={(patch, picked, userId) => {
          // Start from defaults so a stale saved value (e.g. rounds) can't leak into the new league.
          patchSettings({ ...DEFAULT_SETTINGS, ...patch })
          const saved = { leagueId: picked.league_id, userId, name: picked.name }
          saveLeague(saved)
          setLeague(saved)
          saveMode('sleeper')
          setMode('sleeper')
        }}
        onManual={() => {
          saveMode('manual')
          setMode('manual')
        }}
      />
    )

  return (
    <Calculator
      settings={settings}
      onSettingsChange={patchSettings}
      players={players}
      subtitle={mode === 'sleeper' ? league?.name || 'Sleeper league' : 'Manual mode'}
      leagueTeams={mode === 'sleeper' ? leagueTeams : null}
      myUserId={mode === 'sleeper' ? (league?.userId ?? null) : null}
      onChangeLeague={() => setMode(null)}
    />
  )
}
