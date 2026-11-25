import type { Asset, Player, Pos, Settings } from '../types'
import { ageFactor } from './age'
import { INJURY_FACTOR, INJURY_LABEL, LOW_AVAILABILITY, SERIOUS_INJURY, availability } from './availability'
import { POS_LIST, bestLineup, lineupByPos, slotLabel, type Slot } from './lineup'
import { phrase } from './phrase'
import {
  SUPERFLEX_QB_PENALTY,
  evalSide,
  keeperStates,
  lineupStrength,
  nameList,
  qbSpotChange,
  type EvalItem,
  type KeeperCosts,
  type PickCounts,
  type Stance,
  type TeamTrade,
} from './valuation'

/** What a team's outlook says about a trade that trades keeper value for this season, or the other way round. */
function stanceLine(
  stance: Stance | undefined,
  say: { now: (label: string, stance: Stance) => string; later: (label: string, stance: Stance) => string; none: string },
): string {
  if (stance === 'contending') return say.now('contending', stance)
  if (stance === 'allin') return say.now('all in', stance)
  if (stance === 'rebuilding') return say.later('rebuilding', stance)
  if (stance === 'sell') return say.later('selling', stance)
  return say.none
}

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
  /** Which side of the trade this team is on, so the two sides never word the same note alike. */
  side?: 0 | 1
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

/** Ways to say why an incoming player wouldn't be kept; the keepers ahead of him are named after. */
const WHY: Record<'extra-qb' | 'over-limit' | 'no-surplus', readonly string[]> = {
  'extra-qb': [
    'you already have a better QB to keep',
    'there’s a stronger QB ahead of him',
    'your QB keeper spot belongs to someone better',
    'another QB of yours is the better keep',
  ],
  'over-limit': [
    'your keeper spots are filled by better players',
    'stronger players already hold your keeper spots',
    'you have better options for every keeper spot',
    'better keepers have your spots locked up',
  ],
  'no-surplus': [
    'his keeper cost outweighs his value',
    'he costs more to keep than he’s worth',
    'the round he’d cost is too steep',
    'keeping him wouldn’t be a bargain',
  ],
}

/** Says that a trade empties (a heavy penalty) or fills QB spots in a superflex lineup. */
function qbSpotNote(change: number): string {
  const n = Math.abs(change)
  const spots = `${n > 1 ? n : 'a'} QB/superflex spot${n > 1 ? 's' : ''}`
  return change > 0
    ? `This leaves ${spots} without a startable QB, so your side is penalized heavily unless a QB comes back.`
    : `This fills ${spots} that had no startable QB, which counts in your favor.`
}

/** An uneven-trade penalty smaller than this barely moves the result, so it isn't worth a note. */
const UNEVEN_NOTE_EDGE = 0.5

/** Says when a team's result was marked down for sending more players than it gets back. */
export function unevenNotes(trade: TeamTrade): string[] {
  return (trade.uneven ?? 0) >= UNEVEN_NOTE_EDGE
    ? ['You’re giving up more players than you’re getting back.']
    : []
}

/** A player with at least this much keeper surplus (about a top-50 pick) is a good keeper to give up. */
export const GOOD_KEEPER_VALUE = 20

