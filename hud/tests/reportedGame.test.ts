import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Chess } from 'chess.js';
import { NodeEngine } from '../core/nodeEngine';
import { detectBrilliant } from '../core/detector';

async function main() {
  const recorded = new Chess();
  recorded.loadPgn(fs.readFileSync(new URL('./fixtures/reported-scandinavian.pgn', import.meta.url), 'utf8'));
  const moves = recorded.history(), board = new Chess();
  assert.equal(moves.length, 40);
  for (let ply = 0; ply <= moves.length; ply++) {
    const engine = new NodeEngine();
    try {
      assert.deepEqual(await detectBrilliant(board.fen(), engine, new AbortController().signal), { brilliant: false }, `No special notification at ply ${ply}`);
    } finally { engine.dispose(); }
    if (ply < moves.length) board.move(moves[ply]);
  }
  console.log('PASS user-provided Scandinavian game: all 41 positions checked, zero notifications, both former Nc4 alerts suppressed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
