import { CURRENT_WEIGHT_KEEPER, CURRENT_WEIGHT_REDRAFT, DEFAULT_SETTINGS, GAMES_FOR_FULL_WEIGHT, STANCE_SHIFT } from '../lib/valuation'
import { InfoDialog, Section, p } from './InfoDialog'

const pct = (n: number) => `${Math.round(n * 100)}%`

/** A small (i) beside the Rebuilding / Contending slider that explains what it changes. */
export function WinNowInfo() {
  return (
    <InfoDialog small label="How the Rebuilding / Contending slider works" title="Rebuilding / Contending">
      <p className={`${p} mt-3`}>
        This slider tells the calculator whether you’re <b className="text-tx">contending</b> (winning this season) or{' '}
        <b className="text-tx">rebuilding</b> (building for next year’s keepers). Slide it toward Contending and trades are
        judged on who helps you win now. Slide it toward Rebuilding and they’re judged on who holds more keeper value for
        the seasons to come. It’s used
        everywhere in the app: trade grades, the trade finder, the keeper board and the power rankings.
      </p>

      <Section title="The two things it weighs">
        <p className={p}>
          <b className="text-tx">This season.</b> What a player is worth to you right now, whatever he costs to keep.
          Each draft slot has a value that falls off steeply from pick 1, and a player is worth the slot he’s ranked at.
          That rank blends his preseason ADP with how he has produced this season: points per game in your scoring,
          scaled down for games missed, ranked within his position and mapped onto the ADP slots. Production counts for
          up to {pct(CURRENT_WEIGHT_REDRAFT)} of the rank, building over a player’s first {GAMES_FOR_FULL_WEIGHT} games.
          Injuries lower it too.
        </p>
        <p className={`${p} mt-2`}>
          <b className="text-tx">Next year’s keepers.</b> His surplus: what he’s worth next season minus the draft slot
          he costs you. It uses the same blend, but production counts for up to {pct(CURRENT_WEIGHT_KEEPER)}, since
          preseason ADP says more about next year’s draft. It’s 0 when he costs more than he’s worth, and it’s reduced
          when he can’t be kept: over the keeper limit, a second QB, or no pick in his round.
        </p>
      </Section>

      <Section title="What the slider does">
        <p className={p}>
          The slider’s number is the share of a trade’s value that comes from this season. The rest comes from keepers.
        </p>
        <p className={`${p} mt-2`}>
          <b className="text-tx">Value = win-now × this season + (1 − win-now) × keepers</b>
        </p>
        <p className={`${p} mt-2`}>
          At <b className="text-tx">0%</b> only keepers count, so a player who costs more than he’s worth to keep is
          worth nothing. At <b className="text-tx">100%</b> only this season counts, so keeper costs are ignored. At 50%
          each counts for half. For example, a player worth 80 this season with 20 of keeper value comes out at 20 with
          the slider at 0%, 50 at 50%, and 80 at 100%.
        </p>
        <p className={`${p} mt-2`}>
          Draft picks are for the future, so they only carry the keeper share: a pick is worth its slot’s value times
          (1 − win-now).
        </p>
      </Section>

      <Section title="With a roster selected">
        <p className={p}>
          “This season” is what the trade does to the team’s best starting lineup, using your league’s lineup slots. A
          player who would start counts for more than one who would sit behind better players at his position.
        </p>
      </Section>

      <Section title="Contending and rebuilding">
        <p className={p}>
          Each side of a trade has a Contending / Rebuilding toggle that nudges the slider for that team. Contending
          pushes it {STANCE_SHIFT} points toward winning now, and rebuilding pushes it {STANCE_SHIFT} points toward the
          future, staying between 0% and 100%. With the slider at {DEFAULT_SETTINGS.redraftWeight}%, a contending team
          uses {Math.min(100, DEFAULT_SETTINGS.redraftWeight + STANCE_SHIFT)}% and a rebuilding team{' '}
          {Math.max(0, DEFAULT_SETTINGS.redraftWeight - STANCE_SHIFT)}%. Leave both off to use the slider as is. The
          nudge only affects that team’s own valuation, so a contender and a rebuilder can both come out ahead on the
          same trade, and the notes under each grade reflect the team’s outlook.
        </p>
      </Section>

      <Section title="Where to put it">
        <p className={p}>
          The default is {DEFAULT_SETTINGS.redraftWeight}%. If you’re in the hunt and want every trade judged on who helps
          you win this year, push it up. If you’re out of it and stocking up on cheap keepers, pull it down. Because it
          affects the finder, keeper board and rankings too, set it once for how you’re approaching the season.
        </p>
      </Section>
    </InfoDialog>
  )
}
