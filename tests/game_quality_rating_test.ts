import assert from 'node:assert/strict';
import { parseReviewPgn, summarizeReview } from '../src/lib/gameReview';
import { recognizeOpening } from '../src/lib/openingTheory';
import { estimateGameQuality, qualityDecisionLoss, ratingForQualityLoss, relativeRatingForQualityLoss, expectedQualityLossForRating, parsePgnRating, GAME_QUALITY_MODEL_INFO } from '../src/lib/gameQualityRating';
import model from '../src/data/gameQualityModel.json';
import type { ReviewGame, ReviewMoveResult, ReviewReport } from '../src/types/gameReview';

// Actual moves from Caruana–Carlsen, World Championship 2018 game3. Scores below
// are synthetic: this tests quality aggregation and invariance, not the players.
const moves = '1.e4 c5 2.Nf3 Nc6 3.Bb5 g6 4.Bxc6 dxc6 5.d3 Bg7 6.O-O Qc7 7.Re1 e5 8.a3 Nf6 9.b4 O-O 10.Nbd2 Bg4 11.h3 Bxf3 12.Nxf3 cxb4 13.axb4 a5 14.bxa5 Rxa5 15.Bd2 Raa8 16.Qb1 Nd7 17.Qb4 Rfe8 18.Bc3 b5 19.Rxa8 Rxa8 20.Ra1 Rxa1+ 21.Bxa1 Qa7 22.Bc3 Qa2 23.Qb2 Qxb2 24.Bxb2 f6 25.Kf1 Kf7 26.Ke2 Nc5 27.Bc3 Ne6 28.g3 Bf8 29.Nd2 Ng5 30.h4 Ne6 31.Nb3 h5 32.Bd2 Bd6 33.c3 c5 34.Be3 Ke7 35.Kd1 Kd7 36.Kc2 f5 37.Kd1 fxe4 38.dxe4 c4 39.Nd2 Nc5 40.Bxc5 Bxc5 41.Ke2 Kc6 42.Nf1 b4 43.cxb4 Bxb4 44.Ne3 Kc5 45.f4 exf4 46.gxf4 Ba5 47.f5 gxf5 48.Nxc4 Kxc4 49.exf5 1/2-1/2';
const game = parseReviewPgn(`[WhiteElo "2200"]\n[BlackElo "2200"]\n\n${moves}`);
function reportFor(review: ReviewGame, loss = 4.5): ReviewReport {
  const afterCp = Math.log((50 - loss) / (50 + loss)) / .00368208;
  const results: ReviewMoveResult[] = review.moves.map(move => ({
    ...move, classification: 'good', bestSan: move.san, pvSan: [move.san],
    beforeCpWhite: 0, afterCpWhite: afterCp * (move.color === 'w' ? 1 : -1),
    beforeScore: { kind: 'cp', value: 0 }, playedScore: { kind: 'cp', value: afterCp },
    lossCp: -afterCp, lossWinPercent: loss, accuracy: 80, depth: 15,
  }));
  return { version: 1, game: review, results, nodes: 200_000, analyzedAt: 1, completed: true, ...summarizeReview(review, results) };
}
const report = reportFor(game);
const quality = estimateGameQuality(report);
assert(quality.white.rating !== null && quality.black.rating !== null);
assert.equal(quality.white.rating, quality.black.rating, 'Same mover-POV quality must map identically for White and Black');
assert(quality.white.decisions >= 12 && quality.black.decisions >= 12);
assert(Math.abs(quality.white.meanLossWinPercent! - 4.5) < 1e-10);
assert.equal(quality.white.rating! % 50, 0, 'The UI gets one integer rounded to50');

