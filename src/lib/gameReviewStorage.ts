import { Chess } from 'chess.js';
import { compressToUTF16, decompressFromUTF16 } from 'lz-string';
import type { ReviewReport } from '@/types/gameReview';
import { sanitizeReviewHighlights } from './reviewHighlights';
import { summarizeReview } from './gameReview';

export const REVIEW_STORAGE_KEY = 'nonchalant-game-reviews:v1';
export const MAX_SAVED_REVIEWS = 8;
const BASE_CLASSES = ['brilliant', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder', 'forced', 'unverified'];
const NEW_CLASSES = ['great', 'miss', 'trilliant'];
const CLASSES = [...BASE_CLASSES, ...NEW_CLASSES];
const numberOrNull = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value));
const textArray = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === 'string');
const validScore = (value: unknown) => value === null || Boolean(value && typeof value === 'object' && ['cp', 'mate'].includes((value as { kind: string }).kind) && typeof (value as { value: number }).value === 'number' && Number.isFinite((value as { value: number }).value));

function validReport(value: unknown): value is ReviewReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as ReviewReport;
  const game = report.game;
  if (report.performanceRatings !== undefined) {
    const ratings = report.performanceRatings;
    if (!ratings || typeof ratings !== 'object' || ratings.version !== 1 ||
      Object.keys(ratings).some(key => !['version', 'white', 'black'].includes(key)) ||
      !(['white', 'black'] as const).every(color => !Object.prototype.hasOwnProperty.call(ratings, color) || ratings[color] === null ||
        (Number.isInteger(ratings[color]) && ratings[color]! >= 100 && ratings[color]! <= 4000))) return false;
  }
  if (report.ratingInputs !== undefined) {
    const context = report.ratingInputs;
    if (!context || typeof context !== 'object' || ![context.white, context.black].every(rating => rating === null || (Number.isInteger(rating) && rating >= 100 && rating <= 4000))) return false;
  }
  if (report.version !== 1 || report.completed !== true || !Number.isFinite(report.analyzedAt) || !Number.isSafeInteger(report.nodes) || report.nodes <= 0 || !game || typeof game.id !== 'string' || !game.id || typeof game.pgn !== 'string' || game.pgn.length > 100_000 || typeof game.initialFen !== 'string' || !game.headers || typeof game.headers !== 'object' || !Object.values(game.headers).every(item => typeof item === 'string') || !Array.isArray(game.moves) || game.moves.length < 1 || game.moves.length > 400 || !Array.isArray(report.results) || report.results.length !== game.moves.length) return false;
  try { new Chess(game.initialFen); } catch { return false; }
  for (let index = 0; index < game.moves.length; index += 1) {
    const move = game.moves[index];
    const result = report.results[index];
    if (!move || !result || move.ply !== index + 1 || result.ply !== move.ply || !Number.isInteger(move.moveNumber) || move.moveNumber < 1 || !['w', 'b'].includes(move.color) || result.color !== move.color || typeof move.san !== 'string' || result.san !== move.san || typeof move.uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move.uci) || result.uci !== move.uci || result.fenBefore !== move.fenBefore || result.fenAfter !== move.fenAfter || typeof move.fenBefore !== 'string' || typeof move.fenAfter !== 'string' || !CLASSES.includes(result.classification) || result.classification === 'unverified' || !textArray(result.pvSan) || !(result.bestSan === null || typeof result.bestSan === 'string') || !Number.isFinite(result.depth) || result.depth < 0 || !validScore(result.beforeScore) || !validScore(result.playedScore) || !numberOrNull(result.accuracy) || (result.accuracy !== null && (result.accuracy < 0 || result.accuracy > 100)) || !numberOrNull(result.beforeCpWhite) || !numberOrNull(result.afterCpWhite) || !numberOrNull(result.lossCp) || !numberOrNull(result.lossWinPercent)) return false;
  }
  for (const summary of [report.white, report.black]) {
    if (!summary || !numberOrNull(summary.accuracy) || (summary.accuracy !== null && (summary.accuracy < 0 || summary.accuracy > 100)) || !numberOrNull(summary.averageLossCp) || !Number.isInteger(summary.reviewedMoves) || summary.reviewedMoves < 0 || !Number.isInteger(summary.totalMoves) || summary.totalMoves < summary.reviewedMoves || summary.totalMoves > game.moves.length || !summary.counts || !BASE_CLASSES.every(kind => Number.isInteger(summary.counts[kind as keyof typeof summary.counts]) && summary.counts[kind as keyof typeof summary.counts] >= 0) || !NEW_CLASSES.every(kind => summary.counts[kind as keyof typeof summary.counts] === undefined || (Number.isInteger(summary.counts[kind as keyof typeof summary.counts]) && summary.counts[kind as keyof typeof summary.counts] >= 0))) return false;
  }
  return true;
}

function normalizedReport(report: ReviewReport): ReviewReport {
  const results = report.results.map((row, index) => sanitizeReviewHighlights(row, report.results[index - 1], true));
  return { ...report, results, completed: report.completed && results.every(row => row.classification !== 'unverified'), ...summarizeReview(report.game, results) };
}

function readStore(): { valid: boolean; reports: ReviewReport[] } {
  if (typeof window === 'undefined') return { valid: true, reports: [] };
  const raw = window.localStorage.getItem(REVIEW_STORAGE_KEY);
  if (!raw) return { valid: true, reports: [] };
  try {
    if (raw.length > 4_000_000) return { valid: false, reports: [] };
    const data = JSON.parse(raw.startsWith('lz1:') ? decompressFromUTF16(raw.slice(4)) || 'null' : raw);
    if (!data || data.version !== 1 || !Array.isArray(data.reports) || data.reports.length > MAX_SAVED_REVIEWS || !data.reports.every(validReport)) return { valid: false, reports: [] };
    return { valid: true, reports: data.reports.map(normalizedReport).filter((report: ReviewReport) => report.completed) };
  } catch { return { valid: false, reports: [] }; }
}

/** Separate from learning progress: an analysis never awards a solved task or a streak day. */
export function loadSavedReviews(): ReviewReport[] {
  try { return readStore().reports; } catch { return []; }
}

/** Keep the eight most recent complete reviews; a failed write retains the previous history. */
export function saveReview(report: ReviewReport): { saved: boolean; error?: string } {
  if (typeof window === 'undefined') return { saved: false, error: 'Сохранение доступно в браузере.' };
  if (!validReport(report)) return { saved: false, error: 'Незавершённый или непроверенный разбор не сохранён как готовый.' };
  const normalized = normalizedReport(report);
  if (!validReport(normalized)) return { saved: false, error: 'Незавершённый или непроверенный разбор не сохранён как готовый.' };
  try {
    const previous = readStore();
    if (!previous.valid) return { saved: false, error: 'Сохранённая история имеет неизвестный формат. Она не была заменена.' };
    const reports = [normalized, ...previous.reports.filter(item => item.game.id !== report.game.id)].slice(0, MAX_SAVED_REVIEWS);
    const encoded = 'lz1:' + compressToUTF16(JSON.stringify({ version: 1, reports }));
    window.localStorage.setItem(REVIEW_STORAGE_KEY, encoded);
    return { saved: true };
  } catch { return { saved: false, error: 'Не удалось сохранить разбор. Прежняя история сохранена; текущий результат остаётся на экране.' }; }
}
