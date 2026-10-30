import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { buildEngineLine } from '../src/lib/engineLine';

const initial = new Chess().fen();
assert.deepEqual(buildEngineLine(initial, []), { steps: [], error: null });
assert.ok(buildEngineLine('invalid fen', []).error);
assert.deepEqual(buildEngineLine('invalid fen', ['e4']).steps, []);
assert.ok(buildEngineLine(undefined as unknown as string, []).error, 'A missing root must not silently use the initial position');

const source = ['e4', 'e5', 'Nf3', 'Nc6'];
const snapshot = [...source];
const line = buildEngineLine(initial, Object.freeze(source));
assert.equal(line.error, null);
assert.deepEqual(source, snapshot, 'Replay must not modify the suggested SAN array');
assert.deepEqual(line.steps.map(step => step.index), [1, 2, 3, 4]);
assert.deepEqual(line.steps.map(step => step.uci), ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
assert.deepEqual(line.steps.map(step => [step.color, step.moveNumber]), [['w', 1], ['b', 1], ['w', 2], ['b', 2]]);
assert.equal(line.steps[0].fenBefore, initial);
for (let index = 1; index < line.steps.length; index += 1) {
  assert.equal(line.steps[index].fenBefore, line.steps[index - 1].fenAfter, 'Each displayed position must follow the previous legal ply');
}
assert.equal(new Chess(line.steps[3].fenAfter).get('c6')?.type, 'n');

// A suggested alternative begins before the actual move; never append it to
// the actual game's resulting position (which would reject another White move).
assert.equal(buildEngineLine(initial, ['d4']).steps[0].uci, 'd2d4');
const afterE4 = new Chess(initial); afterE4.move('e4');
assert.equal(buildEngineLine(afterE4.fen(), ['d4']).steps.length, 0);

const broken = buildEngineLine(initial, ['e4', 'e5', 'Qh9', 'Nf3']);
assert.equal(broken.steps.length, 2, 'An illegal suffix cannot create positions or skip a move');
assert.ok(broken.error);
assert.deepEqual(broken.steps.map(step => step.san), ['e4', 'e5']);
assert.ok(buildEngineLine(initial, ['e4', '']).error);
assert.ok(buildEngineLine(initial, ['e4', null] as unknown as string[]).error);
assert.ok(buildEngineLine(initial, null as unknown as string[]).error);

const blackRoot = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 12';
const black = buildEngineLine(blackRoot, ['e5', 'Nf3', 'Nc6']);
assert.equal(black.error, null);
assert.deepEqual(black.steps.map(step => [step.color, step.moveNumber]), [['b', 12], ['w', 13], ['b', 13]]);
assert.equal(black.steps[0].fenBefore, blackRoot);

const castleRoot = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
const castles = buildEngineLine(castleRoot, ['O-O', 'O-O-O']);
assert.equal(castles.error, null);
assert.deepEqual(castles.steps.map(step => step.uci), ['e1g1', 'e8c8']);
assert.equal(new Chess(castles.steps[0].fenAfter).get('f1')?.type, 'r');
assert.equal(new Chess(castles.steps[1].fenAfter).get('d8')?.color, 'b');

const promotion = buildEngineLine('7k/P7/8/8/8/8/8/7K w - - 0 1', ['a8=N']);
assert.equal(promotion.error, null);
assert.equal(promotion.steps[0].uci, 'a7a8n');
assert.equal(new Chess(promotion.steps[0].fenAfter).get('a8')?.type, 'n');
const blackPromotion = buildEngineLine('7k/8/8/8/8/8/p7/7K b - - 0 24', ['a1=Q+']);
assert.equal(blackPromotion.error, null);
assert.equal(blackPromotion.steps[0].uci, 'a2a1q');
assert.equal(blackPromotion.steps[0].moveNumber, 24);

const enPassant = buildEngineLine('7k/8/8/3pP3/8/8/8/7K w - d6 0 1', ['exd6']);
assert.equal(enPassant.error, null);
assert.equal(new Chess(enPassant.steps[0].fenAfter).get('d5'), undefined);

const mateRoot = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1';
const mate = buildEngineLine(mateRoot, ['Qg7#']);
assert.equal(mate.error, null);
assert.equal(new Chess(mate.steps[0].fenAfter).isCheckmate(), true);
assert.equal(buildEngineLine(mateRoot, ['Qg7#', 'Kh7']).steps.length, 1);
assert.ok(buildEngineLine(mateRoot, ['Qg7#', 'Kh7']).error);
assert.deepEqual(buildEngineLine(mate.steps[0].fenAfter, []), { steps: [], error: null });

// Identical SAN at distinct nodes must retain unique indexes and correct move
// numbers. A claimable repetition does not make the next legal analysis ply fake.
const repeated = ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8', 'e4'];
const capped = buildEngineLine(initial, repeated);
assert.equal(capped.error, null);
assert.equal(capped.steps.length, 12);
assert.deepEqual(capped.steps.filter(step => step.san === 'Nf3').map(step => [step.index, step.moveNumber]), [[1, 1], [5, 3], [9, 5]]);
assert.equal(repeated.length, 13);
assert.equal(capped.steps[11].color, 'b');

console.log('Engine line: root replay, immutable legal positions, partial errors, black numbering, mate, castling, promotion, en passant, repeated SAN and twelve-ply cap passed.');
