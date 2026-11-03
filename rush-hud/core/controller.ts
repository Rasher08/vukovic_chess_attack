import { Chess } from 'chess.js';
import { validateTrustedFen } from '../../hud/core/position';
import type { RushResult } from './engine';
import type { RushState } from '../types';

export interface SearchEngine {
  ready(): Promise<void>;
  search(fen: string, options: { moveTimeMs: number; onUpdate?: (result: RushResult) => void }): Promise<RushResult>;
  cancel(): void;
  dispose(): void;
}
function aborted() { const error = Error('Позиция сменилась.'); error.name = 'AbortError'; return error; }

/** The same warm engine serves every puzzle; revisions fence off late results. */
export class RushController {
  state: RushState = { status: 'warming', fen: null, result: null, revision: 0, cached: false, error: null };
  budget = 250;
  private paused = false;
  private current: Promise<RushResult> | null = null;
  private cache = new Map<string, RushResult>();
  constructor(private engine: SearchEngine, private publish: () => void) {}
  async warm() {
    try {
      await this.engine.ready();
      if (this.state.status === 'warming') { this.state.status = 'waiting'; this.publish(); }
    } catch (error) {
      if (this.state.status === 'warming') this.fail(error);
    }
  }
  configure(value: { budget?: number; paused?: boolean }) {
    if (value.budget !== undefined && ![100, 250, 600].includes(value.budget)) throw Error('Выберите 100, 250 или 600 мс.');
    const changed = value.budget !== undefined && this.budget !== value.budget || typeof value.paused === 'boolean' && this.paused !== value.paused;
    if (value.budget !== undefined) this.budget = value.budget;
    if (typeof value.paused === 'boolean') this.paused = value.paused;
    if (changed) { this.cache.clear(); this.invalidate(); }
  }
  invalidate() {
    this.engine.cancel(); this.current = null;
    this.state = { status: this.paused ? 'paused' : 'waiting', fen: null, result: null, revision: this.state.revision + 1, cached: false, error: null };
    this.publish();
  }
  analyze(raw: string): Promise<RushResult> {
    if (this.paused) return Promise.reject(Error('HUD на паузе.'));
    let fen: string;
    try { fen = validateTrustedFen(raw); }
    catch (error) { this.invalidate(); return Promise.reject(error); }
    if (fen === this.state.fen && this.current) return this.current;
    this.engine.cancel(); this.current = null;
    const revision = this.state.revision + 1;
    const cached = this.cache.get(fen);
    this.state = { status: cached ? 'ready' : 'searching', fen, result: cached ?? null, revision, cached: !!cached, error: null };
    this.publish();
    if (cached) return Promise.resolve({ ...cached, pv: cached.pv.slice() });
    const started = performance.now();
    const update = (result: RushResult) => {
      if (revision !== this.state.revision || fen !== this.state.fen) return;
      this.state.result = { ...result, pv: result.pv.slice() }; this.publish();
    };
    const task = (async () => {
      try {
        const result = new Chess(fen).moves().length === 0
          ? { move: null, depth: 0, elapsedMs: performance.now() - started, final: true, pv: [] }
          : await this.engine.search(fen, { moveTimeMs: this.budget, onUpdate: update });
        if (revision !== this.state.revision || fen !== this.state.fen) throw aborted();
        const board = new Chess(fen);
        if (result.move) board.move({ from: result.move.slice(0, 2), to: result.move.slice(2, 4), promotion: result.move[4] });
        else if (board.moves().length) throw Error('Движок не вернул ход.');
        if (!result.final) throw Error('Поиск не завершён.');
        const saved = { ...result, pv: result.pv.slice() };
        this.cache.delete(fen); this.cache.set(fen, saved);
        if (this.cache.size > 256) this.cache.delete(this.cache.keys().next().value!);
        this.state = { ...this.state, status: 'ready', result: saved };
        this.publish(); return saved;
      } catch (error) {
        if (revision === this.state.revision && fen === this.state.fen) this.fail(error);
        throw error;
      } finally { if (revision === this.state.revision) this.current = null; }
    })();
    this.current = task;
    return task;
  }
  private fail(error: unknown) {
    this.state = { ...this.state, status: 'error', result: null, error: error instanceof Error ? error.message : 'Ошибка движка.' };
    this.publish();
  }
  dispose() { this.invalidate(); this.engine.dispose(); }
}
