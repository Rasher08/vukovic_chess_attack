import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MoveHistory, normalizeSan, type RecordedMove } from '../core/moveHistory';
import { MoveReceiver, extensionOrigin } from '../core/moveReceiver';

const initial = new Chess().fen();
const sans = ['e4', 'e5', 'Nf3', 'Nf6', 'Nxe5', 'Nc6', 'Nxc6', 'dxc6', 'd3', 'Bc5', 'Bg5'];
const records = sans.map((san, i) => ({ ply: i + 1, san }));
const expected = new Chess(); sans.forEach(m => expected.move(m));
const canonical = (b: Chess) => b.fen({ forceEnpassantSquare: true });
const history = new MoveHistory(initial);
for (let i = 1; i <= records.length; i++) {
  const check = new Chess(); sans.slice(0, i).forEach(m => check.move(m));
  assert.equal(history.ingest(records.slice(Math.max(0, i - 3), i), i).fen, canonical(check), 'Remember earlier moves when only the tail remains visible');
}
assert.equal(history.count, 11);
assert.equal(history.ingest(records, 11).fen, canonical(expected));
assert.equal(history.ingest(records, 11).count, 11, 'Repeated observations do not duplicate moves');
assert.equal(canonical(expected), 'r1bqk2r/ppp2ppp/2p2n2/2b3B1/4P3/3P4/PPP2PPP/RN1QKB1R b KQkq - 2 6', 'Screenshot game reconstructs counters and turn from the actual moves');
assert.equal(history.ingest(records.slice(0, 4), 11).fen, canonical(expected), 'Scrolling back cannot erase recorded moves');
assert.equal(history.ingest(records, 5).issue, 'replay', 'Viewing an earlier position hides the signal');
assert.equal(history.ingest(records, null).fen, null, 'Unknown displayed ply is not guessed');
assert.equal(history.ingest(records, 11).fen, canonical(expected));

const extra = ['O-O', 'Be2', 'Kh8', 'O-O'];
extra.forEach(m => expected.move(m));
const extended = records.concat(extra.map((san, i) => ({ ply: 12 + i, san })));
assert.equal(history.ingest(extended.slice(11), 15).fen, canonical(expected), 'Several rapid moves are replayed in order');
assert.equal(canonical(expected).split(' ')[2], '-', 'Both castling rights are updated');
assert.equal(history.ingest([{ ply: 16, san: 'Qh1' }], 16).issue, 'illegal');
assert.equal(history.count, 15, 'An illegal observation cannot poison stored history');
assert.equal(history.ingest(extended, 15).fen, canonical(expected));
assert.equal(history.ingest([{ ply: 1, san: 'd4' }], 15).issue, 'conflict');
assert.equal(history.ingest(extended, 15).fen, null, 'Conflicting history requires explicit reconnect');

const gap = new MoveHistory(initial);
assert.equal(gap.ingest(records.slice(4), 11).issue, 'gap');
assert.equal(gap.ingest(records.slice(0, 4), 11).fen, 'r1bqk2r/ppp2ppp/2p2n2/2b3B1/4P3/3P4/PPP2PPP/RN1QKB1R b KQkq - 2 6', 'Filling an earlier gap restores the complete position');
assert.equal(new MoveHistory(initial).ingest([{ ply: 1, san: 'e5' }], 1).fen, null);
assert.equal(new MoveHistory(initial).ingest([{ ply: 1, san: 'e4' }, { ply: 1, san: 'd4' }], 1).issue, 'conflict');
assert.throws(() => new MoveHistory('invalid'));

for (const [raw, san] of [['♘ f3','Nf3'],['♞xe5!!','Nxe5'],['0-0','O-O'],['♔h8','Kh8'],['e8=♕+','e8=Q+'],['♗×f7+','Bxf7+']]) assert.equal(normalizeSan(raw), san);
for (const raw of ['35.6s', '1:12', '1-0', 'something', 'f3 / Nc6', 'Q?', '']) assert.throws(() => normalizeSan(raw));

