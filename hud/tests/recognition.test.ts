import assert from 'node:assert/strict';
import { Chess, type Square } from 'chess.js';
import {
  calibrate, recognize, screenSquare, FrameStabilityGate,
  type PixelImage, type Orientation,
} from '../core/recognition';
import { PositionTracker, ScreenPositionTracker, validateTrustedFen } from '../core/position';

// Deterministic raster fixtures exercise orientation, classification, rejection,
// highlights and frame changes. They are not a claim of universal theme OCR.
function fixture(fen: string, orientation: Orientation = 'white', options: { highlight?: string; broken?: string; noise?: boolean; size?: number } = {}): PixelImage {
  const size = options.size ?? 384; const image = { width: size, height: size, data: new Uint8ClampedArray(size * size * 4) };
  const board = new Chess(fen); const step = size / 8;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const row = Math.floor(y / step); const col = Math.floor(x / step); const square = screenSquare(row, col, orientation);
    const piece = board.get(square); const u = (x % step + 0.5) / step; const v = (y % step + 0.5) / step;
    let rgb = (row + col) % 2 ? [98, 120, 117] : [202, 210, 199];
    if (options.highlight === square) rgb = [128, 170, 112];
    if (piece) {
      const type = 'pnbrqk'.indexOf(piece.type);
      const base = v > .67 && v < .82 && u > .21 && u < .79;
      const stem = v > .30 && v < .70 && Math.abs(u - .5) < .08 + type * .018;
      const cap = v > .16 && v < .30 && u > .18 + type * .035 && u < .82 - type * .035;
      const detail = v > .37 && v < .44 + type * .027 && u > .27 && u < .39;
      if ((base || stem || cap) && !detail) rgb = piece.color === 'w' ? [245, 244, 235] : [23, 22, 29];
    }
    if (options.broken === square && u > .15 && u < .87 && v > .13 && v < .9) rgb = [180, 60, 190];
    const i = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) image.data[i + c] = rgb[c] + (options.noise ? ((x * 17 + y * 13 + c) % 3 - 1) : 0);
    image.data[i + 3] = 255;
  }
  return image;
}

const board = new Chess();
const initial = board.fen();
const initialImage = fixture(initial);
const templates = calibrate(initialImage, initial, 'white');
assert.equal(JSON.parse(JSON.stringify(templates)).version, 1, 'Templates are serializable');
const same = recognize(initialImage, templates, 'white');
assert.equal(same.confident, true);
assert.equal(same.placement, initial.split(' ')[0]);
assert.equal(same.cells.length, 64);
assert.equal(same.cells.find(c => c.square === 'e1')?.piece, 'K');
assert.equal(same.cells.find(c => c.square === 'a8')?.piece, 'r');
assert.equal(same.cells.find(c => c.square === 'e4')?.piece, null);
assert.equal(recognize(fixture(initial, 'black'), templates, 'black').placement, initial.split(' ')[0], 'Flipped board is converted back to FEN orientation');
assert.equal(recognize(fixture(initial, 'white', { noise: true }), templates, 'white').placement, initial.split(' ')[0]);
assert.equal(recognize(fixture(initial, 'white', { highlight: 'e1' }), templates, 'white').placement, initial.split(' ')[0], 'Uniform square highlights do not alter piece identity');
assert.throws(() => calibrate(initialImage, '8/8/8/8/8/8/4k3/4K3 w - - 0 1', 'white'));
assert.throws(() => calibrate({ ...initialImage, width: 100 }, initial, 'white'));

board.move('e4');
const e4 = board.fen({ forceEnpassantSquare: true });
assert.equal(recognize(fixture(e4), templates, 'white').placement, e4.split(' ')[0], 'Templates follow a moved piece to a different square');
const broken = recognize(fixture(e4, 'white', { broken: 'e4' }), templates, 'white');
assert.equal(broken.confident, false, 'An unknown foreground cannot manufacture a trusted board');
assert.equal(broken.placement, null);
assert.equal(broken.cells.find(c => c.square === 'e4')?.confident, false);

const gate = new FrameStabilityGate();
assert.deepEqual(gate.observe(initialImage, 0), { stable: false, changed: true, fingerprint: same.fingerprint });
assert.equal(gate.observe(initialImage, 100).stable, false);
assert.equal(gate.observe(initialImage, 250).stable, true);
assert.equal(gate.observe(fixture(initial, 'white', { noise: true }), 300).changed, false, 'Tiny capture noise is tolerated');
const drag = fixture(initial, 'white', { broken: 'e2' });
assert.equal(gate.observe(drag, 350).changed, true, 'First dragging frame immediately withdraws a signal');
assert.equal(gate.observe(initialImage, 400).stable, false, 'Returning from a cancelled drag must settle again');
assert.equal(gate.observe(initialImage, 500).stable, false);
assert.equal(gate.observe(initialImage, 650).stable, true);
assert.equal(gate.observe(fixture(e4), 700).changed, true);
assert.equal(gate.observe(fixture(e4), 800).stable, false);
assert.equal(gate.observe(fixture(e4), 950).stable, true);
assert.equal(gate.observe(fixture(e4, 'white', { size: 400 }), 1000).changed, true, 'Capture dimensions invalidate stability');
gate.reset();
assert.equal(gate.observe(fixture(e4), 1050).stable, false);

