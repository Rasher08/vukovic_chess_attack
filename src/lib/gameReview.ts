import { Chess, type Square } from 'chess.js';
import type { EngineLike, EngineResult } from './autoTraining';
import { inspectSacrifice, verifyBrilliantMove } from './brilliantMove';
import { enhanceReviewMove, safeReviewClassification, sanitizeReviewHighlights } from './reviewHighlights';
import { recognizeOpening } from './openingTheory';
import type {
  ReviewClassification, ReviewGame, ReviewMoveResult, ReviewPlayerSummary, ReviewReport,
} from '@/types/gameReview';

export const REVIEW_LABELS: Record<ReviewClassification, string> = {
  trilliant: 'Триллиант', brilliant: 'Блестящий', great: 'Замечательный', miss: 'Упущенный шанс', best: 'Лучший', excellent: 'Отличный', good: 'Неплохой',
  inaccuracy: 'Неточность', mistake: 'Ошибка', blunder: 'Зевок', forced: 'Вынужденный', unverified: 'Не проверен',
};

const MAX_PGN_BYTES = 100_000;
const MAX_PLIES = 400;
const DEFAULT_NODES = 200_000;
const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
type Score = EngineResult['score'];

function moveUci(board: Chess, uci: string) {
  if (!UCI_MOVE.test(uci)) throw new Error('Движок вернул некорректный ход.');
  return board.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, ...(uci[4] ? { promotion: uci[4] } : {}) });
}