/** Ways to say a team is giving up good keepers. */
export const KEEPER_LOSS_PHRASES: readonly ((names: string, many: boolean) => string)[] = [
  (n, many) => `Parting with ${n} means giving up ${many ? 'some great keepers' : 'a great keeper'}.`,
  (n, many) => `${n} ${many ? 'are keepers' : 'is a keeper'} worth holding onto, so make sure the return is worth it.`,
  (n) => `You’re letting go of some real keeper value in ${n}.`,
  (n, many) => `${many ? 'Keepers' : 'A keeper'} like ${n} can be hard to replace.`,
  (n, many) => `Saying goodbye to ${n} costs you ${many ? 'some valuable keepers' : 'a valuable keeper'}.`,
  (n) => `Your keeper outlook takes a hit without ${n}.`,
  (n, many) => `You’d be handing over ${many ? 'some prized keepers' : 'a prized keeper'} in ${n}.`,
  (n, many) => `${n} would give you a head start on next season, so ${many ? 'they’re' : 'that’s'} a lot to give up.`,
  (n, many) => `Trading ${n} means passing on ${many ? 'some excellent keeper bargains' : 'an excellent keeper bargain'}.`,
  (n, many) => `${n} ${many ? 'are the kind of keepers' : 'is the kind of keeper'} every manager loves to have.`,
  (n, many) => `This deal sends away ${many ? 'some strong keepers' : 'a strong keeper'} in ${n}.`,
  (n) => `Think about next season too: ${n} could be a big piece of your keeper plans.`,
]

