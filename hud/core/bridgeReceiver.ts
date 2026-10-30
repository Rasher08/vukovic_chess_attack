import { timingSafeEqual } from 'node:crypto';
import { validateTrustedFen } from './position';

export const localOrigin = (origin: string) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin);
type Source = { sequence: number; seen: number; fen: string | null };

/** A heartbeat is a lease, never a lasting assertion that the board is current. */
export class BridgeReceiver {
  private sources = new Map<string, Source>();
  private pending: string | null = null;
  private since = 0;
  private samples = 0;
  status: 'waiting' | 'connected' | 'conflict' = 'waiting';
  constructor(private token: string, private emit: (fen: string | null) => void) {}
  reset() { this.sources.clear(); this.pending = null; this.samples = 0; this.status = 'waiting'; this.emit(null); }
  receive(value: unknown, now = Date.now()): boolean {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    if (typeof p.token !== 'string' || !/^[a-f0-9]{64}$/.test(p.token) || p.token.length !== this.token.length || !timingSafeEqual(Buffer.from(p.token), Buffer.from(this.token))) return false;
    if (typeof p.session !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(p.session) ||
      !Number.isSafeInteger(p.sequence) || (p.sequence as number) < 0 ||
      typeof p.sentAt !== 'number' || !Number.isFinite(p.sentAt) || Math.abs(now - p.sentAt) > 1800 ||
      !['white', 'black'].includes(p.orientation as string)) return false;
    let fen: string | null;
    try { fen = p.fen === null ? null : validateTrustedFen(p.fen as string); } catch { return false; }
    this.prune(now);
    const previous = this.sources.get(p.session);
    if ((previous && (p.sequence as number) <= previous.sequence) || (!previous && this.sources.size >= 16)) return false;
    this.sources.set(p.session, { sequence: p.sequence as number, seen: now, fen });
    this.update(now, true);
    return true;
  }
  tick(now = Date.now()) { this.prune(now); this.update(now, false); }
  private prune(now: number) { for (const [id, source] of this.sources) if (now - source.seen > 1800) this.sources.delete(id); }
  private update(now: number, sample: boolean) {
    this.status = this.sources.size > 1 ? 'conflict' : this.sources.size === 1 ? 'connected' : 'waiting';
    const fen = this.sources.size === 1 ? this.sources.values().next().value!.fen : null;
    if (!fen) { this.pending = null; this.samples = 0; this.emit(null); return; }
    if (this.pending !== fen) { this.pending = fen; this.since = now; this.samples = sample ? 1 : 0; this.emit(null); return; }
    if (sample) this.samples++;
    if (this.samples >= 3 && now - this.since >= 800) this.emit(fen);
  }
}
