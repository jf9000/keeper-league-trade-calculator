import { useEffect, useMemo, useState } from 'react'
import { InfoButton } from '../components/InfoButton'
import { ResultBar } from '../components/ResultBar'
import { SettingsCard } from '../components/SettingsCard'
import { TeamColumn, type TeamOption } from '../components/TeamColumn'
import { buildSlots } from '../lib/lineup'
import { positionStrength, teamNotes } from '../lib/notes'
import { describeSfSource } from '../lib/sfSource'
import type { PlayersState } from '../lib/players'
import { ownedPicks, type LeagueTeam } from '../lib/sleeper'
import type { LeagueTeamsState } from '../lib/useLeagueTeams'
import {
  adpOf,
  clampAssets,
  defaultKeeperRound,
  evalSide,
  evalTrade,
  judgeTrade,
  pickYears,
  seasonFor,
  type PickCounts,
} from '../lib/valuation'
import type { Asset, Player, Settings } from '../types'

interface Props {
  settings: Settings
  onSettingsChange: (patch: Partial<Settings>) => void
  players: PlayersState
  /** Shown under the title, e.g. the Sleeper league name or "Manual mode". */
  subtitle: string
  /** Rosters for the loaded Sleeper league; null in manual mode. */
  leagueTeams: LeagueTeamsState | null
  /** The Sleeper user who set up the league, so their roster can be Team 1 by default. */
  myUserId: string | null
  onChangeLeague: () => void
}

const GENERIC = 'generic'
const rosterKey = (t: LeagueTeam) => `r${t.rosterId}`

