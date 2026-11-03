import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import { performance } from 'node:perf_hooks';
import { Chess } from 'chess.js';

export interface RushResult {
  move: string | null;
  depth: number;
  elapsedMs: number;
  final: boolean;
  pv: string[];
}
export interface RushEngineOptions {
  enginePath: string;
  /** Launch a native UCI executable directly instead of Node + WASM script. */
  native?: boolean;
  executablePath?: string;
  startupTimeoutMs?: number;
  searchTimeoutMs?: number;
}
interface Search {
  fen: string;
  legal: Set<string>;
  time: number;
  update?: (result: RushResult) => void;
  resolve: (result: RushResult) => void;
  reject: (error: Error) => void;
  cancelled: boolean;
  started: number;
  latest: RushResult | null;
  published: RushResult | null;
  validatedPvs: Set<string>;
  timer?: ReturnType<typeof setTimeout>;
}
const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
function aborted() { const error = new Error('Search superseded'); error.name = 'AbortError'; return error; }

/** One prewarmed process, one UCI search at a time. A cancelled WASM search must
 * finish/drain before another position is sent; otherwise its late bestmove
 * could be mistaken for the new position. Only the latest waiting search lives. */
export class RushEngine {
  private child: ChildProcessWithoutNullStreams | null = null;
  private lines: Interface | null = null;
  private initialization: Promise<void> | null = null;
  private initialized = false;
  private disposed = false;
  private awaiting: { expected: string; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private active: Search | null = null;
  private waiting: Search | null = null;

  constructor(private readonly options: RushEngineOptions) {}

  ready(): Promise<void> {
    if (this.disposed) return Promise.reject(aborted());
    if (this.initialization) return this.initialization;
    const initialization = this.initialize();
    this.initialization = initialization;
    void initialization.catch(() => { if (this.initialization === initialization) this.initialization = null; });
    return initialization;
  }

  search(fen: string, options: { moveTimeMs: number; onUpdate?: (result: RushResult) => void }): Promise<RushResult> {
    if (this.disposed) return Promise.reject(aborted());
    if (!Number.isSafeInteger(options.moveTimeMs) || options.moveTimeMs < 20 || options.moveTimeMs > 600) {
      return Promise.reject(new Error('Search time must be an integer from 20 to 600 ms'));
    }
    let board: Chess;
    try {
      if (typeof fen !== 'string' || /[\r\n]/.test(fen)) throw Error('Invalid FEN');
      board = new Chess(fen);
    } catch { return Promise.reject(new Error('Invalid FEN')); }
    const legal = new Set(board.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || '')));
    this.cancel();
    if (!legal.size) return Promise.resolve({ move: null, depth: 0, elapsedMs: 0, final: true, pv: [] });
    return new Promise<RushResult>((resolve, reject) => {
      const request: Search = { fen: board.fen(), legal, time: options.moveTimeMs, update: options.onUpdate,
        resolve, reject, cancelled: false, started: 0, latest: null, published: null, validatedPvs: new Set() };
      this.waiting = request;
      void this.ready().then(() => this.pump(), error => {
        if (this.waiting === request) { this.waiting = null; request.reject(error); }
      });
    });
  }

  cancel(): void {
    if (this.waiting) { this.waiting.cancelled = true; this.waiting.reject(aborted()); this.waiting = null; }
    if (this.active && !this.active.cancelled) {
      this.active.cancelled = true;
      this.active.reject(aborted());
      // Stockfish's single-thread WASM may receive this only after movetime.
      // Retain the active request until its bestmove has been consumed.
      this.send('stop');
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.fail(aborted());
  }

  private async initialize(): Promise<void> {
    const child = spawn(this.options.native ? this.options.enginePath : this.options.executablePath ?? process.execPath,
      this.options.native ? [] : [this.options.enginePath], {
      stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true,
    });
    this.child = child;
    this.lines = createInterface({ input: child.stdout });
    this.lines.on('line', line => { if (this.child === child) this.consume(line); });
    child.stderr.resume();
    child.on('error', () => { if (this.child === child) this.fail(new Error('Stockfish failed to start')); });
    child.on('exit', () => { if (this.child === child) this.fail(new Error('Stockfish exited')); });
    child.stdin.on('error', () => { if (this.child === child) this.fail(new Error('Stockfish connection lost')); });
    try {
      await this.expect('uci', 'uciok');
      this.send('setoption name Threads value 1');
      this.send('setoption name Hash value 32');
      this.send('setoption name MultiPV value 1');
      await this.expect('isready', 'readyok');
      if (this.disposed || this.child !== child) throw aborted();
      this.initialized = true;
    } catch (error) {
      if (this.child === child) this.fail(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private expect(command: string, expected: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.awaiting = { expected, resolve, reject,
        timer: setTimeout(() => this.fail(new Error('Stockfish initialization timed out')), this.options.startupTimeoutMs ?? 15000) };
      this.send(command);
    });
  }

  private send(command: string) { this.child?.stdin.write(command + '\n'); }

  private pump(): void {
    if (!this.initialized || this.active || !this.waiting || this.disposed) return;
    const request = this.waiting; this.waiting = null; this.active = request;
    request.started = performance.now();
    request.timer = setTimeout(() => this.fail(new Error('Stockfish search timed out')), this.options.searchTimeoutMs ?? Math.max(3000, request.time + 1500));
    this.send('position fen ' + request.fen);
    this.send('go movetime ' + request.time);
  }

  private consume(line: string): void {
    if (this.awaiting?.expected === line) {
      const awaiting = this.awaiting; this.awaiting = null; clearTimeout(awaiting.timer); awaiting.resolve(); return;
    }
    const request = this.active;
    if (!request) return;
    if (line.startsWith('info ') && !request.cancelled) {
      const result = this.parseInfo(line, request);
      if (!result || result.depth < (request.latest?.depth ?? 0)) return;
      request.latest = result;
      // A proved short mate can produce hundreds of identical depth updates.
      // Publish the first/new move immediately; bound redundant UI updates.
      if (request.published?.move === result.move && result.elapsedMs - request.published.elapsedMs < 40) return;
      request.published = result;
      // Do not let a renderer callback break protocol cleanup or UCI draining.
      try { request.update?.({ ...result, pv: [...result.pv] }); } catch { /* consumer owns callback errors */ }
      return;
    }
    if (!line.startsWith('bestmove ')) return;
    clearTimeout(request.timer);
    this.active = null;
    if (!request.cancelled) {
      const move = line.split(/\s+/)[1];
      if (!UCI_MOVE.test(move) || !request.legal.has(move)) request.reject(new Error('Stockfish returned an illegal move'));
      else {
        const same = request.latest?.move === move ? request.latest : null;
        const result: RushResult = { move, depth: same?.depth ?? 0, elapsedMs: performance.now() - request.started,
          final: true, pv: same?.pv ? [...same.pv] : [move] };
        // Promise resolution is the final update; streamed callback is interim only.
        request.resolve(result);
      }
    }
    this.pump();
  }

  private parseInfo(line: string, request: Search): RushResult | null {
    const fields = line.trim().split(/\s+/);
    if (fields[1] === 'string' || fields.includes('lowerbound') || fields.includes('upperbound')) return null;
    const single = (name: string) => { const i = fields.indexOf(name); return i > 0 && i === fields.lastIndexOf(name) ? i : -1; };
    const depthAt = single('depth'), scoreAt = single('score'), pvAt = single('pv');
    if (depthAt < 0 || scoreAt < 0 || pvAt < 0 || !/^\d+$/.test(fields[depthAt + 1] || '')) return null;
    const depth = Number(fields[depthAt + 1]);
    const kind = fields[scoreAt + 1], rawScore = fields[scoreAt + 2];
    if (!Number.isSafeInteger(depth) || depth < 1 || !['cp', 'mate'].includes(kind) || !/^-?\d+$/.test(rawScore || '') || !Number.isSafeInteger(Number(rawScore))) return null;
    // A completed, exact mate PV is useful even before ordinary depth ten.
    if (depth < 10 && !(kind === 'mate' && Number(rawScore) > 0)) return null;
    const multi = single('multipv');
    if (multi >= 0 && fields[multi + 1] !== '1') return null;
    const pv = fields.slice(pvAt + 1);
    if (!pv.length || pv.some(move => !UCI_MOVE.test(move)) || !request.legal.has(pv[0])) return null;
    const identity = pv.join(' ');
    if (!request.validatedPvs.has(identity)) {
      try {
        const board = new Chess(request.fen);
        for (const move of pv) board.move({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) });
      } catch { return null; }
      request.validatedPvs.add(identity);
    }
    return { move: pv[0], depth, elapsedMs: performance.now() - request.started, final: false, pv };
  }

  private fail(error: Error): void {
    const child = this.child; this.child = null;
    this.lines?.close(); this.lines = null;
    child?.stdin.destroy(); child?.kill('SIGKILL');
    this.initialized = false; this.initialization = null;
    if (this.awaiting) { clearTimeout(this.awaiting.timer); this.awaiting.reject(error); this.awaiting = null; }
    if (this.active) { clearTimeout(this.active.timer); if (!this.active.cancelled) this.active.reject(error); this.active = null; }
    if (this.waiting) { this.waiting.reject(error); this.waiting = null; }
  }
}
