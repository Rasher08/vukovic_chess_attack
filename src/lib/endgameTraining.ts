import { Chess } from 'chess.js';
import { evaluateEngineChange, playUci, type EngineLike, type EngineResult } from './autoTraining';
import { assertEndgameActive, awaitEndgameActive, sharedEndgameTablebase, tablebaseOutcome, type EndgameTablebaseLike, type EndgameTablebasePosition } from './endgameTablebase';

export interface EndgameSpec { id?: string; initialFen: string; playerColor: 'w' | 'b'; goal: 'win' | 'draw'; targetHumanMoves?: number }
export interface EndgameMoveReview {
  ply: number; san: string; uci: string; fenBefore: string; fenAfter: string;
  bestSan: string | null; bestLineSan: string[]; lossCp: number | null; beforeCp: number | null; afterCp: number | null;
  classification: 'sound' | 'inaccuracy' | 'mistake' | 'unverified'; exact: boolean; explanation: string;
  beforeOutcome: -1 | 0 | 1 | null; afterOutcome: -1 | 0 | 1 | null;
}
export interface EndgameAudit {
  outcome: 'passed' | 'needs-review' | 'incomplete' | 'unverified'; terminalResult: 'won' | 'lost' | 'draw' | null;
  playedOwnMoves: number; requiredOwnMoves: number; summary: string; limits: string; moves: EndgameMoveReview[];
  exactMoves: number; engineMoves: number; criticalErrors: number; goal: 'win' | 'draw';
}
export interface EndgameAnalysisOptions {
  signal?: AbortSignal; nodes?: number; tablebase?: EndgameTablebaseLike | false;
  onProgress?: (done: number, total: number) => void;
}
const DEFAULT_NODES = 1_000_000;
function validateSpec(spec: EndgameSpec): void {
  if (!['w', 'b'].includes(spec.playerColor) || !['win', 'draw'].includes(spec.goal)) throw new Error('Некорректная учебная позиция.');
  if (spec.targetHumanMoves !== undefined && (!Number.isSafeInteger(spec.targetHumanMoves) || spec.targetHumanMoves < 1 || spec.targetHumanMoves > 100)) throw new Error('Некорректная длина защиты.');
}
export function replayEndgame(spec: EndgameSpec, movesUci: readonly string[]): Chess {
  validateSpec(spec);
  if (!Array.isArray(movesUci) || movesUci.length > 600) throw new Error('Слишком длинная попытка.');
  const board = new Chess(spec.initialFen);
  for (const uci of movesUci) {
    if (board.isGameOver()) throw new Error('В записи есть ходы после завершения партии.');
    playUci(board, uci);
  }
  return board;
}
export function endgameTerminalResult(board: Chess, playerColor: 'w' | 'b'): EndgameAudit['terminalResult'] {
  return board.isCheckmate() ? board.turn() === playerColor ? 'lost' : 'won' : board.isDraw() ? 'draw' : null;
}
function nodes(options: EndgameAnalysisOptions): number {
  const budget = options.nodes ?? DEFAULT_NODES;
  if (!Number.isSafeInteger(budget) || budget <= 0) throw new Error('Некорректный бюджет анализа.');
  return budget;
}
async function probe(fen: string, options: EndgameAnalysisOptions): Promise<EndgameTablebasePosition | null> {
  assertEndgameActive(options.signal);
  if (options.tablebase === false) return null;
  try { return await awaitEndgameActive((options.tablebase || sharedEndgameTablebase()).probe(fen, options.signal), options.signal); }
  catch { assertEndgameActive(options.signal); return null; }
}
function validAnalysis(result: EngineResult, fen: string, forced?: string): EngineResult {
  if (!result.score || !Number.isFinite(result.score.value) || !['cp', 'mate'].includes(result.score.kind) || (result.score.kind === 'mate' && result.score.value === 0) || !Number.isSafeInteger(result.depth) || result.depth < 1 || !result.bestMove || (forced && result.bestMove !== forced)) throw new Error('Движок не подтвердил позицию. Повтори проверку.');
  playUci(new Chess(fen), result.bestMove);
  return result;
}
function sanLine(fen: string, line: readonly string[]): string[] {
  const board = new Chess(fen); const sans: string[] = [];
  for (const move of line.slice(0, 12)) { try { sans.push(playUci(board, move).san); } catch { break; } }
  return sans;
}

