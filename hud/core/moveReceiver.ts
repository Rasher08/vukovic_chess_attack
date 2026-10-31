import { timingSafeEqual } from 'node:crypto';
import { BridgeReceiver } from './bridgeReceiver';
import { MoveHistory, type MoveIssue, type RecordedMove } from './moveHistory';

export const extensionOrigin = (origin: string) => /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
type Source = { game: string; startFen: string; history: MoveHistory; sequence: number; seen: number };

/** Authenticated, leased text transport. All chess replay happens locally in
 * the desktop process, rather than trusting an extension-supplied FEN. */
export class MoveReceiver {
  private sources = new Map<string, Source>();
  private lease: BridgeReceiver;
  issue: MoveIssue = 'waiting';
  count = 0;
  get status() { return this.lease.status; }
  constructor(private token: string, emit: (fen: string | null) => void) { this.lease = new BridgeReceiver(token, emit); }
  reset() { this.sources.clear(); this.issue = 'waiting'; this.count = 0; this.lease.reset(); }
  receive(value: unknown, now = Date.now()): boolean {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    if (typeof p.token !== 'string' || !/^[a-f0-9]{64}$/.test(p.token) || !timingSafeEqual(Buffer.from(p.token), Buffer.from(this.token)) ||
      typeof p.session !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(p.session) ||
      !Number.isSafeInteger(p.sequence) || (p.sequence as number) < 0 || typeof p.sentAt !== 'number' || Math.abs(now - p.sentAt) > 1800 || !Number.isFinite(p.sentAt) ||
      typeof p.game !== 'string' || p.game.length > 300 || !/^https:\/\/(?:www\.)?chess\.com\//.test(p.game) ||
      typeof p.startFen !== 'string' || p.startFen.length > 200 || typeof p.ready !== 'boolean' || typeof p.visible !== 'boolean' ||
      !Array.isArray(p.moves) || p.moves.length > 2400 || p.currentPly !== null && !Number.isSafeInteger(p.currentPly)) return false;
    for (const [id, source] of this.sources) if (now - source.seen > 60 * 60_000) this.sources.delete(id);
    let source = this.sources.get(p.session);
    if (source && (p.sequence as number) <= source.sequence) return false;
    if (!source || source.game !== p.game || source.startFen !== p.startFen) {
      if (!source && this.sources.size >= 16) return false;
      try { source = { game: p.game, startFen: p.startFen, history: new MoveHistory(p.startFen), sequence: -1, seen: now }; }
      catch { return false; }
      this.sources.set(p.session, source);
    }
    source.sequence = p.sequence as number; source.seen = now;
    const result = p.ready && p.visible ? source.history.ingest(p.moves as RecordedMove[], p.currentPly as number | null) : null;
    this.issue = !p.visible ? 'hidden' : !p.ready ? 'unreadable' : result!.issue;
    this.count = source.history.count;
    const accepted = this.lease.receive({ token: p.token, session: p.session, sequence: p.sequence, sentAt: p.sentAt, orientation: 'white', fen: result?.fen ?? null }, now);
    if (this.lease.status === 'conflict') this.issue = 'conflict';
    return accepted;
  }
  tick(now = Date.now()) {
    this.lease.tick(now);
    if (this.lease.status === 'waiting') this.issue = 'waiting';
    else if (this.lease.status === 'conflict') this.issue = 'conflict';
  }
}
