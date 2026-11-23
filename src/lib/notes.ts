import type { Asset, Player, Pos, Settings } from '../types'
import { ageFactor } from './age'
import { INJURY_FACTOR, INJURY_LABEL, LOW_AVAILABILITY, SERIOUS_INJURY, availability, gamesPossible } from './availability'
import { POS_LIST, bestLineup, lineupByPos, slotLabel, type Slot } from './lineup'
import { keeperStates, lineupStrength, type EvalItem, type KeeperCosts, type PickCounts, type Stance, type TeamTrade } from './valuation'

/** A swing in keeper value or lineup strength smaller than this is treated as no change. */
export const NOTE_EDGE = 5

export interface NoteArgs {
  trade: TeamTrade
  sent: Asset[]
  incoming: Asset[]
  roster: readonly Player[]
  /** Lineup strength by position for every *other* team in the league, to rank this team's groups against. */
  others: readonly Record<Pos, number>[]
  players: ReadonlyMap<string, Player>
  s: Settings
  slots: readonly Slot[]
  firstPickYear: number
  costs?: KeeperCosts
  /** This team's picks in the upcoming draft (before the trade); omit when pick ownership is unknown. */
  picks?: PickCounts
  /** Whether this team is contending or rebuilding, which changes what it should make of a trade. */
  stance?: Stance
  /** Weeks of current-season stats in the data, to judge how many games a player has missed. */
  through?: number
}

interface Shift {
  pos: Pos
  delta: number
  rankBefore: number
  rankAfter: number
}

const SUFFIX = ['th', 'st', 'nd', 'rd']
const ord = (n: number) => `${n}${SUFFIX[(n % 100 - 20) % 10] ?? SUFFIX[n % 100] ?? 'th'}`

const POS_NAME: Record<Pos, string> = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'kicker', DEF: 'D/ST' }

const WHY: Record<NonNullable<EvalItem['blocked']>, string> = {
  'extra-qb': 'you already have a better QB to keep',
  'over-limit': 'your keeper spots are filled by better players',
  'no-surplus': 'his keeper cost outweighs his value',
  'no-pick': 'you have no pick in his round',
  'pick-taken': 'a better keeper uses his pick',
}

/** Lineup strength by position for a roster, for ranking teams against each other. */
export function positionStrength(roster: readonly Player[], slots: readonly Slot[], s: Settings): Record<Pos, number> {
  return lineupByPos(bestLineup(roster, slots, lineupStrength(s)))
}

/**
 * Plain-language caveats for one team's side of a trade, built from what the trade does to its own
 * roster: keeper value (long-term) against its starting lineup (this season), and where its groups
 * rank in the league. Returns nothing when there's no roster to judge against or no real change.
 */
/**
 * Warnings about the players in a trade who are hurt or have missed a lot of games: their value here already
 * accounts for it, so these say why a name may be worth less (or more risky) than it looks.
 */
