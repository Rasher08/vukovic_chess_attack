# Experimental quality-to-rating calibration

This is a numeric convenience sample for a quality-only game estimate. Player
ratings are training targets only. Runtime prediction must use the analyzed move
qualities, never the current PGN's `WhiteElo`/`BlackElo`, player name, result or
opponent rating.

## Sources and reuse

- [CSSLab Maia datasets](https://csslab.cs.toronto.edu/datasets/): KDD testing
  corpus, selected from the December 2019 Lichess rated standard database.
- [Original archive](https://csslab.cs.toronto.edu/data/chess/kdd/maia-chess-testing-set.csv.bz2):
  209,395,633 compressed bytes, Last-Modified 2020-10-21 20:49:00 UTC.
- [Lichess database](https://database.lichess.org/): original database exports
  released under CC0. The CSSLab download page does not state a separate license
  for its transformed CSV. The Maia repository's software license is GPL-3.0;
  it is not assumed to be a data license. Raw downloaded rows are not shipped.
- [Maia research/code](https://github.com/CSSLab/maia-chess), McIlroy-Young, Sen,
  Kleinberg and Anderson, *Aligning Superhuman AI with Human Behavior: Chess as
  a Model System* (2020). No Maia software or network weights are incorporated
  in the runtime model.
- Book decisions use the application's existing CC0 Lichess chess-openings
  transition dataset at commit `a6189a30dc273ccb21fc2536a9a2fefd5592a67a`.

## Reproduce acquisition

From the project root on macOS (Python 3, `/usr/bin/bzip2recover`):

```sh
python3 scripts/calibration/acquire_maia_sample.py
```

The script downloads **40,000,000 bytes total**, in twenty deterministic,
evenly spaced 2 MB HTTP byte ranges across the rating-sorted archive. It
recovers complete bzip2 blocks, discards partial edge lines and games, and
retains only complete standard-start normally terminated Blitz/Rapid/Classical
games with an initial clock of at least 180 seconds and at least 40 plies.
No full archive download occurs. Cached raw ranges and decompressed recovery
blocks stay in `.artifacts/calibration-cache/` and must be excluded from deploys.

The resulting `maia-game-quality-sample.json` contains only
`game_id`, `color`, `elo`, `n`, and `meanLossWP`. No names, moves, boards, clocks,
or free text are exported. `provenance.json` records byte ranges, SHA256 hashes,
filters, exclusions and counts. Acquisition produced 1,827 game-sides from 952
games, covering every 100-point band from 1000 to 2599. These are Lichess ratings
in mixed time controls, not Chess.com or FIDE ratings.

## Quality feature

The archive's `cp` field is in **pawn units**, White's perspective before the
row's move. The next row in the same complete game supplies the after score.
Both are multiplied by 100 to centipawns and then oriented to the mover.
We do not use `winrate_elo`, `active_elo`, `opponent_elo`, or the archive's
Elo-dependent win-rate fields to derive move quality.

For finite before and after scores:

```text
WP(cp) = 100 / (1 + exp(-0.00368208 * cp))
loss = max(0, WP(beforeCP_for_mover) - WP(afterCP_for_mover))
```

Exclude known book transitions, forced moves (at most one legal move), and
positions with `abs(beforeCP) > 400`. Reject missing, mate and nonfinite scores
(including the source's `#0`/infinite artifacts). A game-side needs at least
12 remaining decisions; its feature is their arithmetic mean loss. Negative
evaluation noise is clamped to zero. The final move is excluded because this
CSV has no following row's evaluation.

The source `cp_loss` field is not an input. As a semantic crosscheck, the script
compares its finite values with consecutive-score differences and counts any
disagreements over 2.01 centipawns (rounding tolerance).

## Interpretation and limitations

The mapping fitted from this sample is an **experimental estimate** of the
rating associated with a single game's move quality. It cannot determine an
exact player rating. Holdout must split by game ID, keeping both colors from
one game together; held-out error and the constant-mean baseline must be
reported. The input ratings are labels for fitting, not runtime anchors.

This byte-range convenience sample is not a random population sample. The
source selected similar-rated opponents and rating bins; only games with enough
finite annotations survive our filters. Old archived Stockfish evaluations use
different engines/budgets from the current app and compare consecutive positions;
the app's same-root best-vs-forced-played search may be systematically different.
Game complexity, time pressure and sampling noise remain unmodeled. A point
estimate does not remove these limitations; never describe it as exact Elo.
