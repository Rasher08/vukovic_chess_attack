/** Offline reproducible audit; requires an official Stockfish executable passed as argv[2]. */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, writeFile } from 'node:fs/promises';
import { Chess } from 'chess.js';
import { courseExercises } from '../src/data/course';

const binary = process.argv[2];
if (!binary) throw new Error('Usage: npm run audit:course -- /absolute/path/to/stockfish [nodes]');
const nodes = Number(process.argv[3]) || 500000;
const processEngine = spawn(binary, [], { stdio: ['pipe', 'pipe', 'pipe'] });
const queue: string[] = [];
let receive: ((line: string) => void) | null = null;
let failure: Error | null = null;
processEngine.on('error', error => { failure = error; receive?.('FATAL'); });
processEngine.on('exit', code => { failure = new Error(`Engine exited: ${code}`); receive?.('FATAL'); });
createInterface({ input: processEngine.stdout }).on('line', line => {
  if (receive) { const next = receive; receive = null; next(line); } else queue.push(line);
});
function send(command: string) { processEngine.stdin.write(command + '\n'); }
async function readLine(): Promise<string> {
  if (failure) throw failure;
  if (queue.length) return queue.shift()!;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { receive = null; reject(new Error('Engine timeout after 30 seconds')); }, 30000);
    receive = line => { clearTimeout(timeout); if (failure) reject(failure); else resolve(line); };
  });
}
async function until(prefix: string) { let line: string; do { line = await readLine(); } while (!line.startsWith(prefix)); return line; }
async function analyze(fen: string, searchMove?: string) {
  send('position fen ' + fen);
  send(`go nodes ${nodes}${searchMove ? ' searchmoves ' + searchMove : ''}`);
  let score: { type: string; value: number } | null = null;
  let depth = 0;
  let pv = '';
  while (true) {
    const line = await readLine();
    if (line.startsWith('bestmove')) return { bestmove: line.split(' ')[1], score, depth, pv };
    const scoreMatch = line.match(/ score (cp|mate) (-?\d+)/);
    if (scoreMatch && !line.includes('lowerbound') && !line.includes('upperbound')) {
      score = { type: scoreMatch[1], value: Number(scoreMatch[2]) };
      depth = Number(line.match(/ depth (\d+)/)?.[1]) || depth;
      pv = line.match(/ pv (.+)$/)?.[1] || '';
    }
  }
}

async function main() {
  send('uci'); await until('uciok');
  send('setoption name Threads value 1'); send('setoption name Hash value 64');
  send('isready'); await until('readyok');
  const report: unknown[] = [];
  for (const exercise of courseExercises) {
    send('ucinewgame');
    const game = new Chess(exercise.initialFen);
    const move = game.move(exercise.solutionSan[0]);
    const uci = move.from + move.to + (move.promotion || '');
    const best = await analyze(exercise.initialFen);
    const supplied = best.bestmove === uci ? best : await analyze(exercise.initialFen, uci);
    const loss = best.score?.type === 'cp' && supplied.score?.type === 'cp' ? best.score.value - supplied.score.value : null;
    report.push({ id: exercise.id, initialFen: exercise.initialFen, suppliedMove: uci, best, supplied, centipawnDifference: loss });
    console.log(`${exercise.id}: ${uci}, engine ${best.bestmove}, difference ${loss ?? 'mate/see report'} cp`);
  }
  const output = '.artifacts/course-engine-audit.json';
  await mkdir('.artifacts', { recursive: true });
  await writeFile(output, JSON.stringify({ generatedAt: new Date().toISOString(), engine: binary, nodesPerSearch: nodes, threads: 1, hashMb: 64, purpose: 'First-move quality audit, not proof of every continuation or uniqueness', report }, null, 2));
  console.log('Report: ' + output);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { send('quit'); processEngine.stdin.end(); });
