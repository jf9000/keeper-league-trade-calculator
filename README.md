# Keeper League Trade Calculator

A free trade calculator for fantasy football keeper leagues. Connect a Sleeper league to load its settings,
rosters, draft picks and keeper costs, or enter them manually. Player values come from ADP
(MyFantasyLeague, Fantasy Football Calculator) and current-season production (Sleeper stats).

## Data sources

- **Sleeper**: your league, rosters, traded picks and draft results (live, read-only), plus the player list and
  weekly stats used to build `players.json`.
- **MyFantasyLeague** and **Fantasy Football Calculator**: ADP, fetched offline at build time.

No API keys or accounts are needed. Not affiliated with or endorsed by any of them.

## Development

```bash
npm install
npm run dev            # start the app (http://localhost:5173)
npm test               # unit tests
npm run build          # typecheck + production build
npm run build-players  # regenerate public/players.json
```

## Layout

| Path | What it does |
| --- | --- |
| `src/lib/valuation.ts` | Pure valuation logic: ADP adjustments, pick curve, keeper surplus, roster-aware trade evaluation, letter grades |
| `src/lib/current.ts` | Ranks players by this season's production and maps each rank onto ADP slots |
| `src/lib/sleeper.ts` | Sleeper API client (user, leagues, rosters) and league → settings mapping |
| `src/screens/LeagueSetup.tsx` | Sleeper username → league picker, with a **Skip: use manual mode** button |
| `src/screens/Calculator.tsx` | Team dropdowns, trade columns, sticky result bar with grades |
| `scripts/build-players.ts` | Builds `public/players.json` with ADP and Sleeper IDs |
| `scripts/adp.ts`, `scripts/stats.ts`, `scripts/http.ts` | Tested parsing helpers (ADP, season stats) and the allowlisted HTTP client the script uses |

## Teams and grading

- Team 1 defaults to your roster (the Sleeper user from the setup screen); Team 2 defaults to a generic "Team 2".
  Either dropdown can pick any roster in the loaded league. Rosters are fetched live on every load.
- With a roster selected, that team can only send players on its roster, and values account for the whole
  roster: keeper limits and the one-QB rule apply to everything the team could keep, so a player is worth what he
  adds to (or takes from) that team's keepers.
- **Redraft value vs. keeper value.** Every asset's value blends two things, in the proportion set by the **Redraft
  weight (%)** setting (`redraftWeight`, 65 by default, under a collapsed **Additional settings** section, which also holds Keep only 1 QB, with its own
  info modal): **redraft value** (what a player is worth this season, whatever he
  costs to keep) and **keeper value** (his surplus: keeper worth minus the cost of the slot he's kept in, subject to
  the keeper limit, one-QB rule and pick rules below). A player who costs more than he's worth to keep has no keeper
  value but still has redraft value, so he's never worth 0. Draft picks are for the future, so they only carry the
  keeper share (`itemValue`, `evalTeam`). Each player row shows both values.
- **Contending / rebuilding.** Each side of the trade has a toggle (both off by default). Contending adds
  `STANCE_SHIFT` (25) points to that team's redraft weight and rebuilding subtracts 25, clamped to 0-100
  (`weightFor`, `settingsFor`, `evalTrade`). It applies only to that team's own valuation, so a contender and a
  rebuilder can both come out ahead on one trade, and the grade notes change with it (`stance` in `teamNotes`).
- **League list** (`LeagueSetup`) shows only keeper leagues (`isKeeperLeague`: Sleeper `settings.type === 1`); redraft
  and dynasty leagues are hidden, with a note saying how many.
- **Current-season rankings** (`src/lib/current.ts`). Players' production this season (fantasy points per game in
  the league's scoring, from `players.json`) is ranked within each position, and the n-th best producer takes the ADP
  slot of the n-th best player at that position. That puts production on the ADP scale, including how the market
  values each position (superflex QBs, scoring format), so the two blend: production gets up to 70% of redraft worth
  and 40% of keeper worth (`CURRENT_WEIGHT_REDRAFT`, `CURRENT_WEIGHT_KEEPER`), ramping up over a player's first 8
  games (`GAMES_FOR_FULL_WEIGHT`) and needing at least 4 (`MIN_GAMES`) to be ranked. Without stats (offseason, or the
  stats fetch failed) values fall back to preseason ADP alone.