export function availabilityNotes(a: Pick<NoteArgs, 'sent' | 'incoming' | 'players' | 'through'>): string[] {
  const playersOf = (assets: Asset[]) => assets.flatMap((x) => (x.t === 'p' ? (a.players.get(x.id) ?? []) : []))
  const incoming = playersOf(a.incoming)
  const sent = playersOf(a.sent)
  const hurt = (p: Player) => !!p.inj && INJURY_FACTOR[p.inj] <= SERIOUS_INJURY
  const missed = (p: Player) => !!a.through && a.through >= 4 && !!p.stats && availability(p, a.through) < LOW_AVAILABILITY
  const names = (ps: Player[]) =>
    ps.length < 3 ? ps.map((p) => p.name).join(' and ') : `${ps.slice(0, -1).map((p) => p.name).join(', ')} and ${ps[ps.length - 1]!.name}`
  const status = (p: Player) => INJURY_LABEL[p.inj!]
  const out: string[] = []

  const hurtIn = incoming.filter(hurt)
  if (hurtIn.length) {
    out.push(
      `${hurtIn.map((p) => `${p.name} is ${status(p)}`).join('; ')}, so ${hurtIn.length > 1 ? 'their' : 'his'} value this season is discounted. ` +
        `${hurtIn.some((p) => p.inj === 'IR' || p.inj === 'PUP') ? 'He may not play again this year, but keeper value is unaffected.' : 'Check his status before you agree.'}`,
    )
  }
  const hurtOut = sent.filter(hurt)
  if (hurtOut.length) {
    out.push(`You’d be sending ${names(hurtOut)}, who ${hurtOut.length > 1 ? 'are' : 'is'} hurt, so ${hurtOut.length > 1 ? 'they count' : 'he counts'} for less this season.`)
  }
  // Players already flagged as hurt are covered above; this is for healthy ones who have simply missed time.
  const line = (p: Player) => `${p.name} (${Math.min(p.stats!.gp, gamesPossible(a.through!))} of ${gamesPossible(a.through!)} games)`
  const missedIn = incoming.filter((p) => missed(p) && !hurt(p))
  if (missedIn.length) {
    const many = missedIn.length > 1
    out.push(`${missedIn.map(line).join(', ')} ${many ? 'have' : 'has'} missed a lot of games, so ${many ? 'their' : 'his'} points per game are a small sample and are discounted.`)
  }
  const missedOut = sent.filter((p) => missed(p) && !hurt(p))
  if (missedOut.length) {
    const many = missedOut.length > 1
    out.push(`${missedOut.map(line).join(', ')} ${many ? 'have' : 'has'} missed a lot of games, so ${many ? 'their' : 'his'} production counts for less on your side.`)
  }
  return out
}

/** A discount smaller than this isn't worth a note. */
const AGE_NOTE_EDGE = 0.1

/**
 * Notes on players whose age cuts their keeper value. Age only lowers keeper value (what he's worth to keep
 * for next season), so this reminds you why a name that looks strong on paper isn't worth as much to keep.
 */
export function ageNotes(a: Pick<NoteArgs, 'sent' | 'incoming' | 'players'>): string[] {
  const playersOf = (assets: Asset[]) => assets.flatMap((x) => (x.t === 'p' ? (a.players.get(x.id) ?? []) : []))
  const old = (p: Player) => 1 - ageFactor(p) >= AGE_NOTE_EDGE
  const desc = (p: Player) => `${p.name} (${p.age}, ${Math.round((1 - ageFactor(p)) * 100)}% off)`
  const list = (ps: Player[]) => ps.map(desc).join(', ')
  const out: string[] = []
  const inOld = playersOf(a.incoming).filter(old)
  if (inOld.length) out.push(`${list(inOld)} ${inOld.length > 1 ? 'are' : 'is'} getting older, so ${inOld.length > 1 ? 'their' : 'his'} keeper value is discounted for age.`)
  const outOld = playersOf(a.sent).filter(old)
  if (outOld.length) out.push(`${list(outOld)} ${outOld.length > 1 ? 'are' : 'is'} getting older, so ${outOld.length > 1 ? 'their' : 'his'} keeper value is already discounted for age on your side.`)
  return out
}

