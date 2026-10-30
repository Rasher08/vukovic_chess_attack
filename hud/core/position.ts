import { Chess, type Square } from 'chess.js';

/** Full metadata must come from the application, an explicit user confirmation,
 * or this legal-move tracker. A board image is never a trusted FEN source. */
export function validateTrustedFen(input: string): string {
  if (typeof input !== 'string' || /[\r\n]/.test(input)) throw new Error('Нужен полный FEN из шести полей.');
  const parts = input.trim().split(/\s+/);
  if (parts.length !== 6 || !/^[wb]$/.test(parts[1]) || !/^(?:-|K?Q?k?q?)$/.test(parts[2]) ||
      !/^(?:-|[a-h][36])$/.test(parts[3]) || !/^\d+$/.test(parts[4]) || !/^[1-9]\d*$/.test(parts[5]) ||
      !Number.isSafeInteger(Number(parts[4])) || !Number.isSafeInteger(Number(parts[5]))) {
    throw new Error('Укажите сторону хода, рокировки, en passant и оба счётчика FEN.');
  }
  const board = new Chess(parts.join(' '));
  const pieces = board.board().flat().filter(p => p !== null);
  for (const color of ['w', 'b'] as const) {
    const side = pieces.filter(p => p.color === color);
    if (side.length > 16 || side.filter(p => p.type === 'p').length > 8) throw new Error('На доске слишком много фигур.');
  }
  for (const [right, king, rook, color] of [
    ['K', 'e1', 'h1', 'w'], ['Q', 'e1', 'a1', 'w'],
    ['k', 'e8', 'h8', 'b'], ['q', 'e8', 'a8', 'b'],
  ] as const) {
    if (parts[2].includes(right) && (board.get(king)?.type !== 'k' || board.get(king)?.color !== color ||
        board.get(rook)?.type !== 'r' || board.get(rook)?.color !== color)) throw new Error('Права рокировки не соответствуют доске.');
  }
  const inactive = board.turn() === 'w' ? 'b' : 'w';
  const inactiveKing = pieces.find(p => p.color === inactive && p.type === 'k')!;
  if (board.isAttacked(inactiveKing.square, board.turn())) throw new Error('Король стороны, которая уже сходила, находится под шахом.');
  if (parts[3] !== '-') {
    const ep = parts[3];
    const previousPawnSquare = (ep[0] + (board.turn() === 'w' ? '5' : '4')) as Square;
    const previousStartSquare = (ep[0] + (board.turn() === 'w' ? '7' : '2')) as Square;
    if (ep[1] !== (board.turn() === 'w' ? '6' : '3') || board.get(ep as Square) ||
        board.get(previousPawnSquare)?.type !== 'p' || board.get(previousPawnSquare)?.color !== inactive ||
        board.get(previousStartSquare) || Number(parts[4]) !== 0) throw new Error('Поле en passant не соответствует последнему двойному ходу пешки.');
  }
  // Keep a legally possible EP field even if no pawn can currently capture it.
  return board.fen({ forceEnpassantSquare: true });
}

export interface TrackedPosition { fen: string | null; changed: boolean; reason?: string }

export class PositionTracker {
  private board: Chess | null = null;
  get currentFen(): string | null { return this.board?.fen({ forceEnpassantSquare: true }) ?? null; }
  /** Includes repetition only from the explicitly seeded point onward. */
  get isGameOver(): boolean { return this.board?.isGameOver() ?? false; }

  seed(fen: string): string {
    // A failed explicit re-seed must not leave an old position trusted.
    this.board = null;
    const validated = validateTrustedFen(fen);
    this.board = new Chess(validated);
    return this.currentFen!;
  }

  invalidate(): void { this.board = null; }

  observe(placement: string | null): TrackedPosition {
    if (!this.board) return { fen: null, changed: false, reason: 'Подтвердите полный FEN для начала отслеживания.' };
    const before = this.currentFen!;
    if (placement === before.split(' ')[0]) return { fen: before, changed: false };
    if (!placement || !/^[prnbqkPRNBQK1-8/]+$/.test(placement)) {
      this.invalidate();
      return { fen: null, changed: true, reason: 'Распознавание неоднозначно. Нужна повторная проверка позиции.' };
    }
    const matches = this.board.moves({ verbose: true }).filter(move => {
      const next = new Chess(before); next.move(move);
      return next.fen().split(' ')[0] === placement;
    });
    if (matches.length !== 1) {
      this.invalidate();
      return { fen: null, changed: true, reason: 'Пропущен ход или доска распознана неверно. Подтвердите полный FEN заново.' };
    }
    this.board.move(matches[0]);
    return { fen: this.currentFen, changed: true };
  }
}