/** Strong replies preserve exact WDL where available, never a stored book line. */
export async function chooseEndgameReply(spec: EndgameSpec, movesUci: readonly string[], engine: EngineLike, options: EndgameAnalysisOptions = {}): Promise<{ uci: string | null; source: 'tablebase' | 'engine' | 'terminal'; exact: boolean }> {
  spec = { ...spec }; movesUci = [...movesUci]; options = { ...options };
  const board = replayEndgame(spec, movesUci); const budget = nodes(options);
  assertEndgameActive(options.signal);
  if (board.isGameOver()) return { uci: null, source: 'terminal', exact: true };
  if (board.turn() === spec.playerColor) throw new Error('Сейчас ход ученика.');
  const table = await probe(board.fen(), options);
  assertEndgameActive(options.signal);
  const outcome = table ? tablebaseOutcome(table.category) : null;
  const preserving = table && outcome !== null ? table.moves.filter(move => {
    const child = tablebaseOutcome(move.category); return child !== null && -child === outcome;
  }) : [];
  if (preserving.length && (outcome === 1 || preserving.length === 1)) {
    playUci(new Chess(board.fen()), preserving[0].uci);
    return { uci: preserving[0].uci, source: 'tablebase', exact: true };
  }
  const result = await awaitEndgameActive(engine.analyze(board.fen(), { nodes: budget, ...(preserving.length ? { searchMoves: preserving.map(move => move.uci) } : {}) }), options.signal);
  assertEndgameActive(options.signal);
  validAnalysis(result, board.fen());
  if (preserving.length && !preserving.some(move => move.uci === result.bestMove)) throw new Error('Движок вышел за подтверждённые защитные ходы. Повтори ответ.');
  return { uci: result.bestMove, source: preserving.length ? 'tablebase' : 'engine', exact: preserving.length > 0 };
}

