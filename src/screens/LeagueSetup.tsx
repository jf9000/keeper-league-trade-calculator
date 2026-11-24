import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  SleeperError,
  getUser,
  getUserLeagues,
  isKeeperLeague,
  leagueToSettings,
  type SleeperLeague,
} from '../lib/sleeper'
import { Attribution } from '../components/Attribution'
import { FootballLock } from '../components/FootballLock'
import { loadString, saveString } from '../lib/storage'
import { seasonFor } from '../lib/valuation'
import type { Settings } from '../types'

interface Props {
  /** A league was chosen: settings derived from it, the league, and the Sleeper user who picked it. */
  onLeague: (settings: Partial<Settings>, league: SleeperLeague, userId: string) => void
  /** Skip Sleeper entirely and enter league settings by hand. */
  onManual: () => void
}

const USERNAME_KEY = 'ktc-sleeper-username'

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'leagues'; userName: string; userId: string; leagues: SleeperLeague[]; hidden: number }

export function LeagueSetup({ onLeague, onManual }: Props) {
  const [username, setUsername] = useState(() => loadString(USERNAME_KEY))
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const abort = useRef<AbortController | null>(null)
  const season = seasonFor()

  useEffect(() => () => abort.current?.abort(), [])

  async function lookup(e: FormEvent) {
    e.preventDefault()
    const name = username.trim()
    if (!name) return
    abort.current?.abort()
    const ctrl = (abort.current = new AbortController())
    setStatus({ kind: 'loading' })
    try {
      const user = await getUser(name, ctrl.signal)
      if (!user) return setStatus({ kind: 'error', message: `No Sleeper user named “${name}”.` })
      const all = await getUserLeagues(user.user_id, season, ctrl.signal)
      // Only keeper leagues are listed: redraft and dynasty leagues don't have keeper costs to work with.
      const leagues = all.filter(isKeeperLeague)
      saveString(USERNAME_KEY, name)
      setStatus({
        kind: 'leagues',
        userName: user.display_name || user.username,
        userId: user.user_id,
        leagues,
        hidden: all.length - leagues.length,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setStatus({
        kind: 'error',
        message: err instanceof SleeperError ? err.message : 'Something went wrong talking to Sleeper.',
      })
    }
  }

  const busy = status.kind === 'loading'

  return (
    <div className="fade-in mx-auto max-w-[520px] px-4 pt-5 pb-10">
      <div className="flex items-center gap-2">
        <FootballLock className="h-8 w-8 shrink-0 min-[480px]:h-9 min-[480px]:w-9" />
        <h1 className="m-0 text-base leading-tight font-bold min-[480px]:text-xl">Keeper League Trade Calculator</h1>
      </div>
      <p className="m-0 mt-1 text-[15px] text-mut italic">Not redraft. Not dynasty. Keeper.</p>
      <p className="mt-4 mb-5 text-mut">
        Free fantasy football trade calculator built for keeper leagues. Connect your Sleeper league to value players, draft picks and keeper costs in any trade.
      </p>

      {/* data-nosnippet keeps the form's labels and buttons out of Google's result snippet, so it uses the text above. */}
      <form data-nosnippet onSubmit={lookup} className="rounded-xl border border-bd bg-card p-4">
        <label className="flex flex-col gap-1.5 text-[13px] text-mut">
          Sleeper username
          <div className="flex gap-2">
            <input
              className="flex-1 text-[15px]"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="e.g. your_username"
            />
            <button type="submit" className="primary" disabled={busy || !username.trim()}>
              {busy ? 'Looking up…' : 'Find keeper leagues'}
            </button>
          </div>
        </label>
        <p className="mt-2 mb-0 text-xs text-mut">Public, read-only lookup of your {season} NFL leagues. No password needed.</p>

        {status.kind === 'error' && (
          <p role="alert" className="mt-3 mb-0 text-[13px] text-bad">
            {status.message}
          </p>
        )}

        {status.kind === 'leagues' && (
          <div className="mt-3">
            {status.leagues.length === 0 ? (
              <p className="m-0 text-[13px] text-mut">
                {status.userName} has no {season} keeper leagues on Sleeper
                {status.hidden > 0 ? ` (${status.hidden} other ${status.hidden === 1 ? 'league is' : 'leagues are'} not keeper leagues, so ${status.hidden === 1 ? 'it’s' : 'they’re'} hidden)` : ''}
                . You can skip and enter settings manually.
              </p>
            ) : (
              <>
                <div className="mb-1.5 text-xs text-mut">{status.userName}’s keeper leagues</div>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {status.leagues.map((l) => (
                    <li key={l.league_id}>
                      <button
                        type="button"
                        className="flex w-full flex-col items-start gap-1 !px-3 !py-2.5 text-left min-[480px]:flex-row min-[480px]:items-center min-[480px]:justify-between min-[480px]:gap-3"
                        onClick={() => onLeague(leagueToSettings(l), l, status.userId)}
                      >
                        <span className="font-semibold">{l.name}</span>
                        <span className="text-[13px] whitespace-nowrap text-mut">{l.total_rosters} teams</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {status.hidden > 0 && (
                  <p className="mt-2 mb-0 text-xs text-mut">
                    {status.hidden} other {status.hidden === 1 ? 'league' : 'leagues'} hidden because
                    {status.hidden === 1 ? ' it isn’t' : ' they aren’t'} keeper leagues.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </form>

      <div data-nosnippet className="mt-4 text-center">
        <button type="button" onClick={onManual}>
          Skip: use manual mode
        </button>
      </div>

      <div data-nosnippet>
        <Attribution />
      </div>
    </div>
  )
}
