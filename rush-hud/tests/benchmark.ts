import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Chess } from 'chess.js';
import { RushEngine } from '../core/engine';
const here = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.resolve(here, '../package.json'));
const budget = Number(process.argv[2] || 250);
const count = Number(process.argv[3] || 90);
const nativePath = process.env.RUSH_ENGINE_NATIVE;
interface Row { PuzzleId: string; FEN: string; Moves: string; Rating: string }
const rows: Row[] = JSON.parse(fs.readFileSync(path.resolve(here, '../content/training-bank/selected-source-rows.json'), 'utf8'));
const engine = new RushEngine({ enginePath: nativePath || path.join(path.dirname(require.resolve('stockfish/package.json')), 'bin/stockfish-19-lite-single.js'), native: !!nativePath });
const output = path.join(here, 'test-results'); fs.mkdirSync(output, { recursive: true });
async function main() {
  const cold = performance.now(); await engine.ready(); const readyMs = performance.now() - cold;
  const samples: { id: string; rating: number; ply: number; expected: string; actual: string | null; exact: boolean; depth: number; ms: number }[] = [];
  const start = performance.now();
  for (const row of rows.slice(0, count)) {
    const board = new Chess(row.FEN), moves = row.Moves.split(' ');
    for (let ply = 0; ply < moves.length; ply++) {
      if (ply % 2 === 1) {
        const fields = board.fen().split(' ');
        if (ply === 1) { fields[2] = '-'; fields[3] = '-'; }
        const searched = ply === 1 ? fields.join(' ') : board.fen();
        const before = performance.now(); const result = await engine.search(searched, { moveTimeMs: budget });
        samples.push({ id: row.PuzzleId, rating: Number(row.Rating), ply, expected: moves[ply], actual: result.move, exact: result.move === moves[ply], depth: result.depth, ms: performance.now() - before });
      }
      board.move({ from: moves[ply].slice(0, 2), to: moves[ply].slice(2, 4), promotion: moves[ply][4] });
    }
    if ((rows.indexOf(row) + 1) % 15 === 0) console.log(`Bench ${rows.indexOf(row) + 1}/${count}: ${samples.length} searches`);
  }
  const sorted = samples.map(s => s.ms).sort((a, b) => a - b);
  const exact = samples.filter(s => s.exact).length;
  const perfectSequences = rows.slice(0, count).filter(row => samples.filter(s => s.id === row.PuzzleId).every(s => s.exact)).length;
  const report = { engine: nativePath ? 'native' : 'wasm-lite', budget, puzzles: Math.min(count, rows.length), queries: samples.length, exactMoves: exact, exactPercent: Math.round(exact / samples.length * 1000) / 10,
    perfectSequences, readyMs, totalMs: performance.now() - start, medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * .95)], maxMs: sorted.at(-1),
    caveat: 'Canonical solution move agreement on local Lichess training-bank positions, mainly 2200+. Alternative legal moves are not adjudicated. No live Chess.com timed run; no human input, DOM settling or transport time included. Not a 90-puzzle completion claim.', samples };
  fs.writeFileSync(path.join(output, `benchmark-${nativePath ? 'native-' : ''}${budget}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, samples: undefined }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => engine.dispose());