/** Says when a team is sending away players who are good to keep at the round they cost. */
export function keeperLossNotes(
  a: Pick<NoteArgs, 'sent' | 'players' | 's' | 'firstPickYear' | 'picks' | 'side'>,
): string[] {
  // Each player is judged on his own: whether he's a good keeper doesn't depend on who else is on the roster.
  const good = a.sent
    .flatMap((x) => (x.t === 'p' ? evalSide([x], a.players, a.s, a.firstPickYear, a.picks) : []))
    .filter((i) => !i.blocked && i.value >= GOOD_KEEPER_VALUE)
    .sort((x, y) => y.value - x.value)
  if (!good.length) return []
  const names = nameList(good.map((i) => i.player!.name))
  return [phrase(KEEPER_LOSS_PHRASES, `keeper-loss ${names}`, a.side)(names, good.length > 1)]
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
export function availabilityNotes(a: Pick<NoteArgs, 'sent' | 'incoming' | 'players' | 'through' | 'side'>): string[] {
  const playersOf = (assets: Asset[]) => assets.flatMap((x) => (x.t === 'p' ? (a.players.get(x.id) ?? []) : []))
  const incoming = playersOf(a.incoming)
  const sent = playersOf(a.sent)
  const hurt = (p: Player) => !!p.inj && INJURY_FACTOR[p.inj] <= SERIOUS_INJURY
  const missed = (p: Player) => !!a.through && a.through >= 4 && !!p.stats && availability(p, a.through) < LOW_AVAILABILITY
  const names = (ps: Player[]) => nameList(ps.map((p) => p.name))
  const status = (p: Player) => (p.inj === 'IR' ? 'on injured reserve' : INJURY_LABEL[p.inj!])
  const say = (seed: string, options: string[]) => phrase(options, seed, a.side)
  const out: string[] = []

  const hurtIn = incoming.filter(hurt)
  if (hurtIn.length) {
    const many = hurtIn.length > 1
    const their = many ? 'their' : 'his'
    const list = hurtIn.map((p) => `${p.name} is ${status(p)}`).join('; ')
    const lead = say(`hurt-in ${list}`, [
      `${list}, so ${their} value this season is discounted.`,
      `${list}, which trims ${their} value for this season.`,
      `${list}. This season’s value reflects that.`,
      `${list}, so ${their} outlook for this year is marked down.`,
      `Injury watch: ${list}, and ${their} value this year takes a hit.`,
      `${list}, so expect less from ${many ? 'them' : 'him'} this season.`,
    ])
    const advice = say(`check ${list}`, [
      `Check ${their} status before you agree.`,
      'Take a look at the latest injury news before accepting.',
      `Confirm ${their} timeline before you sign off.`,
      `It’s worth finding out when ${many ? 'they’re' : 'he’s'} expected back.`,
    ])
    out.push(`${lead} ${advice}`)
  }
  const hurtOut = sent.filter(hurt)
  if (hurtOut.length) {
    const many = hurtOut.length > 1
    const n = names(hurtOut)
    const is = many ? 'are' : 'is'
    out.push(
      say(`hurt-out ${n}`, [
        `You’d be sending ${n}, who ${is} hurt, so ${many ? 'they count' : 'he counts'} for less this season.`,
        `Trading ${n} stings less right now, since ${many ? 'they’re' : 'he’s'} hurt.`,
        `Because ${n} ${is} injured, parting with ${many ? 'them' : 'him'} costs you less this year.`,
        `${n} ${is} dealing with injury, so you’re giving up less for this season.`,
        `With ${n} hurt, what you give up this year is marked down.`,
        `The injury news on ${n} lowers what you’re sending away this season.`,
      ]),
    )
  }
  // Players already flagged as hurt are covered above; this is for healthy ones who have simply missed time.
  const missedIn = incoming.filter((p) => missed(p) && !hurt(p))
  if (missedIn.length) {
    const many = missedIn.length > 1
    const n = names(missedIn)
    const has = many ? 'have' : 'has'
    const their = many ? 'their' : 'his'
    out.push(
      say(`missed-in ${n}`, [
        `${n} ${has} missed a lot of games, so ${their} points per game are a small sample and are discounted.`,
        `${n} ${has} been out often, so ${their} per-game scoring is taken with a grain of salt.`,
        `With plenty of missed time, ${n} ${has} a thin sample this season, and the value reflects it.`,
        `Limited action for ${n} means ${their} scoring average counts for less here.`,
      ]),
    )
  }
  const missedOut = sent.filter((p) => missed(p) && !hurt(p))
  if (missedOut.length) {
    const many = missedOut.length > 1
    const n = names(missedOut)
    const has = many ? 'have' : 'has'
    const their = many ? 'their' : 'his'
    out.push(
      say(`missed-out ${n}`, [
        `${n} ${has} missed a lot of games, so ${their} production counts for less on your side.`,
        `${n} ${has} been sidelined often, which softens the loss for you.`,
        `You’re giving up less production than it might seem, since ${n} ${has} sat out plenty of games.`,
        `Missed time lowers what ${n} ${many ? 'add' : 'adds'} to your side of this deal.`,
      ]),
    )
  }
  return out
}

/** A discount smaller than this isn't worth a note. */
const AGE_NOTE_EDGE = 0.1

/**
 * Notes on players whose age cuts their keeper value. Age only lowers keeper value (what he's worth to keep
 * for next season), so this reminds you why a name that looks strong on paper isn't worth as much to keep.
 */
export function ageNotes(a: Pick<NoteArgs, 'sent' | 'incoming' | 'players' | 'side'>): string[] {
  const playersOf = (assets: Asset[]) => assets.flatMap((x) => (x.t === 'p' ? (a.players.get(x.id) ?? []) : []))
  const old = (p: Player) => 1 - ageFactor(p) >= AGE_NOTE_EDGE
  const words = (ps: Player[]) => {
    const many = ps.length > 1
    return {
      many,
      n: nameList(ps.map((p) => p.name)),
      ages: nameList(ps.map((p) => String(p.age))),
      is: many ? 'are' : 'is',
      their: many ? 'their' : 'his',
    }
  }
  const out: string[] = []
  const inOld = playersOf(a.incoming).filter(old)
  if (inOld.length) {
    const { many, n, ages, is, their } = words(inOld)
    const options = [
      `${n} ${is} getting older (${ages} y/o), so ${their} keeper value is discounted for age.`,
      `Age is a factor with ${n} (${ages} y/o), which trims ${their} keeper value.`,
      `At ${ages}, ${n} ${many ? 'carry' : 'carries'} less keeper value than ${their} production alone would suggest.`,
      `Keep in mind that ${n} (${ages} y/o) ${many ? 'lose' : 'loses'} some keeper value to age.`,
    ]
    out.push(phrase(options, `age-in ${n}`, a.side))
  }
  const outOld = playersOf(a.sent).filter(old)
  if (outOld.length) {
    const { many, n, ages, is, their } = words(outOld)
    const options = [
      `${n} ${is} getting older (${ages} y/o), so ${their} keeper value is already discounted for age on your side.`,
      `Age already lowers what ${n} (${ages} y/o) ${is} worth to keep, which softens this part of the deal.`,
      `${n} (${ages} y/o) ${is} on the older side, so you’re giving up less keeper value than you might think.`,
      `At ${ages}, ${n} ${many ? 'were' : 'was'} already marked down as ${many ? 'keepers' : 'a keeper'} on your roster.`,
    ]
    out.push(phrase(options, `age-out ${n}`, a.side))
  }
  return out
}

export function teamNotes(a: NoteArgs): string[] {
  const { later, now } = a.trade
  // Without a roster to judge against, injuries and missed games are still worth flagging.
  if (!later || !now || !a.roster.length) {
    return [...unevenNotes(a.trade), ...[...availabilityNotes(a), ...ageNotes(a)].slice(0, 3), ...keeperLossNotes(a)]
  }

  const strength = lineupStrength(a.s)
  const sentIds = new Set(a.sent.flatMap((x) => (x.t === 'p' ? [x.id] : [])))
  const staying = a.roster.filter((p) => !sentIds.has(p.id))
  const arriving = a.incoming.flatMap((x) => (x.t === 'p' ? (a.players.get(x.id) ?? []) : []))

  const before = lineupByPos(bestLineup(a.roster, a.slots, strength))
  const afterLineup = bestLineup([...staying, ...arriving], a.slots, strength)
  const after = lineupByPos(afterLineup)

  const n = a.others.length + 1
  const rank = (pos: Pos, v: number) => 1 + a.others.filter((o) => o[pos] > v).length
  const qbChange = qbSpotChange(a.roster, [...staying, ...arriving], a.slots, a.s)
  const shifts: Shift[] = POS_LIST.map((pos) => ({
    pos,
    // Includes any QB penalty, so the position named as gaining or losing matches the trade's numbers.
    delta: after[pos] - before[pos] - (pos === 'QB' ? qbChange * SUPERFLEX_QB_PENALTY : 0),
    rankBefore: rank(pos, before[pos]),
    rankAfter: rank(pos, after[pos]),
  }))
  const gain = shifts.reduce((m, x) => (x.delta > m.delta ? x : m))
  const loss = shifts.reduce((m, x) => (x.delta < m.delta ? x : m))
  const weak = (x: Shift) => n > 1 && x.rankBefore > (n * 2) / 3
  const strong = (x: Shift) => n > 1 && x.rankBefore <= n / 3

  /** A trade note's wording, in this side's own words (see `phrase`). */
  const say = (seed: string, options: readonly string[], nth?: number) => phrase(options, seed, a.side, nth)

  const boost = (x: Shift) => {
    const name = POS_NAME[x.pos]
    if (n === 1) return `it upgrades your ${name} starters`
    if (x.rankAfter < x.rankBefore) {
      const moved = `from ${ord(x.rankBefore)} to ${ord(x.rankAfter)} of ${n}`
      const move = say(`climb ${name}`, [
        `your ${name} group moves ${moved}`,
        `your ${name} group climbs ${moved}`,
        `it lifts your ${name} group ${moved}`,
        `your ${name} ranking jumps ${moved}`,
      ])
      const patch = say(`patch ${name}`, [
        ', patching a weak spot',
        ', shoring up a soft spot',
        ', filling a real need',
        ', helping where you needed it',
      ])
      return `${move}${weak(x) ? patch : ''}`
    }
    const strength = say(`strong ${name}`, [
      ', already a strength',
      ', already a strong suit',
      ', a spot where you were already good',
      ', where you were already set',
    ])
    const need = say(`need ${name}`, [
      ', a weak spot for you',
      ', a soft spot on your roster',
      ', an area of need',
      ', where you could use the help',
    ])
    const rankNow = `(${ord(x.rankBefore)} of ${n}${strong(x) ? strength : weak(x) ? need : ''})`
    return say(`add ${name}`, [
      `it adds to your ${name} group ${rankNow}`,
      `it bolsters your ${name} group ${rankNow}`,
      `your ${name} group gets stronger ${rankNow}`,
      `it gives your ${name} group a boost ${rankNow}`,
    ])
  }
  const hit = (x: Shift) => {
    const name = POS_NAME[x.pos]
    if (n === 1) return `it weakens your ${name} starters`
    if (x.rankAfter > x.rankBefore) {
      const moved = `from ${ord(x.rankBefore)} to ${ord(x.rankAfter)} of ${n}`
      const move = say(`drop ${name}`, [
        `your ${name} group drops ${moved}`,
        `your ${name} group slides ${moved}`,
        `it knocks your ${name} group ${moved}`,
        `your ${name} ranking slips ${moved}`,
      ])
      const thin = say(`thin ${name}`, [
        ', where you’re already thin',
        ', a spot that was already shaky',
        ', which was already a soft spot',
        ', where depth was already an issue',
      ])
      return `${move}${weak(x) ? thin : ''}`
    }
    const soft = say(`soft ${name}`, [
      ', already a weak spot',
      ', already a soft spot',
      ', already a concern',
      ', already thin',
    ])
    const rankNow = `(${ord(x.rankBefore)} of ${n}${weak(x) ? soft : ''})`
    return say(`less ${name}`, [
      `it thins your ${name} group ${rankNow}`,
      `it takes a bite out of your ${name} group ${rankNow}`,
      `your ${name} group gets weaker ${rankNow}`,
      `it leaves you lighter at ${name} ${rankNow}`,
    ])
  }

  const laterNet = later.gets - later.gives
  const nowNet = now.gets - now.gives
  const laterLoss = laterNet <= -NOTE_EDGE
  const laterGain = laterNet >= NOTE_EDGE
  const nowGain = nowNet >= NOTE_EDGE
  const nowLoss = nowNet <= -NOTE_EDGE

  const notes: string[] = []
  if (laterLoss && nowGain) {
    const b = boost(gain)
    const lead = say('later-loss now-gain', [
      `A losing trade long-term, since you give up keeper value, but it strengthens your lineup this season: ${b}.`,
      `You’re trading future keeper value for help right now: ${b}.`,
      `This one costs you keeper value down the road but pays off this season: ${b}.`,
      `Your keepers take a step back here, though this year’s lineup gets better: ${b}.`,
      `A win-now swap where you part with keeper value, and in return ${b}.`,
      `Short-term gain, long-term cost: you lose some keeper value, but ${b}.`,
    ])
    const advice = stanceLine(a.stance, {
      now: (label) =>
        say('buy now', [
          `Since you’re ${label}, it may be worth it.`,
          `For a team that’s ${label}, this could make sense.`,
          `Being ${label}, you could easily justify it.`,
          `That lines up well with being ${label}.`,
        ]),
      later: (label) =>
        say('buy later', [
          `Since you’re ${label}, it’s probably not worth it.`,
          `For a team that’s ${label}, the cost is likely too high.`,
          `Being ${label}, you’d likely want to pass.`,
          `That runs against ${label}, so be cautious.`,
        ]),
      none: say('buy balanced', [
        'If you’re trying to win now, it may be worth considering.',
        'It could be worth it if this season is your priority.',
        'Worth a look if you’re chasing a title this year.',
        'If you’re pushing for the playoffs, you might take that deal.',
      ]),
    })
    notes.push(`${lead} ${advice}`)
  } else if (laterGain && nowLoss) {
    const h = hit(loss)
    const lead = say('later-gain now-loss', [
      `Good for your keepers, but it hurts you this season: ${h}.`,
      `You’re building for the future here, at a cost this year: ${h}.`,
      `Your keeper outlook improves, though this season’s lineup pays for it: ${h}.`,
      `A nice long-term move with a short-term sting: ${h}.`,
      `Next year looks brighter after this one, but for now ${h}.`,
      `You come away with more keeper value, but ${h}.`,
    ])
    const advice = stanceLine(a.stance, {
      now: (label) =>
        say('sell now', [
          `Since you’re ${label}, think twice.`,
          `For a team that’s ${label}, that’s a real concern.`,
          `Being ${label}, you may want to hold off.`,
          `That works against being ${label}.`,
        ]),
      later: (label, stance) =>
        say('sell later', [
          stance === 'sell' ? 'That fits selling for the future.' : 'That fits a rebuild.',
          stance === 'sell' ? 'Exactly the kind of move a seller makes.' : 'Just what a rebuild calls for.',
          `That’s right in line with ${stance === 'sell' ? 'a sell-off' : 'your rebuild'}.`,
          `A smart direction while you’re ${label}.`,
        ]),
      none: say('sell balanced', [
        'If you’re contending now, think twice.',
        'If this is your year to compete, weigh that carefully.',
        'Teams chasing a title right now should be cautious.',
        'Make sure you can afford the hit if you’re in the hunt.',
      ]),
    })
    notes.push(`${lead} ${advice}`)
  } else if (laterLoss && nowLoss) {
    const h = hit(loss)
    notes.push(
      say('loss both', [
        `This hurts you now and later: you give up keeper value and ${h}.`,
        `A tough one on both fronts: you lose keeper value, and ${h}.`,
        `You come out behind this season and next, since you part with keeper value and ${h}.`,
        `Hard to like this one: your keepers get weaker and ${h}.`,
      ]),
    )
  } else if (laterGain && nowGain) {
    const b = boost(gain)
    notes.push(
      say('gain both', [
        `Helps now and later: more keeper value, and ${b}.`,
        `A win on both fronts: you gain keeper value, and ${b}.`,
        `You get better today and tomorrow, with added keeper value, and ${b}.`,
        `Plenty to like here: your keepers improve and ${b}.`,
      ]),
    )
  } else if (nowGain) {
    const b = boost(gain)
    notes.push(
      say('now gain', [
        `Keeper value is about even, but it upgrades your lineup this season: ${b}.`,
        `Your keepers hold steady while this season’s lineup improves: ${b}.`,
        `Little changes long-term, but you get a boost right away: ${b}.`,
        `A solid win-now tweak that leaves your keeper value intact: ${b}.`,
      ]),
    )
  } else if (nowLoss) {
    const h = hit(loss)
    notes.push(
      say('now loss', [
        `Keeper value is about even, but it weakens your lineup this season: ${h}.`,
        `Your keepers hold steady, but this season takes a hit: ${h}.`,
        `Little changes long-term, yet you’re worse off right now: ${h}.`,
        `There’s no real keeper gain to make up for what you lose this year: ${h}.`,
      ]),
    )
  } else if (laterLoss) {
    notes.push(
      say('later loss', [
        'You give up keeper value without improving your lineup.',
        'You lose some keeper value, and your lineup doesn’t get any better for it.',
        'Your keepers take a hit here with no lineup upgrade to show for it.',
        'This costs you keeper value without helping this season.',
      ]),
    )
  } else if (laterGain) {
    notes.push(
      say('later gain', [
        'Adds keeper value without changing your lineup.',
        'A quiet boost to your keepers that leaves this season’s lineup alone.',
        'You pick up keeper value while your starters stay much the same.',
        'Better keepers and the same lineup make this a low-risk gain.',
      ]),
    )
  }

  const ks = keeperStates(a.sent, a.incoming, a.roster, a.players, a.s, a.firstPickYear, a.costs, a.picks)
  const byPlayer = (items: EvalItem[]) => new Map(items.flatMap((i) => (i.player ? [[i.player.id, i] as const] : [])))
  const beforeKeep = byPlayer(ks.before)
  const afterKeep = byPlayer(ks.after)
  const incomingIds = new Set(a.incoming.flatMap((x) => (x.t === 'p' ? [x.id] : [])))
  const pickBlocked = (i?: EvalItem) => i?.blocked === 'no-pick' || i?.blocked === 'pick-taken'

  // Keepers need a pick in their round, and keepers compete for it, so trades that move picks or
  // keepers can cost a team a keeper it had, or give it one it couldn't use.
  const pickNotes: string[] = []
  if (a.picks) {
    const sentPickRounds = new Set(a.sent.flatMap((x) => (x.t === 'k' && x.year === a.firstPickYear ? [x.round] : [])))
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
      const kept = nameList(names)
      const many = names.length > 1
      // Stepping by the notes so far keeps one side's rounds from being worded alike.
      const nth = pickNotes.length
      if (taker) {
        const t = taker.player!.name
        const options = [
          `${t} would use your round ${round} pick as a keeper, so ${kept} can no longer be kept with it.`,
          `Keeping ${t} would take your round ${round} pick, leaving no room to keep ${kept} there.`,
          `${t} claims your round ${round} keeper pick, which bumps ${kept} out.`,
          `Your round ${round} pick would go to ${t}, so you couldn’t use it on ${kept} anymore.`,
        ]
        pickNotes.push(say('pick taken', options, nth))
      } else if (sentPickRounds.has(round)) {
        const options = [
          `Trading away your round ${round} pick means you can no longer keep ${kept}.`,
          `Without the round ${round} pick you’re sending, keeping ${kept} is off the table.`,
          `Giving up your round ${round} pick also costs you the chance to keep ${kept}.`,
          `You need that round ${round} pick to keep ${kept}, and this deal sends it away.`,
        ]
        pickNotes.push(say('pick sent', options, nth))
      } else {
        const options = [
          `You’d be left without a round ${round} pick for ${kept}, so ${many ? 'they' : 'he'} can’t be kept.`,
          `This leaves no round ${round} pick for ${kept}, taking ${many ? 'them' : 'him'} out of your keeper plans.`,
          `With no round ${round} pick available, ${kept} would drop off your keeper list.`,
          `Your round ${round} pick would be gone, so keeping ${kept} wouldn’t be possible.`,
        ]
        pickNotes.push(say('pick missing', options, nth))
      }
    }
    for (const [round, names] of group((p) => pickBlocked(beforeKeep.get(p.id)) && !!afterKeep.get(p.id) && !afterKeep.get(p.id)!.blocked)) {
      // Keepers being sent away who were using this round's pick.
      const freed = [...beforeKeep.values()]
        .filter((i) => i.player && sentIds.has(i.player.id) && i.round === round && !i.blocked)
        .map((i) => i.player!.name)
      const kept = nameList(names)
      const nth = pickNotes.length
      if (gotPickRounds.has(round)) {
        const options = [
          `The round ${round} pick you’re getting lets you keep ${kept}, which you couldn’t before.`,
          `Picking up a round ${round} pick opens the door to keeping ${kept}.`,
          `Thanks to your new round ${round} pick, you can now keep ${kept}.`,
          `Bonus: the incoming round ${round} pick puts ${kept} back in play as a keeper.`,
        ]
        pickNotes.push(say('pick received', options, nth))
      } else if (freed.length) {
        const gone = nameList(freed)
        const options = [
          `Sending away ${gone}, who used your round ${round} pick, frees it up for ${kept}, which you couldn’t before.`,
          `Moving ${gone} opens up your round ${round} pick, so you can now keep ${kept}.`,
          `With ${gone} gone, your round ${round} pick is available to keep ${kept}.`,
          `Parting with ${gone} has a silver lining: your round ${round} pick can now go to ${kept}.`,
        ]
        pickNotes.push(say('pick freed', options, nth))
      } else {
        const options = [
          `${kept} can be kept with your round ${round} pick, which you couldn’t before.`,
          `Your round ${round} pick can now go toward keeping ${kept}.`,
          `This opens a path to keeping ${kept} in round ${round}.`,
          `You gain the option to keep ${kept} with your round ${round} pick.`,
        ]
        pickNotes.push(say('pick opened', options, nth))
      }
    }
  }

  // A player who can't be kept is only worth something this season, and only if he'd start.
  const why = (i: EvalItem): string => {
    const ahead = i.keptInstead ?? []
    const others = nameList(ahead)
    const many = ahead.length > 1
    if (i.blocked === 'no-pick') {
      return say('why no-pick', [
        `you have no round ${i.round} pick to keep him with`,
        `you don’t own a round ${i.round} pick to use on him`,
        `keeping him takes a round ${i.round} pick you don’t have`,
        `there’s no round ${i.round} pick of yours for him`,
      ])
    }
    if (i.blocked === 'pick-taken') {
      return say('why pick-taken', [
        `your round ${i.round} pick is already used on ${others}, ${many ? 'better keepers' : 'a better keeper'}`,
        `${others} ${many ? 'have' : 'has'} first claim on your round ${i.round} pick`,
        `your round ${i.round} pick is better spent on ${others}`,
        `${others} already ${many ? 'take' : 'takes'} your round ${i.round} pick`,
      ])
    }
    const reason = say(`why ${i.blocked}`, WHY[i.blocked!])
    return ahead.length ? `${reason}: ${others}` : reason
  }
  const rental = ks.after
    // K and D/ST are never keepers worth mentioning; the position-group note already covers them.
    .filter((i) => i.player && i.player.pos !== 'K' && i.player.pos !== 'DEF' && i.blocked && incomingIds.has(i.player.id))
    .sort((x, y) => strength(y.player!) - strength(x.player!))[0]
  const rentalNotes: string[] = []
  if (rental?.player && rental.blocked) {
    const starter = afterLineup.find((st) => st.player.id === rental.player!.id)
    const name = rental.player.name
    const reason = why(rental)
    if (starter) {
      const slot = slotLabel(a.slots[starter.slot]!)
      const options = [
        `${name} wouldn’t be a keeper for you (${reason}), so he’s a this-season rental: he’d start at ${slot}.`,
        `Think of ${name} as a one-season pickup who’d start at ${slot}, since you couldn’t keep him (${reason}).`,
        `${name} could start at ${slot} this season, but don’t count on keeping him (${reason}).`,
        `You’d get ${name} for this year only (${reason}), though he’d slot in at ${slot}.`,
      ]
      rentalNotes.push(say(`rental starter ${name}`, options))
    } else {
      const options = [
        `${name} wouldn’t be a keeper for you (${reason}), and he wouldn’t start for you either, so he adds little.`,
        `${name} doesn’t move the needle: you couldn’t keep him (${reason}), and he’d sit on your bench.`,
        `There’s not much here in ${name}, who’d neither start for you nor be kept (${reason}).`,
        `Expect little from ${name}, with no starting role this season and no keeper spot (${reason}).`,
      ]
      rentalNotes.push(say(`rental bench ${name}`, options))
    }
  }
  const qbNote = qbChange ? [qbSpotNote(qbChange)] : []
  return [
    // Outside the caps below, so it always shows when the result was adjusted.
    ...unevenNotes(a.trade),
    ...[...availabilityNotes(a), ...ageNotes(a)].slice(0, 3),
    // A newly emptied spot is the heaviest factor, so it leads; a filled one follows the main notes.
    ...[...(qbChange > 0 ? qbNote : []), ...pickNotes, ...notes, ...(qbChange < 0 ? qbNote : []), ...rentalNotes].slice(0, 3),
    // Also outside the caps, so giving up a good keeper is always pointed out.
    ...keeperLossNotes(a),
  ]
}
