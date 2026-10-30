import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { endgameLessons, endgameTracks, getEndgameLesson } from '../src/data/endgames';

const index: { id: string; sourceId: string; initialFen: string }[] = JSON.parse(readFileSync('content/endgames/position-index.json', 'utf8'));
const games: { id: string; initialFen: string; ply: number; playerColor: 'w' | 'b'; headers: Record<string, string>; pgn: string }[] = JSON.parse(readFileSync('content/endgames/selected-games.json', 'utf8'));
const probes: { initialFen: string; category: string; error?: string }[] = JSON.parse(readFileSync('content/endgames/technical-tablebase-audit.json', 'utf8')).positions;

assert.equal(endgameLessons.length, 24);
assert.equal(new Set(endgameLessons.map(lesson => lesson.id)).size, 24);
assert.equal(new Set(endgameLessons.map(lesson => lesson.initialFen.split(' ').slice(0, 4).join(' '))).size, 24, 'No duplicate board positions');
assert.equal(endgameTracks.length, 3);
assert.equal(games.length, 12);
assert.equal(new Set(games.map(game => [game.headers.White, game.headers.Black, game.headers.Date, game.headers.Event, game.headers.Round].join('|'))).size, 12, 'Twelve game roots must represent twelve distinct games');
assert.equal(index.length, 24);

let technical = 0; let practical = 0;
for (const lesson of endgameLessons) {
  assert.match(lesson.id, /^eg-\d{2}$/, 'Blind URLs cannot reveal the motif');
  assert.equal(getEndgameLesson(lesson.id), lesson);
  assert(lesson.title.length > 5 && lesson.description.length > 25);
  assert.equal(lesson.theory.length, 3, 'Each lesson has a position-specific review');
  assert(lesson.theory.every(paragraph => paragraph.length > 110));
  assert.equal(lesson.reviewQuestions.length, 3);
  assert(lesson.source.label.length > 20);
  assert.equal(lesson.targetHumanMoves, lesson.goal === 'draw' ? 16 : 12);
  assert(!('solutionSan' in lesson) && !('bestMove' in lesson), 'No fixed first-line answer is accepted');
  const board = new Chess(lesson.initialFen);
  assert(!board.isGameOver(), 'Training cannot begin in a terminal position');
  assert.equal(board.turn(), lesson.playerColor, 'The learner moves first');
  const pieces = board.board().flat().filter(Boolean);
  assert.equal(pieces.filter(piece => piece!.type === 'k').length, 2);
  assert(pieces.every(piece => !piece || piece.type !== 'p' || !['1', '8'].includes(piece.square[1])), 'No unpromoted pawns on first/eighth rank');
  const ref = index.find(row => row.id === lesson.id)!;
  assert(ref && ref.initialFen === lesson.initialFen);
  if (pieces.length <= 7) {
    technical += 1;
    const probe = probes.find(row => row.initialFen === lesson.initialFen);
    assert(probe && !probe.error, 'Every small technical root has an actual tablebase response');
    assert.equal(probe.category, lesson.goal === 'win' ? 'win' : 'draw', 'Goals match exact WDL from the learner POV');
  } else {
    practical += 1;
    assert(pieces.length <= 15, 'Practical material remains an endgame');
    assert(!pieces.some(piece => piece!.type === 'q'), 'First practical pack is queenless');
    const source = games.find(game => game.id === lesson.id);
    assert(source, 'Every larger root is backed by a real game');
    const replay = new Chess(); replay.loadPgn(source.pgn);
    const history = replay.history({ verbose: true });
    assert.equal(history[source.ply - 1].before, lesson.initialFen, 'FEN and counters come from the actual game');
    assert.equal(history[source.ply - 1].color, lesson.playerColor);
    assert(source.headers.White.includes('Carlsen') || source.headers.Black.includes('Carlsen'));
    assert(history.length - source.ply >= 20, 'Real positions have a substantial continuation, not one finishing move');
  }
}
assert.equal(technical, 12); assert.equal(practical, 12);
assert(endgameLessons.some(lesson => lesson.goal === 'draw' && games.some(game => game.id === lesson.id)), 'Historical wins do not imply every earlier position was objectively won');
assert.equal(getEndgameLesson('not-a-lesson'), undefined);
console.log('Endgame content: 24 legal unique blind roots; 12 exact tablebase positions; 12 distinct replayed Carlsen games; specific reviews and no fixed-line grading passed.');
