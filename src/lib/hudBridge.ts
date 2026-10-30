import { Chess } from 'chess.js';

export type HudOrientation = 'white' | 'black';
export type HudBridgeStatus = 'off' | 'connecting' | 'connected' | 'unavailable';
export interface HudBridgeBoard {
  fen: string;
  orientation: HudOrientation;
  blocked: boolean;
  visible: () => boolean;
}
export interface HudBridgeMessage {
  token: string;
  session: string;
  sequence: number;
  fen: string | null;
  orientation: HudOrientation;
  sentAt: number;
}

const ENDPOINT = 'http://127.0.0.1:18319/position';
export const HUD_SETTLE_MS = 900;
export const HUD_HEARTBEAT_MS = 500;

/** A FEN is accepted only from the application's full position, never completed from pixels. */
export function canonicalHudFen(value: string): string | null {
  if (typeof value !== 'string' || value.length > 200 || value.trim().split(/\s+/).length !== 6 || /[\r\n]/.test(value)) return null;
  try {
    const board = new Chess(value);
    return board.isGameOver() ? null : board.fen();
  } catch { return null; }
}

/** Pure state selection, also used in tests. Multiple boards are deliberately ambiguous. */
export function selectHudBoard(boards: Iterable<HudBridgeBoard>, visible: boolean): { fen: string | null; orientation: HudOrientation } {
  if (!visible) return { fen: null, orientation: 'white' };
  const available = Array.from(boards).filter(board => board.visible());
  if (available.length !== 1 || available[0].blocked) return { fen: null, orientation: 'white' };
  return { fen: canonicalHudFen(available[0].fen), orientation: available[0].orientation };
}

interface BridgeEnvironment {
  now: () => number;
  visible: () => boolean;
  send: (message: HudBridgeMessage) => Promise<void>;
  session: string;
}

/** Transport-independent publisher; timing starts afresh whenever board identity changes. */
export class HudBridgePublisher {
  private boards = new Map<string, HudBridgeBoard>();
  private token = '';
  private sequence = 0;
  private key = '';
  private changedAt = 0;
  private status: HudBridgeStatus = 'off';
  private generation = 0;
  private listeners = new Set<() => void>();

  constructor(private readonly environment: BridgeEnvironment) {}

  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  getStatus = (): HudBridgeStatus => this.status;
  private setStatus(status: HudBridgeStatus) {
    if (this.status === status) return;
    this.status = status; this.listeners.forEach(listener => listener());
  }

  enable(token: string): void {
    if (!/^[a-f0-9]{64}$/i.test(token.trim())) throw new Error('Нужен полный ключ из окна локального HUD (64 символа).');
    this.disable();
    this.token = token.trim(); this.key = ''; this.changedAt = this.environment.now();
    this.setStatus('connecting'); this.tick();
  }

  disable(): void {
    if (this.token) this.dispatch(null, 'white');
    this.token = ''; this.generation += 1; this.setStatus('off');
  }

  update(id: string, board: HudBridgeBoard): void {
    const previous = this.boards.get(id);
    this.boards.set(id, board);
    if (!previous || previous.fen !== board.fen || previous.orientation !== board.orientation || previous.blocked !== board.blocked) this.invalidate();
  }

  remove(id: string): void { this.boards.delete(id); this.invalidate(); }

  /** Called on navigation/visibility changes; a null message always clears old evidence. */
  invalidate(): void {
    this.key = ''; this.changedAt = this.environment.now();
    if (this.token) this.dispatch(null, 'white');
  }

  tick(): void {
    if (!this.token) return;
    const selected = selectHudBoard(this.boards.values(), this.environment.visible());
    const nextKey = `${selected.fen || '?'}|${selected.orientation}`;
    if (this.key !== nextKey) { this.key = nextKey; this.changedAt = this.environment.now(); }
    this.dispatch(this.environment.now() - this.changedAt >= HUD_SETTLE_MS ? selected.fen : null, selected.orientation);
  }

  private dispatch(fen: string | null, orientation: HudOrientation): void {
    if (!this.token) return;
    const generation = this.generation;
    const message: HudBridgeMessage = {
      token: this.token, session: this.environment.session, sequence: ++this.sequence,
      fen, orientation, sentAt: this.environment.now(),
    };
    void this.environment.send(message).then(() => {
      if (this.token && this.generation === generation) this.setStatus('connected');
    }, () => {
      if (this.token && this.generation === generation) this.setStatus('unavailable');
    });
  }
}

let browserPublisher: HudBridgePublisher | null = null;
export function getHudBridge(): HudBridgePublisher | null {
  if (typeof window === 'undefined' || !['localhost', '127.0.0.1'].includes(window.location.hostname)) return null;
  if (browserPublisher) return browserPublisher;
  browserPublisher = new HudBridgePublisher({
    now: Date.now, visible: () => document.visibilityState === 'visible', session: crypto.randomUUID(),
    send: async message => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 700);
      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', keepalive: message.fen === null,
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message), signal: controller.signal,
        });
        if (!response.ok) throw new Error('Локальный HUD недоступен.');
      } finally { window.clearTimeout(timeout); }
    },
  });
  const publisher = browserPublisher;
  window.setInterval(() => publisher.tick(), HUD_HEARTBEAT_MS);
  document.addEventListener('visibilitychange', () => { publisher.invalidate(); publisher.tick(); });
  window.addEventListener('pagehide', () => publisher.disable());
  window.addEventListener('blur', () => publisher.invalidate());
  window.addEventListener('resize', () => publisher.invalidate());
  window.addEventListener('scroll', () => publisher.invalidate(), { passive: true });
  return publisher;
}