// Own Elo is now an explicit reference; changing it must change the estimate.
const references: number[] = [];
for (const elo of ['100', '1800', '2800', '4000']) {
  const alternate = parseReviewPgn(`[White "Other person"]\n[Black "Other rival"]\n[WhiteElo "${elo}"]\n[BlackElo "${elo}"]\n\n${moves}`);
  const measured = estimateGameQuality({ ...report, game: alternate });
  assert.equal(measured.white.baselineRating, Math.round(Number(elo) / 50) * 50);
  assert.equal(measured.white.provenance, 'pgn');
  assert.equal(measured.white.meanLossWinPercent, quality.white.meanLossWinPercent, 'Elo cannot change the measured move quality');
  assert.equal(measured.white.rating, measured.black.rating);
  references.push(measured.white.rating!);
}
assert(references[2] > references[1], 'Same quality at2800 must produce a higher relative estimate than at1800');
const missing = reportFor(parseReviewPgn(moves));
assert.equal(estimateGameQuality(missing).white.rating, null, 'Missing Elo must never silently assume1500');
assert.equal(estimateGameQuality(missing).white.decisions, quality.white.decisions);
const manual = estimateGameQuality(report, undefined, { white: 1800 });
assert.equal(manual.white.provenance, 'manual'); assert.equal(manual.white.baselineRating, 1800);
assert.deepEqual(manual.black, quality.black, 'A White override must not affect Black');
assert.equal(estimateGameQuality(report, undefined, { white: null }).white.rating, null, 'Clearing an override must not fall back toPGN');
assert.deepEqual(estimateGameQuality(report, undefined, { white: undefined }), quality, 'Undefined override key keepsPGN');
for (const value of [NaN, Infinity, 99, 4001, 1800.5]) {
  assert.equal(estimateGameQuality(report, undefined, { white: value }).white.rating, null);
}
for (const value of [undefined, '', '?', '1800?', '1e3', '+1800', '1800.0', '099', '4001', 'Infinity', 'NaN', '1800 extra']) {
  assert.equal(parsePgnRating(value), null, `Reject invalidPGNratedreference ${value}`);
}
for (const value of ['100', '1800', '2832', '4000', ' 1800 ']) assert.equal(parsePgnRating(value), Number(value.trim()));
const otherHeaders = parseReviewPgn(`[White "Other person"]\n[Black "Other rival"]\n[WhiteElo "2200"]\n[BlackElo "9999"]\n\n${moves}`);
assert.deepEqual(estimateGameQuality({ ...report, game: otherHeaders }).white, quality.white, 'Names and opponentElo must not affect White');
assert.deepEqual(estimateGameQuality({ ...report, ratingInputs: { white: 900, black: 1000 } }), quality, 'Do not reuse obsolete anchors');
assert.deepEqual(estimateGameQuality({ ...report, game: { ...game, result: '1-0' } }), quality);
const frozen = JSON.stringify(report);
estimateGameQuality(report);
assert.equal(JSON.stringify(report), frozen, 'Rating derivation must not mutate saved reports');

