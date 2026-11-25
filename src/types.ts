export type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF'
export type Scoring = 'ppr' | 'half' | 'std'
/** A player's current injury designation (Sleeper's injury_status, simplified). Absent when healthy. */
export type Injury = 'IR' | 'PUP' | 'Out' | 'Susp' | 'Doubtful' | 'Questionable'

/** A player's fantasy points so far this season, as season totals in each scoring format. */
export interface PlayerStats {
  gp: number
  ppr: number
  half: number
  std: number
}

export interface Player {
  /** Sleeper ID when matched, otherwise a name slug. Stable key for trade assets. */
  id: string
  sleeperId: string | null
  name: string
  pos: Pos
  team: string
  /** ADP in the standard 1QB format. Players nobody drafted carry a late placeholder (UNDRAFTED_ADP). */
  adp: number
  /** ADP in a superflex / 2QB format, when known. */
  sfAdp: number | null
  /** Current-season production, when the data build could fetch it. */
  stats?: PlayerStats
  /** Age in years as of the last data refresh, when known. Only keeper value uses it. */
  age?: number
  /** Injury designation as of the last data refresh; only recorded while the season is in progress. */
  inj?: Injury
  /** Not in players.json: fantasy weeks left in the season, stamped on injured players at load (see `withWeeksLeft`). */
  weeksLeft?: number
  /** Not in players.json: the ADP-equivalent of his current-season rank at his position, set at runtime. */
  curAdp?: number
}

export interface PlayersFile {
  generatedAt: string
  season: number
  source: string
  /**
   * Where superflex ADP came from: "ffc-2qb:<season>" (real drafts), "estimated:<season>"
   * (QB ADP remapped from a past season's superflex drafts), or "none".
   */
  sfSource?: string
  /** The last full week of current-season stats included in `stats`, if any. */
  statsThrough?: number
  /** Each team's bye week this season, by team code, when the schedule was available. */
  byes?: Record<string, number>
  players: Player[]
}

export interface Settings {
  teams: number
  keepers: number
  rounds: number
  scoring: Scoring
  superflex: boolean
  /** Only one QB may be kept. */
  oneQb: boolean
  /** Starting spots any of RB/WR/TE can fill. */
  flex: number
  /**
   * Percent (0–100) of a trade's value that comes from this season (redraft) rather than keeper value,
   * before a team's contending / rebuilding stance. Fixed at 65 (balanced); there's no control for it.
   */
  redraftWeight: number
}

export type Asset =
  | { t: 'p'; id: string; keeperRound: number }
  | { t: 'k'; year: number; round: number }
