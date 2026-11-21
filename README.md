# Keeper League Trade Calculator

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
| `src/lib/sleeper.ts` | Sleeper API client (user, leagues, rosters) and league → settings mapping |
| `src/screens/LeagueSetup.tsx` | Sleeper username → league picker, with a **Skip: use manual mode** button |
| `src/screens/Calculator.tsx` | Team dropdowns, trade columns, sticky result bar with grades |
| `scripts/build-players.ts` | Builds `public/players.json` with ADP and Sleeper IDs |
| `scripts/adp.ts`, `scripts/http.ts` | Tested parsing helpers and the allowlisted HTTP client the script uses |

## Teams and grading

- Team 1 defaults to your roster (the Sleeper user from the setup screen); Team 2 defaults to a generic "Team 2".
  Either dropdown can pick any roster in the loaded league. Rosters are fetched live on every load.
- With a roster selected, that team can only send players on its roster, and values account for the whole
  roster: keeper limits and the one-QB rule apply to everything the team could keep, so a player is worth what he
  adds to (or takes from) that team's keepers.
- **Keeper cost comes from the league's own draft** when a league is loaded: the round each player was drafted in
  (Sleeper's longest completed draft of 10+ rounds; undrafted players cost the last round). ADP is only used to
  estimate costs when no league is selected or the league has no completed draft. ADP is still what a player is
  worth; the draft round is what he costs. A yellow banner shows in manual mode, and the (i) next to the title
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
  toggle supply the flex slots, so editing them changes the result (Sleeper import fills in the flex count). ADP is
  the measure of strength. K and D/ST are drafted so late that raw ADP makes them look worthless, so their lineup
  strength is measured from where those rounds start and scaled down (`KD_ADP_OFFSET`, `KD_STRENGTH_SCALE`); they
  are worth almost nothing as keepers and only matter for needs when the league starts one. Half of the lineup change (`WIN_NOW_WEIGHT`) is added to the
  long-term keeper value, so a player who can't be kept but would start still has this-season value, and a player at a
  position a team is stacked at adds little.
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
