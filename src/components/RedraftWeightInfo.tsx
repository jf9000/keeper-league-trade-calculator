import { CURRENT_WEIGHT_KEEPER, CURRENT_WEIGHT_REDRAFT, DEFAULT_SETTINGS, GAMES_FOR_FULL_WEIGHT, STANCE_SHIFT } from '../lib/valuation'
import { InfoDialog, h3, p } from './InfoDialog'

const pct = (n: number) => `${Math.round(n * 100)}%`

/** A small (i) beside the Redraft weight field that explains how that setting changes a trade's value. */
export function RedraftWeightInfo() {
  return (
    <InfoDialog small label="How the redraft weight works" title="Redraft weight">
      <p className={`${p} mt-3`}>
        Every player has two values, and the value you see is a blend of them. This setting is how much of that blend
        comes from this season.
      </p>

      <h3 className={h3}>The blend</h3>
      <p className={p}>
        <b className="text-tx">Value = weight × redraft value + (1 − weight) × keeper value</b>
      </p>
      <p className={`${p} mt-2`}>
        The <b className="text-tx">weight</b> is this setting written as a fraction: 50% is 0.5. So (1 − weight) is
        what’s left over, the keeper share, and the two shares always add up to 100%. At 50% each counts for half; at
        80% redraft value counts for 0.8 and keeper value for 0.2.
      </p>
      <p className={`${p} mt-2`}>
        A player worth 80 this season with 20 of keeper value comes out at 20 with a 0% weight, 50 at 50%, and 80 at
        100%. Draft picks are for the future, so they only carry the keeper share: a pick is worth its slot’s value
        times (1 − weight).
      </p>

      <h3 className={h3}>Redraft value</h3>
      <p className={p}>
        What a player is worth for this season, no matter what he costs to keep. Each draft slot has a value that
        falls off steeply from pick 1, and a player is worth the slot he’s ranked at. That rank blends his preseason
        ADP with how he has produced this season: his points per game, in your scoring, ranked within his position and
        mapped onto the ADP slots. Production counts for up to {pct(CURRENT_WEIGHT_REDRAFT)} of it, scaling in over a
        player’s first {GAMES_FOR_FULL_WEIGHT} games.
      </p>

      <h3 className={h3}>Keeper value</h3>
      <p className={p}>
        His surplus: what he’s worth for next season minus the draft slot he costs you. That’s the same blend of ADP
        and production, but production counts for up to {pct(CURRENT_WEIGHT_KEEPER)}, since preseason ADP says more
        about next year’s draft. It’s 0 when he costs more than he’s worth, and it’s reduced when he can’t be kept:
        over the keeper limit, a second QB, or no pick in his round.
      </p>

      <h3 className={h3}>With a roster selected</h3>
      <p className={p}>
        Redraft value is what the trade does to the team’s best starting lineup, using your league’s lineup slots. A
        player who would start counts for more than one who would sit behind better players at his position.
      </p>

      <h3 className={h3}>Contending and rebuilding</h3>
      <p className={p}>
        Each side of the trade has a Contending / Rebuilding toggle. Contending adds {STANCE_SHIFT} points to that
        team’s weight, and rebuilding subtracts {STANCE_SHIFT}, always staying between 0% and 100%. With the setting
        at {DEFAULT_SETTINGS.redraftWeight}%, a contending team uses{' '}
        {Math.min(100, DEFAULT_SETTINGS.redraftWeight + STANCE_SHIFT)}% and a rebuilding one{' '}
        {Math.max(0, DEFAULT_SETTINGS.redraftWeight - STANCE_SHIFT)}%. Leave both off
        to use the setting as is. The shift applies only to that team’s own valuation, so a contender and a rebuilder
        can each come out ahead on the same trade, and the notes under each grade reflect the team’s outlook.
      </p>

      <h3 className={h3}>What to set it to</h3>
      <p className={p}>
        The default is {DEFAULT_SETTINGS.redraftWeight}%. Raise it when you’re contending this season, so trades are judged on who helps you win now.
        Lower it when you’re building for next year’s keepers. At 0% only keeper value counts, so a player who costs
        more than he’s worth to keep is worth nothing.
      </p>
    </InfoDialog>
  )
}