- **Keeper cost comes from the league's own draft** when a league is loaded: the round each player was drafted in
  (Sleeper's longest completed draft of 10+ rounds; undrafted players cost the last round). ADP is only used to
  estimate costs when no league is selected or the league has no completed draft. The draft round is what a player
  costs; ADP and production are what he's worth. A yellow banner shows in manual mode, and the (i) next to the title
  opens a modal explaining all of this.
- **Keepers need a draft pick.** A keeper costs a pick in the round he was drafted in, so he can only be kept if the
  team owns one (Sleeper's `traded_picks` decide who owns what in the upcoming draft; everyone starts with their own
  pick in every round). Keepers in the same round compete for that pick, so the best affordable combination is chosen
  (within the keeper limit and the one-QB rule) and the rest keep only 25% of their value. Trading a pick therefore
  costs any keeper you could no longer use it on, and receiving one credits any keeper it unlocks, on top of the
  pick's own value. Only picks in the next draft decide who can be kept; later years are valued as picks. With a
  league loaded, each team's pick search lists only the picks it owns. If Sleeper can't report pick ownership,
  this is skipped. Leagues with round-bumping rules aren't modeled (change a player's keeper round by hand).
- **Roster needs:** with a league loaded, each trade is also measured on the best starting lineup each team can
  field (`src/lib/lineup.ts`). Position slots, including **K and D/ST**, come from the league's `roster_positions`
  (a typical QB/RB/RB/WR/WR/TE lineup if Sleeper doesn't provide it); the **Flex spots** setting and the Superflex
  toggle supply the flex slots, so editing them changes the result (Sleeper import fills in the flex count). A
  player's strength is his redraft worth (below). K and D/ST are drafted so late that raw ADP makes them look
  worthless, so their strength is measured from where those rounds start and scaled down (`KD_ADP_OFFSET`,
  `KD_STRENGTH_SCALE`); they are worth almost nothing as keepers and only matter for needs when the league starts
  one. With a roster, a team's redraft side of a trade is the change in its best lineup, so a player who can't be
  kept but would start still has this-season value, and a player at a position a team is stacked at adds little.
  With no roster, each player counts at his own redraft worth.
- **Grade notes** (`src/lib/notes.ts`) show under the result bar (up to three per team). They're built from each
  team's own roster: which keepers a trade costs or unlocks through picks ("Trading away your round 5 pick means you
  can no longer keep X"), keeper value vs. lineup change, and where its position groups rank in the league, so they
  differ by team (e.g. "a losing
  trade long-term, but it moves your RB group from 12th to 1st; if you're trying to win now, consider it", or "a
  second QB wouldn't be a keeper, but he'd start at SUPERFLEX, so he's a this-season rental").
- Each team gets a grade from what it receives vs. gives up: **B is a fair trade** (within 10%), then A-/A/A+ for
  winning and B-/C+ … D-/F for losing, stepping with the log of the ratio. Thresholds live in `gradeFor`.
- Rostered players missing from `players.json` (no ADP) aren't valued; the column says how many.

## players.json

`npm run build-players -- [--season 2026] [--teams 12] [--source mfl|ffc] [--refresh]`

ADP sources, tried in order (first with 100+ players wins):

1. **MyFantasyLeague** public ADP export: documented API, no key, real redraft PPR drafts, current season.
2. Fantasy Football Calculator, this season.
3. Fantasy Football Calculator, previous season.

Sleeper IDs come from Sleeper's player database, matched by normalized name + position. Unmatched players keep a
slug ID and `sleeperId: null`. The list includes kickers and team defenses (position `DEF`); a defense's ID is its
team abbreviation, which is how Sleeper identifies it on rosters.

**Current-season production** comes from Sleeper's weekly stats (`/v1/stats/nfl/regular/<season>/<week>`, an unofficial
but public endpoint on the same allowlisted host), one request per completed week, summed into season totals for PPR,
half-PPR and standard (`scripts/stats.ts`). A week only counts once at least 200 players have scored, so a game week
in progress is skipped. `statsThrough` in the file says how many weeks are in. Players nobody drafted who are
producing at 6+ points per game over 4+ games are added with a placeholder ADP (`UNDRAFTED_ADP`) so waiver
pickups can be traded and valued. If the stats can't be fetched the build carries on with ADP alone.

**Superflex ADP** comes from FFC's 2QB drafts for the same season. Those cover only part of the board, so QBs they
miss are estimated from the QBs that have both numbers. If there are no same-season superflex drafts, QB ADP is
estimated from the previous season's. `sfSource` in the file says which, and the app footer flags estimates.

### Safety

- Requests go through an HTTPS-only **allowlist** of three hosts (MFL, FFC, Sleeper), with no redirects, a generic
  user-agent (no personal info), timeouts, response-size caps, and bounded retries that honor `Retry-After`.
- Responses are parsed as data only, validated (counts, positions, plausible ADP, no duplicates) and the file is
  written atomically. A failed validation leaves the existing `players.json` untouched.
- Sleeper's ~10 MB player dump is cached in `.cache/` for 24 hours (they ask for at most one fetch a day).
- **The app never calls MFL from the browser**: their terms forbid browser-side use from other domains. The script
  fetches offline and ships static JSON. The script also doesn't use MFL's `DETAILS` option, which would return
  other users' league data.
- No API keys or accounts are needed anywhere.
