/** Reproducible audit against the exact bundled Stockfish 19 Lite WASM. */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Chess } from 'chess.js';
import { endgameLessons } from '../src/data/endgames';

interface Candidate { id?: string; initialFen: string; playerColor: 'w' | 'b'; headers?: Record<string, string>; ply?: number }
const args = process.argv.slice(2);
const candidateFile = args.includes('--candidates') ? args[args.indexOf('--candidates') + 1] : null;
const nodes = args.includes('--nodes') ? Number(args[args.indexOf('--nodes') + 1]) : 2_000_000;
const outFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : 'content/endgames/audit-report.json';
if (!Number.isSafeInteger(nodes) || nodes < 1) throw new Error('Positive integer --nodes required');

async function main() {
  const positions: Candidate[] = candidateFile ? JSON.parse(await readFile(candidateFile, 'utf8')) : endgameLessons;
  const child = spawn(process.execPath, ['public/engine/stockfish-19-lite-single.js'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let rejectPending: ((error: Error) => void) | null = null;
  let consume: ((line: string) => void) | null = null;
  const output = createInterface({ input: child.stdout });
  output.on('line', line => consume?.(line));
  child.stderr.on('data', buffer => process.stderr.write(buffer));
  child.on('error', error => rejectPending?.(error));
  const send = (command: string) => child.stdin.write(command + '\n');
  function command<T>(start: string, read: (line: string, done: (value: T) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { consume = null; rejectPending = null; reject(new Error(`Engine timeout: ${start}`)); }, 90_000);
      const cleanup = () => { clearTimeout(timeout); consume = null; rejectPending = null; };
      rejectPending = error => { cleanup(); reject(error); };
      consume = line => read(line, value => { cleanup(); resolve(value); });
      send(start);
    });
  }
  try {
    await command<void>('uci', (line, done) => { if (line === 'uciok') done(); });
    send('setoption name Threads value 1'); send('setoption name Hash value 64');
    await command<void>('isready', (line, done) => { if (line === 'readyok') done(); });
    const report: unknown[] = [];
    for (let index = 0; index < positions.length; index += 1) {
      const item = positions[index]; const board = new Chess(item.initialFen);
      if (board.isGameOver()) throw new Error('Terminal initial position: ' + item.id);
      send('ucinewgame');
      await command<void>('isready', (line, done) => { if (line === 'readyok') done(); });
      send('position fen ' + board.fen());
      let score: { kind: 'cp' | 'mate'; value: number } | null = null; let depth = 0; let pv: string[] = [];
      const result = await command(`go nodes ${nodes}`, (line, done) => {
        if (line.startsWith('info ') && !/\b(?:lowerbound|upperbound)\b/.test(line)) {
          const match = line.match(/\bscore (cp|mate) (-?\d+)/);
          if (match) { score = { kind: match[1] as 'cp' | 'mate', value: Number(match[2]) }; depth = Number(line.match(/\bdepth (\d+)/)?.[1]) || depth; }
          const variation = line.match(/\bpv (.*)$/); if (variation) pv = variation[1].split(/\s+/);
        }
        if (line.startsWith('bestmove ')) done({ score, depth, pv, bestMove: line.split(' ')[1] });
      });
      const relative = (result as { score: { kind: string; value: number } | null }).score;
      const playerScore = relative ? { ...relative, value: relative.value * (board.turn() === item.playerColor ? 1 : -1) } : null;
      const row = { id: item.id || index, fen: item.initialFen, nodes, engine: 'Stockfish 19.0.1 lite-single', playerColor: item.playerColor, ...result as object, playerScore };
      report.push(row);
      process.stdout.write(JSON.stringify({ index, id: item.id, game: item.headers ? `${item.headers.White}–${item.headers.Black},${item.headers.Date}` : undefined, ply: item.ply, playerScore, depth }) + '\n');
    }
    await mkdir('content/endgames', { recursive: true });
    await writeFile(outFile, JSON.stringify({ schemaVersion: 1, nodes, engine: 'Stockfish 19.0.1 lite-single', positions: report }, null, 2) + '\n');
  } finally { child.kill(); output.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
