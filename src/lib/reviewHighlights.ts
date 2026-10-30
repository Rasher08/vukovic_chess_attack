import { Chess } from 'chess.js';
import type { EngineLike, EngineResult } from './autoTraining';
import { inspectSacrifice } from './brilliantMove';
import type { ReviewBaseClassification, ReviewClassification, ReviewHighlightEvidence, ReviewMoveResult } from '@/types/gameReview';

type Score = NonNullable<EngineResult['score']>;
const BASE: ReviewBaseClassification[] = ['brilliant', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder', 'forced', 'unverified'];
const EXTRA = ['great', 'miss', 'trilliant'];
const scoreValid = (s: unknown): s is Score => Boolean(s && typeof s === 'object' && ['cp', 'mate'].includes((s as Score).kind) && Number.isFinite((s as Score).value) && ((s as Score).kind !== 'mate' || (s as Score).value !== 0));
const positiveInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
export const highlightWinPercent = (s: Score): number => s.kind === 'mate' ? s.value > 0 ? 100 : 0 : 100 / (1 + Math.exp(-0.00368208 * s.value));
const gap = (a: Score, b: Score) => Math.max(0, highlightWinPercent(a) - highlightWinPercent(b));
const strong = (s: Score) => s.kind === 'mate' ? s.value > 0 : s.value >= 150;
const lostEdge = (s: Score) => s.kind === 'mate' ? s.value < 0 : s.value <= 50;
const nonlosing = (s: Score) => s.kind === 'mate' ? s.value > 0 : s.value >= -35;
const sameScore = (a: Score, b: Score) => a.kind === b.kind && a.value === b.value;
const legal = (fen: string) => new Chess(fen).moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
function rowLegal(row: ReviewMoveResult): boolean {
  try {
    const board = new Chess(row.fenBefore);
    if (board.turn() !== row.color || board.fen() !== row.fenBefore || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(row.uci)) return false;
    const move = board.move({ from: row.uci.slice(0, 2), to: row.uci.slice(2, 4), promotion: row.uci[4] });
    return move.san === row.san && board.fen() === row.fenAfter;
  } catch { return false; }
}
function abort(signal?: AbortSignal) { if (signal?.aborted) { const e = new Error('Анализ отменён.'); e.name = 'AbortError'; throw e; } }

/** Recover a numerical grade, never a positive special badge from broken evidence. */
function fallback(row: ReviewMoveResult): ReviewBaseClassification {
  if (!scoreValid(row.beforeScore) || !scoreValid(row.playedScore) || !positiveInt(row.depth)) return 'unverified';
  try { if (legal(row.fenBefore).length === 1) return 'forced'; } catch { return 'unverified'; }
  const loss = gap(row.beforeScore, row.playedScore);
  if (loss >= 20) return 'blunder'; if (loss >= 10) return 'mistake'; if (loss >= 5) return 'inaccuracy';
  return row.bestSan === row.san ? 'best' : loss <= 1 ? 'excellent' : 'good';
}
function quietOffer(row: ReviewMoveResult) {
  const candidate = inspectSacrifice(row.fenBefore, row.uci);
  if (!candidate) return null;
  const board = new Chess(row.fenBefore); const move = board.move({ from: row.uci.slice(0, 2), to: row.uci.slice(2, 4), promotion: row.uci[4] });
  return move.captured || board.isCheck() ? null : candidate;
}
function validHighlight(row: ReviewMoveResult): boolean {
  try {
    const e = row.highlightEvidence;
    if (!e || e.version !== 1 || e.kind !== row.classification || e.rootFen !== row.fenBefore || e.moveUci !== row.uci || e.baseClassification !== row.baseClassification || !BASE.includes(e.baseClassification) || ['forced', 'unverified'].includes(e.baseClassification) || typeof e.reason !== 'string' || !e.reason.trim() || e.reason.length > 2000 || !positiveInt(e.nodes) || !positiveInt(e.depth) || !scoreValid(e.bestScore) || !scoreValid(e.playedScore) || !scoreValid(row.beforeScore) || !scoreValid(row.playedScore) || !positiveInt(row.depth) || !rowLegal(row) || legal(row.fenBefore).length <= 1) return false;
    if (e.kind === 'miss') return ['mistake', 'blunder'].includes(e.baseClassification) && e.baseClassification === fallback(row) && sameScore(e.bestScore, row.beforeScore) && sameScore(e.playedScore, row.playedScore) && e.depth === row.depth && strong(e.bestScore) && lostEdge(e.playedScore) && gap(e.bestScore, e.playedScore) >= 10;
    const alt = e.alternative;
    if (!alt || !scoreValid(alt.score) || alt.uci === row.uci || !legal(row.fenBefore).includes(alt.uci) || !positiveInt(alt.depth) || e.depth < 12 || alt.depth < 12 || e.nodes < 600_000 || gap(e.bestScore, e.playedScore) > 1 || gap(e.playedScore, alt.score) < 15 || !nonlosing(e.playedScore) || row.san !== row.bestSan || gap(row.beforeScore, row.playedScore) > 1) return false;
    if (e.kind === 'great') return ['best', 'excellent'].includes(e.baseClassification) && positiveInt(e.previousPly) && e.previousPly === row.ply - 1 && typeof e.previousUci === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(e.previousUci) && typeof e.previousOpponentLoss === 'number' && Number.isFinite(e.previousOpponentLoss) && e.previousOpponentLoss >= 10 && e.previousOpponentLoss <= 100;
    if (e.kind !== 'trilliant' || e.baseClassification !== 'brilliant' || typeof row.brilliantReason !== 'string' || !row.brilliantReason.trim() || e.nodes < 1_200_000 || e.depth < 16 || alt.depth < 16) return false;
    const offer = quietOffer(row);
    if (!offer || !e.acceptances || e.acceptances.length !== offer.acceptances.length || !offer.acceptances.some(a => a.investmentCp >= 300) || e.investmentCp !== Math.max(...offer.acceptances.map(a => a.investmentCp))) return false;
    return offer.acceptances.every(a => {
      const saved = e.acceptances!.find(v => v.uci === a.uci && v.fen === a.fenAfterAcceptance);
      return Boolean(saved && scoreValid(saved.score) && positiveInt(saved.depth) && saved.depth >= 16 && acceptanceHolds(e.playedScore, saved.score));
    });
  } catch { return false; }
}
function acceptanceHolds(chosen: Score, accepted: Score) {
  if (chosen.kind === 'mate') return chosen.value > 0 && accepted.kind === 'mate' && accepted.value > 0;
  return accepted.kind === 'mate' ? accepted.value > 0 : accepted.value >= Math.max(-35, chosen.value - 80);
}

/** Structural/metric validation, not a claim of cryptographic proof of an engine run. */
export function safeReviewClassification(row: ReviewMoveResult): ReviewClassification {
  if (EXTRA.includes(row.classification)) return validHighlight(row) ? row.classification : fallback(row);
  return BASE.includes(row.classification as ReviewBaseClassification) ? row.classification : 'unverified';
}
export function getVerifiedHighlightReason(row: ReviewMoveResult): string | null {
  if (!EXTRA.includes(row.classification) || !validHighlight(row)) return null;
  if (row.classification === 'miss') return 'Был явный перевес, но ход упустил его: потеря не менее 10 процентных пунктов расчётных шансов. Базовая оценка ошибки сохранена.';
  if (row.classification === 'great') return 'После ошибки соперника найден единственный сильный ход: лучший другой кандидат уступает не менее 15 процентных пунктов расчётных шансов в усиленном поиске.';
  return 'Тихая жертва минимум трёх пешек подтверждена усиленным поиском, проверкой принятия и лучшей альтернативы. Это экспериментальный критерий nonchalant, а не измерение трудности для человека.';
}
export function hasVerifiedAdventure(row: ReviewMoveResult): boolean {
  if (!row.adventurous) return false;
  try {
    const e = row.adventurous; const base = fallback(row);
    if (!['inaccuracy', 'mistake', 'blunder', 'miss'].includes(safeReviewClassification(row)) || !rowLegal(row)) return false;
    if (!e || e.version !== 1 || e.rootFen !== row.fenAfter || e.moveUci !== row.uci || !['inaccuracy', 'mistake', 'blunder'].includes(base) || !inspectSacrifice(row.fenBefore, row.uci) || typeof e.reason !== 'string' || !e.reason.trim() || e.reason.length > 2000 || !positiveInt(e.nodes) || e.nodes < 600_000 || !positiveInt(e.depth) || e.depth < 12 || !scoreValid(e.replyScore) || !scoreValid(e.alternativeReplyScore) || !Number.isFinite(e.replyGapWinPercent) || e.replyGapWinPercent !== gap(e.replyScore, e.alternativeReplyScore) || e.replyGapWinPercent < 15 || highlightWinPercent(e.replyScore) < 65 || highlightWinPercent(e.alternativeReplyScore) > 55 || e.bestReplyUci === e.alternativeReplyUci) return false;
    const replies = legal(row.fenAfter);
    return replies.includes(e.bestReplyUci) && replies.includes(e.alternativeReplyUci);
  } catch { return false; }
}
/** Drop only invalid new metadata; old report versions remain readable. */
export function sanitizeReviewHighlights(row: ReviewMoveResult, previous?: ReviewMoveResult, requirePrevious = false): ReviewMoveResult {
  let classification = safeReviewClassification(row);
  if (classification === 'great' && requirePrevious && !previous) classification = fallback(row);
  if (classification === 'great' && previous && (!scoreValid(previous.beforeScore) || !scoreValid(previous.playedScore) || previous.classification === 'unverified' || previous.classification === 'forced' || previous.ply !== row.highlightEvidence?.previousPly || previous.uci !== row.highlightEvidence?.previousUci || previous.fenAfter !== row.fenBefore || previous.color === row.color || gap(previous.beforeScore, previous.playedScore) !== row.highlightEvidence?.previousOpponentLoss)) classification = fallback(row);
  const next = { ...row, classification };
  if (classification !== row.classification || !EXTRA.includes(classification)) { delete next.highlightEvidence; delete next.baseClassification; }
  else next.highlightEvidence = JSON.parse(JSON.stringify(row.highlightEvidence));
  if (!hasVerifiedAdventure(next)) delete next.adventurous;
  else next.adventurous = JSON.parse(JSON.stringify(row.adventurous));
  return next;
}

/** Extra searches are restricted to contextual best moves and material offers. */
export async function enhanceReviewMove(row: ReviewMoveResult, previous: ReviewMoveResult | undefined, engine: EngineLike, options: { nodes: number; signal?: AbortSignal; isBook?: boolean; previousIsBook?: boolean }): Promise<ReviewMoveResult> {
  abort(options.signal);
  if (options.isBook || ['forced', 'unverified'].includes(row.classification) || !scoreValid(row.beforeScore) || !scoreValid(row.playedScore)) return row;
  let result = row;
  const base = row.classification as ReviewBaseClassification;
  const evidence = (kind: ReviewHighlightEvidence['kind'], nodes: number, best: EngineResult, chosen = best): ReviewHighlightEvidence => ({ version: 1, kind, rootFen: row.fenBefore, moveUci: row.uci, baseClassification: base, reason: 'Проверено критериями nonchalant.', nodes, depth: Math.min(best.depth, chosen.depth), bestScore: { ...best.score! }, playedScore: { ...chosen.score! } });
  const analyze = async (fen: string, nodes: number, allowed?: string[]) => {
    abort(options.signal); const value = await engine.analyze(fen, { nodes, ...(allowed ? { searchMoves: allowed } : {}) }); abort(options.signal);
    if (!scoreValid(value.score) || !positiveInt(value.depth) || value.depth < 12 || !value.bestMove || !legal(fen).includes(value.bestMove) || (allowed && !allowed.includes(value.bestMove))) throw new Error('Highlight search was not confirmed');
    return value;
  };
  if (['mistake', 'blunder'].includes(base) && strong(row.beforeScore) && lostEdge(row.playedScore) && gap(row.beforeScore, row.playedScore) >= 10) {
    const e = evidence('miss', options.nodes, { bestMove: row.uci, score: row.beforeScore, depth: row.depth, pv: [] }, { bestMove: row.uci, score: row.playedScore, depth: row.depth, pv: [] });
    result = { ...row, classification: 'miss', baseClassification: base, highlightEvidence: e };
  }
  try {
    const offer = inspectSacrifice(row.fenBefore, row.uci);
    if (base === 'brilliant' && quietOffer(row) && offer?.acceptances.some(a => a.investmentCp >= 300)) {
      const nodes = Math.max(1_200_000, options.nodes * 6); const best = await analyze(row.fenBefore, nodes);
      if (best.bestMove !== row.uci || best.depth < 16 || !nonlosing(best.score!)) return result;
      const alternative = await analyze(row.fenBefore, nodes, legal(row.fenBefore).filter(m => m !== row.uci));
      if (alternative.depth < 16 || gap(best.score!, alternative.score!) < 15) return result;
      const acceptances = [];
      for (const a of offer.acceptances) {
        const accepted = await analyze(a.fenAfterAcceptance, nodes);
        if (accepted.depth < 16 || !acceptanceHolds(best.score!, accepted.score!)) return result;
        acceptances.push({ fen: a.fenAfterAcceptance, uci: a.uci, score: accepted.score!, depth: accepted.depth });
      }
      const e = evidence('trilliant', nodes, best); e.alternative = { uci: alternative.bestMove!, score: alternative.score!, depth: alternative.depth }; e.investmentCp = Math.max(...offer.acceptances.map(a => a.investmentCp)); e.acceptances = acceptances;
      result = { ...row, classification: 'trilliant', baseClassification: base, highlightEvidence: e };
    } else if (['best', 'excellent'].includes(base) && row.uci && row.san === row.bestSan && gap(row.beforeScore, row.playedScore) <= 1 && previous && !options.previousIsBook && previous.color !== row.color && previous.ply === row.ply - 1 && previous.fenAfter === row.fenBefore && !['forced', 'unverified'].includes(previous.classification) && scoreValid(previous.beforeScore) && scoreValid(previous.playedScore) && gap(previous.beforeScore, previous.playedScore) >= 10) {
      const nodes = Math.max(600_000, options.nodes * 3); const best = await analyze(row.fenBefore, nodes);
      if (best.bestMove !== row.uci || !nonlosing(best.score!)) return result;
      const alternative = await analyze(row.fenBefore, nodes, legal(row.fenBefore).filter(m => m !== row.uci));
      if (gap(best.score!, alternative.score!) < 15) return result;
      const e = evidence('great', nodes, best); e.alternative = { uci: alternative.bestMove!, score: alternative.score!, depth: alternative.depth }; e.previousOpponentLoss = gap(previous.beforeScore, previous.playedScore); e.previousPly = previous.ply; e.previousUci = previous.uci;
      result = { ...row, classification: 'great', baseClassification: base, highlightEvidence: e };
    } else if (['inaccuracy', 'mistake', 'blunder'].includes(base) && offer && legal(row.fenAfter).length > 1 && !new Chess(row.fenAfter).isGameOver()) {
      const nodes = Math.max(600_000, options.nodes * 3); const reply = await analyze(row.fenAfter, nodes);
      const alternative = await analyze(row.fenAfter, nodes, legal(row.fenAfter).filter(m => m !== reply.bestMove));
      const e = { version: 1 as const, rootFen: row.fenAfter, moveUci: row.uci, reason: 'Защита с единственным точным ответом по усиленному поиску.', nodes, depth: Math.min(reply.depth, alternative.depth), replyGapWinPercent: gap(reply.score!, alternative.score!), bestReplyUci: reply.bestMove!, alternativeReplyUci: alternative.bestMove!, replyScore: reply.score!, alternativeReplyScore: alternative.score! };
      const candidate = { ...result, adventurous: e };
      if (hasVerifiedAdventure(candidate)) result = candidate;
    }
  } catch (caught) { abort(options.signal); if (caught instanceof Error && caught.name === 'AbortError') throw caught; }
  const safe = sanitizeReviewHighlights(result, previous);
  const reason = getVerifiedHighlightReason(safe);
  if (safe.highlightEvidence && reason) safe.highlightEvidence.reason = reason;
  return safe;
}