const better = estimateGameQuality(reportFor(game, .2));
const worse = estimateGameQuality(reportFor(game, 12));
assert(better.white.rating! > quality.white.rating! && quality.white.rating! > worse.white.rating!);
assert.equal(better.white.boundary, null); assert.equal(worse.white.boundary, null, 'No independent-model boundary label');
assert.equal(estimateGameQuality(reportFor(game, 0)).white.rating, 3000, 'Perfect quality at2200 gives the chosen+800 adjustment');
assert.equal(estimateGameQuality(reportFor(game, 0), undefined, { white: 2800 }).white.rating, 3600, 'There is no2550globalcap');
for (const reference of [100, 825, 1800, 2200, 2832, 4000]) {
  const expected = expectedQualityLossForRating(reference)!;
  assert(expected > 0 && Number.isFinite(expected));
  const neutral = relativeRatingForQualityLoss(expected, reference)!;
  assert.equal(neutral.rating, Math.round(reference / 50) * 50);
  assert.equal(neutral.adjustment, 0, 'Expected quality gives zero correction');
  assert.equal(relativeRatingForQualityLoss(0, reference)!.adjustment, 800);
  let previousRelative = Infinity;
  for (let index = 0; index <= 1000; index += 1) {
    const result = relativeRatingForQualityLoss(index / 10, reference)!;
    assert(Number.isSafeInteger(result.rating) && result.rating >= 50 && result.rating % 50 === 0);
    assert(Math.abs(result.adjustment) <= 800);
    assert.equal(result.rating - result.baselineRating, result.adjustment);
    assert(result.rating <= previousRelative, 'Increasingloss cannot improve the relativeestimate');
    previousRelative = result.rating;
  }
}
for (const rating of [NaN, Infinity, 99, 4001, 1800.5]) assert.equal(expectedQualityLossForRating(rating), null);
for (const loss of [NaN, Infinity, -1, 101]) assert.equal(relativeRatingForQualityLoss(loss, 1800), null);
let previous = Infinity;
for (let index = 0; index <= 1000; index += 1) {
  const rating = ratingForQualityLoss(index / 10)!;
  assert(Number.isSafeInteger(rating) && rating >= model.minRating && rating <= model.maxRating);
  assert(rating <= previous, 'Larger quality loss must never increase the rating index');
  previous = rating;
}
for (const loss of [NaN, Infinity, -1, 101]) assert.equal(ratingForQualityLoss(loss), null);
for (const [loss] of model.knots) {
  const plateau = model.knots.filter(([other]) => other === loss).map(([, rating]) => rating);
  const expected = Math.round(((Math.min(...plateau) + Math.max(...plateau)) / 2) / 50) * 50;
  assert.equal(ratingForQualityLoss(loss), expected, 'Flat characteristic curve uses midpoint rather than an arbitrary edge');
}

const opening = recognizeOpening(game);
const allTheory = { ...opening, bookByPly: Object.fromEntries(game.moves.map(move => [move.ply, { eco: 'X', name: 'Test' }])) };
assert.equal(estimateGameQuality(report, allTheory).white.rating, null, 'Book moves cannot manufacture a rating');
const whiteTheory = { ...opening, bookByPly: Object.fromEntries(game.moves.filter(move => move.color === 'w').map(move => [move.ply, { eco: 'X', name: 'Test' }])) };
assert.equal(estimateGameQuality(report, whiteTheory).white.rating, null);
assert.equal(estimateGameQuality(report, whiteTheory).black.rating, quality.black.rating, 'Insufficient White decisions do not suppress Black');
const first = report.results[0];
assert.equal(qualityDecisionLoss({ ...first, classification: 'forced' }), null);
assert.equal(qualityDecisionLoss({ ...first, classification: 'unverified' }), null);
assert.equal(qualityDecisionLoss({ ...first, beforeScore: { kind: 'cp', value: 401 } }), null, 'Decided positions are not eligible');
assert.equal(qualityDecisionLoss({ ...first, beforeScore: { kind: 'cp', value: -401 } }), null);
assert.equal(qualityDecisionLoss({ ...first, beforeScore: { kind: 'cp', value: NaN } }), null);
assert.equal(qualityDecisionLoss({ ...first, playedScore: { kind: 'cp', value: Infinity } }), null);
assert.equal(qualityDecisionLoss({ ...first, beforeScore: { kind: 'mate', value: 3 } }), null);
assert.equal(qualityDecisionLoss({ ...first, playedScore: { kind: 'mate', value: -3 } }), 50, 'A newly allowed losing mate must count as a severe loss');
assert.equal(qualityDecisionLoss({ ...first, playedScore: { kind: 'mate', value: 3 } }), 0, 'A newly achieved winning mate has no loss');
assert.equal(qualityDecisionLoss({ ...first, playedScore: { kind: 'mate', value: 0 } }), null, 'Ambiguous mate0 is not a valid root score');
assert.equal(qualityDecisionLoss({ ...first, playedScore: { kind: 'mate', value: Infinity } }), null);
assert.equal(qualityDecisionLoss({ ...first, playedScore: { kind: 'cp', value: 50 } }), 0, 'An apparent improvement from search noise has zero loss');
const perfectReport = reportFor(game, 0);
const perfectRating = estimateGameQuality(perfectReport);
const independentWhitePly = perfectReport.results.findIndex(move => move.color === 'w' && !opening.bookByPly[move.ply]);
assert(independentWhitePly >= 0);
const mateBlunder = { ...perfectReport, results: perfectReport.results.map((move, index) => index === independentWhitePly
  ? { ...move, classification: 'blunder' as const, playedScore: { kind: 'mate' as const, value: -2 } } : move) };
