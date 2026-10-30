import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { loadSavedReviews, saveReview, REVIEW_STORAGE_KEY, MAX_SAVED_REVIEWS } from '../src/lib/gameReviewStorage';
import type { ReviewClassification, ReviewReport } from '../src/types/gameReview';

const classes: ReviewClassification[] = ['brilliant', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder', 'forced', 'unverified', 'great', 'miss', 'trilliant'];
function report(id = 'one'): ReviewReport {
  const game = new Chess(); const before = game.fen(); game.move('e4');
  const move = { ply: 1, moveNumber: 1, color: 'w' as const, san: 'e4', uci: 'e2e4', fenBefore: before, fenAfter: game.fen() };
  const counts = Object.fromEntries(classes.map(kind => [kind, 0])) as Record<ReviewClassification, number>;
  return {
    version: 1, game: { id, headers: { White: 'Ученик ♞', Black: 'Соперник' }, initialFen: before, moves: [move], pgn: '1. e4 *', result: '*' },
    results: [{ ...move, classification: 'best', bestSan: 'e4', pvSan: ['e4', 'e5'], beforeScore: { kind: 'cp', value: 30 }, playedScore: { kind: 'cp', value: 30 }, beforeCpWhite: 30, afterCpWhite: 30, lossCp: 0, lossWinPercent: 0, accuracy: 100, depth: 15 }],
    nodes: 200000, analyzedAt: 123456, completed: true,
    white: { accuracy: 100, averageLossCp: 0, counts: { ...counts, best: 1 }, reviewedMoves: 1, totalMoves: 1 },
    black: { accuracy: null, averageLossCp: null, counts: { ...counts }, reviewedMoves: 0, totalMoves: 0 },
  };
}
const values = new Map<string, string>(); let fail = false;
const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { if (fail) throw new Error('quota'); values.set(key, value); },
} } });
try {
  values.set('vukovic-course-progress:v1', 'keep learning history');
  assert.deepEqual(loadSavedReviews(), []);
  assert.equal(saveReview(report()).saved, true);
  assert.ok(values.get(REVIEW_STORAGE_KEY)!.startsWith('lz1:'));
  assert.deepEqual(loadSavedReviews(), [report()]);
  const loaded = loadSavedReviews(); loaded[0].game.headers.White = 'edited';
  assert.equal(loadSavedReviews()[0].game.headers.White, 'Ученик ♞');
  for (let index = 0; index < MAX_SAVED_REVIEWS + 2; index += 1) assert.equal(saveReview(report(String(index))).saved, true);
  assert.equal(loadSavedReviews().length, MAX_SAVED_REVIEWS);
  assert.equal(loadSavedReviews()[0].game.id, String(MAX_SAVED_REVIEWS + 1));
  assert.equal(saveReview(report('3')).saved, true);
  assert.equal(loadSavedReviews().filter(item => item.game.id === '3').length, 1);
  const withRatings = { ...report('ratings'), ratingInputs: { white: 2200, black: 2150 } };
  assert.equal(saveReview(withRatings).saved, true);
  assert.deepEqual(loadSavedReviews()[0].ratingInputs, { white: 2200, black: 2150 });
  assert.equal(loadSavedReviews()[0].game.headers.WhiteElo, undefined, 'Manual anchors must not overwrite PGN metadata');
  assert.equal(saveReview({ ...report('cleared-ratings'), ratingInputs: { white: null, black: 2150 } }).saved, true);
  assert.deepEqual(loadSavedReviews()[0].ratingInputs, { white: null, black: 2150 });
  const previous = values.get(REVIEW_STORAGE_KEY);
  assert.equal(saveReview({ ...report('bad-ratings'), ratingInputs: { white: 50000, black: 2200 } }).saved, false);
  assert.equal(saveReview({ ...report('nan-ratings'), ratingInputs: { white: NaN, black: 2200 } }).saved, false);
  assert.equal(values.get(REVIEW_STORAGE_KEY), previous);

  const relative = { ...report('relative-ratings'), performanceRatings: { version: 1 as const, white: 2200, black: null } };
  assert.equal(saveReview(relative).saved, true);
  assert.deepEqual(loadSavedReviews()[0].performanceRatings, { version: 1, white: 2200, black: null });
  assert.equal(loadSavedReviews()[0].game.headers.WhiteElo, undefined, 'Current overrides must not replace PGN source metadata');
  assert.equal(saveReview({ ...report('one-override'), performanceRatings: { version: 1, black: 1800 } }).saved, true);
  assert.deepEqual(loadSavedReviews()[0].performanceRatings, { version: 1, black: 1800 });
  const beforeInvalidOverrides = values.get(REVIEW_STORAGE_KEY);
  for (const invalid of [
    { version: 2, white: 2200 }, { version: 1, white: NaN }, { version: 1, black: 4001 },
    { version: 1, white: 99 }, { version: 1, white: '2200' }, { version: 1, white: undefined },
    { version: 1, white: 2200, unknown: 1 },
  ]) assert.equal(saveReview({ ...report('invalid-override'), performanceRatings: invalid } as unknown as ReviewReport).saved, false);
  assert.equal(values.get(REVIEW_STORAGE_KEY), beforeInvalidOverrides);
  assert.equal(saveReview({ ...report('cleared-current-overrides'), performanceRatings: undefined }).saved, true);

  const legacy = report('legacy-counts');
  for (const summary of [legacy.white, legacy.black]) for (const kind of ['great', 'miss', 'trilliant'] as const) Reflect.deleteProperty(summary.counts, kind);
  values.set(REVIEW_STORAGE_KEY, JSON.stringify({ version: 1, reports: [legacy] }));
  const migrated = loadSavedReviews();
  assert.equal(migrated.length, 1, 'Old reports without new category counters remain readable');
  for (const summary of [migrated[0].white, migrated[0].black]) for (const kind of ['great', 'miss', 'trilliant'] as const) assert.equal(summary.counts[kind], 0);
  assert.equal(saveReview(report('after-legacy')).saved, true);
  const beforeBadHighlight = values.get(REVIEW_STORAGE_KEY);
  const scoreless = report('scoreless-highlight');
  scoreless.results[0] = { ...scoreless.results[0], classification: 'great', beforeScore: null, playedScore: null, depth: 0 };
  assert.equal(saveReview(scoreless).saved, false, 'Sanitizing a fake positive badge must not save an unverified row as complete');
  assert.equal(values.get(REVIEW_STORAGE_KEY), beforeBadHighlight, 'A bad highlight cannot poison the previous store');
  const staleEvidence = report('future-highlight-evidence');
  staleEvidence.results[0] = { ...staleEvidence.results[0], classification: 'great', baseClassification: 'best', highlightEvidence: { version: 99 } as never };
  assert.equal(saveReview(staleEvidence).saved, true, 'Unknown optional evidence preserves a verified numerical grade');
  const downgraded = loadSavedReviews()[0];
  assert.equal(downgraded.results[0].classification, 'best');
  assert.equal(downgraded.results[0].highlightEvidence, undefined);
  assert.equal(downgraded.results[0].baseClassification, undefined);
  assert.equal(downgraded.white.counts.great, 0); assert.equal(downgraded.white.counts.best, 1);
  values.set(REVIEW_STORAGE_KEY, JSON.stringify({ version: 1, reports: [scoreless, report('healthy-neighbour')] }));
  assert.deepEqual(loadSavedReviews().map(item => item.game.id), ['healthy-neighbour'], 'A broken new badge cannot hide neighbouring valid old reports');
  assert.equal(saveReview(report('after-broken-row')).saved, true, 'A dropped unverifiable optional row must not lock future saves');
  const beforeQuota = values.get(REVIEW_STORAGE_KEY);

  fail = true;
  assert.equal(saveReview(report('quota')).saved, false);
  assert.equal(values.get(REVIEW_STORAGE_KEY), beforeQuota);
  fail = false;
  assert.equal(saveReview({ ...report(), completed: false }).saved, false);
  const unverified = report(); unverified.results[0].classification = 'unverified';
  assert.equal(saveReview(unverified).saved, false);
  assert.equal(values.get(REVIEW_STORAGE_KEY), beforeQuota);
  values.set(REVIEW_STORAGE_KEY, '{"version":99,"reports":[]}');
  assert.equal(saveReview(report('future')).saved, false);
  assert.equal(values.get(REVIEW_STORAGE_KEY), '{"version":99,"reports":[]}');
  assert.equal(values.get('vukovic-course-progress:v1'), 'keep learning history');
  console.log('Game review storage: Unicode roundtrip, detached reads, bounded history, dedup, quota retention, partial/future rejection and learning isolation passed.');
} finally {
  if (original) Object.defineProperty(globalThis, 'window', original); else Reflect.deleteProperty(globalThis, 'window');
}
