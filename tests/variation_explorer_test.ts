import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { appendVariationMove, replayVariation, undoVariation } from '../src/lib/variationExplorer';

const start = new Chess().fen();
const empty: string[] = [];
const e4 = appendVariationMove(start, empty, 'e2', 'e4')!;
assert.deepEqual(empty, [], 'Playing a branch cannot mutate the original line');
assert.equal(replayVariation(start, e4).game.get('e4')?.type, 'p');
assert.equal(appendVariationMove(start, e4, 'e2', 'e4'), null, 'Illegal and out-of-turn moves are rejected');
const e5 = appendVariationMove(start, e4, 'e7', 'e5')!;
assert.equal(replayVariation(start, undoVariation(start, e5, 'auto')).fen, start, 'Auto undo removes the learner move and its reply');
assert.equal(replayVariation(start, undoVariation(start, e4, 'auto')).fen, start, 'Undo during thinking removes the unanswered learner move');
assert.equal(replayVariation(start, undoVariation(start, e5, 'manual')).fen, replayVariation(start, e4).fen, 'Manual undo removes exactly one ply');

// A black-to-move root uses the root player, not board orientation or White, as the learner.
const blackRoot = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 12';
const blackLine = ['e7e5', 'g1f3', 'b8c6', 'f1b5'];
const black = replayVariation(blackRoot, blackLine);
assert.deepEqual(black.labels, ['12…', '13.', '13…', '14.']);
assert.deepEqual(black.san, ['e5', 'Nf3', 'Nc6', 'Bb5']);
assert.deepEqual(undoVariation(blackRoot, blackLine, 'auto'), blackLine.slice(0, 2));
assert.equal(replayVariation(blackRoot, undoVariation(blackRoot, blackLine, 'auto')).game.turn(), 'b');
assert.deepEqual(undoVariation(blackRoot, blackLine.slice(0, 3), 'auto'), blackLine.slice(0, 2));

const castleRoot = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
const castled = appendVariationMove(castleRoot, [], 'e1', 'g1')!;
const castledGame = replayVariation(castleRoot, castled).game;
assert.equal(castledGame.get('g1')?.type, 'k'); assert.equal(castledGame.get('f1')?.type, 'r');
assert.equal(replayVariation(castleRoot, undoVariation(castleRoot, castled, 'auto')).fen, castleRoot);

const promotionRoot = '7k/P7/8/8/8/8/8/7K w - - 0 1';
const promoted = appendVariationMove(promotionRoot, [], 'a7', 'a8', 'n')!;
assert.deepEqual(promoted, ['a7a8n']);
assert.equal(replayVariation(promotionRoot, promoted).game.get('a8')?.type, 'n', 'Underpromotion survives replay');
const enPassantRoot = '7k/8/8/3pP3/8/8/8/7K w - d6 0 1';
const enPassant = appendVariationMove(enPassantRoot, [], 'e5', 'd6')!;
assert.equal(replayVariation(enPassantRoot, enPassant).game.get('d5'), undefined);
assert.equal(replayVariation(enPassantRoot, enPassant).game.get('d6')?.color, 'w');

const mateRoot = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1';
const mateLine = appendVariationMove(mateRoot, [], 'f7', 'g7')!;
assert.equal(replayVariation(mateRoot, mateLine).game.isCheckmate(), true);
assert.equal(appendVariationMove(mateRoot, mateLine, 'h8', 'h7'), null, 'No moves after a terminal result');
assert.deepEqual(undoVariation(mateRoot, mateLine, 'auto'), [], 'Undo also leaves a completed branch');
assert.throws(() => replayVariation(start, ['e2e5']));
assert.throws(() => replayVariation('invalid fen', []));
console.log('Variation explorer: actual FEN, immutable legal moves, black-root numbering, auto/manual undo, castling, underpromotion, en passant and terminal positions passed.');