const epStart = '4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 20';
const ep = new MoveHistory(epStart);
const epBoard = new Chess(epStart); epBoard.move('d5');
assert.equal(ep.ingest([{ ply: 40, san: 'd5' }], 40).fen, canonical(epBoard));
assert.equal(canonical(epBoard).split(' ')[3], 'd6', 'En passant derives from the recorded double push');
epBoard.move('exd6');
assert.equal(ep.ingest([{ ply: 41, san: 'exd6' }], 41).fen, canonical(epBoard));
const promotion = new MoveHistory('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
assert(promotion.ingest([{ ply: 1, san: 'a8=Q+' }], 1).fen?.startsWith('Q3k3/'));
const repeat = new MoveHistory(initial), repeatSans = ['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1','Ng8'];
assert.equal(repeat.ingest(repeatSans.map((san, i) => ({ ply: i + 1, san })), 8).issue, 'game-over', 'Preserve repetition history');

const token = 'a'.repeat(64); let fen: string | null = null;
const receiver = new MoveReceiver(token, value => { fen = value; });
let sequence = 0;
const send = (now: number, moves: RecordedMove[] = records, currentPly: number | null = 11, extra = {}) => receiver.receive({
  token, session: 'text-session-one', sequence: ++sequence, sentAt: now,
  game: 'https://www.chess.com/game/live/12345', startFen: initial, visible: true, ready: true, moves, currentPly, ...extra,
}, now);
assert(send(1000)); assert.equal(fen, null);
send(1450); send(1900); assert.equal(fen, 'r1bqk2r/ppp2ppp/2p2n2/2b3B1/4P3/3P4/PPP2PPP/RN1QKB1R b KQkq - 2 6');
send(1950, [], null, { ready: false }); assert.equal(fen, null, 'First changed DOM observation immediately withdraws the old signal');
send(2000); send(2450); send(2900); assert(fen);
send(3000, records, 5); assert.equal(fen, null); assert.equal(receiver.issue, 'replay');
send(3100); send(3550); send(4000); assert(fen);
send(4050, records, 11, { visible: false }); assert.equal(fen, null); assert.equal(receiver.issue, 'hidden');
send(4100); send(4550); send(5000); assert(fen);
receiver.tick(6801); assert.equal(fen, null, 'An expired source cannot leave an old positive visible');
assert.equal(receiver.issue, 'waiting');
send(7000); send(7450); send(7900); assert(fen, 'A renderer/service-worker interruption can resume retained history');
send(8000, records, 11, { session: 'text-session-two' }); assert.equal(fen, null); assert.equal(receiver.status, 'conflict');
assert.equal(send(8100, records, 11, { token: 'b'.repeat(64) }), false);
assert.equal(send(8200, records, 11, { sentAt: 0 }), false);
assert.equal(send(8300, records, 11, { game: 'https://www.chess.com.evil/game' }), false);
assert.equal(send(8400, records, 11, { sequence: 0 }), false);
receiver.reset(); assert.equal(receiver.count, 0); assert.equal(receiver.issue, 'waiting');
assert(extensionOrigin('chrome-extension://' + 'a'.repeat(32)));
for (const origin of ['', 'null', 'https://www.chess.com', 'chrome-extension://' + 'x'.repeat(32), 'chrome-extension://' + 'a'.repeat(32) + '.evil']) assert(!extensionOrigin(origin));
const recorded = new Chess();
recorded.loadPgn(fs.readFileSync(fileURLToPath(new URL('../../content/course-build/Lasker-selected.pgn', import.meta.url)), 'utf8'));
const fullGame = recorded.history(), replay = new Chess(), textReplay = new MoveHistory(initial);
const played: RecordedMove[] = [];
assert.equal(textReplay.ingest([], 0).fen, initial);
for (const [i, san] of fullGame.entries()) {
  replay.move(san); played.push({ ply: i + 1, san });
  const result = textReplay.ingest(played.slice(-4), i + 1);
  if (replay.isGameOver()) assert.equal(result.issue, 'game-over');
  else assert.equal(result.fen, canonical(replay), `Exact text-reconstructed FEN at ply ${i + 1}`);
}
assert.equal(textReplay.count, 75);
console.log('PASS full recorded game: 76 text positions with exact FEN, only the last four moves visible.');
console.log('Text move history PASS: screenshot game, scrolling, gaps, duplicates, rapid moves, invalid/conflicting notation, replay, castling, EP, promotion, repetition, custom start, leases and authentication.');
