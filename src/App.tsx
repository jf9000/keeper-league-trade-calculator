import { useEffect, useState } from 'react'
import { AppHeader } from './components/AppHeader'
import { SettingsCard } from './components/SettingsCard'
import { useLeagueCtx } from './lib/context'
import { usePlayers } from './lib/players'
import { TABS, goHome, goTo, queryFromHash, tabFromHash, useRoute, type Tab } from './lib/route'
import { decodeTrade, type SharedTrade } from './lib/share'
import {
  loadLeague,
  loadMode,
  loadSettings,
  loadSettingsOpen,
  saveLeague,
  saveMode,
  saveSettings,
  saveSettingsOpen,
  type Mode,
  type SavedLeague,
} from './lib/storage'
import { useTheme } from './lib/theme'
import { EMPTY_TRADE, GENERIC, rosterKey, type TradeState } from './lib/trade'
import { useLeagueTeams } from './lib/useLeagueTeams'
import { DEFAULT_SETTINGS, clampAssets } from './lib/valuation'
import { DataFooter } from './components/DataFooter'
import { Calculator } from './screens/Calculator'
import { Finder } from './screens/Finder'
import { Keepers } from './screens/Keepers'
import { LeagueSetup } from './screens/LeagueSetup'
import { Rankings } from './screens/Rankings'
import { Watchlist } from './screens/Watchlist'
import type { Settings } from './types'

/** A trade opened from a share link, read once when the page loads. It overrides the saved league for this visit only. */
const SHARED: SharedTrade | null =
  tabFromHash(window.location.hash) === 'calculator' ? decodeTrade(queryFromHash(window.location.hash)) : null

const sharedTradeState = (t: SharedTrade): TradeState => ({
  assets: t.assets,
  choice: [t.rosters[0] === null ? GENERIC : rosterKey(t.rosters[0]), t.rosters[1] === null ? GENERIC : rosterKey(t.rosters[1])],
  stance: t.stance,
})

function initialLeague(): SavedLeague | null {
  const saved = loadLeague()
  if (!SHARED) return saved
  if (!SHARED.leagueId) return saved
  return saved?.leagueId === SHARED.leagueId ? saved : { leagueId: SHARED.leagueId, userId: '', name: 'Shared league' }
}

function initialMode(): Mode | null {
  if (SHARED) return SHARED.leagueId ? 'sleeper' : 'manual'
  const m = loadMode()
  // A saved "sleeper" mode without a saved league (older version) falls back to setup.
  return m === 'sleeper' && !loadLeague() ? null : m
}

export default function App() {
  const players = usePlayers()
  const route = useRoute()
  const home = route === 'home'
  // Anywhere but the homepage, an unknown route falls back to the calculator.
  const tab: Tab = route === 'home' ? 'calculator' : route
  const [theme, setTheme] = useTheme()
  const [settings, setSettings] = useState<Settings>(() => SHARED?.settings ?? loadSettings())
  const [league, setLeague] = useState<SavedLeague | null>(initialLeague)
  // null = show the setup screen. The bare site URL always shows it; other URLs go straight to their tab.
  const [mode, setMode] = useState<Mode | null>(initialMode)
  const [settingsOpen, setSettingsOpen] = useState(loadSettingsOpen)
  const [trade, setTrade] = useState<TradeState>(() => (SHARED ? sharedTradeState(SHARED) : EMPTY_TRADE))
  const leagueTeams = useLeagueTeams(mode === 'sleeper' ? (league?.leagueId ?? null) : null)
  const inLeague = mode === 'sleeper'
  const ctx = useLeagueCtx(settings, players, inLeague ? leagueTeams : null, inLeague ? (league?.userId || null) : null)

  // The share link has been applied, so tidy the address bar; reloading then shows the plain calculator.
  useEffect(() => {
    if (SHARED) window.history.replaceState(null, '', `${window.location.pathname}#/calculator`)
  }, [])

  useEffect(() => {
    const label = TABS.find((t) => t.id === tab)?.label ?? ''
    document.title = tab === 'calculator' ? 'Keeper League Trade Calculator - Fantasy Football' : `${label} | Keeper League Trade Calculator`
  }, [tab])

  const patchSettings = (patch: Partial<Settings>) =>
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      return next
    })

  // Settings are shared by every tab. A new round count also re-clamps the rounds of anything already in the trade.
  const changeSettings = (patch: Partial<Settings>) => {
    patchSettings(patch)
    if (patch.rounds !== undefined) {
      const rounds = patch.rounds
      setTrade((t) => ({ ...t, assets: [clampAssets(t.assets[0], rounds), clampAssets(t.assets[1], rounds)] }))
    }
  }

  if (mode === null || home)
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
          setTrade(EMPTY_TRADE)
          goTo('calculator')
        }}
        onManual={() => {
          saveMode('manual')
          setMode('manual')
          setTrade(EMPTY_TRADE)
          goTo('calculator')
        }}
      />
    )

  const openTrade = (t: TradeState) => {
    setTrade(t)
    goTo('calculator')
  }
  const onChangeLeague = () => {
    setMode(null)
    goHome()
  }

  // Everything sits in a centered column except the calculator's sticky trade meter, which spans the whole page.
  const column = 'mx-auto max-w-[980px] px-4'
  return (
    <div className="fade-in pt-5">
      <div className={column}>
        <AppHeader
          tab={tab}
          subtitle={inLeague ? league?.name || 'Sleeper league' : 'Manual mode'}
          hasLeague={inLeague}
          onChangeLeague={onChangeLeague}
          theme={theme}
          onTheme={setTheme}
        />
        <SettingsCard
          settings={settings}
          onChange={changeSettings}
          open={settingsOpen}
          onToggle={(open) => {
            setSettingsOpen(open)
            saveSettingsOpen(open)
          }}
        />
      </div>
      <main>
        {tab === 'calculator' && (
          <Calculator
            ctx={ctx}
            trade={trade}
            onTrade={(fn) => setTrade(fn)}
            subtitle={inLeague ? league?.name || 'Sleeper league' : 'Manual mode'}
            leagueId={inLeague ? (league?.leagueId ?? null) : null}
            hasLeague={inLeague}
          />
        )}
        {tab !== 'calculator' && (
          <div className={column}>
            {tab === 'keepers' && <Keepers ctx={ctx} onChangeLeague={onChangeLeague} />}
            {tab === 'finder' && <Finder ctx={ctx} onChangeLeague={onChangeLeague} onOpenTrade={openTrade} />}
            {tab === 'rankings' && <Rankings ctx={ctx} onChangeLeague={onChangeLeague} />}
            {tab === 'watchlist' && <Watchlist ctx={ctx} onOpenTrade={openTrade} />}
          </div>
        )}
      </main>
      <div className={column}>
        <DataFooter file={players.file} fallbackSeason={ctx.years[0] - 1} />
      </div>
    </div>
  )
}
