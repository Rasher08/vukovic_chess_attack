import { Chess } from 'chess.js';

export interface BrowserEngineLine {
  bestMove: string;
  /** UCI score from the side to move at the search root. */
  score: { kind: 'cp' | 'mate'; value: number };
  pv: string[];
  depth: number;
}

export interface BrowserEngineAnalysis {
  bestMove: string | null;
  /** UCI score from the side to move in the supplied FEN, never White's POV. */
  score: { kind: 'cp' | 'mate'; value: number } | null;
  pv: string[];
  depth: number;
  /** Present for MultiPV searches; only comparable, legal lines are included. */
  lines?: BrowserEngineLine[];
}

export interface BrowserEngineSearchOptions {
  nodes?: number;
  moveTimeMs?: number;
  searchMoves?: string[];
  multiPv?: number;
}

interface EngineConstructionOptions {
  /** Dependency injection for lifecycle/protocol tests. No Worker is created eagerly. */
  workerFactory?: () => Worker;
  startupTimeoutMs?: number;
  /** Legacy absolute search deadline, used when searchIdleTimeoutMs is absent. */
  searchTimeoutMs?: number;
  /** Opt-in inactivity window: genuine UCI depth/node progress extends a search. */
  searchIdleTimeoutMs?: number;
}

interface PendingCommand {
  consume: (line: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** A score and PV must come from one complete UCI info line, at one depth. */
function parseSearchLine(line: string, fen: string, count: number, restricted?: string[]): { rank: number; line: BrowserEngineLine } | null {
  const tokens = line.split(/\s+/);
  if (tokens[0] !== 'info' || tokens[1] === 'string' || tokens.includes('lowerbound') || tokens.includes('upperbound')) return null;
  const integer = (field: string, minimum: number): number | null => {
    const index = tokens.indexOf(field);
    if (index < 0 || index !== tokens.lastIndexOf(field) || !/^\d+$/.test(tokens[index + 1] || '')) return null;
    const value = Number(tokens[index + 1]);
    return Number.isSafeInteger(value) && value >= minimum ? value : null;
  };
  const rank = tokens.includes('multipv') ? integer('multipv', 1) : 1;
  const depth = integer('depth', 1);
  const scoreIndex = tokens.indexOf('score');
  const pvIndex = tokens.indexOf('pv');
  if (rank === null || rank > count || depth === null || scoreIndex < 0 || scoreIndex !== tokens.lastIndexOf('score') || pvIndex < 0 || pvIndex !== tokens.lastIndexOf('pv')) return null;
  const kind = tokens[scoreIndex + 1]; const rawScore = tokens[scoreIndex + 2];
  if (!['cp', 'mate'].includes(kind) || !/^-?\d+$/.test(rawScore || '') || !Number.isSafeInteger(Number(rawScore))) return null;
  const pv = tokens.slice(pvIndex + 1);
  if (!pv.length || pv.some(move => !UCI_MOVE.test(move)) || (restricted?.length && !restricted.includes(pv[0]))) return null;
  try {
    const board = new Chess(fen);
    for (const move of pv) board.move({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) });
  } catch { return null; }
  return { rank, line: { bestMove: pv[0], score: { kind: kind as 'cp' | 'mate', value: Number(rawScore) }, pv, depth } };
}

/** A search can be slow without being stuck. Repeated status text is not progress. */
function searchProgress() {
  let lastDepth = 0;
  let lastNodes = 0;
  return (line: string): boolean => {
    const tokens = line.split(/\s+/);
    if (tokens[0] !== 'info' || tokens[1] === 'string') return false;
    const scoreIndex = tokens.indexOf('score');
    if (scoreIndex !== -1 && (!['cp', 'mate'].includes(tokens[scoreIndex + 1]) ||
      !/^-?\d+$/.test(tokens[scoreIndex + 2] || '') || !Number.isSafeInteger(Number(tokens[scoreIndex + 2])))) return false;
    let depth = lastDepth; let nodes = lastNodes;
    for (const field of ['depth', 'nodes'] as const) {
      const index = tokens.indexOf(field);
      if (index === -1) continue;
      const value = tokens[index + 1];
      // Ignore incomplete, duplicate or malformed numeric fields entirely.
      if (!value || !/^\d+$/.test(value) || tokens.lastIndexOf(field) !== index) return false;
      const number = Number(value);
      if (!Number.isSafeInteger(number)) return false;
      if (field === 'depth') depth = number; else nodes = number;
    }
    const advanced = depth > lastDepth || nodes > lastNodes;
    lastDepth = Math.max(lastDepth, depth);
    lastNodes = Math.max(lastNodes, nodes);
    return advanced;
  };
}

/** A private, single-threaded UCI Worker. Calls are serialized, including readiness. */
export class BrowserChessEngine {
  private worker: Worker | null = null;
  private initialization: Promise<void> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private pending: PendingCommand | null = null;
  private failure: Error | null = null;
  private disposed = false;

