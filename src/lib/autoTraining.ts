import { Chess } from 'chess.js';

export interface EngineResult {
  bestMove: string | null;
  score: { kind: 'cp' | 'mate'; value: number } | null;
  pv: string[];
  depth: number;
}
export interface EngineLike {
  analyze(fen: string, options?: { nodes?: number; moveTimeMs?: number; searchMoves?: string[] }): Promise<EngineResult>;
}
export interface AutoMoveReview {
  ply: number;
  san: string;
  fenBefore: string;
  fenAfter: string;
  bestSan: string | null;
  bestLineSan: string[];
  lossCp: number | null;
  classification: 'sound' | 'inaccuracy' | 'mistake' | 'unverified';
  beforeCp: number | null;
  afterCp: number | null;
}
export interface AutoAudit {
  outcome: 'passed' | 'needs-review' | 'incomplete' | 'unverified';
  moves: AutoMoveReview[];
  playedOwnMoves: number;
  requiredOwnMoves: number;
  maxLossCp: number | null;
  summary: string;
  terminalResult: 'won' | 'lost' | 'draw' | null;
  limits: string;
}

const AUDIT_NODES = 300000;
export function playUci(game: Chess, uci: string) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error('Некорректная запись хода движка');
  return game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) });
}

/** An upstream puzzle's analysed defence is used only at its exact board node. */
export function preparedPuzzleReply(exercise: { initialFen: string; solutionSan: string[]; trainingMeta?: unknown }, fen: string): string | null {
  if (!exercise.trainingMeta) return null;
  const game = new Chess(exercise.initialFen);
  const learner = game.turn();
  for (const san of exercise.solutionSan) {
    const matches = game.turn() !== learner && game.fen() === fen;
    const move = game.move(san);
    if (matches) return `${move.from}${move.to}${move.promotion || ''}`;
  }
  return null;
}
function scoreCp(score: EngineResult['score']): number | null {
  return score?.kind === 'cp' && Number.isFinite(score.value) ? score.value : null;
}

export function evaluateEngineChange(before: EngineResult['score'], after: EngineResult['score']): { lossCp: number | null; classification: AutoMoveReview['classification'] } {
  if (!before || !after || !Number.isFinite(before.value) || !Number.isFinite(after.value)) return { lossCp: null, classification: 'unverified' };
  const winning = (score: NonNullable<EngineResult['score']>) => score.kind === 'mate' ? score.value > 0 : score.value >= 500;
  if (before.kind === 'mate' || after.kind === 'mate') {
    // A longer forced mate remains a win; mate distances are never centipawns.
    if (winning(after)) return { lossCp: null, classification: 'sound' };
    if (before.kind === 'mate' && before.value <= 0) return { lossCp: null, classification: 'sound' };
    return { lossCp: null, classification: 'mistake' };
  }
  const lossCp = Math.max(0, Math.round(before.value - after.value));
  return { lossCp, classification: winning(before) && winning(after) ? 'sound' : classifyLoss(lossCp) };
}
function lineSan(fen: string, moves: string[]): string[] {
  const game = new Chess(fen);
  const result: string[] = [];
  for (const uci of moves.slice(0, 10)) {
    try { result.push(playUci(game, uci).san); } catch { break; }
  }
  return result;
}
export function classifyLoss(lossCp: number | null): AutoMoveReview['classification'] {
  return lossCp === null ? 'unverified' : lossCp >= 200 ? 'mistake' : lossCp >= 80 ? 'inaccuracy' : 'sound';
}

