import { Chess } from 'chess.js';

export type TablebaseCategory = 'win' | 'unknown' | 'syzygy-win' | 'maybe-win' | 'cursed-win' | 'draw' | 'blessed-loss' | 'maybe-loss' | 'syzygy-loss' | 'loss';
export interface EndgameTablebaseMove { uci: string; san: string; category: TablebaseCategory; dtz: number | null }
export interface EndgameTablebasePosition { fen: string; category: TablebaseCategory; moves: EndgameTablebaseMove[]; dtz: number | null }
export interface EndgameTablebaseLike { probe(fen: string, signal?: AbortSignal): Promise<EndgameTablebasePosition | null> }
export const ENDGAME_TABLEBASE_SOURCE = 'https://github.com/lichess-org/lila-tablebase';
const ENDPOINT = 'https://tablebase.lichess.org/standard';
const CATEGORIES: TablebaseCategory[] = ['win', 'unknown', 'syzygy-win', 'maybe-win', 'cursed-win', 'draw', 'blessed-loss', 'maybe-loss', 'syzygy-loss', 'loss'];

/** Only unambiguous rule-aware categories are treated as proof. */
export function tablebaseOutcome(category: TablebaseCategory): -1 | 0 | 1 | null {
  return category === 'win' ? 1 : category === 'loss' ? -1 : ['draw', 'cursed-win', 'blessed-loss'].includes(category) ? 0 : null;
}
export function endgameAbortError(): Error { const error = new Error('Проверка остановлена.'); error.name = 'AbortError'; return error; }
export function assertEndgameActive(signal?: AbortSignal): void { if (signal?.aborted) throw endgameAbortError(); }
function abortable<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  assertEndgameActive(signal);
  if (!signal) return work;
  return new Promise((resolve, reject) => {
    const onAbort = () => { cleanup(); reject(endgameAbortError()); };
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) onAbort();
  });
}
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  assertEndgameActive(signal);
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); cleanup(); reject(endgameAbortError()); };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}
export function awaitEndgameActive<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> { return abortable(work, signal); }
function clone(position: EndgameTablebasePosition): EndgameTablebasePosition { return { ...position, moves: position.moves.map(move => ({ ...move })) }; }
const dtz = (value: unknown): value is number | null => value === null || (typeof value === 'number' && Number.isSafeInteger(value));

/** Validate a complete legal response before trusting external tablebase data. */
export function parseEndgameTablebase(fen: string, data: unknown): EndgameTablebasePosition | null {
  const board = new Chess(fen);
  if (!data || typeof data !== 'object') return null;
  const root = data as { category?: unknown; moves?: unknown; dtz?: unknown };
  if (!CATEGORIES.includes(root.category as TablebaseCategory) || !Array.isArray(root.moves) || !dtz(root.dtz)) return null;
  const legal = new Map(board.moves({ verbose: true }).map(move => [move.from + move.to + (move.promotion || ''), move.san]));
  if (root.moves.length !== legal.size) return null;
  const moves: EndgameTablebaseMove[] = [];
  const seen = new Set<string>();
  for (const candidate of root.moves) {
    if (!candidate || typeof candidate !== 'object') return null;
    const move = candidate as EndgameTablebaseMove;
    if (typeof move.uci !== 'string' || !legal.has(move.uci) || seen.has(move.uci) || move.san !== legal.get(move.uci) || !CATEGORIES.includes(move.category) || !dtz(move.dtz)) return null;
    seen.add(move.uci); moves.push({ uci: move.uci, san: move.san, category: move.category, dtz: move.dtz });
  }
  const outcome = tablebaseOutcome(root.category as TablebaseCategory);
  const known = moves.map(move => tablebaseOutcome(move.category)).filter((value): value is -1 | 0 | 1 => value !== null).map(value => -value);
  if (outcome !== null && legal.size && (!known.includes(outcome) || known.some(value => value > outcome))) return null;
  return { fen: board.fen(), category: root.category as TablebaseCategory, moves, dtz: root.dtz };
}

/** Public no-auth API, one request at a time; 429 pauses probing for a minute. */
export class EndgameTablebaseClient implements EndgameTablebaseLike {
  private cache = new Map<string, EndgameTablebasePosition>();
  private queue: Promise<unknown> = Promise.resolve();
  private nextRequestAt = 0;
  private blockedUntil = 0;
  private readonly fetcher: typeof fetch;
  constructor(private readonly options: { fetcher?: typeof fetch; minIntervalMs?: number; timeoutMs?: number } = {}) {
    if (options.minIntervalMs !== undefined && (!Number.isSafeInteger(options.minIntervalMs) || options.minIntervalMs < 0)) throw new Error('Некорректный интервал табличной проверки.');
    if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1)) throw new Error('Некорректный срок табличной проверки.');
    this.fetcher = options.fetcher || ((...args) => fetch(...args));
  }
  async probe(fen: string, signal?: AbortSignal): Promise<EndgameTablebasePosition | null> {
    assertEndgameActive(signal);
    const board = new Chess(fen); const canonical = board.fen();
    if (board.board().flat().filter(Boolean).length > 7 || canonical.split(' ')[2] !== '-' || board.isGameOver()) return null;
    const cached = this.cache.get(canonical);
    if (cached) return clone(cached);
    const work = this.queue.then(async () => {
      assertEndgameActive(signal);
      const secondCache = this.cache.get(canonical);
      if (secondCache) return clone(secondCache);
      if (Date.now() < this.blockedUntil) return null;
      await wait(Math.max(0, this.nextRequestAt - Date.now()), signal);
      assertEndgameActive(signal);
      this.nextRequestAt = Date.now() + (this.options.minIntervalMs ?? 1100);
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      signal?.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 8000);
      try {
        const response = await this.fetcher(`${ENDPOINT}?fen=${encodeURIComponent(canonical)}`, { signal: controller.signal, headers: { Accept: 'application/json' } });
        assertEndgameActive(signal);
        if (response.status === 429) {
          const retry = response.headers.get('Retry-After');
          const seconds = retry !== null && /^\d+$/.test(retry) ? Number(retry) : null;
          const date = retry !== null && seconds === null ? Date.parse(retry) : NaN;
          const advised = seconds !== null && Number.isFinite(seconds) ? seconds * 1000 : Number.isFinite(date) ? date - Date.now() : 0;
          this.blockedUntil = Date.now() + Math.max(60_000, advised);
          return null;
        }
        if (!response.ok) return null;
        const parsed = parseEndgameTablebase(canonical, await response.json());
        assertEndgameActive(signal);
        if (parsed) {
          if (this.cache.size >= 1200) this.cache.delete(this.cache.keys().next().value!);
          this.cache.set(canonical, clone(parsed));
        }
        return parsed;
      } catch { assertEndgameActive(signal); return null; }
      finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
    });
    this.queue = work.catch(() => undefined);
    return abortable(work, signal);
  }
}
let shared: EndgameTablebaseClient | undefined;
export function sharedEndgameTablebase(): EndgameTablebaseClient { return shared ||= new EndgameTablebaseClient(); }
