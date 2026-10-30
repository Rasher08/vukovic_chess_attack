import { Chess } from 'chess.js';
import model from '@/data/gameQualityModel.json';
import { recognizeOpening, type OpeningReview } from './openingTheory';
import type { ReviewColor, ReviewMoveResult, ReviewReport } from '@/types/gameReview';

export interface GameQualityRating {
  rating: number | null;
  decisions: number;
  meanLossWinPercent: number | null;
  reason: string | null;
  boundary: 'upper' | 'lower' | null;
  /** Rounded reference used in the displayed estimate, not a learned rating. */
  baselineRating: number | null;
  adjustment: number | null;
  provenance: 'pgn' | 'manual' | null;
}

/** An absent key keeps PGN Elo; an explicit null removes that side's reference. */
export type GameRatingBaselines = Partial<{ white: number | null; black: number | null }>;

const MAX_ADJUSTMENT = 800;
const RATING_STEP = 50;

export const GAME_QUALITY_MODEL_INFO = {
  sourceUrl: model.sourceUrl,
  method: 'relative-quality-heuristic',
  version: 3,
  maxAdjustment: MAX_ADJUSTMENT,
  ratingStep: RATING_STEP,
  principleSourceUrl: 'https://support.chess.com/en/articles/10773754-how-is-game-rating-calculated-in-game-review',
  groupLossMae: model.groupLossMae,
  baselineGroupLossMae: model.baselineGroupLossMae,
  groupRatingMae: model.groupRatingMae,
  scale: 'reference-rating',
  validationMae: model.validationMae,
  baselineMae: model.baselineMae,
  trainingGames: model.trainingGames,
  trainingSides: model.trainingSides,
  testGames: model.testGames,
  testSides: model.testSides,
  minDecisions: model.minDecisions,
} as const;

function noRating(reason: string, decisions = 0, meanLossWinPercent: number | null = null): GameQualityRating {
  return { rating: null, decisions, meanLossWinPercent, reason, boundary: null, baselineRating: null, adjustment: null, provenance: null };
}

function validReference(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 100 && value <= 4000;
}

/** Do not coerce unknown/partial PGN strings into a usable player reference. */
export function parsePgnRating(value: string | undefined): number | null {
  if (typeof value !== 'string' || !/^\d{3,4}$/.test(value.trim())) return null;
  const rating = Number(value.trim());
  return validReference(rating) ? rating : null;
}

function winPercent(cp: number): number {
  return 100 / (1 + Math.exp(-0.00368208 * cp));
}

/** Current review loss, including a move that newly allows forced mate. */
export function qualityDecisionLoss(move: ReviewMoveResult): number | null {
  if (move.classification === 'forced' || move.classification === 'unverified' ||
    move.beforeScore?.kind !== 'cp' || !move.playedScore ||
    !Number.isFinite(move.beforeScore.value) || !Number.isFinite(move.playedScore.value) ||
    Math.abs(move.beforeScore.value) > model.maxBeforeAbsCp) return null;
  // Both engine scores already have the mover's POV, including for Black.
  const playedPercent = move.playedScore.kind === 'cp' ? winPercent(move.playedScore.value)
    : move.playedScore.kind === 'mate' && move.playedScore.value !== 0 ? move.playedScore.value > 0 ? 100 : 0 : null;
  if (playedPercent === null) return null;
  return Math.max(0, Math.min(100, winPercent(move.beforeScore.value) - playedPercent));
}

/** Invert the learned characteristic curve; equal-loss plateaus use their midpoint. */
export function ratingForQualityLoss(meanLossWinPercent: number): number | null {
  if (!Number.isFinite(meanLossWinPercent) || meanLossWinPercent < 0 || meanLossWinPercent > 100) return null;
  const knots = model.knots;
  if (meanLossWinPercent < knots[0][0]) return model.maxRating;
  if (meanLossWinPercent > knots[knots.length - 1][0]) return model.minRating;
  const same = knots.filter(([loss]) => Math.abs(meanLossWinPercent - loss) < 1e-9).map(([, rating]) => rating);
  let estimate: number | null = same.length ? (Math.min(...same) + Math.max(...same)) / 2 : null;
  if (estimate === null) for (let index = 1; index < knots.length; index += 1) {
    const left = knots[index - 1]; const right = knots[index];
    if (left[0] < meanLossWinPercent && meanLossWinPercent < right[0]) {
      const fraction = (meanLossWinPercent - left[0]) / (right[0] - left[0]);
      estimate = left[1] + fraction * (right[1] - left[1]);
      break;
    }
  }
  if (estimate === null) return null;
  return Math.max(model.minRating, Math.min(model.maxRating, Math.round(estimate / model.roundTo) * model.roundTo));
}