/** Only called AFTER an attempt is committed. Never provides quality feedback during play. */
export async function auditAutoAttempt(
  exercise: { initialFen: string; solutionSan: string[] },
  movesUci: string[],
  engine: EngineLike,
  options: { decisionCorrect?: boolean; assisted?: boolean; isFirstAttempt?: boolean; nodes?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<AutoAudit> {
  const nodes = options.nodes ?? AUDIT_NODES;
  if (!Number.isSafeInteger(nodes) || nodes <= 0) throw new Error('Некорректный бюджет анализа');
  const game = new Chess(exercise.initialFen);
  const userColor = game.turn();
  const requiredOwnMoves = Math.max(1, Math.ceil(exercise.solutionSan.length / 2));
  const positions: { fenBefore: string; fenAfter: string; uci: string; san: string; ply: number }[] = [];
  for (let index = 0; index < movesUci.length; index += 1) {
    const fenBefore = game.fen();
    const humanMove = game.turn() === userColor;
    const move = playUci(game, movesUci[index]);
    if (humanMove) positions.push({ fenBefore, fenAfter: game.fen(), uci: movesUci[index], san: move.san, ply: index + 1 });
  }
  const terminalResult: AutoAudit['terminalResult'] = game.isCheckmate() ? game.turn() === userColor ? 'lost' : 'won' : game.isDraw() ? 'draw' : null;
  const reviews: AutoMoveReview[] = [];
  let failed = false;
  let firstRootScore: EngineResult['score'] = null;
  options.onProgress?.(0, positions.length);
  for (const position of positions) {
    try {
      const before = await engine.analyze(position.fenBefore, { nodes });
      // Compare at the SAME root and the SAME side to move, forcing the played move.
      // This avoids a colour-sign mistake for exercises where the learner plays Black.
      const chosen = before.bestMove === position.uci ? before : await engine.analyze(position.fenBefore, { nodes, searchMoves: [position.uci] });
      if (reviews.length === 0) firstRootScore = before.score;
      const beforeCp = scoreCp(before.score);
      const afterCp = scoreCp(chosen.score);
      const { lossCp, classification } = evaluateEngineChange(before.score, chosen.score);
      const bestLineSan = lineSan(position.fenBefore, before.pv.length ? before.pv : before.bestMove ? [before.bestMove] : []);
      reviews.push({ ...position, bestSan: bestLineSan[0] || null, bestLineSan, beforeCp, afterCp, lossCp, classification });
    } catch {
      failed = true;
      reviews.push({ ...position, bestSan: null, bestLineSan: [], beforeCp: null, afterCp: null, lossCp: null, classification: 'unverified' });
      break;
    }
    options.onProgress?.(reviews.length, positions.length);
  }
  const hasUnverified = failed || reviews.some(move => move.classification === 'unverified');
  const finishedReply = game.turn() === userColor || game.isGameOver();
  const horizonReached = positions.length >= requiredOwnMoves && finishedReply;
  const hasLoss = reviews.some(move => move.classification === 'inaccuracy' || move.classification === 'mistake');
  let outcome: AutoAudit['outcome'];
  const savedDraw = terminalResult === 'draw' && firstRootScore?.kind === 'cp' && firstRootScore.value < -80;
  const lostWinToDraw = terminalResult === 'draw' && firstRootScore && (firstRootScore.kind === 'mate' ? firstRootScore.value > 0 : firstRootScore.value > 80);
  if (hasUnverified) outcome = 'unverified';
  else if (terminalResult === 'lost' || lostWinToDraw) outcome = 'needs-review';
  else if (!horizonReached && terminalResult !== 'won' && !savedDraw) outcome = 'incomplete';
  else if (hasLoss || options.decisionCorrect === false) outcome = 'needs-review';
  else outcome = 'passed';
  const summaries: Record<AutoAudit['outcome'], string> = {
    passed: 'Заданный отрезок сыгран без обнаруженной существенной потери оценки. Это результат ограниченной движковой проверки, а не доказательство единственности ходов.',
    'needs-review': terminalResult === 'lost' ? 'Попытка завершилась матом твоему королю. Разбери, в какой момент защита соперника опровергла план.' : options.decisionCorrect === false ? 'Вернись к исходной оценке и плану. Ниже — проверка сыгранных ходов.' : 'В расчёте найдены потери оценки. Разбери свои решения и защитные ответы соперника.',
    incomplete: 'Попытка закончена до заданного отрезка. Ходы разобраны, но полное решение не засчитано.',
    unverified: 'Движок не смог закончить проверку. Попытка сохранена; её нельзя считать ни решённой, ни ошибочной по этому анализу.',
  };
  const losses = reviews.map(move => move.lossCp).filter((loss): loss is number => loss !== null);
  return {
    outcome, moves: reviews, playedOwnMoves: positions.length, requiredOwnMoves,
    maxLossCp: losses.length ? Math.max(...losses) : null, terminalResult, summary: summaries[outcome],
    limits: `Stockfish 19 Lite, один поток; ${nodes.toLocaleString('ru-RU')} узлов на поиск. В неясных позициях потеря от 0,8 пешки отмечена как неточность, от 2 — как существенная потеря. Сохранённый форсированный мат или оценка не ниже +5 допускают другой путь к победе. Оценки приблизительны и зависят от позиции.`,
  };
}
