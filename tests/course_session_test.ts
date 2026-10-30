import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { assessCourseLine, assessCourseLines, canonicalizeLine, tokenizeSan } from '../src/lib/courseSession';
const fen = new Chess().fen();
const line = ['e4', 'e5', 'Nf3', 'Nc6'];
assert.equal(assessCourseLine(fen, line, line).kind, 'correct');
assert.equal(assessCourseLine(fen, ['e4', 'e5'], line).kind, 'incomplete');
assert.deepEqual(assessCourseLine(fen, ['e4', 'c5'], line), { kind: 'divergence', matchedPlies: 1, divergencePly: 2 });
assert.equal(assessCourseLine(fen, ['e5'], line).kind, 'invalid');
assert.equal(assessCourseLine(fen, [], line).kind, 'incomplete');
assert.equal(assessCourseLine('bad fen', [], line).kind, 'invalid');
assert.equal(assessCourseLine(fen, line, ['e5']).kind, 'invalid');
assert.equal(assessCourseLine(fen, [...line, 'Bb5'], line).kind, 'correct');
const mate = ['f3', 'e5', 'g4', 'Qh4#'];
assert.deepEqual(canonicalizeLine(fen, mate).san, mate);
assert.equal(canonicalizeLine(fen, [...mate, 'e4']).invalidPly, 5);
// Canonical SAN normalizes omitted check symbols and equivalent coordinate notation.
assert.equal(assessCourseLine(fen, ['f2f3', 'e7e5', 'g2g4', 'd8h4'], mate).kind, 'correct');
console.log('Course session: correct, incomplete, legal divergence, illegal line, bad data, mate and SAN aliases passed.');

assert.deepEqual(tokenizeSan('1. e4 e5 2.Nf3 Nc6 {comment} 3. Bb5 a6 1-0'), ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
assert.deepEqual(tokenizeSan('12… Kh7 13. Ng5+ $1 ; comment\n 13... Kg8'), ['Kh7', 'Ng5+', 'Kg8']);
assert.equal(assessCourseLines(fen, ['d4', 'd5', 'c4'], [line, ['d4', 'd5', 'c4']]).kind, 'correct');
assert.equal(assessCourseLines(fen, ['d4'], [line, ['d4', 'd5', 'c4']]).kind, 'incomplete');
assert.deepEqual(assessCourseLines(fen, ['d4', 'Nf6'], [line, ['d4', 'd5', 'c4']]), { kind: 'divergence', matchedPlies: 1, divergencePly: 2 });
console.log('Mental notation and alternate accepted defenses passed.');
