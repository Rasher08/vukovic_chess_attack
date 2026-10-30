# Experimental relative game rating

The current display is a **player rating plus an adjustment for game quality**.
It follows the principle described in [Chess.com's official help article](https://support.chess.com/en/articles/10773754-how-is-game-rating-calculated-in-game-review):
compare move quality with expectations for the player's rating. It does not copy
or reproduce Chess.com's undisclosed formula. In particular, the correction cap
of 800 below is our product choice, not a verified statement about Chess.com.
This is an approximate performance indicator, not a calculation of true Elo.

## Inputs and output

For each color separately, use that player's valid `WhiteElo` or `BlackElo` from
PGN, or an explicit manual override. References must be integer ratings from
100 through 4000. Missing, unknown, malformed or explicitly cleared references
produce an explanation instead of a fabricated number. An absent override key
keeps PGN; an override of `null` clears the reference. The other player's rating,
player names, game result and obsolete `ratingInputs` never enter the estimate.
The UI passes the current manual overrides explicitly; the module does not read
old saved anchors implicitly.

At least 12 eligible decisions for that color and a fully analyzed standard-start
record of at least 40 plies are required. Known book transitions, forced moves,
nonfinite scores and positions whose pre-move score is already mate or has
`abs(beforeCP) > 400` are excluded. A newly allowed losing mate is counted: a
finite nonzero played mate score gives 0 winning percent when negative and100
when positive. Ambiguous mate0 is rejected. This prevents an equal-position
blunder that allows mate from being discarded as though it never happened.
The final ply is included because our same-root review has its played score.

The measured feature `L` is arithmetic mean nonnegative percentage-point loss:

```text
WP(cp) = 100 / (1 + exp(-0.00368208 * cp))
playedWP = WP(playedCP), or 100/0 for a positive/negative played mate
loss = max(0, WP(beforeCP_for_mover) - playedWP)
L = mean(loss over eligible decisions)
```

Both current engine scores use the mover's perspective, also for Black. Theory
and forced moves cannot manufacture a high estimate. Partial engine results do
not produce a final rating.

## Transparent relative heuristic

`E(R)` is expected mean loss interpolated from the retained empirical rating-group
characteristic curve at reference rating `R`. Use endpoint expected losses beyond
the source corpus's rating coverage; **do not cap the displayed result at 2550**.

```text
roundedReference = 50 * round(R / 50)
rawAdjustment = clamp(800 * (1 - L / E(R)), -800, 800)
roundedAdjustment = 50 * round(rawAdjustment / 50)
displayedRating = max(50, roundedReference + roundedAdjustment)
```

Quantizing the reference and adjustment separately makes the displayed correction
relative to the rounded reference exactly bounded by 800. The reported
`adjustment` includes the floor of 50, so it always equals displayed rating minus
rounded reference. A supplied reference of 2832 is represented as 2850 for this
rounded display. This is not hidden precision or a range.

Quality equal to `E(R)` gives zero correction; zero measured loss gives +800;
twice expected loss gives -800 unless the positive floor intervenes. Thus an
ideal-quality eligible record at reference 2200 gives 3000; at 2800 it gives 3600.
Equal measured moves at different references intentionally give different results.
Equal references with better/worse quality give higher/lower results. The single
number changes with the moves, rather than simply echoing the PGN rating.

This ratio and its 800-point cap are heuristic design choices. They have not been
validated as a way to predict a player's stable rating or to match Chess.com game
ratings. Archived expectations are from Lichess ratings, so using them as a prior
for Chess.com, FIDE or unknown rating pools is **uncalibrated**. The resulting
number is expressed relative to the supplied reference, not a validated rating-pool
conversion. Do not market it as exact Elo or the Chess.com algorithm.

## Empirical curve provenance

The retained characteristic curve is fitted from a bounded 40 MB convenience
sample of the official University of Toronto CSSLab Maia KDD CSV, drawn from
December 2019 Lichess games. `provenance.json` records source URLs, compressed
byte ranges/hashes, exclusions, source licensing notes and limitations. Aggregate
rows contain game IDs, color, Elo, eligible decision count and mean loss; no player
names or moves. See `README.md` in this directory for extraction details.

```sh
python3 scripts/calibration/acquire_maia_sample.py
python3 scripts/calibration/fit_model.py content/rating-calibration/maia-game-quality-sample.json
npx tsx tests/game_quality_rating_test.ts
```

The sample has 1827 game-sides from 952 games across 16 bands 1000–2599. Assign
whole games to holdout when SHA256(game_id)'s first 8 hex digits modulo 5 equals
zero; both colors stay together. Train: 772 games / 1482 sides. Holdout: 180 games /
345 sides. Mean loss by 100-point rating group is fitted with weighted decreasing
PAVA and piecewise-linear interpolation. No held-out rows fit this curve.

For held-out rating-group mean losses, MAE is 0.677 percentage points versus 0.872
for a constant training-group mean loss. This supports the curve as a coarse
expectation of group quality, not the new relative correction's numerical accuracy.

The source uses old, consecutive pre-move White-POV evaluations in pawn units;
the app uses Stockfish19 Lite same-root best and forced-played-move scores.
The archived expectation curve excludes nonfinite/mate rows and cannot measure
the final ply. The current relative product intentionally includes valid newly
allowed mate losses and the last ply to avoid hiding decisive errors. These
measurement procedures and feature definitions differ and have not been
calibrated against each other.
Source eligibility additionally requires normal termination and an initial clock
of at least 180 seconds. The UI does not adjust the new index from PGN clocks;
bullet games and abnormal terminations are outside that calibration sample.
Position complexity, opponent pressure and time pressure are not modeled.

## Historical independent estimate diagnostics

The previous display inverted the characteristic curve directly, without a
player reference. Its rounded endpoints were 1050 and 2550. That independent
mode is no longer the default estimator; its pure inversion helper remains only
for diagnostics/tests.

On that old inverse, 109 of 345 holdout sides (31.6%) reached the upper endpoint
and 43 (12.5%) the lower. Balanced MAE against the actual individual ratings was
491.4 points, worse than a constant central rating's 397.8. Inverting holdout
rating-group mean losses gave MAE204.4 points from actual group means. None of
these rating-error figures validates the current reference-plus-adjustment
heuristic, and they must not be displayed as its measured accuracy.

Full historical diagnostics: `.artifacts/calibration-model-validation.json`.
`src/data/gameQualityModel.json` remains version2 curve data/provenance. Runtime
`GAME_QUALITY_MODEL_INFO` is version3, `relative-quality-heuristic`, to distinguish
the changed calculation from that retained curve artifact.
