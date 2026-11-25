import type { ReactNode } from 'react'
import type { LeagueCtx } from '../lib/context'

interface Props {
  ctx: LeagueCtx
  /** What this screen does, for the "connect a league" message. */
  what: string
  onChangeLeague: () => void
  children: ReactNode
}

/** Shows a message instead of the screen until a Sleeper league (with rosters) and the player data are loaded. */
export function LeagueGate({ ctx, what, onChangeLeague, children }: Props) {
  if (ctx.players.status === 'error')
    return (
      <p role="alert" className="text-bad">
        Couldn’t load the player data. Reload to retry.
      </p>
    )
  if (ctx.leagueStatus === 'none' || ctx.leagueStatus === 'idle')
    return (
      <section className="card p-5">
        <h2 className="m-0 mb-1 text-base font-semibold">Connect a Sleeper league</h2>
        <p className="m-0 mb-3 text-mut">{what} needs your league’s rosters, so it isn’t available in manual mode.</p>
        <button type="button" className="primary" onClick={onChangeLeague}>
          Select league
        </button>
      </section>
    )
  if (ctx.leagueStatus === 'loading' || ctx.players.status === 'loading') return <p className="text-mut">Loading rosters…</p>
  if (ctx.leagueStatus === 'error')
    return (
      <p role="alert" className="text-bad">
        Couldn’t load this league’s rosters from Sleeper. Reload to retry.
      </p>
    )
  return <>{children}</>
}
