import assert from 'node:assert/strict';
import { reviewPresentation, type ReviewBookMove } from '../src/lib/reviewPresentation';
import { reviewMoveBadge } from '../src/lib/reviewBoard';
import type { ReviewClassification, ReviewMoveResult } from '../src/types/gameReview';

const book: ReviewBookMove = { eco: 'C20', name: "King's Pawn Game" };
const move = {
  ply: 1, moveNumber: 1, color: 'w', san: 'e4', uci: 'e2e4',
  fenBefore: 'before-e4', fenAfter: 'after-e4',
} as const;
const base = {
  ...move, classification: 'best', bestSan: 'e4', pvSan: ['e4'],
  beforeCpWhite: 25, afterCpWhite: 25, beforeScore: { kind: 'cp', value: 25 },
  playedScore: { kind: 'cp', value: 25 }, lossCp: 0, lossWinPercent: 0,
  accuracy: 100, depth: 15,
} as ReviewMoveResult;
const original = JSON.stringify({ base, book });

for (const classification of ['best', 'excellent', 'good', 'forced'] as ReviewClassification[]) {
  const result = { ...base, classification };
  assert.deepEqual(reviewPresentation(result, book), { kind: 'book', symbol: '📖', label: 'Теория' });
  assert.deepEqual(reviewMoveBadge(move.fenAfter, move, result, book), {
    square: 'e4', classification: 'book', symbol: '📖',
  });
}
for (const classification of ['inaccuracy', 'mistake', 'blunder', 'brilliant', 'unverified'] as ReviewClassification[]) {
  const result = { ...base, classification };
  assert.equal(reviewPresentation(result, book).kind, classification,
    'Theory must not hide warnings, unverified analysis or a verified sacrifice');
}
assert.deepEqual(reviewPresentation(base), { kind: 'best', symbol: '★', label: 'Лучший' });
assert.equal(reviewPresentation(base, { eco: '', name: '' }).kind, 'best');
assert.equal(reviewPresentation(base, { eco: '', name: ' ' }).kind, 'best');
assert.equal(reviewPresentation(base, { eco: '', name: 'Известный дебютный вариант' }).kind, 'book');
assert.equal(reviewMoveBadge(move.fenAfter, move, { ...base, classification: 'unverified' }, book), null);
assert.equal(reviewMoveBadge('another-board', move, base, book), null);
assert.equal(reviewMoveBadge(move.fenAfter, undefined, base, book), null);
assert.equal(JSON.stringify({ base, book }), original, 'Presentation cannot mutate persisted results or opening metadata');
console.log('Review presentation: book badges, underlying warnings/sacrifices, unverified hiding and immutable metadata passed.');