function contentId(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `review-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** Parse the complete single-game input before analysis: never silently import a valid prefix. */
export function parseReviewPgn(pgn: string): ReviewGame {
  if (typeof pgn !== 'string' || !pgn.trim()) throw new Error('Вставь PGN одной партии или выбери файл.');
  if (new TextEncoder().encode(pgn).length > MAX_PGN_BYTES) throw new Error('PGN слишком большой. Максимальный размер — 100 КБ.');
  const text = pgn.replace(/^\uFEFF/, '').trim();
  const board = new Chess();
  try { board.loadPgn(text, { strict: false }); }
  catch { throw new Error('Не удалось прочитать PGN. Нужна одна партия с полными легальными ходами; проверь запись и незакрытые комментарии.'); }
  const headers = board.getHeaders();
  const variant = Object.entries(headers).find(([key]) => key.toLowerCase() === 'variant')?.[1];
  if (variant && !['standard', 'chess', 'from position'].includes(variant.trim().toLowerCase())) {
    throw new Error('Пока поддерживаются только обычные шахматы.');
  }
  if (headers.SetUp === '1' && !headers.FEN) throw new Error('В PGN указан SetUp, но отсутствует исходная позиция FEN.');
  const played = board.history({ verbose: true });
  if (!played.length) throw new Error('В этой записи нет ходов для анализа.');
  if (played.length > MAX_PLIES) throw new Error('Слишком длинная партия: максимум 200 ходов (400 полуходов).');
  const moves = played.map((move, index) => ({
    ply: index + 1, moveNumber: Number(move.before.split(' ')[5]), color: move.color,
    san: move.san, uci: `${move.from}${move.to}${move.promotion || ''}`, fenBefore: move.before, fenAfter: move.after,
  }));
  const initialFen = played[0].before;
  return {
    id: contentId(initialFen + '|' + moves.map(move => move.uci).join(' ')), headers, initialFen, moves,
    pgn: text, result: headers.Result || (/\b(1-0|0-1|1\/2-1\/2|\*)\s*$/.exec(text)?.[1] ?? '*'),
  };
}

function aborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error('Анализ остановлен.'); error.name = 'AbortError'; throw error;
  }
}

function validScore(score: Score): score is NonNullable<Score> {
  return Boolean(score && Number.isFinite(score.value) && (score.kind === 'cp' || (score.kind === 'mate' && score.value !== 0)));
}

function validateAnalysis(analysis: EngineResult, fen: string, forced?: string) {
  if (!validScore(analysis.score) || !Number.isFinite(analysis.depth) || analysis.depth < 1) {
    throw new Error('Движок не подтвердил оценку позиции.');
  }
  if (!analysis.bestMove || (forced && analysis.bestMove !== forced)) throw new Error('Движок не подтвердил проверяемый ход.');
  moveUci(new Chess(fen), analysis.bestMove);
}

/** Public Lichess move formula; aggregate below is our own metric, not Lichess game accuracy. */
function winPercent(score: NonNullable<Score>) {
  return score.kind === 'mate' ? score.value > 0 ? 100 : 0 : 100 / (1 + Math.exp(-0.00368208 * score.value));
}

function whiteCp(score: Score, color: 'w' | 'b') {
  return score?.kind === 'cp' && Number.isFinite(score.value) ? score.value * (color === 'w' ? 1 : -1) : null;
}

function sanLine(fen: string, moves: string[]): string[] {
  const board = new Chess(fen); const result: string[] = [];
  for (const uci of moves.slice(0, 12)) {
    try { result.push(moveUci(board, uci).san); } catch { break; }
  }
  return result;
}

function classification(lossWinPercent: number, exactBest: boolean): ReviewClassification {
  if (lossWinPercent >= 20) return 'blunder';
  if (lossWinPercent >= 10) return 'mistake';
  if (lossWinPercent >= 5) return 'inaccuracy';
  if (exactBest) return 'best';
  return lossWinPercent <= 1 ? 'excellent' : 'good';
}

function playerSummary(game: ReviewGame, results: ReviewMoveResult[], color: 'w' | 'b'): ReviewPlayerSummary {
  const counts = Object.fromEntries(Object.keys(REVIEW_LABELS).map(key => [key, 0])) as Record<ReviewClassification, number>;
  const expected = new Map(game.moves.filter(move => move.color === color).map(move => [move.ply, move]));
  const unique = new Map<number, ReviewMoveResult>();
  for (const result of results) {
    const move = expected.get(result.ply);
    if (move && move.uci === result.uci) unique.set(result.ply, { ...result, classification: safeReviewClassification(result) });
  }
  const values = Array.from(unique.values());
  const verified = values.filter(result => result.classification !== 'unverified');
  for (const result of values) counts[result.classification] += 1;
  const choices = verified.filter(result => result.classification !== 'forced');
  const accuracies = choices.map(result => result.accuracy).filter((value): value is number => value !== null && Number.isFinite(value));
  const losses = choices.map(result => result.lossCp).filter((value): value is number => value !== null && Number.isFinite(value));
  // Our transparent game aggregate averages arithmetic and harmonic mean. The
  // harmonic calculation floors individual values at 1 to avoid division by zero.
  const mean = accuracies.length ? accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length : null;
  const harmonic = accuracies.length ? accuracies.length / accuracies.reduce((sum, value) => sum + 1 / Math.max(1, value), 0) : null;
  return {
    accuracy: mean === null || harmonic === null ? null : Math.max(0, Math.min(100, (mean + harmonic) / 2)),
    averageLossCp: losses.length ? losses.reduce((sum, value) => sum + value, 0) / losses.length : null,
    counts, reviewedMoves: verified.length, totalMoves: expected.size,
  };
}

export function summarizeReview(game: ReviewGame, results: ReviewMoveResult[]) {
  return { white: playerSummary(game, results, 'w'), black: playerSummary(game, results, 'b') };
}

/**
 * Only a checked, contiguous prefix can be resumed. Never skip a failed move
 * and reuse later rows, or borrow evaluations from a different game/position.
 * Returned rows do not share mutable score objects or PV arrays with the input.
 */
export function verifiedReviewPrefix(game: ReviewGame, results: readonly ReviewMoveResult[]): ReviewMoveResult[] {
  const prefix: ReviewMoveResult[] = [];
  if (!Array.isArray(results)) return prefix;
  let board: Chess;
  try { board = new Chess(game.initialFen); } catch { return prefix; }
  for (let index = 0; index < Math.min(results.length, game.moves.length); index += 1) {
    const move = game.moves[index];
    const result = results[index];
    if (!move || !result || move.ply !== index + 1 || result.ply !== move.ply ||
      result.moveNumber !== move.moveNumber || result.color !== move.color || result.san !== move.san ||
      result.uci !== move.uci || result.fenBefore !== move.fenBefore || result.fenAfter !== move.fenAfter ||
      !Object.prototype.hasOwnProperty.call(REVIEW_LABELS, result.classification) || result.classification === 'unverified' ||
      !validScore(result.beforeScore) || !validScore(result.playedScore) ||
      !Number.isFinite(result.depth) || result.depth < 1 ||
      result.accuracy === null || !Number.isFinite(result.accuracy) || result.accuracy < 0 || result.accuracy > 100 ||
      result.lossWinPercent === null || !Number.isFinite(result.lossWinPercent) || result.lossWinPercent < 0 || result.lossWinPercent > 100 ||
      !(result.lossCp === null || (Number.isFinite(result.lossCp) && result.lossCp >= 0)) ||
      result.beforeCpWhite !== whiteCp(result.beforeScore, move.color) || result.afterCpWhite !== whiteCp(result.playedScore, move.color) ||
      typeof result.bestSan !== 'string' || !result.bestSan || !Array.isArray(result.pvSan) ||
      !result.pvSan.length || result.pvSan.length > 12 || !result.pvSan.every((san: unknown) => typeof san === 'string' && san.length > 0)) break;
    try {
      if (board.fen() !== move.fenBefore) break;
      // Validate the saved line independently: never mutate the played history
      // with a hypothetical engine continuation while checking the prefix.
      const best = new Chess(move.fenBefore);
      best.move(result.bestSan, { strict: true });
      const pv = new Chess(move.fenBefore);
      for (const san of result.pvSan) pv.move(san, { strict: true });
      const played = moveUci(board, move.uci);
      if (played.san !== move.san || board.fen() !== move.fenAfter) break;
      const detached = sanitizeReviewHighlights({
        ...result, beforeScore: { ...result.beforeScore }, playedScore: { ...result.playedScore },
        pvSan: [...result.pvSan],
      }, prefix[prefix.length - 1], true);
      if (detached.classification === 'unverified') break;
      prefix.push(detached);
    } catch { break; }
  }
  return prefix;
}

/** Review both players from the same root, never compare two unrelated search POVs. */
export async function analyzeReviewGame(game: ReviewGame, engine: EngineLike, options: {
  nodes?: number; signal?: AbortSignal; resumeResults?: readonly ReviewMoveResult[];
  onProgress?: (result: ReviewMoveResult, done: number, total: number) => void;
} = {}): Promise<ReviewReport> {
  const nodes = options.nodes ?? DEFAULT_NODES;
  if (!Number.isSafeInteger(nodes) || nodes < 1) throw new Error('Некорректный бюджет анализа.');
  aborted(options.signal);
  const results = verifiedReviewPrefix(game, options.resumeResults || []);
  const opening = recognizeOpening(game);
  const playedBoard = new Chess(game.initialFen);
  // Rebuild actual move history, not just the last FEN: threefold repetition
  // and other draw checks must see the already analysed part of the game.
  for (const result of results) { aborted(options.signal); moveUci(playedBoard, result.uci); }
  for (const ply of game.moves.slice(results.length)) {
    aborted(options.signal);
    let result: ReviewMoveResult;
    try {
      const legalMoves = playedBoard.moves();
      if (playedBoard.fen() !== ply.fenBefore) throw new Error('Позиция в записи партии не совпала с ходами.');
      moveUci(playedBoard, ply.uci);
      const before = await engine.analyze(ply.fenBefore, { nodes });
      aborted(options.signal); validateAnalysis(before, ply.fenBefore);
      const exactBest = before.bestMove === ply.uci;
      let chosen: EngineResult;
      if (playedBoard.isCheckmate()) chosen = { ...before, bestMove: ply.uci, score: { kind: 'mate', value: 1 }, pv: [ply.uci] };
      else if (playedBoard.isDraw()) chosen = { ...before, bestMove: ply.uci, score: { kind: 'cp', value: 0 }, pv: [ply.uci] };
      else chosen = exactBest ? before : await engine.analyze(ply.fenBefore, { nodes, searchMoves: [ply.uci] });
      aborted(options.signal); validateAnalysis(chosen, ply.fenBefore, ply.uci);
      const lossWinPercent = Math.max(0, winPercent(before.score!) - winPercent(chosen.score!));
      const lossCp = before.score!.kind === 'cp' && chosen.score!.kind === 'cp' ? Math.max(0, before.score!.value - chosen.score!.value) : null;
      result = {
        ...ply, classification: legalMoves.length === 1 ? 'forced' : classification(lossWinPercent, exactBest),
        bestSan: sanLine(ply.fenBefore, [before.bestMove!])[0] || null,
        pvSan: sanLine(ply.fenBefore, before.pv[0] === before.bestMove ? before.pv : [before.bestMove!]),
        beforeCpWhite: whiteCp(before.score, ply.color), afterCpWhite: whiteCp(chosen.score, ply.color),
        beforeScore: before.score, playedScore: chosen.score, lossCp, lossWinPercent,
        accuracy: Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * lossWinPercent) - 3.1669)),
        depth: Math.min(before.depth, chosen.depth),
      };
      if (['best', 'excellent', 'good'].includes(result.classification)) {
        const candidate = inspectSacrifice(ply.fenBefore, ply.uci);
        if (candidate) {
          const verified = await verifyBrilliantMove(candidate, before, chosen, engine, {
            nodes: Math.max(600_000, nodes * 3), signal: options.signal,
          });
          aborted(options.signal);
          if (verified.brilliant) { result.classification = 'brilliant'; result.brilliantReason = verified.reason; }
        }
      }
      result = await enhanceReviewMove(result, results[results.length - 1], engine, {
        nodes, signal: options.signal, isBook: Boolean(opening.bookByPly[ply.ply]),
        previousIsBook: Boolean(opening.bookByPly[ply.ply - 1]),
      });
    } catch (caught) {
      aborted(options.signal);
      if (caught instanceof Error && caught.name === 'AbortError') throw caught;
      result = {
        ...ply, classification: 'unverified', bestSan: null, pvSan: [], beforeCpWhite: null, afterCpWhite: null,
        beforeScore: null, playedScore: null, lossCp: null, lossWinPercent: null, accuracy: null, depth: 0,
        error: caught instanceof Error ? caught.message : 'Не удалось проверить ход.',
      };
    }
    results.push(result);
    options.onProgress?.(result, results.length, game.moves.length);
    if (result.classification === 'unverified') break;
  }
  aborted(options.signal);
  return {
    version: 1, game, results, nodes, analyzedAt: Date.now(),
    completed: results.length === game.moves.length && results.every(result => result.classification !== 'unverified'),
    ...summarizeReview(game, results),
  };
}
