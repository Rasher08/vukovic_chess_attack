import type { ReviewClassification, ReviewMoveResult, ReviewPly } from '@/types/gameReview';
import { reviewPresentation, REVIEW_DISPLAY_SYMBOLS, type ReviewBookMove } from './reviewPresentation';

export const REVIEW_SYMBOLS: Record<ReviewClassification, string> = REVIEW_DISPLAY_SYMBOLS;

/** Visual coordinates from the top left of the board, independent of whose move it is. */
export function reviewSquareCoordinates(square: string, orientation: 'white' | 'black') {
  if (!/^[a-h][1-8]$/.test(square)) return null;
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return orientation === 'white' ? { column: file, row: 7 - rank } : { column: 7 - file, row: rank };
}

/** Never carry a badge over to the initial position, an unverified move or a different board. */
export function reviewMoveBadge(position: string, move?: ReviewPly, result?: ReviewMoveResult, book?: ReviewBookMove) {
  if (!move || !result || result.classification === 'unverified' ||
    move.ply !== result.ply || move.uci !== result.uci ||
    move.fenAfter !== position || result.fenAfter !== position ||
    !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move.uci)) return null;
  const display = reviewPresentation(result, book);
  if (display.kind === 'unverified') return null;
  return { square: move.uci.slice(2, 4), classification: display.kind, symbol: display.symbol };
}
