import { BrowserChessEngine } from './browserEngine';
import { analyzeReviewGame, parseReviewPgn, summarizeReview, verifiedReviewPrefix } from './gameReview';
import type { EngineLike } from './autoTraining';
import type { ReviewGame, ReviewMoveResult, ReviewReport } from '@/types/gameReview';

export interface ReviewRecoveryState {
  /** Failed attempt number; each subsequent attempt creates a fresh worker. */
  attempt: number;
  verified: number;
  total: number;
  retryInMs: number;
  message: string;
}

export interface DisposableReviewEngine extends EngineLike { dispose(): void }

export interface ReviewRecoveryOptions {
  nodes: number;
  signal?: AbortSignal;
  resumeResults?: readonly ReviewMoveResult[];
  createEngine?: (attempt: number) => DisposableReviewEngine;
  /** A detached snapshot containing verified contiguous rows only. */
  onProgress?: (results: ReviewMoveResult[], done: number, total: number) => void;
  onRecovery?: (state: ReviewRecoveryState | null) => void;
  /** Test override; production waits one second, increasing to at most fifteen. */
  retryDelayMs?: number;
}

const MAX_RETRY_DELAY_MS = 15_000;

function abortError(): Error {
  const error = new Error('Анализ остановлен.');
  error.name = 'AbortError';
  return error;
}

function aborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function snapshot(rows: readonly ReviewMoveResult[]): ReviewMoveResult[] {
  return rows.map(row => ({
    ...row,
    pvSan: [...row.pvSan],
    beforeScore: row.beforeScore ? { ...row.beforeScore } : null,
    playedScore: row.playedScore ? { ...row.playedScore } : null,
  }));
}

/** Reject a corrupt deterministic game once, rather than retrying it forever. */
function validateGame(game: ReviewGame): void {
  const parsed = parseReviewPgn(game.pgn);
  if (parsed.id !== game.id || parsed.initialFen !== game.initialFen || parsed.moves.length !== game.moves.length || parsed.moves.some((move, index) => {
    const actual = game.moves[index];
    return !actual || move.ply !== actual.ply || move.moveNumber !== actual.moveNumber || move.color !== actual.color || move.san !== actual.san || move.uci !== actual.uci || move.fenBefore !== actual.fenBefore || move.fenAfter !== actual.fenAfter;
  })) throw new Error('Запись партии повреждена. Заново загрузи исходный PGN.');
}

function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
  aborted(signal);
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); cleanup(); reject(abortError()); };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

/**
 * Keep working at the chosen node budget until the review is complete or the
 * caller stops it. A failed worker never invalidates already verified rows.
 * Recovery waits are abortable and bounded to prevent an immediate retry loop
 * while offline or when a browser repeatedly kills a worker.
 */
export async function runReviewWithRecovery(game: ReviewGame, options: ReviewRecoveryOptions): Promise<ReviewReport> {
  aborted(options.signal);
  if (!Number.isSafeInteger(options.nodes) || options.nodes < 1) throw new Error('Некорректный бюджет анализа.');
  const retryBase = options.retryDelayMs ?? 1000;
  if (!Number.isSafeInteger(retryBase) || retryBase < 0) throw new Error('Некорректный интервал восстановления анализа.');
  validateGame(game);

  let prefix = verifiedReviewPrefix(game, options.resumeResults || []);
  let attempt = 0;
  let failuresWithoutProgress = 0;
  const createEngine = options.createEngine || (() => new BrowserChessEngine({ startupTimeoutMs: 90_000, searchIdleTimeoutMs: 90_000 }));
  const publish = () => options.onProgress?.(snapshot(prefix), prefix.length, game.moves.length);
  if (prefix.length) publish();

  try {
    while (true) {
      aborted(options.signal);
      if (prefix.length === game.moves.length) {
        options.onRecovery?.(null);
        return {
          version: 1, game, results: snapshot(prefix), nodes: options.nodes,
          analyzedAt: Date.now(), completed: true, ...summarizeReview(game, prefix),
        };
      }

      attempt += 1;
      options.onRecovery?.(null);
      const previouslyVerified = prefix.length;
      let engine: DisposableReviewEngine | null = null;
      let disposed = false;
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        try { engine?.dispose(); } catch { /* Cleanup must not hide the search or cancellation result. */ }
      };
      const onAbort = () => dispose();
      let reason = 'Движок не подтвердил текущий ход.';
      try {
        engine = createEngine(attempt);
        options.signal?.addEventListener('abort', onAbort, { once: true });
        aborted(options.signal);
        const report = await analyzeReviewGame(game, engine, {
          nodes: options.nodes, signal: options.signal, resumeResults: prefix,
          onProgress: row => {
            if (options.signal?.aborted || row.classification === 'unverified' || row.ply !== prefix.length + 1) return;
            prefix.push(snapshot([row])[0]);
            publish();
          },
        });
        aborted(options.signal);
        prefix = verifiedReviewPrefix(game, report.results);
        if (report.completed && prefix.length === game.moves.length) {
          options.onRecovery?.(null);
          return { ...report, results: snapshot(prefix), ...summarizeReview(game, prefix) };
        }
        reason = report.results.find(row => row.classification === 'unverified')?.error || reason;
      } catch (caught) {
        aborted(options.signal);
        reason = caught instanceof Error ? caught.message : 'Движок временно недоступен.';
      } finally {
        options.signal?.removeEventListener('abort', onAbort);
        dispose();
      }
      aborted(options.signal);
      failuresWithoutProgress = prefix.length > previouslyVerified ? 1 : failuresWithoutProgress + 1;
      const retryInMs = Math.min(MAX_RETRY_DELAY_MS, retryBase * 2 ** Math.min(20, failuresWithoutProgress - 1));
      options.onRecovery?.({
        attempt, verified: prefix.length, total: game.moves.length, retryInMs,
        message: `${reason} Проверенные ходы сохранены; проверка продолжится автоматически.`,
      });
      await waitForRetry(retryInMs, options.signal);
    }
  } finally {
    options.onRecovery?.(null);
  }
}
