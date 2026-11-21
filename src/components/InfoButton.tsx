import { faCircleInfo } from '@fortawesome/free-solid-svg-icons/faCircleInfo'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useRef } from 'react'

const h3 = 'mt-4 mb-1 text-sm font-semibold'
const p = 'm-0 text-[13px] leading-relaxed text-mut'

/** An (i) button beside the page title that opens a modal explaining how trades are valued and graded. */
export function InfoButton() {
  const dialog = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        type="button"
        aria-label="How this is calculated"
        title="How this is calculated"
        className="!inline-flex !h-6 !w-6 shrink-0 items-center justify-center !rounded-full !border-0 !bg-transparent !p-0 text-mut hover:text-ac"
        onClick={() => dialog.current?.showModal()}
      >
        <FontAwesomeIcon icon={faCircleInfo} size="lg" aria-hidden="true" />
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="how-it-works-title"
        className="m-auto max-h-[85vh] w-[min(640px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-bd bg-card p-0 text-tx backdrop:bg-black/50"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close()
        }}
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 id="how-it-works-title" className="m-0 text-lg font-bold">
              How trades are calculated
            </h2>
            <button type="button" aria-label="Close" className="shrink-0 !px-2 !py-0.5" onClick={() => dialog.current?.close()}>
              ✕
            </button>
          </div>

          <h3 className={h3}>What a player is worth</h3>
          <p className={p}>
            ADP (average draft position) says how highly the market values a player, and each draft slot has a value that
            falls off steeply from pick 1. A kept player’s value is his surplus: what he’s worth at his ADP minus what the
            draft slot he costs you is worth. A first-round talent kept in round 10 is a big win; one kept in the round
            he’s worth is worth nothing extra.
          </p>

          <h3 className={h3}>What a keeper costs</h3>
          <p className={p}>
            <b className="text-tx">With a league selected</b>, the cost is the round the player was actually drafted in
            your league’s draft (players nobody drafted cost the last round). ADP isn’t used to guess costs at all.
            <br />
            <b className="text-tx">Without a league</b>, costs are estimated from ADP. That’s why the results are rougher.
            Either way, you can change any player’s keeper round in the trade.
          </p>

          <h3 className={h3}>Keepers need a draft pick</h3>
          <p className={p}>
            With a league selected, keeping a player costs a pick in the round he was drafted in, so a team can only keep
            him if it owns that pick. Two keepers from the same round compete for one pick, and the better one gets it;
            the other counts for only a fraction of its value. That works both ways in a trade. A player you receive is
            only worth full keeper value if you have a pick in his round that a better keeper isn’t already using. And
            a draft pick is worth more than its slot if a keeper on your roster depends on it, or if it would let you
            keep someone you can’t keep now. The notes under the grade call these out by name.
          </p>

          <h3 className={h3}>How league rosters are used</h3>
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
            result counts it. Players not in the trade keep their draft-round cost. Rostered players with no ADP data
            can’t be valued, and the team column tells you how many.
          </p>

          <h3 className={h3}>Roster needs</h3>
          <p className={p}>
            Each trade is also measured against the best starting lineup each team can field, using your league’s own
            lineup slots (QB, RB, WR, TE, K, D/ST) plus the flex and superflex spots from the settings, and ADP as a
            stand-in for strength. A player who would start for you is worth more to you than the same player is to a
            team that’s already deep at his position. About half of that lineup change counts toward the grade, next to
            the long-term keeper value.
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
            you can’t afford to be. ADP is a preseason number, so late in the season a player’s current form may differ
            from his rank.
          </p>

          <h3 className={h3}>Draft picks</h3>
          <p className={p}>
            A pick is worth the value of the middle of its round. Picks more than one draft away are discounted 15%.
            With a league selected you can only trade picks you own, including ones you acquired.
          </p>

          <h3 className={h3}>Grades</h3>
          <p className={p}>
            Each team is graded on what it receives versus what it gives up, counting both keeper value and (with a
            league selected) lineup impact. Within 10% is a fair trade and gets a B.
            Beyond that, the grade steps with how lopsided the ratio is: A-, A and A+ for the winner, B- down to F for
            the loser. A 4:1 trade is an A+ for one side and about a D- for the other.
          </p>

          <h3 className={h3}>Limits</h3>
          <p className={p}>
            This is a rough guide. It doesn’t know your team’s positional needs, injuries, or league-specific keeper
            rules such as round penalties. Use the keeper-round selector to adjust for those.
          </p>
        </div>
      </dialog>
    </>
  )
}
