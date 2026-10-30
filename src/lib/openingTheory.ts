import { Chess } from 'chess.js';
import openingData from '@/data/openingTheory.json';
import type { ReviewGame } from '@/types/gameReview';

export interface OpeningName { eco: string; name: string }
export interface OpeningReview {
  version: 1;
  opening: (OpeningName & { ply: number }) | null;
  /** Exact known position + played move; independent from the engine grade. */
  bookByPly: Record<number, OpeningName>;
  lastBookPly: number;
  /** The first non-book move, even if a later transposition returns to book. */
  firstIndependentPly: number | null;
  hasOpeningStart: boolean;
}

export const OPENING_THEORY_SOURCE = {
  name: 'Lichess chess-openings',
  url: 'https://github.com/lichess-org/chess-openings',
  commit: openingData.sourceCommit,
  license: 'CC0-1.0',
  openingCount: openingData.openingCount,
  maxPly: openingData.maxPly,
} as const;

/** chess.js emits en-passant only when a capture is legal, including pin rules. */
export function normalizedOpeningPosition(fen: string): string | null {
  try { return new Chess(fen).fen().split(' ').slice(0, 4).join(' '); }
  catch { return null; }
}

let index: { names: Map<string, OpeningName>; moves: Map<string, Set<string>> } | null = null;
function openingIndex() {
  if (index) return index;
  const names = new Map<string, OpeningName>();
  for (const [fen, rawId] of openingData.positions) {
    const [eco, name] = openingData.names[Number(rawId)];
    names.set(String(fen), { eco, name });
  }
  index = {
    names,
    moves: new Map(openingData.transitions.map(([fen, ucis]) => [fen, new Set(ucis.split(' '))])),
  };
  return index;
}

/**
 * Recognize only transitions recorded in the pinned opening dataset. A good
 * engine move is not automatically a book move; an absent line is not a novelty.
 * A move-order transposition may return to theory, but the gap stays non-book.
 * Finite scope is the longest recorded opening line, not an arbitrary first N.
 */
export function recognizeOpening(game: ReviewGame): OpeningReview {
  const result: OpeningReview = {
    version: 1, opening: null, bookByPly: {}, lastBookPly: 0,
    firstIndependentPly: game.moves[0]?.ply ?? null, hasOpeningStart: false,
  };
  try {
    const board = new Chess(game.initialFen);
    if (board.fen() !== new Chess().fen() || game.moves[0]?.moveNumber !== 1 || game.moves[0]?.color !== 'w') return result;
    result.hasOpeningStart = true;
    const data = openingIndex();
    let latestName: OpeningName | null = null;
    for (const move of game.moves) {
      if (move.ply > openingData.maxPly) break;
      const before = board.fen().split(' ').slice(0, 4).join(' ');
      if (normalizedOpeningPosition(move.fenBefore) !== before || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move.uci)) break;
      const known = data.moves.get(before)?.has(move.uci) === true;
      board.move({ from: move.uci.slice(0, 2), to: move.uci.slice(2, 4), ...(move.uci[4] ? { promotion: move.uci[4] } : {}) });
      const after = board.fen().split(' ').slice(0, 4).join(' ');
      if (normalizedOpeningPosition(move.fenAfter) !== after) break;
      const name = data.names.get(after);
      if (name) { latestName = name; result.opening = { ...name, ply: move.ply }; }
      if (known) {
        result.bookByPly[move.ply] = { ...(latestName || { eco: '', name: 'Известный дебютный вариант' }) };
        result.lastBookPly = move.ply;
      }
    }
    result.firstIndependentPly = game.moves.find(move => !result.bookByPly[move.ply])?.ply ?? null;
    return result;
  } catch {
    // A malformed restored game must never make the analysis screen unusable.
    result.firstIndependentPly = game.moves.find(move => !result.bookByPly[move.ply])?.ply ?? null;
    return result;
  }
}