const mateRating = estimateGameQuality(mateBlunder);
assert(mateRating.white.rating! < perfectRating.white.rating!, 'One decisive losing-mate blunder must reduce an otherwise perfect rating');
assert.equal(mateRating.white.decisions, perfectRating.white.decisions, 'The mate blunder is counted, not filtered away');
assert.deepEqual(mateRating.black, perfectRating.black);
const finalMove = perfectReport.results[perfectReport.results.length - 1];
const finalColor = finalMove.color === 'w' ? 'white' : 'black';
const lastBlunder = { ...perfectReport, results: perfectReport.results.map((move, index) => index === perfectReport.results.length - 1
  ? { ...move, classification: 'blunder' as const, playedScore: { kind: 'cp' as const, value: -2000 } } : move) };
const lastRating = estimateGameQuality(lastBlunder);
assert(lastRating[finalColor].rating! < perfectRating[finalColor].rating!, 'The final ply must not hide a decisive centipawn blunder');
assert.equal(lastRating[finalColor].decisions, perfectRating[finalColor].decisions, 'The final ply contributes a decision');
for (const count of [11, 12]) {
  const remaining = { w: count, b: count };
  const threshold = { ...report, results: report.results.map(move => {
    const keep = !opening.bookByPly[move.ply] && remaining[move.color]-- > 0;
    return keep ? move : { ...move, classification: 'forced' as const };
  }) };
  const measured = estimateGameQuality(threshold);
  assert.equal(measured.white.decisions, count);
  assert.equal(measured.black.decisions, count);
  assert.equal(measured.white.rating !== null, count === 12, 'Require at least12 independent eligible decisions per side');
}
const forced = { ...report, results: report.results.map(move => ({ ...move, classification: 'forced' as const })) };
assert.equal(estimateGameQuality(forced).white.rating, null);
assert.equal(estimateGameQuality(forced).white.decisions, 0);
assert.equal(estimateGameQuality({ ...report, completed: false }).white.rating, null, 'No final rating during partial analysis');
assert.equal(estimateGameQuality({ ...report, results: report.results.slice(1) }).white.rating, null);
const badMove = { ...report, results: report.results.map((move, index) => index === 3 ? { ...move, uci: 'a1a2' } : move) };
assert.equal(estimateGameQuality(badMove).white.rating, null, 'Do not accept results belonging to another move');
const short = reportFor(parseReviewPgn('1.e4 e5 2.Nf3 Nc6 *'));
assert.equal(estimateGameQuality(short).white.rating, null);
const fragment = reportFor({ ...game, initialFen: game.moves[5].fenBefore });
assert.equal(estimateGameQuality(fragment).white.rating, null, 'No calibration claim for FEN fragments');
assert(GAME_QUALITY_MODEL_INFO.testSides > 0);
assert(GAME_QUALITY_MODEL_INFO.groupLossMae < GAME_QUALITY_MODEL_INFO.baselineGroupLossMae, 'Held-out rating-group quality curve must beat a constant loss');
console.log('PASS game quality rating: relative reference+quality heuristic, PGN/manual validation, per-side overrides, monotonicity, exact correction caps/no2550cap, theory/forced/decided exclusions, losing-mate and final-ply penalties, complete-game safeguards');