assert.throws(() => validateTrustedFen(initial.split(' ').slice(0, 4).join(' ')), 'Missing counters are not invented');
assert.throws(() => validateTrustedFen(initial.replace(' w ', ' ? ')), 'Unknown turn is not invented');
assert.throws(() => validateTrustedFen('4k3/8/8/8/8/8/8/4K3 w K - 0 1'), 'Castling requires the named rook');
assert.throws(() => validateTrustedFen('4k3/8/8/8/8/8/8/4K3 w - e6 0 1'), 'EP requires a just-moved pawn');
assert.throws(() => validateTrustedFen('4k3/8/8/8/8/8/4R3/4K3 w - - 0 1'), 'Inactive king cannot already be in check');
assert.throws(() => validateTrustedFen(initial + '\ngo infinite'));

const tracker = new PositionTracker();
assert.equal(tracker.observe(initial.split(' ')[0]).fen, null, 'Pixels alone do not initialize metadata');
assert.equal(tracker.seed(initial), initial);
assert.deepEqual(tracker.observe(initial.split(' ')[0]), { fen: initial, changed: false });
assert.equal(tracker.observe(e4.split(' ')[0]).fen, e4);
assert.equal(tracker.currentFen?.split(' ')[1], 'b');
assert.equal(tracker.currentFen?.split(' ')[2], 'KQkq');
assert.equal(tracker.currentFen?.split(' ')[3], '-', 'chess.js omits uncapturable EP targets');
board.move('a6');
assert.equal(tracker.observe(board.fen().split(' ')[0]).fen, board.fen({ forceEnpassantSquare: true }));
assert.equal(tracker.currentFen?.split(' ')[3], '-', 'EP expires after one move');
board.move('d4'); board.move('a5');
assert.equal(tracker.observe(board.fen().split(' ')[0]).fen, null, 'Two missed plies do not cause guessed turn/rights');
assert.equal(tracker.currentFen, null);
assert.equal(tracker.observe(initial.split(' ')[0]).fen, null, 'An unknown tracker remains unknown until explicitly reseeded');
tracker.seed(initial);
assert.equal(tracker.observe(null).fen, null);
assert.equal(tracker.currentFen, null);

const castleFen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
tracker.seed(castleFen);
const castleBoard = new Chess(castleFen); castleBoard.move('O-O');
assert.equal(tracker.observe(castleBoard.fen().split(' ')[0]).fen, castleBoard.fen());
assert.equal(String(tracker.currentFen).split(' ')[2], 'kq');

// A capture on the EP target differs from a regular one but is fully determined
// once the metadata and previous move are trusted.
const beforeEp = '4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1';
tracker.seed(beforeEp); const beforeEpBoard = new Chess(beforeEp); beforeEpBoard.move('d5');
assert.equal(tracker.observe(beforeEpBoard.fen().split(' ')[0]).fen?.split(' ')[3], 'd6', 'Capturable EP target derives from tracked double push');
const epFen = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2';
tracker.seed(epFen); const epBoard = new Chess(epFen); epBoard.move('exd6');
assert.equal(tracker.observe(epBoard.fen().split(' ')[0]).fen, epBoard.fen());
tracker.seed(initial); const repeat = new Chess();
for (const move of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) {
  repeat.move(move); tracker.observe(repeat.fen().split(' ')[0]);
}
assert.equal(tracker.isGameOver, true, 'Tracked repetitions suppress analysis once the game is drawn');
assert.throws(() => tracker.seed('invalid'));
assert.equal(tracker.currentFen, null, 'A failed re-seed withdraws old trust');

const screenTracker = new ScreenPositionTracker();
screenTracker.seed(initial);
screenTracker.suspend();
assert.equal(screenTracker.currentFen, null, 'A changed or animated frame cannot reuse the old FEN');
assert(screenTracker.hasAnchor, 'Keep the last trusted anchor privately during an obstruction');
assert.equal(screenTracker.observe(null).fen, null, 'An uncertain recognition never reaches analysis');
assert.equal(screenTracker.currentFen, null);
assert.equal(screenTracker.observe(initial.split(' ')[0]).fen, initial, 'Returning to the same board resumes without inventing metadata');
screenTracker.observe(null);
assert.equal(screenTracker.observe(e4.split(' ')[0]).fen, e4, 'One legal move after a transient obstruction is recoverable');
screenTracker.suspend();
const skipped = new Chess(e4); skipped.move('e5'); skipped.move('Nf3');
assert.equal(screenTracker.observe(skipped.fen().split(' ')[0]).fen, null, 'Multiple skipped moves still fail closed');
assert.equal(screenTracker.hasAnchor, false, 'An illegal transition requires a fresh full FEN');
screenTracker.seed(initial); screenTracker.invalidate();
assert.equal(screenTracker.observe(initial.split(' ')[0]).fen, null, 'A lost capture/source still discards trust');
screenTracker.seed(initial);
assert.throws(() => screenTracker.seed('invalid'));
assert.equal(screenTracker.currentFen, null);
assert.equal(screenTracker.hasAnchor, false);
console.log('HUD recognition/tracking checks passed (synthetic raster fixtures).');
