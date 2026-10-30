import { Chess, type Square } from 'chess.js';

export type VariationMode = 'auto' | 'manual';

/** A branch starts at the selected review node, not necessarily at move one. */
export function replayVariation(initialFen: string, moves: readonly string[]) {
  const game = new Chess(initialFen);
  const san: string[] = [];
  const labels: string[] = [];
  const fens = [game.fen()];
  for (const uci of moves) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error('Некорректный ход в ветке.');
    const moveNumber = Number(game.fen().split(' ')[5]);
    labels.push(`${moveNumber}${game.turn() === 'w' ? '.' : '…'}`);
    const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    san.push(move.san); fens.push(game.fen());
  }
  return { game, fen: game.fen(), san, labels, fens };
}

/** Return a new line only for a legal move; never mutate the input branch. */
export function appendVariationMove(initialFen: string, moves: readonly string[], from: Square, to: Square, promotion?: string): string[] | null {
  try {
    const { game } = replayVariation(initialFen, moves);
    if (game.isGameOver()) return null;
    const move = game.move({ from, to, promotion: promotion?.slice(-1).toLowerCase() || 'q' });
    return [...moves, `${move.from}${move.to}${move.promotion || ''}`];
  } catch { return null; }
}

/** Auto undo returns control to the learner, including an unanswered last move. */
export function undoVariation(initialFen: string, moves: readonly string[], mode: VariationMode): string[] {
  if (!moves.length) return [];
  const next = moves.slice(0, -1);
  if (mode === 'manual') return next;
  const learner = new Chess(initialFen).turn();
  while (next.length && replayVariation(initialFen, next).game.turn() !== learner) next.pop();
  return next;
}
