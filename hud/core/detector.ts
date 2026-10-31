import { Chess } from 'chess.js';
import { inspectSacrifice, verifyBrilliantMove, type SacrificeCandidate } from '../../src/lib/brilliantMove';
import { BrowserChessEngine, type BrowserEngineAnalysis, type BrowserEngineSearchOptions } from '../../src/lib/browserEngine';

export class IncompleteAnalysisError extends Error {
  constructor(message = 'Проверка не завершена.') { super(message); this.name = 'IncompleteAnalysisError'; }
}

export interface DetectionOptions {
  /** Per-search budget. Production never lowers nonchalant's 600k-node floor. */
  nodes?: number;
  /** Absolute deadline across all searches; expiration kills the worker. */
  timeoutMs?: number;
  maxSearches?: number;
}

const abortError = () => { const e = new Error('Анализ отменён.'); e.name = 'AbortError'; return e; };
const legalMoves = (fen: string) => new Chess(fen).moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));

function usable(result: BrowserEngineAnalysis, fen: string, allowed?: string[]): boolean {
  return Boolean(result.bestMove && result.pv[0] === result.bestMove && result.score &&
    Number.isFinite(result.score.value) && !(result.score.kind === 'mate' && result.score.value === 0) &&
    result.depth >= 12 && legalMoves(fen).includes(result.bestMove) && (!allowed || allowed.includes(result.bestMove)));
}

function sound(best: BrowserEngineAnalysis['score'], chosen: BrowserEngineAnalysis['score']): boolean {
  if (!best || !chosen) return false;
  if (best.kind === 'mate') return best.value > 0 && chosen.kind === 'mate' && chosen.value > 0;
  if (chosen.kind === 'mate') return chosen.value > 0;
  return chosen.value >= -35 && best.value - chosen.value <= 40;
}

/** Compare the opponent's independent full search with the offer's root score. */
function defenseHolds(chosen: NonNullable<BrowserEngineAnalysis['score']>, defense: NonNullable<BrowserEngineAnalysis['score']>): boolean {
  const ours = { kind: defense.kind, value: -defense.value };
  if (chosen.kind === 'mate') return chosen.value > 0 && ours.kind === 'mate' && ours.value > 0;
  if (ours.kind === 'mate') return ours.value > 0;
  return ours.value >= Math.max(-35, chosen.value - 80);
}

/**
 * Finds at most three promising *sacrifices*, then reuses nonchalant verification.
 * MultiPV is a candidate generator, never evidence sufficient for a notification.
 * Only the boolean leaves this module. Callers must not display internal errors,
 * engine lines, candidates or reasons. A false result means this bounded check
 * found no confirmed candidate, not a mathematical proof that none exists.
 * The caller owns one engine per job and must recreate it after abort/failure.
 */
export async function detectBrilliant(
  fen: string,
  engine: BrowserChessEngine,
  signal: AbortSignal,
  options: DetectionOptions = {},
): Promise<{ brilliant: boolean }> {
  if (signal.aborted) throw abortError();
  const nodes = options.nodes ?? 600_000;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxSearches = options.maxSearches ?? 28;
  if (![nodes, timeoutMs, maxSearches].every(n => Number.isSafeInteger(n) && n > 0) || nodes < 600_000) throw new IncompleteAnalysisError('Некорректный бюджет проверки.');
  let timedOut = false;
  let searches = 0;
  let failure: unknown;
  const cancel = () => engine.dispose();
  signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; engine.dispose(); }, timeoutMs);
  const check = () => {
    if (signal.aborted) throw abortError();
    if (timedOut) throw new IncompleteAnalysisError('Лимит времени проверки исчерпан.');
  };
  const cache = new Map<string, BrowserEngineAnalysis>();
  const analyze = async (root: string, request: BrowserEngineSearchOptions = {}): Promise<BrowserEngineAnalysis> => {
    check();
    const query = { ...request, nodes: Math.max(nodes, request.nodes ?? nodes) };
    const key = JSON.stringify([root, query.nodes, query.multiPv ?? 1, query.searchMoves ?? null]);
    const saved = cache.get(key);
    if (saved) return saved;
    if (++searches > maxSearches) { failure = new IncompleteAnalysisError('Лимит поисков проверки исчерпан.'); throw failure; }
    try {
      const result = await engine.analyze(root, query);
      check();
      if (!usable(result, root, query.searchMoves)) throw new IncompleteAnalysisError('Недостаточная глубина или неполный ответ движка.');
      cache.set(key, result);
      return result;
    } catch (error) {
      check();
      failure = error;
      throw error;
    }
  };
  try {
    if (typeof fen !== 'string' || fen.trim().split(/\s+/).length !== 6) throw new IncompleteAnalysisError('Нужен полный FEN.');
    const board = new Chess(fen);
    if (board.isGameOver()) return { brilliant: false };
    const candidates = legalMoves(board.fen()).map(move => inspectSacrifice(board.fen(), move)).filter((c): c is SacrificeCandidate => c !== null);
    check();
    if (!candidates.length) return { brilliant: false };
    const before = await analyze(board.fen());
    const ranked = await analyze(board.fen(), { searchMoves: candidates.map(c => c.uci), multiPv: Math.min(3, candidates.length), nodes: nodes * 2 });
    const lines = ranked.lines ?? [{ bestMove: ranked.bestMove!, score: ranked.score!, depth: ranked.depth, pv: ranked.pv }];
    if (lines.length !== Math.min(3, candidates.length) || lines.some(line => line.depth < 12)) throw new IncompleteAnalysisError('Не удалось сравнить кандидатов.');
    for (const line of lines) {
      check();
      // Ranking only selects work. A MultiPV score at a different search budget
      // must not veto the website's shared verification of that candidate.
      if (line.depth < 12) continue;
      const candidate = candidates.find(c => c.uci === line.bestMove);
      if (!candidate) throw new IncompleteAnalysisError('Ответ движка не соответствует кандидатам.');
      const chosen = before.bestMove === candidate.uci ? before : await analyze(board.fen(), { searchMoves: [candidate.uci] });
      if (!sound(before.score, chosen.score)) continue;
      // Existing verifier searches the unrestricted root, forced offer, all legal
      // acceptances, and (when winning) the strongest alternative to the offer.
      const verified = await verifyBrilliantMove(candidate, before, chosen, { analyze }, { nodes, signal });
      check();
      // The shared verifier conservatively swallows failures; preserve the HUD's
      // distinction between 'checked' and 'could not complete'.
      if (failure) throw failure;
      if (!verified.brilliant) continue;
      const defense = await analyze(candidate.fenAfterMove);
      if (!defenseHolds(chosen.score!, defense.score!)) continue;
      return { brilliant: true };
    }
    return { brilliant: false };
  } catch (error) {
    check();
    if (error instanceof IncompleteAnalysisError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new IncompleteAnalysisError();
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}