export function teamNotes(a: NoteArgs): string[] {
  const { later, now } = a.trade
  // Without a roster to judge against, injuries and missed games are still worth flagging.
  if (!later || !now || !a.roster.length) return [...availabilityNotes(a), ...ageNotes(a)].slice(0, 3)

  const strength = lineupStrength(a.s)
  const sentIds = new Set(a.sent.flatMap((x) => (x.t === 'p' ? [x.id] : [])))
  const staying = a.roster.filter((p) => !sentIds.has(p.id))
  const arriving = a.incoming.flatMap((x) => (x.t === 'p' ? (a.players.get(x.id) ?? []) : []))

  const before = lineupByPos(bestLineup(a.roster, a.slots, strength))
  const afterLineup = bestLineup([...staying, ...arriving], a.slots, strength)
  const after = lineupByPos(afterLineup)

  const n = a.others.length + 1
  const rank = (pos: Pos, v: number) => 1 + a.others.filter((o) => o[pos] > v).length
  const shifts: Shift[] = POS_LIST.map((pos) => ({
    pos,
    delta: after[pos] - before[pos],
    rankBefore: rank(pos, before[pos]),
    rankAfter: rank(pos, after[pos]),
  }))
  const gain = shifts.reduce((m, x) => (x.delta > m.delta ? x : m))
  const loss = shifts.reduce((m, x) => (x.delta < m.delta ? x : m))
  const weak = (x: Shift) => n > 1 && x.rankBefore > (n * 2) / 3
  const strong = (x: Shift) => n > 1 && x.rankBefore <= n / 3

  const boost = (x: Shift) => {
    const name = POS_NAME[x.pos]
    if (n === 1) return `it upgrades your ${name} starters`
    if (x.rankAfter < x.rankBefore) {
      return `your ${name} group moves from ${ord(x.rankBefore)} to ${ord(x.rankAfter)} of ${n}${weak(x) ? ', patching a weak spot' : ''}`
    }
    const tag = strong(x) ? ', already a strength' : weak(x) ? ', a weak spot for you' : ''
    return `it adds to your ${name} group (${ord(x.rankBefore)} of ${n}${tag})`
  }
  const hit = (x: Shift) => {
    const name = POS_NAME[x.pos]
    if (n === 1) return `it weakens your ${name} starters`
    if (x.rankAfter > x.rankBefore) {
      return `your ${name} group drops from ${ord(x.rankBefore)} to ${ord(x.rankAfter)} of ${n}${weak(x) ? ', where you’re already thin' : ''}`
    }
    return `it thins your ${name} group (${ord(x.rankBefore)} of ${n}${weak(x) ? ', already a weak spot' : ''})`
  }

  const laterNet = later.gets - later.gives
  const nowNet = now.gets - now.gives
  const laterLoss = laterNet <= -NOTE_EDGE
  const laterGain = laterNet >= NOTE_EDGE
  const nowGain = nowNet >= NOTE_EDGE
  const nowLoss = nowNet <= -NOTE_EDGE

  const notes: string[] = []
  if (laterLoss && nowGain) {
    notes.push(
      `A losing trade long-term, since you give up keeper value, but it strengthens your lineup this season: ${boost(gain)}. ${
        a.stance === 'contending'
          ? 'Since you’re contending, it may be worth it.'
          : a.stance === 'rebuilding'
            ? 'Since you’re rebuilding, it’s probably not worth it.'
            : 'If you’re trying to win now, it may be worth considering.'
      }`,
    )
  } else if (laterGain && nowLoss) {
    notes.push(
      `Good for your keepers, but it hurts you this season: ${hit(loss)}. ${
        a.stance === 'contending'
          ? 'Since you’re contending, think twice.'
          : a.stance === 'rebuilding'
            ? 'That fits a rebuild.'
            : 'If you’re contending now, think twice.'
      }`,
    )
  } else if (laterLoss && nowLoss) {
    notes.push(`This hurts you now and later: you give up keeper value and ${hit(loss)}.`)
  } else if (laterGain && nowGain) {
    notes.push(`Helps now and later: more keeper value, and ${boost(gain)}.`)
  } else if (nowGain) {
    notes.push(`Keeper value is about even, but it upgrades your lineup this season: ${boost(gain)}.`)
  } else if (nowLoss) {
    notes.push(`Keeper value is about even, but it weakens your lineup this season: ${hit(loss)}.`)
  } else if (laterLoss) {
    notes.push('You give up keeper value without improving your lineup.')
  } else if (laterGain) {
    notes.push('Adds keeper value without changing your lineup.')
  }

  const ks = keeperStates(a.sent, a.incoming, a.roster, a.players, a.s, a.firstPickYear, a.costs, a.picks)
  const byPlayer = (items: EvalItem[]) => new Map(items.flatMap((i) => (i.player ? [[i.player.id, i] as const] : [])))
  const beforeKeep = byPlayer(ks.before)
  const afterKeep = byPlayer(ks.after)
  const incomingIds = new Set(a.incoming.flatMap((x) => (x.t === 'p' ? [x.id] : [])))
  const pickBlocked = (i?: EvalItem) => i?.blocked === 'no-pick' || i?.blocked === 'pick-taken'
  const list = (names: string[]) =>
    names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

  // Keepers need a pick in their round, and keepers compete for it, so trades that move picks or
  // keepers can cost a team a keeper it had, or give it one it couldn't use.
  const pickNotes: string[] = []
  if (a.picks) {
    const sentPickRounds = new Set(a.sent.flatMap((x) => (x.t === 'k' && x.year === a.firstPickYear ? [x.round] : [])))
    const sentKeeperRounds = new Set(a.sent.flatMap((x) => (x.t === 'p' ? [x.keeperRound] : [])))
    const gotPickRounds = new Set(a.incoming.flatMap((x) => (x.t === 'k' && x.year === a.firstPickYear ? [x.round] : [])))
    const group = (pick: (p: Player) => boolean) => {
      const byRound = new Map<number, string[]>()
      for (const p of staying) {
        if (!pick(p)) continue
        const round = afterKeep.get(p.id)?.round ?? 0
        byRound.set(round, [...(byRound.get(round) ?? []), p.name])
      }
      return [...byRound.entries()].sort((x, y) => x[0] - y[0])
    }

    for (const [round, names] of group((p) => !!beforeKeep.get(p.id) && !beforeKeep.get(p.id)!.blocked && pickBlocked(afterKeep.get(p.id)))) {
      const taker = [...afterKeep.values()].find((i) => i.player && incomingIds.has(i.player.id) && i.round === round && !i.blocked)
      pickNotes.push(
        taker
          ? `${taker.player!.name} would use your round ${round} pick as a keeper, so ${list(names)} can no longer be kept with it.`
          : sentPickRounds.has(round)
            ? `Trading away your round ${round} pick means you can no longer keep ${list(names)}.`
            : `You’d be left without a round ${round} pick for ${list(names)}, so ${names.length > 1 ? 'they' : 'he'} can’t be kept.`,
      )
    }
    for (const [round, names] of group((p) => pickBlocked(beforeKeep.get(p.id)) && !!afterKeep.get(p.id) && !afterKeep.get(p.id)!.blocked)) {
      const why = gotPickRounds.has(round)
        ? `The round ${round} pick you’re getting lets you keep ${list(names)}`
        : sentKeeperRounds.has(round)
          ? `Sending away the keeper who used your round ${round} pick frees it up for ${list(names)}`
          : `${list(names)} can be kept with your round ${round} pick`
      pickNotes.push(`${why}, which you couldn’t before.`)
    }
  }

  // A player who can't be kept is only worth something this season, and only if he'd start.
  const holderOf = (round: number) => [...afterKeep.values()].find((i) => i.round === round && !i.blocked)?.player?.name
  const why = (i: EvalItem): string => {
    if (i.blocked === 'no-pick') return `you have no round ${i.round} pick to keep him with`
    if (i.blocked === 'pick-taken') {
      const holder = holderOf(i.round!)
      return holder ? `your round ${i.round} pick is already used on ${holder}, a better keeper` : `a better keeper uses your round ${i.round} pick`
    }
    return WHY[i.blocked!]
  }
  const rental = ks.after
    // K and D/ST are never keepers worth mentioning; the position-group note already covers them.
    .filter((i) => i.player && i.player.pos !== 'K' && i.player.pos !== 'DEF' && i.blocked && incomingIds.has(i.player.id))
    .sort((x, y) => strength(y.player!) - strength(x.player!))[0]
  const rentalNotes: string[] = []
  if (rental?.player && rental.blocked) {
    const starter = afterLineup.find((st) => st.player.id === rental.player!.id)
    const who = `${rental.player.name} wouldn’t be a keeper for you (${why(rental)})`
    rentalNotes.push(
      starter
        ? `${who}, so he’s a this-season rental: he’d start at ${slotLabel(a.slots[starter.slot]!)}.`
        : `${who}, and he wouldn’t start for you either, so he adds little.`,
    )
  }
  return [...[...availabilityNotes(a), ...ageNotes(a)].slice(0, 3), ...[...pickNotes, ...notes, ...rentalNotes].slice(0, 3)]
}
