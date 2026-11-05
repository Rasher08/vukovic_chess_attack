import { Chess } from 'chess.js';
import { inspectSoundSacrifice, verifySoundSacrifice, type SacrificeCandidate } from '../../src/lib/brilliantMove';
import { BrowserChessEngine, type BrowserEngineAnalysis, type BrowserEngineSearchOptions } from '../../src/lib/browserEngine';

export class IncompleteAnalysisError extends Error {
  constructor(message = 'Проверка не завершена.', public readonly retryable = true) { super(message); this.name = 'IncompleteAnalysisError'; }
}

export type AnalysisMode = 'fast' | 'verified';
const SACRIFICE_DEPTH = 15;
export interface DetectionOptions {
  /** Fast uses the full depth15 root score; verified separately checks replies. */
  mode?: AnalysisMode;
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
 * Checks the full-search best offer first, then ranks unchecked offers in batches.
 * MultiPV is a candidate generator, never evidence sufficient for a notification.
 * Only the boolean leaves this module. Callers must not display internal errors,
 * engine lines, candidates or reasons. Budgets leave the job incomplete instead
 * of declaring unchecked candidates negative. Structural coverage is conservative.
 * The caller owns one engine per job and must recreate it after abort/failure.
 */
export async function detectSacrifice(
  fen: string,
  engine: BrowserChessEngine,
  signal: AbortSignal,
  options: DetectionOptions = {},
): Promise<{ brilliant: boolean }> {
  if (signal.aborted) throw abortError();
  if (options.mode !== undefined && !['fast', 'verified'].includes(options.mode)) throw new IncompleteAnalysisError('Неизвестный режим проверки.', false);
  const nodes = 600_000;
  const timeoutMs = options.timeoutMs ?? 90_000;
  const maxSearches = options.maxSearches ?? 36;
  if (![timeoutMs, maxSearches].every(n => Number.isSafeInteger(n) && n > 0)) throw new IncompleteAnalysisError('Некорректный бюджет проверки.', false);
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
    // A node cap can finish early at insufficient depth on a slow machine.
    // Give every search (including MultiPV ranking) time to reach its target.
    const query: BrowserEngineSearchOptions = {
      searchMoves: request.searchMoves, multiPv: request.multiPv,
      depth, moveTimeMs: 15_000,
    };
    const key = JSON.stringify([root, query.depth, query.multiPv ?? 1, query.searchMoves ?? null]);
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
    const deepAnalyze = (root: string, request: BrowserEngineSearchOptions = {}) => analyze(root, request, SACRIFICE_DEPTH);
    const before = await deepAnalyze(board.fen());
    // Under sound(), no offer can qualify against a root losing-mate score.
    if (before.score!.kind === 'mate' && before.score!.value < 0) return { brilliant: false };
    const checked = new Set<string>();
    const verify = async (candidate: SacrificeCandidate): Promise<boolean> => {
      check();
      checked.add(candidate.uci);
      // One quality pass: the offer, every acceptance and unrestricted defense
      // must actually reach depth15; the candidate-ranking search is not proof.
      const chosen = before.bestMove === candidate.uci ? before : await deepAnalyze(board.fen(), { searchMoves: [candidate.uci] });
      if (!sound(before.score, chosen.score)) return false;
      // The root search includes every legal opposing reply. Fast mode uses
      // that single horizon; verified mode also searches each child at depth15.
      if (options.mode === 'fast') return true;
      const verified = await verifySoundSacrifice(candidate, before, chosen, { analyze: deepAnalyze }, { nodes, signal });
      check();
      // The shared verifier swallows search errors; keep them incomplete.
      if (failure) throw failure;
      if (!verified.brilliant) return false;
      const defense = await deepAnalyze(candidate.fenAfterMove);
      return defenseHolds(chosen.score!, defense.score!);
    };
    const priority = candidates.find(candidate => candidate.uci === before.bestMove);
    if (priority && await verify(priority)) return { brilliant: true };
    for (;;) {
      check();
      const remaining = candidates.filter(candidate => !checked.has(candidate.uci));
      if (!remaining.length) return { brilliant: false };
      const count = Math.min(3, remaining.length);
      const ranked = await analyze(board.fen(), { searchMoves: remaining.map(c => c.uci), multiPv: count });
      const lines = ranked.lines ?? [{ bestMove: ranked.bestMove!, score: ranked.score!, depth: ranked.depth, pv: ranked.pv }];
      if (lines.length !== count || new Set(lines.map(line => line.bestMove)).size !== count ||
        lines.some(line => line.depth < 12 || !remaining.some(candidate => candidate.uci === line.bestMove))) {
        throw new IncompleteAnalysisError('Не удалось сравнить кандидатов.', false);
      }
      // Ranking orders work; its scores cannot veto independent depth15 checks.
      for (const line of lines) {
        const candidate = remaining.find(candidate => candidate.uci === line.bestMove)!;
        if (await verify(candidate)) return { brilliant: true };
      }
    }
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
