import { Chess } from 'chess.js';
import { validateTrustedFen } from './position';

export interface RecordedMove { ply: number; san: string }
export type MoveIssue = 'waiting' | 'connected' | 'gap' | 'conflict' | 'illegal' | 'replay' | 'hidden' | 'unreadable' | 'game-over';
export interface MoveResult { fen: string | null; issue: MoveIssue; count: number }
const FIGURINES: Record<string, string> = { '♔':'K','♚':'K','♕':'Q','♛':'Q','♖':'R','♜':'R','♗':'B','♝':'B','♘':'N','♞':'N','♙':'','♟':'' };

/** Normalize notation, never infer a missing piece, capture or destination. */
export function normalizeSan(raw: string): string {
  if (typeof raw !== 'string' || raw.length > 40) throw Error('Invalid notation');
  const san = raw.replace(/[♔♚♕♛♖♜♗♝♘♞♙♟]/g, c => FIGURINES[c])
    .replace(/[\s\u200b\u200e\u200f\ufeff]/g, '').replace(/×/g, 'x')
    .replace(/0/g, 'O').replace(/[!?]+$/, '');
  if (!/^(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?$/.test(san)) throw Error('Invalid notation');
  return san;
}

/** Absolute half-move numbers make scrolling/virtualization harmless. Known
 * moves are append-only. A changed old move requires an explicit new session.
 * Pending gaps are retained, but no FEN escapes until every move is legal and
 * the page confirms it is displaying the end of the recorded main line. */
export class MoveHistory {
  private readonly start: string;
  private readonly firstPly: number;
  private moves = new Map<number, string>();
  private board: Chess;
  private end: number;
  private complete = true;
  private broken = false;
  private lastInput = '';
  constructor(startFen: string) {
    this.start = validateTrustedFen(startFen);
    this.board = new Chess(this.start);
    const fields = this.start.split(' ');
    this.firstPly = (Number(fields[5]) - 1) * 2 + (fields[1] === 'b' ? 1 : 0);
    if (!Number.isSafeInteger(this.firstPly)) throw Error('Invalid move number');
    this.end = this.firstPly;
  }
  get count() { return this.moves.size; }
  ingest(input: RecordedMove[], currentPly: number | null): MoveResult {
    const no = (issue: MoveIssue): MoveResult => ({ fen: null, issue, count: this.count });
    if (this.broken) return no('conflict');
    if (!Array.isArray(input) || input.length > 2400 || currentPly !== null && (!Number.isSafeInteger(currentPly) || currentPly < this.firstPly || currentPly > this.firstPly + 2400)) return no('unreadable');
    try {
      const normalized = input.map(m => {
        if (!m || !Number.isSafeInteger(m.ply) || m.ply <= this.firstPly || m.ply > this.firstPly + 2400) throw Error('Invalid ply');
        return { ply: m.ply, san: normalizeSan(m.san) };
      });
      const key = JSON.stringify(normalized);
      if (key !== this.lastInput) {
        const merged = new Map(this.moves);
        for (const move of normalized) {
          if (merged.has(move.ply) && merged.get(move.ply) !== move.san) { this.broken = true; return no('conflict'); }
          merged.set(move.ply, move.san);
        }
        // Rebuild only on a changed list, preserving repetition, castling and EP.
        const next = new Chess(this.start);
        const end = Math.max(this.firstPly, ...merged.keys());
        let complete = true;
        for (let ply = this.firstPly + 1; ply <= end; ply++) {
          const san = merged.get(ply);
          if (!san) { complete = false; break; }
          // Strict SAN prevents chess.js's permissive parser from repairing OCR.
          next.move(san, { strict: true });
        }
        this.moves = merged; this.board = next; this.end = end; this.complete = complete; this.lastInput = key;
      }
    } catch { return no('illegal'); }
    if (!this.complete || currentPly !== null && currentPly > this.end) return no('gap');
    if (currentPly !== this.end) return no('replay');
    if (this.board.isGameOver()) return no('game-over');
    return { fen: this.board.fen({ forceEnpassantSquare: true }), issue: 'connected', count: this.count };
  }
}

export const MOVE_STATUS: Record<MoveIssue, string> = {
  waiting: 'Ожидаем список ходов', connected: 'Ходы синхронизированы',
  gap: 'В списке пропущены ходы', conflict: 'История изменилась — подключите партию заново',
  illegal: 'Не удалось прочитать ход', replay: 'Вернитесь к последнему ходу',
  hidden: 'Откройте вкладку партии', unreadable: 'Список ходов недоступен', 'game-over': 'Партия завершена',
};
