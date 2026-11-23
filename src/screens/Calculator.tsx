import { useEffect, useMemo, useState } from 'react'
import { ResultBar } from '../components/ResultBar'
import { TeamColumn, type TeamOption } from '../components/TeamColumn'
import { TradeNotes } from '../components/TradeNotes'
import type { LeagueCtx } from '../lib/context'
import { encodeTrade } from '../lib/share'
import { cardBlob, type CardData } from '../lib/shareCard'
import { GENERIC, rosterKey, type TradeState } from '../lib/trade'
import { ageNotes, availabilityNotes, positionStrength, teamNotes } from '../lib/notes'
import {
  adpOf,
  defaultKeeperRound,
  evalSide,
  evalTrade,
  judgeTrade,
  settingsFor,
  type Stance,
} from '../lib/valuation'
import type { Asset } from '../types'

interface Props {
  ctx: LeagueCtx
  trade: TradeState
  onTrade: (fn: (t: TradeState) => TradeState) => void
  /** Shown on the share card, e.g. the league name. */
  subtitle: string
  /** The Sleeper league the trade is in, so a shared link opens the same league; null in manual mode. */
  leagueId: string | null
  hasLeague: boolean
}

export function Calculator({ ctx, trade, onTrade, subtitle, leagueId, hasLeague }: Props) {
  const { s, players, byId, teams: leagueList, costs, mine, slots, years, owned, picksOf, rosterOf } = ctx
  const { assets, choice } = trade
  const setAssets = (fn: (a: [Asset[], Asset[]]) => [Asset[], Asset[]]) => onTrade((t) => ({ ...t, assets: fn(t.assets) }))
  const [shareMsg, setShareMsg] = useState('')

  const byKey = (k: string | null) => (k && k !== GENERIC ? leagueList.find((t) => rosterKey(t.rosterId) === k) : undefined)

  const team1 = byKey(choice[0] ?? (mine ? rosterKey(mine.rosterId) : GENERIC))
  // A roster can only be on one side, even if rosters finished loading after a pick was made.
  const picked2 = byKey(choice[1])
  const team2 = picked2 && picked2.rosterId !== team1?.rosterId ? picked2 : undefined
  const teamsSel = [team1, team2] as const
  const keys = [team1 ? rosterKey(team1.rosterId) : GENERIC, team2 ? rosterKey(team2.rosterId) : GENERIC] as const
  const names = [team1?.name ?? 'Team 1', team2?.name ?? 'Team 2'] as const

  // Your own team just follows the Rebuilding / Contending slider; only the other side gets an outlook toggle.
  const isMine = (t: typeof team1) => !!t && !!mine && t.rosterId === mine.rosterId
  const stance: [Stance, Stance] = [isMine(team1) ? null : trade.stance[0], isMine(team2) ? null : trade.stance[1]]

  const rosterPlayers = useMemo(() => [rosterOf(team1), rosterOf(team2)] as const, [team1, team2, byId])

  const allPlayers = ctx.ranked
  const searchable = [team1 ? rosterPlayers[0] : allPlayers, team2 ? rosterPlayers[1] : allPlayers] as const

  const sides = [evalSide(assets[0], byId, s, years[0]), evalSide(assets[1], byId, s, years[0])] as const
  const pickAvailable = (i: 0 | 1) => {
    const t = teamsSel[i]
    if (!t || !owned) return undefined
    return (year: number, round: number) => {
      const have = owned.get(year)?.get(t.rosterId)?.get(round) ?? 0
      return have > assets[i].filter((a) => a.t === 'k' && a.year === year && a.round === round).length
    }
  }

  const trades = evalTrade(
    assets[0],
    assets[1],
    rosterPlayers[0],
    rosterPlayers[1],
    byId,
    s,
    years[0],
    costs,
    slots,
    [picksOf(team1), picksOf(team2)],
    stance,
  )
  const verdict = judgeTrade(trades[0], trades[1], names)

  // How strong each team's starters are at each position, so a team's groups can be ranked in the league.
  const leagueStrength = useMemo(
    () =>
      leagueList.map((t) => ({
        rosterId: t.rosterId,
        by: positionStrength(t.playerIds.flatMap((id) => byId.get(id) ?? []), slots, s),
      })),
    [leagueList, byId, slots, s],
  )
  const notes = ([0, 1] as const).map((i) => {
    const t = teamsSel[i]
    if (!t) {
      const args = { sent: assets[i], incoming: i === 0 ? assets[1] : assets[0], players: byId, through: ctx.statsThrough }
      return [...availabilityNotes(args), ...ageNotes(args)].slice(0, 3)
    }
    return teamNotes({
      trade: trades[i],
      sent: assets[i],
      incoming: i === 0 ? assets[1] : assets[0],
      roster: rosterPlayers[i],
      others: leagueStrength.filter((x) => x.rosterId !== t.rosterId).map((x) => x.by),
      players: byId,
      s,
      slots,
      firstPickYear: years[0],
      costs,
      picks: picksOf(t),
      stance: stance[i],
      through: ctx.statsThrough,
    })
  }) as [string[], string[]]

  const used = useMemo(() => new Set(assets.flat().flatMap((a) => (a.t === 'p' ? [a.id] : []))), [assets])

  const optionsFor = (i: 0 | 1): TeamOption[] => {
    const other = teamsSel[1 - i]
    return [
      { key: GENERIC, label: `Team ${i + 1}` },
      ...leagueList
        .filter((t) => t.rosterId !== other?.rosterId)
        .map((t) => ({ key: rosterKey(t.rosterId), label: mine && t.rosterId === mine.rosterId ? `${t.name} (you)` : t.name })),
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

  // Changing a side's team keeps what that team could still send: players on its roster, and picks it owns.
  // Picking a generic team keeps everything, since a generic team can send anyone.
  const keepFor = (key: string, list: Asset[]): Asset[] => {
    const team = byKey(key)
    if (!team) return list
    const roster = new Set(team.playerIds)
    const used = new Map<string, number>()
    return list.filter((a) => {
      if (a.t === 'p') return roster.has(a.id)
      if (!owned) return true
      const id = `${a.year}-${a.round}`
      const n = (used.get(id) ?? 0) + 1
      used.set(id, n)
      return (owned.get(a.year)?.get(team.rosterId)?.get(a.round) ?? 0) >= n
    })
  }
  // A team can also change without a click (your roster becomes the default once the league loads), so
  // whenever the team on a side changes, drop anything that team couldn't send.
  useEffect(() => {
    onTrade((t) => {
      const next: [Asset[], Asset[]] = [keepFor(keys[0], t.assets[0]), keepFor(keys[1], t.assets[1])]
      return next[0].length === t.assets[0].length && next[1].length === t.assets[1].length ? t : { ...t, assets: next }
    })
  }, [keys[0], keys[1], leagueList])
  const select = (i: 0 | 1, key: string) =>
    onTrade((t) => ({
      ...t,
      choice: i === 0 ? [key, t.choice[1]] : [t.choice[0], key],
      assets: i === 0 ? [keepFor(key, t.assets[0]), t.assets[1]] : [t.assets[0], keepFor(key, t.assets[1])],
    }))

  const cardSide = (i: 0 | 1) => ({ name: names[i], grade: i === 0 ? verdict.grade1 : verdict.grade2, trade: trades[i], items: sides[i] })
  const cardData = (): CardData => ({ subtitle, verdict, sides: [cardSide(0), cardSide(1)] })
  const hasTrade = assets[0].length + assets[1].length > 0
  const flash = (m: string) => {
    setShareMsg(m)
    window.setTimeout(() => setShareMsg(''), 2500)
  }
  const shareUrl = () =>
    `${window.location.origin}${window.location.pathname}#/calculator?${encodeTrade({
      assets,
      rosters: [team1?.rosterId ?? null, team2?.rosterId ?? null],
      stance,
      settings: s,
      leagueId,
    })}`
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl())
      flash('Link copied')
    } catch {
      window.prompt('Copy this link', shareUrl())
    }
  }
  // Puts the card on the clipboard so it can be pasted straight into a chat, with nothing downloaded.
  // Browsers that can't copy images open it in a new tab instead.
  const copyImage = async () => {
    const png = cardBlob(cardData()).then((b) => {
      if (!b) throw new Error('no image')
      return b
    })
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
      flash('Image copied')
    } catch {
      try {
        const url = URL.createObjectURL(await png)
        window.open(url, '_blank')
        flash('Image opened in a new tab')
      } catch {
        flash('Couldn’t make the image')
      }
    }
  }

  return (
    <>
      <div className="mx-auto max-w-[980px] px-4">
      {!hasLeague && (
        <div role="status" className="mb-4 rounded-lg border border-[#fde047] bg-[#fef9c3] px-4 py-2.5 text-center text-[13px] font-medium text-[#713f12]">
          Select a league for a more accurate trade assessment.
        </div>
      )}
      {players.status === 'loading' && <p className="my-3 text-mut">Loading players…</p>}
      {players.status === 'error' && (
        <p className="my-3 text-bad" role="alert">
          Couldn’t load players.json. Run <b>npm run build-players</b> and reload.
        </p>
      )}
      {ctx.leagueStatus === 'loading' && <p className="my-3 text-mut">Loading rosters…</p>}
      {ctx.leagueStatus === 'error' && (
        <p className="my-3 text-bad" role="alert">
          Couldn’t load this league’s rosters from Sleeper, so teams are generic for now. Reload to retry.
        </p>
      )}
      {ctx.leagueStatus === 'ready' && !costs && (
        <p className="my-3 text-[13px] text-mut">
          No completed draft found for this league, so keeper costs are estimated from ADP.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {shareMsg && (
          <span role="status" className="mr-auto text-sm text-good">
            {shareMsg}
          </span>
        )}
        <button type="button" disabled={!hasTrade} onClick={copyLink}>
          Copy link
        </button>
        <button type="button" disabled={!hasTrade} onClick={copyImage}>
          Copy image
        </button>
        <button type="button" disabled={!hasTrade} onClick={() => setAssets(() => [[], []])}>
          Clear trade
        </button>
      </div>

      <div className="mt-3 mb-4 grid grid-cols-1 gap-4 min-[760px]:grid-cols-2">
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
            settings={settingsFor(s, stance[i])}
            stance={stance[i]}
            hideOutlook={isMine(teamsSel[i])}
            onStance={(next) => onTrade((t) => ({ ...t, stance: i === 0 ? [next, t.stance[1]] : [t.stance[0], next] }))}
            years={years}
            through={ctx.statsThrough}
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

      <TradeNotes names={names} notes={notes} />

      <ResultBar names={names} trades={trades} verdict={verdict} />
      </div>
    </>
  )
}
