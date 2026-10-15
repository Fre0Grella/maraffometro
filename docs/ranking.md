# How the ranking works

Maraffometro ranks players with a **Bayesian Bradley–Terry model fitted on the
whole history**, recomputed every time a match is recorded or voided. This page
explains why, and what every number in `backend/src/rating/` does.

## What it had to do

1. **Rate individuals from 2v2 results.** Nobody plays alone; a win belongs to a pair.
2. **Not reward volume.** Playing more must not, by itself, push anyone up.
3. **Show skill even with very lopsided game counts.** Someone with 6 sets and
   someone with 200 should both get a fair number, the first just a less certain one.
4. **Use what a Maraffa result says:** sets of 31/41/51, matches of several sets,
   margins of victory.

## The options

| System | Teams | Volume bias | Lopsided counts | Notes |
| --- | --- | --- | --- | --- |
| **Elo** (chess) | Only by averaging partners | None in the rating, but early games swing wildly and order matters | Poor: a newcomer's 3 lucky wins move them as much as 3 games move a veteran (fixed K) | Simple, but blind to who carried whom |
| **Glicko-2** (Glickman) | No native support | Leaderboards sorted by `r − 2·RD` reward volume | Good uncertainty model | 1v1 by design |
| **TrueSkill** (Microsoft, Xbox Live) / **OpenSkill** (Weng–Lin) | Native | The usual leaderboard, `μ − 3σ`, *strongly* rewards volume: σ only shrinks by playing | Good | Online updates: results are processed once, in order |
| **Bradley–Terry, batch** (Bradley & Terry 1952; Coulom's *Whole-History Rating*, 2008) | Native (team strength = sum of players) | None | Excellent: every result informs every rating, through partners and opponents | Needs a refit per write, which a small group can afford |

The online systems (Elo, Glicko, TrueSkill) process each game once, when it
happens. If you beat a newcomer who later turns out to be the best player in the
group, that win stays cheap forever. With a group that plays the same handful of
people every day, a batch fit is strictly more informative, and with tens of
players and thousands of sets it takes milliseconds.

## The model

Each player *i* has a hidden strength θᵢ. A pair's strength is the sum of its
players'. The probability that pair A beats pair B is

    P(A wins) = σ(θA1 + θA2 − θB1 − θB2),   σ(x) = 1 / (1 + e^−x)

Ratings are the **maximum a posteriori** estimate under a Gaussian prior
θ ~ N(0, τ²), found with Newton's method (the objective is strictly concave, so
there is exactly one answer and it doesn't depend on the order of the games). The
uncertainty shown as "±" is the posterior standard deviation (Laplace
approximation).

**Why the prior doesn't reward volume:** it pulls a player with little evidence
toward the *average*, not down. A newcomer who won their first three sets starts
a little above 1500, not at the top; one who lost them starts a little below,
not at the bottom. As results pile up, the prior matters less and the rating
moves to where the results say, up *or* down. Playing many games at a 50% rate
keeps you at 1500 however many you play (there's a test for exactly that).

**Provisional players** (fewer than 8 finished sets) are listed separately, "in
rodaggio", without a rank number, so two lucky sets are not read as a verdict.
They aren't hidden or penalised.

## The weights

Each finished set is one observation, with a weight. Each decided match adds one
more, lighter observation.

| Factor | Value | Why |
| --- | --- | --- |
| **Margin** | `1 + 0.5·ln(1 + 4·m)`, m = point difference / target, capped at 1 | A bigger win says more, with diminishing returns, the shape of FiveThirtyEight's log-of-margin multiplier. A 42–40 win counts ≈1.0, 41–20 ≈1.55, 44–0 ≈1.8. Normalising by the target makes 31–15 and 41–20 equivalent. |
| **Set length** | 31 → 0.85, 41 → 1.0, 51 → 1.15 | Longer sets have more hands, so less of the result is down to the deal. |
| **Match** | 0.5 per decided match, only if at least 2 sets were finished | Closing out a bo3 is worth something, but the sets already carry most of the information. A match stopped after one set is just that set. |
| **Age** | half the weight every 180 days | People get better (or worse). **Measured from the most recent recorded result, not from today**, so ratings only change when a match is recorded or voided, never overnight. |
| **Prior τ** | 0.35 | Tuned so that a 3–0 newcomer lands level with a 60%-over-100-sets regular, and a 70%-over-50 regular stays above a 6–0 newcomer. |

Unfinished sets (the match ended mid-set) count toward statistics but not toward
the ranking.

## The displayed number

`rating = 1500 + θ · 400 / ln 10`. That's the chess Elo scale, so a 200-point gap
between two *pairs* means the stronger pair wins about 76% of the time. "Last
change" is the difference in a player's rating just before and just after their
latest match.

## Tests

`backend/src/rating/rating.test.ts` turns the requirements above into checks: no
volume reward, a carried partner rated below the carrier, beating strong
opponents counting more than beating weak ones, margin and age effects, order
and date-shift invariance, and a refit of 2000 sets among 25 players inside a
Worker's CPU budget.
