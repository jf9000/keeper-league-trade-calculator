import { InfoDialog, Section, p } from './InfoDialog'

/** An (i) button beside the page title that opens a modal explaining how trades are valued and graded. */
export function InfoButton() {
  return (
    <InfoDialog label="How this is calculated" title="How trades are calculated">
      <Section title="Redraft value and keeper value">
        <p className={p}>
          Every player has two values, and the number you see is a blend of them. Each draft slot has a value that
          falls off steeply from pick 1, and both values are measured on that scale.
        </p>
        <p className={`${p} mt-2`}>
          <b className="text-tx">Redraft value</b> is what a player is worth this season, no matter what he costs to
          keep. <b className="text-tx">Keeper value</b> is his surplus: what he’s worth minus the draft slot he costs
          you, so a first-round talent kept in round 10 is a big win, while one kept in the round he’s worth adds
          nothing here. A player who costs more than he’s worth to keep has no keeper value but still has redraft
          value, so he’s never worth 0. Each player shows both values under his name. How much each one counts is set
          by the Rebuilding / Contending slider in the league settings: the closer to Contending it is, the more this
          season counts and the less keeper value does. Each team can also be marked contending or rebuilding.
        </p>

      </Section>
      <Section title="Current-season rankings">
        <p className={p}>
          A player’s worth isn’t just his preseason ADP. It also reflects how he has produced this season, in your
          league’s scoring and ranked against the other players at his position. So a breakout is valued like a top
          player at his position, and a bust like a late pick. Players who went undrafted but are producing are
          included. The footer shows how many weeks of production the data covers.
        </p>

      </Section>
      <Section title="Injuries and availability">
        <p className={p}>
          <b className="text-tx">Games missed.</b> Points per game only mean so much from a few games, so a player’s
          rate is scaled down for the games he has missed, measured against the weeks played so far (allowing for a
          bye). A player who has played 4 of 10 games is ranked as if he scored about 70% of his per-game rate, so a hot
          short stretch doesn’t outrank a full season. When someone in the trade has missed a lot of time, the notes
          under the grade say so.
        </p>
        <p className={`${p} mt-2`}>
          <b className="text-tx">Current injuries.</b> A player listed on injured reserve, PUP, out, suspended,
          doubtful or questionable keeps only part of his value for this season: about a quarter on IR, 60% when out,
          and 95% when questionable. That lowers his redraft value and his place in the lineup. His keeper value looks
          to next season, so it isn’t changed. Injury designations come from Sleeper with the weekly data refresh, so
          they can be out of date on game day. Always check a player’s current status before agreeing to a trade.
        </p>
      </Section>
      <Section title="Age">
        <p className={p}>
          Keeper value looks ahead, so age matters: an older player is worth less to keep. Running backs start losing
          value at 27 (8% per year), wide receivers and tight ends at 30 (7% per year), and quarterbacks at 35 (6% per
          year), each down to a floor of about a third to 40% of their value. A 31-year-old back keeps about 60% of
          his keeper value; a 31-year-old receiver about 86%. Age doesn’t change what a player is worth this season,
          only what he’s worth to keep. Ages come from Sleeper with the weekly data refresh, and when a trade involves
          an older player the notes under the grade say so.
        </p>
      </Section>
      <Section title="What a keeper costs">
        <p className={p}>
          <b className="text-tx">With a league selected</b>, the cost is the round the player was actually drafted in
          your league’s draft (players nobody drafted cost the last round). ADP isn’t used to guess costs at all.
          <br />
          <b className="text-tx">Without a league</b>, costs are estimated from ADP. That’s why the results are rougher.
          Either way, you can change any player’s keeper round in the trade.
        </p>

      </Section>
      <Section title="Keepers need a draft pick">
        <p className={p}>
          With a league selected, keeping a player costs a pick in the round he was drafted in, so a team can only keep
          him if it owns that pick. Two keepers from the same round compete for one pick, and the better one gets it;
          the other counts for only a fraction of its value. That works both ways in a trade. A player you receive is
          only worth full keeper value if you have a pick in his round that a better keeper isn’t already using. And
          a draft pick is worth more than its slot if a keeper on your roster depends on it, or if it would let you
          keep someone you can’t keep now. The notes under the grade call these out by name.
        </p>

      </Section>
      <Section title="How league rosters are used">
        <p className={p}>
          Pick a roster for either team and its whole roster is taken into account, not just the players in the trade.
          Keeper limits and the one-QB rule apply to everyone a team could keep, so a player is worth what he adds to
          (or takes from) that team’s keepers.
        </p>
        <p className={`${p} mt-2`}>
          <b className="text-tx">Players who can’t be kept are worth less.</b> A second QB when you already have a
          better QB to keep, or any keeper beyond your limit, counts for little or nothing as a keeper. That’s the
          long-term view. They can still help you win now, though: a player who can’t be kept but would crack your
          starting lineup (a second QB in a superflex league, say) adds real value this season, and the trade
          result counts it. Players not in the trade keep their draft-round cost. Rostered players missing from the
          player data can’t be valued, and the team column tells you how many.
        </p>

      </Section>
      <Section title="Roster needs">
        <p className={p}>
          Each trade is also measured against the best starting lineup each team can field, using your league’s own
          lineup slots (QB, RB, WR, TE, K, D/ST) plus the flex and superflex spots from the settings, with each
          player’s redraft value as his strength. With a roster selected, a team’s redraft side of the trade is what
          it does to that lineup, so a player who would start for you is worth more to you than the same player is to
          a team that’s already deep at his position. Without a roster, each player counts at his own redraft value.
        </p>
        <p className={`${p} mt-2`}>
          Kickers and D/ST can be traded too. They’re drafted so late that they’re worth almost nothing as keepers,
          so they only matter for needs, and only when your league starts one: a team with no kicker gains from
          getting one, while a team that already has a good one doesn’t. Because a replacement is always on the
          waiver wire, their lineup weight is kept small.
        </p>
        <p className={`${p} mt-2`}>
          Under the result bar, each team gets notes based on its own roster: where its positions rank in the league
          (weak, strong, or in between) and how the trade changes them. A trade that’s a loser long-term can still
          be worth a look if you need to win now. One that’s great for your keepers can leave you thin at a position
          you can’t afford to be.
        </p>

      </Section>
      <Section title="Draft picks">
        <p className={p}>
          A pick is worth the value of the middle of its round. Picks more than one draft away are discounted 15%.
          With a league selected you can only trade picks you own, including ones you acquired.
        </p>

      </Section>
      <Section title="Grades">
        <p className={p}>
          Each team is graded on what it receives versus what it gives up, counting both keeper value and (with a
          league selected) lineup impact. Within 10% is a fair trade and gets a B.
          Beyond that, the grade steps with how lopsided the ratio is: A-, A and A+ for the winner, B- down to F for
          the loser. A 4:1 trade is an A+ for one side and about a D- for the other.
        </p>

      </Section>
      <Section title="Limits">
        <p className={p}>
          This is a rough guide. Injury designations are only as fresh as the last weekly refresh, and it doesn’t
          know league-specific keeper rules such as round penalties. Use the keeper-round selector to adjust for those.
        </p>
      </Section>
    </InfoDialog>
  )
}