  constructor(private readonly options: EngineConstructionOptions = {}) {}

  ready(): Promise<void> {
    try { this.assertUsable(); } catch (error) { return Promise.reject(error); }
    if (!this.initialization) this.initialization = this.initialize();
    return this.initialization;
  }

  analyze(fen: string, options: BrowserEngineSearchOptions = {}): Promise<BrowserEngineAnalysis> {
    // Snapshot inputs now so a caller cannot change a queued search by mutating its array.
    const request = { ...options, searchMoves: options.searchMoves?.slice() };
    const result = this.queue.then(async () => {
      this.assertUsable();
      if (typeof fen !== 'string' || /[\r\n]/.test(fen)) throw new Error('Invalid engine FEN');
      const board = new Chess(fen);
      for (const value of [request.nodes, request.moveTimeMs]) {
        if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) {
          throw new Error('Engine search limits must be positive integers');
        }
      }
      const multiPv = request.multiPv ?? 1;
      if (!Number.isSafeInteger(multiPv) || multiPv < 1 || multiPv > 3) throw new Error('Engine MultiPV must be an integer from 1 to 3');
      const idleTimeout = this.options.searchIdleTimeoutMs;
      if (idleTimeout !== undefined && (!Number.isSafeInteger(idleTimeout) || idleTimeout <= 0)) {
        throw new Error('Engine search idle timeout must be a positive integer');
      }
      const legal = new Set(board.moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || '')));
      if (request.searchMoves?.some(move => !UCI_MOVE.test(move) || !legal.has(move))) {
        throw new Error('searchMoves must contain legal UCI moves for this position');
      }
      await this.ready();
      this.assertUsable();
      this.send('ucinewgame');
      // The same private worker can serve both review MultiPV and ordinary play.
      this.send('setoption name MultiPV value ' + multiPv);
      await this.expect('isready', 'readyok', this.startupTimeout);
      this.send('position fen ' + board.fen());

      const limits = request.nodes !== undefined ? `nodes ${request.nodes}`
        : request.moveTimeMs !== undefined ? '' : 'nodes 200000';
      const time = request.moveTimeMs !== undefined ? `movetime ${request.moveTimeMs}` : '';
      const restricted = request.searchMoves?.length ? 'searchmoves ' + request.searchMoves.join(' ') : '';
      const command = ['go', limits, time, restricted].filter(Boolean).join(' ');
      const timeout = Math.max(idleTimeout ?? this.options.searchTimeoutMs ?? 30000, request.moveTimeMs === undefined ? 0 : request.moveTimeMs + 10000);
      const analysis: BrowserEngineAnalysis = { bestMove: null, score: null, pv: [], depth: 0 };
      const candidates = new Map<number, BrowserEngineLine>();
      const availableCount = Math.min(multiPv, request.searchMoves?.length ? new Set(request.searchMoves).size : legal.size);
      const iterations = new Map<number, Map<number, BrowserEngineLine>>();
      const completeIterations = new Map<number, BrowserEngineLine[]>();

