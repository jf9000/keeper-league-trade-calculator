export type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF'
export type Scoring = 'ppr' | 'half' | 'std'

export interface Player {
  /** Sleeper ID when matched, otherwise a name slug. Stable key for trade assets. */
  id: string
  sleeperId: string | null
  name: string
  pos: Pos
  team: string
  /** ADP in the standard 1QB format. */
  adp: number
  /** ADP in a superflex / 2QB format, when known. */
  sfAdp: number | null
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
}

export type Asset =
  | { t: 'p'; id: string; keeperRound: number }
  | { t: 'k'; year: number; round: number }
