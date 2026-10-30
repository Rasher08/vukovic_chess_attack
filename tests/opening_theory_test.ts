import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Chess } from 'chess.js';
import data from '../src/data/openingTheory.json';
import { normalizedOpeningPosition, recognizeOpening, OPENING_THEORY_SOURCE } from '../src/lib/openingTheory';
import type { ReviewGame } from '../src/types/gameReview';

function game(pgn: string): ReviewGame {
  const board = new Chess(); board.loadPgn(pgn, { strict: false });
  const moves = board.history({ verbose: true }).map((move, i) => ({ ply: i + 1, moveNumber: Number(move.before.split(' ')[5]), color: move.color, san: move.san, uci: move.from + move.to + (move.promotion || ''), fenBefore: move.before, fenAfter: move.after }));
  return { id: 'opening-test', headers: board.getHeaders(), initialFen: moves[0].fenBefore, moves, pgn, result: '*' };
}
const spanish = game('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6');
const snapshot = JSON.stringify(spanish);
const result = recognizeOpening(spanish);
assert.equal(result.hasOpeningStart, true);
assert.equal(Object.keys(result.bookByPly).length, 8);
assert.equal(result.lastBookPly, 8);
assert.equal(result.firstIndependentPly, null);
assert.match(result.opening!.name, /Ruy Lopez/);
assert.match(result.bookByPly[1].name, /King's Pawn/);
assert.doesNotMatch(result.bookByPly[1].name, /Ruy Lopez/, 'A known prefix cannot be assigned a future opening name');
assert.equal(JSON.stringify(spanish), snapshot, 'Recognition is detached metadata and does not mutate stored grades/game');
result.bookByPly[1].name = 'mutated';
assert.notEqual(recognizeOpening(spanish).bookByPly[1].name, 'mutated', 'Returned metadata does not mutate the shared index');

const viaD4 = recognizeOpening(game('1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. Nf3'));
const viaNf3 = recognizeOpening(game('1. Nf3 Nf6 2. c4 e6 3. d4 Bb4+ 4. Nc3'));
assert.deepEqual(viaNf3.opening, viaD4.opening, 'Equivalent positions through a move-order transposition have the same name');
assert.ok(viaNf3.bookByPly[7]);
const returnToBook = recognizeOpening(game('1. Nf3 Nf6 2. Ng1 Ng8 3. e4 e5'));
assert.equal(returnToBook.bookByPly[3], undefined);
assert.equal(returnToBook.bookByPly[4], undefined);
assert.ok(returnToBook.bookByPly[5]); assert.ok(returnToBook.bookByPly[6]);
assert.equal(returnToBook.firstIndependentPly, 3);
assert.equal(returnToBook.lastBookPly, 6, 'A transposition may return, but does not mark the unknown gap retroactively');
const unknown = recognizeOpening(game('1. a4 h5 2. Ra3 Rh6'));
assert.equal(unknown.bookByPly[4], undefined, 'No blanket first N moves rule');
const longLoop = recognizeOpening(game(Array(9).fill('Nf3 Nf6 Ng1 Ng8').join(' ') + ' e4 e5'));
assert.equal(longLoop.bookByPly[37], undefined); assert.equal(longLoop.bookByPly[38], undefined, 'Late re-entry beyond the finite source window is not book');

const custom = game('[SetUp "1"]\n[FEN "r4rk1/1b2bppp/ppq1p3/2ppB2n/5P2/1P1BP3/P1PPQ1PP/R4RK1 w - - 0 15"]\n\n15. Bxh7+ Kxh7');
assert.deepEqual(recognizeOpening(custom), { version: 1, opening: null, bookByPly: {}, lastBookPly: 0, firstIndependentPly: 1, hasOpeningStart: false });
const blackCustom = game('[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"]\n\n1... e5');
assert.equal(recognizeOpening(blackCustom).hasOpeningStart, false);
const malformed = structuredClone(spanish); malformed.moves[1].fenBefore = 'broken';
assert.doesNotThrow(() => recognizeOpening(malformed));
assert.equal(recognizeOpening(malformed).bookByPly[2], undefined);

const start = new Chess().fen();
assert.equal(normalizedOpeningPosition(start), normalizedOpeningPosition(start.replace('0 1', '47 73')));
assert.notEqual(normalizedOpeningPosition(start), normalizedOpeningPosition(start.replace(' w ', ' b ')));
assert.notEqual(normalizedOpeningPosition(start), normalizedOpeningPosition(start.replace('KQkq', '-')));
assert.equal(normalizedOpeningPosition('6k1/8/8/3pP3/8/8/8/4K3 w - d6 0 1')?.split(' ')[3], 'd6');
assert.notEqual(normalizedOpeningPosition('6k1/8/8/3pP3/8/8/8/4K3 w - d6 0 1'), normalizedOpeningPosition('6k1/8/8/3pP3/8/8/8/4K3 w - - 0 1'));
assert.equal(normalizedOpeningPosition('4r1k1/8/8/3pP3/8/8/8/4K3 w - d6 0 1'), normalizedOpeningPosition('4r1k1/8/8/3pP3/8/8/8/4K3 w - - 0 1'), 'Pinned en-passant is canonicalized out');
assert.equal(normalizedOpeningPosition('invalid'), null);

const transitions = new Map(data.transitions.map(([fen, moves]) => [fen, new Set(moves.split(' '))]));
const positions = new Set(data.positions.map(([fen]) => fen));
let lines = 0; let plies = 0; let longest = 0;
for (const filename of ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv']) {
  const rows = fs.readFileSync(new URL(`../content/openings/${filename}`, import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1);
  for (const row of rows) {
    const [, , pgn] = row.split('\t');
    const opening = game(pgn); const board = new Chess();
    for (const move of opening.moves) {
      const fen = board.fen().split(' ').slice(0, 4).join(' ');
      assert.ok(transitions.get(fen)?.has(move.uci), `Missing source prefix ${filename} ${pgn} ply${move.ply}`);
      board.move({ from: move.uci.slice(0, 2), to: move.uci.slice(2, 4), ...(move.uci[4] ? { promotion: move.uci[4] } : {}) });
      plies += 1;
    }
    assert.ok(positions.has(board.fen().split(' ').slice(0, 4).join(' ')));
    lines += 1; longest = Math.max(longest, opening.moves.length);
  }
}
assert.equal(lines, data.openingCount); assert.equal(longest, data.maxPly);
assert.equal(OPENING_THEORY_SOURCE.license, 'CC0-1.0');
assert.match(OPENING_THEORY_SOURCE.commit, /^[a-f0-9]{40}$/);
console.log(`Opening theory: ${lines} legal source lines / ${plies} indexed prefixes, names, transpositions, unknown gaps, custom roots, rights, en-passant and immutability passed.`);