export function Calculator({ settings: s, onSettingsChange, players, subtitle, leagueTeams, myUserId, onChangeLeague }: Props) {
  const [assets, setAssets] = useState<[Asset[], Asset[]]>([[], []])
  // null = use the default (Team 1: your roster if known; Team 2: generic).
  const [choice, setChoice] = useState<[string | null, string | null]>([null, null])
  const years = useMemo(() => pickYears(seasonFor()), [])

  const leagueList = leagueTeams?.teams ?? []
  // Where players were drafted in the loaded league is what they cost to keep; without it, costs come from ADP.
  const costs = leagueTeams?.draftRounds ?? undefined
  const mine = myUserId ? leagueList.find((t) => t.ownerId === myUserId) : undefined
  const byKey = (k: string | null) => (k && k !== GENERIC ? leagueList.find((t) => rosterKey(t) === k) : undefined)

  const team1 = byKey(choice[0] ?? (mine ? rosterKey(mine) : GENERIC))
  // A roster can only be on one side, even if rosters finished loading after a pick was made.
  const picked2 = byKey(choice[1])
  const team2 = picked2 && picked2.rosterId !== team1?.rosterId ? picked2 : undefined
  const teamsSel = [team1, team2] as const
  const keys = [team1 ? rosterKey(team1) : GENERIC, team2 ? rosterKey(team2) : GENERIC] as const
  const names = [team1?.name ?? 'Team 1', team2?.name ?? 'Team 2'] as const

  // A team's traded assets belong to the roster they were picked from, so changing the roster clears them.
  useEffect(() => setAssets((a) => [[], a[1]]), [keys[0]])
  useEffect(() => setAssets((a) => [a[0], []]), [keys[1]])

  const rosterPlayers = useMemo(() => {
    const lookup = (t: LeagueTeam | undefined): Player[] =>
      t ? t.playerIds.flatMap((id) => players.byId.get(id) ?? []) : []
    return [lookup(team1), lookup(team2)] as const
  }, [team1, team2, players.byId])

  const allPlayers = players.file?.players ?? []
  const searchable = [team1 ? rosterPlayers[0] : allPlayers, team2 ? rosterPlayers[1] : allPlayers] as const

  const sides = [evalSide(assets[0], players.byId, s, years[0]), evalSide(assets[1], players.byId, s, years[0])] as const
  // The league's starting lineup decides which players actually help a team this season.
  const slots = useMemo(
    () => buildSlots(leagueTeams?.rosterPositions, s),
    [leagueTeams?.rosterPositions, s.flex, s.superflex],
  )

  // Who owns which picks in each upcoming draft. A keeper needs a pick in his round, so this decides who can be kept.
  const owned = useMemo(() => {
    const traded = leagueTeams?.tradedPicks
    if (!traded || !leagueTeams.teams.length) return null
    const ids = leagueTeams.teams.map((t) => t.rosterId)
    return new Map(years.map((y) => [y, ownedPicks(ids, traded, y, s.rounds)] as const))
  }, [leagueTeams?.tradedPicks, leagueTeams?.teams, years, s.rounds])
  const picksOf = (t: LeagueTeam | undefined): PickCounts | undefined => (t ? owned?.get(years[0])?.get(t.rosterId) : undefined)
  const pickAvailable = (i: 0 | 1) => {
    const t = teamsSel[i]
    if (!t || !owned) return undefined
    return (year: number, round: number) => {
      const have = owned.get(year)?.get(t.rosterId)?.get(round) ?? 0
      return have > assets[i].filter((a) => a.t === 'k' && a.year === year && a.round === round).length
    }
  }

  const trades = evalTrade(assets[0], assets[1], rosterPlayers[0], rosterPlayers[1], players.byId, s, years[0], costs, slots, [
    picksOf(team1),
    picksOf(team2),
  ])
  const verdict = judgeTrade(trades[0], trades[1], names)

  // How strong each team's starters are at each position, so a team's groups can be ranked in the league.
  const leagueStrength = useMemo(
    () =>
      (leagueTeams?.teams ?? []).map((t) => ({
        rosterId: t.rosterId,
        by: positionStrength(t.playerIds.flatMap((id) => players.byId.get(id) ?? []), slots, s),
      })),
    [leagueTeams?.teams, players.byId, slots, s],
  )
  const notes = ([0, 1] as const).map((i) => {
    const t = teamsSel[i]
    if (!t) return []
    return teamNotes({
      trade: trades[i],
      sent: assets[i],
      incoming: i === 0 ? assets[1] : assets[0],
      roster: rosterPlayers[i],
      others: leagueStrength.filter((x) => x.rosterId !== t.rosterId).map((x) => x.by),
      players: players.byId,
      s,
      slots,
      firstPickYear: years[0],
      costs,
      picks: picksOf(t),
    })
  }) as [string[], string[]]

  const generated = players.file ? new Date(players.file.generatedAt) : null
  const refreshed =
    generated && !Number.isNaN(generated.getTime())
      ? generated.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : ''

  const used = useMemo(() => new Set(assets.flat().flatMap((a) => (a.t === 'p' ? [a.id] : []))), [assets])

  const optionsFor = (i: 0 | 1): TeamOption[] => {
    const other = teamsSel[1 - i]
    return [
      { key: GENERIC, label: `Team ${i + 1}` },
      ...leagueList
        .filter((t) => t.rosterId !== other?.rosterId)
        .map((t) => ({ key: rosterKey(t), label: t.ownerId === myUserId ? `${t.name} (you)` : t.name })),
    ]
  }
  const noteFor = (i: 0 | 1) => {
    const t = teamsSel[i]
    if (!t) return undefined
    const missing = t.playerIds.length - rosterPlayers[i].length
    return missing > 0
      ? `${missing} of ${t.playerIds.length} rostered players have no ADP data and aren’t valued.`
      : undefined
  }

  const update = (i: 0 | 1, fn: (list: Asset[]) => Asset[]) =>
    setAssets((t) => (i === 0 ? [fn(t[0]), t[1]] : [t[0], fn(t[1])]))

  const select = (i: 0 | 1, key: string) => setChoice((c) => (i === 0 ? [key, c[1]] : [c[0], key]))

  const changeSettings = (patch: Partial<Settings>) => {
    onSettingsChange(patch)
    if (patch.rounds !== undefined) {
      const rounds = patch.rounds
      setAssets((t) => [clampAssets(t[0], rounds), clampAssets(t[1], rounds)])
    }
  }

  return (
    <>
    {!leagueTeams && (
      <div role="status" className="border-b border-[#fde047] bg-[#fef9c3] px-3.5 py-2 text-center text-[13px] font-medium text-[#713f12]">
        Select a league for a more accurate trade assessment.
      </div>
    )}
    <div className="mx-auto max-w-[980px] px-3.5 pt-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="m-0 text-xl font-bold">Keeper League Trade Calculator</h1>
            <InfoButton />
          </div>
          <div className="text-[13px] text-mut">{subtitle}</div>
        </div>
        <button onClick={onChangeLeague} className="text-[13px]">
          {leagueTeams ? 'Change league' : 'Select league'}
        </button>
      </header>

      <SettingsCard settings={s} onChange={changeSettings} />

      {players.status === 'loading' && <p className="my-3 text-mut">Loading players…</p>}
      {players.status === 'error' && (
        <p className="my-3 text-bad" role="alert">
          Couldn’t load players.json. Run <b>npm run build-players</b> and reload.
        </p>
      )}
      {leagueTeams?.status === 'loading' && <p className="my-3 text-mut">Loading rosters…</p>}
      {leagueTeams?.status === 'error' && (
        <p className="my-3 text-bad" role="alert">
          Couldn’t load this league’s rosters from Sleeper, so teams are generic for now. Reload to retry.
        </p>
      )}
      {leagueTeams?.status === 'ready' && !leagueTeams.draftRounds && (
        <p className="my-3 text-[13px] text-mut">
          No completed draft found for this league, so keeper costs are estimated from ADP.
        </p>
      )}

      <div className="mt-3 flex justify-end">
        <button type="button" disabled={assets[0].length + assets[1].length === 0} onClick={() => setAssets([[], []])}>
          Clear trade
        </button>
      </div>

      <div className="mt-2 mb-3 grid grid-cols-1 gap-3 min-[760px]:grid-cols-2">
        {([0, 1] as const).map((i) => (
          <TeamColumn
            key={i}
            index={i}
            options={optionsFor(i)}
            selected={keys[i]}
            onSelect={(k) => select(i, k)}
            note={noteFor(i)}
            items={sides[i]}
            players={searchable[i]}
            used={used}
            settings={s}
            years={years}
            pickAvailable={pickAvailable(i)}
            adp={(p) => adpOf(p, s)}
            defaultRound={(p) => defaultKeeperRound(p, s, costs)}
            onAdd={(a) => update(i, (l) => [...l, a])}
            onRemove={(k) => update(i, (l) => l.filter((_, j) => j !== k))}
            onKeeperRound={(k, round) =>
              update(i, (l) => l.map((a, j) => (j === k && a.t === 'p' ? { ...a, keeperRound: round } : a)))
            }
          />
        ))}
      </div>

      <p className="mt-3 mb-[90px] text-xs text-mut">
        {players.file ? `ADP is from the ${players.file.season} season (${players.file.source}). ` : ''}
        {refreshed ? `Data refreshed ${refreshed}. ` : ''}
        {describeSfSource(players.file?.sfSource, players.file?.season ?? years[0] - 1)}
      </p>

      <ResultBar names={names} trades={trades} verdict={verdict} notes={notes} />
    </div>
    </>
  )
}