/**
 * Expected mean loss from the empirical Lichess characteristic curve. References
 * outside that corpus use its endpoint loss; the displayed rating is not capped
 * to corpus Elo. Using this prior for other rating pools is an uncalibrated
 * product heuristic, not a conversion between Lichess and Chess.com ratings.
 */
export function expectedQualityLossForRating(rating: number): number | null {
  if (!validReference(rating)) return null;
  const anchors = [...model.knots].reverse(); // Ascending rating; equal losses are fine.
  if (rating <= anchors[0][1]) return anchors[0][0];
  if (rating >= anchors[anchors.length - 1][1]) return anchors[anchors.length - 1][0];
  for (let index = 1; index < anchors.length; index += 1) {
    const left = anchors[index - 1]; const right = anchors[index];
    if (rating <= right[1]) {
      const fraction = (rating - left[1]) / (right[1] - left[1]);
      return left[0] + fraction * (right[0] - left[0]);
    }
  }
  return null;
}

/**
 * Own relative-game heuristic: expected loss gives zero adjustment, no loss
 * gives +800, twice expected loss gives -800. Quantize reference and adjustment
 * to 50 before adding; this keeps the displayed change within exactly ±800.
 */
export function relativeRatingForQualityLoss(meanLossWinPercent: number, reference: number): {
  rating: number; baselineRating: number; adjustment: number;
} | null {
  if (!Number.isFinite(meanLossWinPercent) || meanLossWinPercent < 0 || meanLossWinPercent > 100) return null;
  const expected = expectedQualityLossForRating(reference);
  if (expected === null || expected <= 0) return null;
  const baselineRating = Math.round(reference / RATING_STEP) * RATING_STEP;
  const rawAdjustment = Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, MAX_ADJUSTMENT * (1 - meanLossWinPercent / expected)));
  const roundedAdjustment = Math.round(rawAdjustment / RATING_STEP) * RATING_STEP;
  const rating = Math.max(RATING_STEP, baselineRating + roundedAdjustment);
  return { rating, baselineRating, adjustment: rating - baselineRating };
}

/**
 * Experimental relative performance estimate: own reference plus an own
 * quality adjustment. Only that side's explicit/PGN rating is the reference;
 * names, result, opponent Elo and legacy ratingInputs never affect its estimate.
 * This follows Chess.com's described principle, not its undisclosed formula.
 * Neither the relative heuristic nor cross-pool use has been calibrated as a
 * predictor of a player's true strength.
 */
export function estimateGameQuality(report: ReviewReport, opening: OpeningReview = recognizeOpening(report.game), baselines?: GameRatingBaselines): {
  white: GameQualityRating; black: GameQualityRating;
} {
  const unavailable = (reason: string) => ({ white: noRating(reason), black: noRating(reason) });
  if (!report.completed || report.results.length !== report.game.moves.length ||
    report.results.some((move, index) => {
      const expected = report.game.moves[index];
      return !expected || move.classification === 'unverified' || move.ply !== expected.ply ||
        move.uci !== expected.uci || move.color !== expected.color || move.fenBefore !== expected.fenBefore || move.fenAfter !== expected.fenAfter;
    })) return unavailable('Дождись полного анализа партии.');
  if (!opening.hasOpeningStart || report.game.initialFen !== new Chess().fen() || report.game.moves.length < 40) {
    return unavailable('Нужна партия с начальной позиции длиной хотя бы 20 ходов.');
  }
  const side = (color: ReviewColor): GameQualityRating => {
    const losses: number[] = [];
    for (const move of report.results) {
      // Our same-root review has a played score for the last move as well.
      if (move.color !== color || opening.bookByPly[move.ply]) continue;
      const loss = qualityDecisionLoss(move);
      if (loss !== null) losses.push(loss);
    }
    const mean = losses.length ? losses.reduce((sum, value) => sum + value, 0) / losses.length : null;
    if (losses.length < model.minDecisions) {
      return noRating(`Недостаточно ходов для оценки: учтено ${losses.length}, нужно ${model.minDecisions}.`, losses.length, mean);
    }
    const key = color === 'w' ? 'white' : 'black';
    const explicit = baselines?.[key];
    const reference = explicit === undefined ? parsePgnRating(report.game.headers[color === 'w' ? 'WhiteElo' : 'BlackElo']) : validReference(explicit) ? explicit : null;
    if (reference === null) return noRating('Укажи исходный рейтинг игрока для оценки партии.', losses.length, mean);
    const estimated = relativeRatingForQualityLoss(mean!, reference);
    if (!estimated) return noRating('Не удалось рассчитать оценку партии.', losses.length, mean);
    return {
      ...estimated, decisions: losses.length, meanLossWinPercent: mean, reason: null,
      boundary: null, provenance: explicit === undefined ? 'pgn' : 'manual',
    };
  };
  return { white: side('w'), black: side('b') };
}