      return this.exchange<BrowserEngineAnalysis>(command, timeout, (line, resolve) => {
        if (line.startsWith('info ')) {
          const parsed = parseSearchLine(line, board.fen(), multiPv, request.searchMoves);
          if (parsed) {
            if (parsed.line.depth >= (candidates.get(parsed.rank)?.depth ?? 0)) candidates.set(parsed.rank, parsed.line);
            if (multiPv > 1) {
              const depth = parsed.line.depth;
              let rows = iterations.get(depth);
              // A fresh rank-one update starts another batch at this depth.
              // Keep the last complete snapshot while that batch is unfinished.
              if (!rows || (parsed.rank === 1 && rows.has(1))) { rows = new Map(); iterations.set(depth, rows); }
              rows.set(parsed.rank, parsed.line);
              const ranked = Array.from({ length: availableCount }, (_, index) => rows!.get(index + 1));
              if (ranked.length && ranked.every((row): row is BrowserEngineLine => row !== undefined) && new Set(ranked.map(row => row.bestMove)).size === availableCount) completeIterations.set(depth, ranked);
            }
          }
        }
        if (line.startsWith('bestmove ')) {
          const move = line.split(/\s+/)[1];
          if (['(none)', '0000', 'null', 'none'].includes(move)) {
            if (legal.size) throw new Error('Engine returned no move in a non-terminal position');
            analysis.bestMove = null;
          } else {
            if (!UCI_MOVE.test(move) || !legal.has(move)) throw new Error('Engine returned an illegal move');
            if (request.searchMoves?.length && !request.searchMoves.includes(move)) {
              throw new Error('Engine returned a move outside searchMoves');
            }
            analysis.bestMove = move;
          }
          let first = candidates.get(1);
          if (multiPv > 1) {
            // A node limit can end just after PV1 of the next iteration. Prefer
            // the deepest complete, comparable set, provided its first move is
            // still the engine's final bestmove; never mislabel an older choice.
            const complete = Array.from(completeIterations.entries()).sort(([a], [b]) => b - a)
              .find(([, rows]) => rows[0].bestMove === analysis.bestMove)?.[1];
            if (complete) { analysis.lines = complete; first = complete[0]; }
            else {
              const seen = new Set<string>();
              analysis.lines = first?.bestMove === analysis.bestMove ? Array.from(candidates.entries())
                .sort(([a], [b]) => a - b)
                .filter(([, candidate]) => {
                  if (candidate.depth !== first!.depth || seen.has(candidate.bestMove)) return false;
                  seen.add(candidate.bestMove); return true;
                }).map(([, candidate]) => candidate) : [];
            }
          }
          if (first && first.bestMove === analysis.bestMove) {
            analysis.score = first.score; analysis.pv = first.pv; analysis.depth = first.depth;
          }
          resolve(analysis);
        }
      }, idleTimeout === undefined ? undefined : searchProgress());
    });
    // Rejection of one invalid request must not poison subsequent queued requests.
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const error = new Error('Chess engine disposed');
    error.name = 'AbortError';
    this.fail(error);
  }

  private get startupTimeout(): number { return this.options.startupTimeoutMs ?? 45000; }

  private assertUsable(): void {
    if (this.failure) throw this.failure;
    if (this.disposed) throw new Error('Chess engine disposed');
  }

  private async initialize(): Promise<void> {
    try {
      this.worker = this.options.workerFactory ? this.options.workerFactory()
        : new Worker('/engine/stockfish-19-lite-single.js');
      this.worker.addEventListener('message', this.onMessage);
      this.worker.addEventListener('error', this.onError);
      this.worker.addEventListener('messageerror', this.onMessageError);
      await this.expect('uci', 'uciok', this.startupTimeout);
      this.send('setoption name Threads value 1');
      this.send('setoption name Hash value 32');
      this.send('setoption name MultiPV value 1');
      await this.expect('isready', 'readyok', this.startupTimeout);
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
      throw this.failure;
    }
  }

  private send(command: string): void {
    this.assertUsable();
    if (!this.worker) throw new Error('Chess engine is not initialized');
    this.worker.postMessage(command);
  }

  private expect(command: string, response: string, timeout: number): Promise<void> {
    return this.exchange<void>(command, timeout, (line, resolve) => { if (line === response) resolve(); });
  }

  private exchange<T>(command: string, timeout: number, consume: (line: string, resolve: (value: T) => void) => void, progress?: (line: string) => boolean): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.assertUsable();
      if (this.pending) throw new Error('Concurrent UCI command');
      const finish = (value: T) => {
        if (this.pending !== pending) return;
        clearTimeout(pending.timer);
        this.pending = null;
        resolve(value);
      };
      const pending: PendingCommand = {
        consume: line => {
          if (progress?.(line) && this.pending === pending) {
            clearTimeout(pending.timer);
            pending.timer = setTimeout(() => this.fail(new Error('Chess engine response timed out')), timeout);
          }
          consume(line, finish);
        },
        reject,
        timer: setTimeout(() => this.fail(new Error('Chess engine response timed out')), timeout),
      };
      this.pending = pending;
      try { this.send(command); } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private readonly onMessage = (event: MessageEvent<unknown>): void => {
    if (typeof event.data !== 'string') return;
    for (const raw of event.data.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      try {
        if (/^(?:Error|ERROR|RuntimeError|exception|Unknown command)\b/.test(line) || /^info string CRITICAL ERROR\b/.test(line)) throw new Error(line);
        this.pending?.consume(line);
      } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
    }
  };

  private readonly onError = (event: ErrorEvent): void => {
    event.preventDefault();
    this.fail(new Error(event.message || 'Could not load the chess engine'));
  };

  private readonly onMessageError = (): void => { this.fail(new Error('Could not read the chess engine response')); };

  private fail(error: Error): void {
    this.failure ??= error;
    const pending = this.pending;
    this.pending = null;
    if (pending) { clearTimeout(pending.timer); pending.reject(this.failure); }
    if (this.worker) {
      this.worker.removeEventListener('message', this.onMessage);
      this.worker.removeEventListener('error', this.onError);
      this.worker.removeEventListener('messageerror', this.onMessageError);
      this.worker.terminate();
      this.worker = null;
    }
  }
}
