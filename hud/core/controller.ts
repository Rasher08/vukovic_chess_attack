import type { BrowserChessEngine } from '../../src/lib/browserEngine';
import { validateTrustedFen } from './position';

export type HudStatus = 'unknown' | 'checking' | 'checked' | 'paused' | 'error';
export interface HudState { status: HudStatus; idea: boolean; revision: number }
type Verdict = { brilliant: boolean };
type Detector = (fen: string, engine: BrowserChessEngine, signal: AbortSignal) => Promise<Verdict>;

/** Only a boolean verdict crosses into UI. All search evidence stays private. */
export class HudController {
  state: HudState = { status: 'unknown', idea: false, revision: 0 };
  private fen: string | null = null;
  private engine: BrowserChessEngine | null = null;
  private abort: AbortController | null = null;
  private paused = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private cache = new Map<string, { at: number; verdict: Verdict }>();
  private announced = new Set<string>();
  constructor(private createEngine: () => BrowserChessEngine, private detect: Detector,
    private publish: (state: HudState, notify: boolean) => void,
    private retryDelay = 1500) {}

  setPaused(value: boolean) {
    this.paused = value;
    this.invalidate();
  }
  invalidate() {
    this.fen = null;
    this.cancel();
    this.emit(this.paused ? 'paused' : 'unknown');
  }
  accept(raw: string | null) {
    if (this.paused) return;
    let fen: string;
    try { if (!raw) { this.invalidateIfNeeded(); return; } fen = validateTrustedFen(raw); }
    catch { this.invalidateIfNeeded(); return; }
    if (fen === this.fen) return;
    this.cancel();
    this.fen = fen;
    const cached = this.cache.get(fen);
    if (cached && Date.now() - cached.at < 600_000) { this.finish(fen, cached.verdict); return; }
    this.emit('checking');
    void this.run(fen, this.state.revision, 0);
  }
  dispose() { this.fen = null; this.cancel(); }
  private invalidateIfNeeded() { if (this.fen !== null || !['unknown', 'paused'].includes(this.state.status)) this.invalidate(); }
  private cancel() {
    this.state = { ...this.state, revision: this.state.revision + 1 };
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.abort?.abort(); this.abort = null;
    this.engine?.dispose(); this.engine = null;
  }
  private emit(status: HudStatus, idea = false, notify = false) {
    this.state = { ...this.state, status, idea };
    this.publish({ ...this.state }, notify);
  }
  private finish(fen: string, verdict: Verdict) {
    const identity = fen.split(' ').slice(0, 4).join(' ');
    const first = verdict.brilliant && !this.announced.has(identity);
    if (first) this.announced.add(identity);
    this.emit('checked', first, first);
  }
  private async run(fen: string, revision: number, attempt: number) {
    const abort = new AbortController(); this.abort = abort;
    try {
      const engine = this.createEngine(); this.engine = engine;
      const result = await this.detect(fen, engine, abort.signal);
      if (abort.signal.aborted || revision !== this.state.revision || fen !== this.fen) return;
      this.cache.delete(fen);
      this.cache.set(fen, { at: Date.now(), verdict: { brilliant: result.brilliant === true } });
      if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value!);
      this.finish(fen, result);
    } catch {
      if (abort.signal.aborted || revision !== this.state.revision || fen !== this.fen) return;
      if (attempt === 0) {
        this.retry = setTimeout(() => {
          this.retry = null;
          if (revision === this.state.revision && this.fen === fen) void this.run(fen, revision, 1);
        }, this.retryDelay);
      } else this.emit('error');
    } finally {
      if (this.abort === abort) { this.engine?.dispose(); this.engine = null; this.abort = null; }
    }
  }
}
