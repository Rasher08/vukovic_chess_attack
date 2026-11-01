import { Chess } from 'chess.js';
import { inspectSoundSacrifice, verifySoundSacrifice, type SacrificeCandidate } from '../../src/lib/brilliantMove';
import { BrowserChessEngine, type BrowserEngineAnalysis, type BrowserEngineSearchOptions } from '../../src/lib/browserEngine';

export class IncompleteAnalysisError extends Error {
  constructor(message = 'Проверка не завершена.', public readonly retryable = true) { super(message); this.name = 'IncompleteAnalysisError'; }
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

function usable(result: BrowserEngineAnalysis, fen: string, allowed?: string[], depth = 12): boolean {
  return Boolean(result.bestMove && result.pv[0] === result.bestMove && result.score &&
    Number.isFinite(result.score.value) && !(result.score.kind === 'mate' && result.score.value === 0) &&
    result.depth >= depth && legalMoves(fen).includes(result.bestMove) && (!allowed || allowed.includes(result.bestMove)));
}

function sound(best: BrowserEngineAnalysis['score'], chosen: BrowserEngineAnalysis['score']): boolean {
  if (!best || !chosen) return false;
  if (best.kind === 'mate') return best.value > 0 && chosen.kind === 'mate' && chosen.value > 0;
  if (chosen.kind === 'mate') return chosen.value > 0;
  return chosen.value >= 0 && best.value - chosen.value <= 40;
}

/** Compare the opponent's independent full search with the offer's root score. */
function defenseHolds(chosen: NonNullable<BrowserEngineAnalysis['score']>, defense: NonNullable<BrowserEngineAnalysis['score']>): boolean {
  const ours = { kind: defense.kind, value: -defense.value };
  if (chosen.kind === 'mate') return chosen.value > 0 && ours.kind === 'mate' && ours.value > 0;
  if (ours.kind === 'mate') return ours.value > 0;
  return ours.value >= Math.max(0, chosen.value - 80);
}

/**
 * Finds at most three promising material offers, then verifies compensation.
 * MultiPV is a candidate generator, never evidence sufficient for a notification.
 * Only the boolean leaves this module. Callers must not display internal errors,
 * engine lines, candidates or reasons. A false result means this bounded check
 * found no confirmed candidate, not a mathematical proof that none exists.
 * The caller owns one engine per job and must recreate it after abort/failure.
 */
export async function detectSacrifice(
  fen: string,
  engine: BrowserChessEngine,
  signal: AbortSignal,
  options: DetectionOptions = {},
): Promise<{ brilliant: boolean }> {
  if (signal.aborted) throw abortError();
  const nodes = options.nodes ?? 600_000;
  const timeoutMs = options.timeoutMs ?? 90_000;
  const maxSearches = options.maxSearches ?? 36;
  if (![nodes, timeoutMs, maxSearches].every(n => Number.isSafeInteger(n) && n > 0) || nodes < 600_000 || nodes > 9_600_000) throw new IncompleteAnalysisError('Некорректный бюджет проверки.', false);
  let timedOut = false;
  let searches = 0;
  let failure: unknown;
  const cancel = () => engine.dispose();
  signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; engine.dispose(); }, timeoutMs);
  const check = () => {
    if (signal.aborted) throw abortError();
    if (timedOut) throw new IncompleteAnalysisError('Лимит времени проверки исчерпан.', false);
  };
  const cache = new Map<string, BrowserEngineAnalysis>();
  const analyze = async (root: string, request: BrowserEngineSearchOptions = {}, depth = 12): Promise<BrowserEngineAnalysis> => {
    check();
    const query = { ...request, nodes: depth >= 20
      ? Math.min(9_600_000, Math.max(nodes * (depth >= 22 ? 16 : 8), (request.nodes ?? nodes) * 8))
      : Math.max(nodes, request.nodes ?? nodes), ...(depth >= 20 ? { depth } : {}) };
    const key = JSON.stringify([root, query.nodes, query.depth ?? null, query.multiPv ?? 1, query.searchMoves ?? null]);
    const saved = cache.get(key);
    if (saved) return saved;
    if (++searches > maxSearches) { failure = new IncompleteAnalysisError('Лимит поисков проверки исчерпан.', false); throw failure; }
    try {
      const result = await engine.analyze(root, query);
      check();
      if (!usable(result, root, query.searchMoves, depth)) throw new IncompleteAnalysisError('Недостаточная глубина или неполный ответ движка.', result.depth >= depth);
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
    const candidates = legalMoves(board.fen()).map(move => inspectSoundSacrifice(board.fen(), move)).filter((c): c is SacrificeCandidate => c !== null);
    check();
    if (!candidates.length) return { brilliant: false };
    const ranked = await analyze(board.fen(), { searchMoves: candidates.map(c => c.uci), multiPv: Math.min(3, candidates.length), nodes: nodes * 2 });
    const lines = ranked.lines ?? [{ bestMove: ranked.bestMove!, score: ranked.score!, depth: ranked.depth, pv: ranked.pv }];
    if (lines.length !== Math.min(3, candidates.length) || lines.some(line => line.depth < 12)) throw new IncompleteAnalysisError('Не удалось сравнить кандидатов.', false);
    for (const line of lines) {
      check();
      // Ranking only selects work. A MultiPV score at a different search budget
      // must not veto the Tal profile's independent verification of a candidate.
      if (line.depth < 12) continue;
      const candidate = candidates.find(c => c.uci === line.bestMove);
      if (!candidate) throw new IncompleteAnalysisError('Ответ движка не соответствует кандидатам.');
      let confirmed = true;
      // The first positive is provisional. Re-run the SAME offer, all its
      // acceptances and unrestricted defense at a strictly greater depth.
      for (const depth of [20, 22]) {
        const deepAnalyze = (root: string, request: BrowserEngineSearchOptions = {}) => analyze(root, request, depth);
        const before = await deepAnalyze(board.fen());
        // Tal accepts a sound offer even when another move ranks first. The
        // exact same candidate must hold up at both independent search depths.
        const chosen = before.bestMove === candidate.uci ? before : await deepAnalyze(board.fen(), { searchMoves: [candidate.uci] });
        if (!sound(before.score, chosen.score)) { confirmed = false; break; }
        const verified = await verifySoundSacrifice(candidate, before, chosen, { analyze: deepAnalyze }, { nodes, signal });
        check();
        // The shared verifier swallows search errors; keep them incomplete.
        if (failure) throw failure;
        if (!verified.brilliant) { confirmed = false; break; }
        const defense = await deepAnalyze(candidate.fenAfterMove);
        if (!defenseHolds(chosen.score!, defense.score!)) { confirmed = false; break; }
      }
      if (!confirmed) continue;
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

/** Legacy name and boolean field retained for controller/bridge compatibility.
 * They now report Tal's sound-sacrifice profile, not a brilliant-move award.
 */
export const detectBrilliant = detectSacrifice;