/** Called only after the learner ends a blind attempt; alternatives are graded by their result. */
export async function auditEndgameAttempt(spec: EndgameSpec, movesUci: readonly string[], engine: EngineLike, options: EndgameAnalysisOptions = {}): Promise<EndgameAudit> {
  spec = { ...spec }; movesUci = [...movesUci]; options = { ...options };
  const board = replayEndgame(spec, movesUci); const budget = nodes(options); const required = spec.targetHumanMoves ?? 16;
  assertEndgameActive(options.signal);
  const timeline = new Chess(spec.initialFen);
  const positions = board.history({ verbose: true }).map((move, index) => {
    playUci(timeline, move.from + move.to + (move.promotion || ''));
    return { move, ply: index + 1, terminalAfter: endgameTerminalResult(timeline, spec.playerColor) };
  }).filter(({ move }) => move.color === spec.playerColor);
  const reviews: EndgameMoveReview[] = [];
  options.onProgress?.(0, positions.length);
  for (const { move, ply, terminalAfter } of positions) {
    assertEndgameActive(options.signal);
    const uci = move.from + move.to + (move.promotion || '');
    const row: EndgameMoveReview = { ply, san: move.san, uci, fenBefore: move.before, fenAfter: move.after, bestSan: null, bestLineSan: [], lossCp: null, beforeCp: null, afterCp: null, classification: 'unverified', exact: false, explanation: 'Не удалось подтвердить оценку. Повтори проверку.', beforeOutcome: null, afterOutcome: null };
    try {
      const table = await probe(move.before, options);
      assertEndgameActive(options.signal);
      const before = table ? tablebaseOutcome(table.category) : null;
      const child = table?.moves.find(candidate => candidate.uci === uci);
      const afterChild = child ? tablebaseOutcome(child.category) : null;
      if (before !== null && afterChild !== null) {
        row.exact = true; row.beforeOutcome = before; row.afterOutcome = terminalAfter === 'draw' ? 0 : terminalAfter === 'won' ? 1 : terminalAfter === 'lost' ? -1 : -afterChild as -1 | 0 | 1;
        const best = table!.moves.find(candidate => { const value = tablebaseOutcome(candidate.category); return value !== null && -value === before; });
        row.bestSan = best?.san || null; row.bestLineSan = best ? [best.san] : [];
        row.classification = row.afterOutcome < before ? 'mistake' : 'sound';
        row.explanation = row.afterOutcome < before ? before === 1 ? 'Таблица подтверждает потерю выигрыша: этот ход допускает ничью или поражение.' : 'Таблица подтверждает потерю ничьей: соперник получил выигрыш.' : 'Табличный результат сохранён. Подходит любой ход с тем же результатом; совпадение с первой линией не требуется.';
      } else {
        const beforeResult = validAnalysis(await awaitEndgameActive(engine.analyze(move.before, { nodes: budget }), options.signal), move.before);
        assertEndgameActive(options.signal);
        const played = beforeResult.bestMove === uci ? beforeResult : validAnalysis(await awaitEndgameActive(engine.analyze(move.before, { nodes: budget, searchMoves: [uci] }), options.signal), move.before, uci);
        assertEndgameActive(options.signal);
        const change = evaluateEngineChange(beforeResult.score, played.score);
        // A different technical route may reduce a numerical advantage while
        // retaining a clear search advantage. This is not proof of a win;
        // the winning goal still requires an actual victory on the board.
        if (beforeResult.score?.kind === 'cp' && played.score?.kind === 'cp' && beforeResult.score.value >= 200 && played.score.value >= 200) change.classification = 'sound';
        if (terminalAfter === 'draw' && (beforeResult.score?.kind === 'mate' ? beforeResult.score.value > 0 : (beforeResult.score?.value ?? 0) > 80)) change.classification = 'mistake';
        row.lossCp = change.lossCp; row.classification = change.classification;
        row.beforeCp = beforeResult.score?.kind === 'cp' ? beforeResult.score.value : null;
        row.afterCp = played.score?.kind === 'cp' ? played.score.value : null;
        row.bestLineSan = sanLine(move.before, beforeResult.pv.length ? beforeResult.pv : [beforeResult.bestMove!]); row.bestSan = row.bestLineSan[0] || null;
        row.explanation = change.classification === 'sound' ? 'Ограниченный анализ движка не нашёл существенной потери. Это не табличное доказательство выигрыша или ничьей.' : change.classification === 'unverified' ? row.explanation : 'Движок нашёл потерю оценки. Сравни свой план с лучшим продолжением и контригрой соперника.';
      }
    } catch { assertEndgameActive(options.signal); }
    reviews.push(row); options.onProgress?.(reviews.length, positions.length);
  }
  assertEndgameActive(options.signal);
  const terminalResult = endgameTerminalResult(board, spec.playerColor);
  const finishedReply = board.turn() === spec.playerColor || board.isGameOver();
  const criticalErrors = reviews.filter(move => move.classification === 'mistake').length;
  const unverified = reviews.some(move => move.classification === 'unverified');
  let heldExact = false;
  if (spec.goal === 'draw' && !terminalResult && positions.length >= required && finishedReply && reviews.length && reviews.every(move => move.exact && move.beforeOutcome !== null && move.beforeOutcome >= 0 && move.afterOutcome !== null && move.afterOutcome >= 0)) {
    const initial = await probe(spec.initialFen, options); const final = await probe(board.fen(), options);
    const initialResult = initial ? tablebaseOutcome(initial.category) : null; const finalResult = final ? tablebaseOutcome(final.category) : null;
    const initialPlayer = initialResult === null ? null : initialResult * (new Chess(spec.initialFen).turn() === spec.playerColor ? 1 : -1);
    const finalPlayer = finalResult === null ? null : finalResult * (board.turn() === spec.playerColor ? 1 : -1);
    heldExact = initialPlayer === 0 && finalPlayer !== null && finalPlayer >= 0;
  }
  assertEndgameActive(options.signal);
  let outcome: EndgameAudit['outcome'];
  if (terminalResult === 'lost' || criticalErrors || reviews.some(move => move.classification === 'inaccuracy') || (spec.goal === 'win' && terminalResult === 'draw')) outcome = 'needs-review';
  else if (unverified || !reviews.length) outcome = 'unverified';
  else if ((spec.goal === 'win' && terminalResult === 'won') || (spec.goal === 'draw' && (terminalResult === 'draw' || terminalResult === 'won' || heldExact))) outcome = 'passed';
  else outcome = 'incomplete';
  const summary = outcome === 'passed' ? terminalResult === 'won' ? 'Позиция доведена до победы. Ниже — проверка твоих решений.' : terminalResult === 'draw' ? 'Ничья достигнута на доске. Ниже — проверка защитных решений.' : `${positions.length} своих ходов сыграны с сохранением табличной ничьей. Выполнен учебный отрезок защиты; партия не объявляется завершённой.`
    : outcome === 'needs-review' ? terminalResult === 'lost' ? 'Партия проиграна. Найди момент, в котором защита или техника перестала работать.' : spec.goal === 'win' && terminalResult === 'draw' ? 'Выигрыш не реализован: на доске ничья. Разбери потерю преимущества.' : 'Обнаружены потери оценки или табличного результата. Разбери свои решения.'
    : outcome === 'unverified' ? 'Проверку не удалось полностью подтвердить. Это не засчитано как успешное решение; можно повторить проверку.'
    : spec.goal === 'win' ? 'Попытка не завершена победой. Сохранение положительной оценки ещё не означает реализацию; продолжи позицию.' : `Для учебной защиты нужно ${required} своих ходов и подтверждённый табличный результат либо ничья на доске. Движковая оценка сама по себе не доказывает ничью.`;
  return { outcome, terminalResult, playedOwnMoves: positions.length, requiredOwnMoves: required, summary,
    limits: `Табличный результат использует правило 50 ходов и полный FEN. Неопределённые категории не считаются доказательством. При недоступной таблице — Stockfish 19 Lite, ${budget.toLocaleString('ru-RU')} узлов на поиск; такие оценки приблизительны. Сохранённые оценки не ниже +2 допускают другую техническую линию, но сами по себе не доказывают выигрыш. Троекратное повторение и 50 ходов считаются заявленной ничьей.`,
    moves: reviews, exactMoves: reviews.filter(move => move.exact).length, engineMoves: reviews.filter(move => !move.exact && move.classification !== 'unverified').length, criticalErrors, goal: spec.goal };
}
