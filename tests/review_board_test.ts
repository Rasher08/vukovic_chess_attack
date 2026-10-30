import assert from 'node:assert/strict';
import { reviewMoveBadge, reviewSquareCoordinates } from '../src/lib/reviewBoard';
import type { ReviewMoveResult, ReviewPly } from '../src/types/gameReview';

const fen = 'board-after-move';
const move = { ply: 1, uci: 'd3h7', fenAfter: fen, san: 'Bxh7+' } as ReviewPly;
const result = { ...move, classification: 'brilliant' } as ReviewMoveResult;
assert.deepEqual(reviewMoveBadge(fen, move, result), { square: 'h7', classification: 'brilliant', symbol: '!!' });
assert.deepEqual(reviewSquareCoordinates('h7', 'white'), { column: 7, row: 1 });
assert.deepEqual(reviewSquareCoordinates('h7', 'black'), { column: 0, row: 6 });
assert.deepEqual(reviewSquareCoordinates('a1', 'white'), { column: 0, row: 7 });
assert.deepEqual(reviewSquareCoordinates('a1', 'black'), { column: 7, row: 0 });
assert.equal(reviewSquareCoordinates('a9', 'white'), null);
assert.equal(reviewMoveBadge(fen, undefined, result), null, 'Initial board has no badge');
assert.equal(reviewMoveBadge(fen, move, { ...result, classification: 'unverified' }), null);
assert.equal(reviewMoveBadge('different-board', move, result), null);
assert.equal(reviewMoveBadge(fen, move, { ...result, ply: 2 }), null);
assert.equal(reviewMoveBadge(fen, move, { ...result, uci: 'h7h8' }), null);
for (const uci of ['e1g1', 'e8c8', 'a7a8q']) {
  const special = { ...move, uci };
  assert.equal(reviewMoveBadge(fen, special, { ...result, uci })?.square, uci.slice(2, 4), 'Castling and promotion follow the played piece destination');
}
console.log('Review board: selected verified move only, both orientations, edge squares, castling and promotion passed.');
