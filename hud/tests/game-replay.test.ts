import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { PositionTracker } from '../core/position';
import { detectBrilliant, IncompleteAnalysisError } from '../core/detector';
import { NodeEngine } from '../core/nodeEngine';
import { BridgeReceiver } from '../core/bridgeReceiver';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pgn = readFileSync(path.join(root, 'content/course-build/Lasker-selected.pgn'), 'utf8');
const recorded = new Chess(); recorded.loadPgn(pgn);
const moves = recorded.history({ verbose: true });
const game = new Chess(), tracker = new PositionTracker();
tracker.seed(game.fen());
const token = 'a'.repeat(64);
let received: string | null = null, sequence = 0, now = Date.now();
const bridge = new BridgeReceiver(token, fen => { received = fen; });
const rows: { ply: number; turn: string; status: string; signal: boolean; searches: number; elapsedMs: number }[] = [];

async function main() {
  console.log(`Replay: ${recorded.getHeaders().White} — ${recorded.getHeaders().Black}, ${moves.length} plies; real Stockfish 19 Lite, production budgets.`);
  for (let ply = 0; ply <= moves.length; ply++) {
    const expected = game.fen({ forceEnpassantSquare: true });
    assert.equal(tracker.observe(expected.split(' ')[0]).fen, expected, `Full FEN/history must track at ply ${ply}`);
    const publish = (fen: string | null, offset: number) => {
      const sentAt = now + offset;
      assert(bridge.receive({ token, session: 'recorded-game-session', sequence: ++sequence, fen, orientation: 'white', sentAt }, sentAt));
    };
    publish(null, 0); assert.equal(received, null);
    publish(expected, 100); publish(expected, 600); publish(expected, 1100);
    assert.equal(received, expected, 'Stable trusted bridge must deliver the exact tracked FEN');
    const engine = new NodeEngine();
    let searches = 0;
    const analyze = engine.analyze.bind(engine);
    engine.analyze = (...args) => { searches++; return analyze(...args); };
    const started = Date.now(); let status = 'checked', signal = false;
    try {
      if (!tracker.isGameOver) signal = (await detectBrilliant(expected, engine, new AbortController().signal)).brilliant;
    } catch (error) {
      if (!(error instanceof IncompleteAnalysisError)) throw error;
      status = 'incomplete';
    } finally { engine.dispose(); }
    rows.push({ ply, turn: game.turn(), status, signal, searches, elapsedMs: Date.now() - started });
    console.log(`ply ${ply}/${moves.length}: ${status}, signal=${signal}, searches=${searches}, ${Date.now() - started}ms`);
    if (ply === 0) assert.equal(signal, false, 'The ordinary initial position must not notify');
    if (ply === 28) assert(signal || status === 'incomplete', 'The known sacrifice must either pass the stronger gate or remain explicitly incomplete under the caps');
    publish(null, 1200); assert.equal(received, null, 'Moving to the next frame immediately withdraws evidence');
    now += 2000;
    if (ply < moves.length) game.move(moves[ply]);
  }
  const result = {
    game: recorded.getHeaders(), fixture: 'content/course-build/Lasker-selected.pgn',
    engine: 'Stockfish 19 Lite / stockfish npm 19.0.1', nodesPerSearch: 600_000, depthFloor: 12,
    positions: rows.length, checked: rows.filter(r => r.status === 'checked').length,
    incomplete: rows.filter(r => r.status !== 'checked').length,
    notifications: rows.filter(r => r.signal).length,
    elapsedMs: rows.reduce((sum, r) => sum + r.elapsedMs, 0), rows,
  };
  const output = path.join(root, 'hud/test-results'); mkdirSync(output, { recursive: true });
  writeFileSync(path.join(output, 'game-replay.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`PASS game replay: ${result.positions} positions, ${result.checked} checked, ${result.incomplete} incomplete, ${result.notifications} confirmed candidates. No assumption that all unsignaled positions have no brilliant move.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
