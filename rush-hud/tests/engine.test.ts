import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Chess } from 'chess.js';
import { RushEngine, type RushResult } from '../core/engine';

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-engine-test-'));
const script = path.join(folder, 'fake.cjs'), log = path.join(folder, 'commands.txt');
fs.writeFileSync(script, `
const fs=require('node:fs'), readline=require('node:readline');
const log=${JSON.stringify(log)};
fs.appendFileSync(log,'START\\n');
let black=false;
readline.createInterface({input:process.stdin}).on('line',line=>{
 fs.appendFileSync(log,line+'\\n');
 if(line==='uci') console.log('uciok');
 if(line==='isready') console.log('readyok');
 if(line.startsWith('position fen ')) black=line.split(' ')[3]==='b';
 if(line.startsWith('go ')) {
  const n=Number(line.split(' ').at(-1)), move=black?'e7e5':'e2e4', reply=black?'g1f3':'e7e5';
  if(n===33)return;
  if(n===34){setTimeout(()=>console.log('bestmove a1a8'),10);return;}
  setTimeout(()=>{
   console.log('info depth 9 score cp 20 pv '+move+' '+reply);
   console.log('info depth 10 score cp 20 lowerbound pv '+move+' '+reply);
   console.log('info depth 10 score cp 20 pv a1a8');
   console.log('info depth 10 score cp 20 pv '+move+' a1a8');
   console.log('info depth 10 score cp 20 pv '+move+' '+reply);
  },10);
  setTimeout(()=>console.log('bestmove '+move),60);
 }
});
`);
const start = new Chess().fen();
const board = new Chess(); board.move('e4'); const black = board.fen();
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const engine = new RushEngine({ enginePath: script, searchTimeoutMs: 250 });
  try {
  await Promise.all([engine.ready(), engine.ready()]);
  const updates: RushResult[] = [];
  const first = await engine.search(start, { moveTimeMs: 120, onUpdate: row => updates.push(row) });
  assert.equal(first.move, 'e2e4'); assert.equal(first.depth, 10); assert.equal(first.final, true);
  assert.equal(updates.length, 1, 'ignore shallow, bound and illegal PVs');
  assert.equal(updates[0].final, false); assert.deepEqual(updates[0].pv, ['e2e4', 'e7e5']);
  // Canceled output must drain before switching positions, never become a stale arrow.
  const stale: RushResult[] = [];
  const old = engine.search(start, { moveTimeMs: 120, onUpdate: row => stale.push(row) });
  const oldRejected = assert.rejects(old, { name: 'AbortError' });
  await pause(2);
  const updatesBeforeCancellation = stale.length;
  const newer = engine.search(black, { moveTimeMs: 120 });
  await oldRejected;
  assert.equal((await newer).move, 'e7e5'); assert.equal(stale.length, updatesBeforeCancellation);
  // Rapid replacement retains only the latest waiting position.
  const active = engine.search(start, { moveTimeMs: 120 });
  const activeRejected = assert.rejects(active, { name: 'AbortError' });
  await pause(2);
  const queued = engine.search(black, { moveTimeMs: 120 });
  const queuedRejected = assert.rejects(queued, { name: 'AbortError' });
  const latest = engine.search(start, { moveTimeMs: 120 });
  await Promise.all([activeRejected, queuedRejected]);
  assert.equal((await latest).move, 'e2e4');
  assert.equal(fs.readFileSync(log, 'utf8').split('\n').filter(l => l === 'START').length, 1, 'one warm process across searches and cancels');
  assert.equal(fs.readFileSync(log, 'utf8').includes('ucinewgame'), false, 'retain hash between positions');
  await assert.rejects(engine.search(start, { moveTimeMs: 34 }), /illegal move/);
  assert.equal((await engine.search(start, { moveTimeMs: 20 })).move, 'e2e4', 'protocol recovers after bad result');
  await assert.rejects(engine.search(start, { moveTimeMs: 33 }), /timed out/);
  assert.equal((await engine.search(black, { moveTimeMs: 20 })).move, 'e7e5', 'timeout restarts connection');
  assert.equal(fs.readFileSync(log, 'utf8').split('\n').filter(l => l === 'START').length, 2);
  await assert.rejects(engine.search('bad fen', { moveTimeMs: 120 }), /Invalid FEN/);
  await assert.rejects(engine.search(start, { moveTimeMs: 601 }), /Search time/);
  const mate = '7k/6Q1/5K2/8/8/8/8/8 b - - 0 1';
  assert.equal((await engine.search(mate, { moveTimeMs: 120 })).move, null);
  const cancelled = engine.search(start, { moveTimeMs: 120 });
  const disposed = assert.rejects(cancelled, { name: 'AbortError' });
  engine.dispose(); await disposed;
  await assert.rejects(engine.ready(), { name: 'AbortError' });
  await assert.rejects(engine.search(start, { moveTimeMs: 20 }), { name: 'AbortError' });

  // Native mode launches the engine itself, without a Node runtime argument.
  if (process.platform !== 'win32') {
    const executable = path.join(folder, 'fake-native');
    fs.writeFileSync(executable, `#!${process.execPath}\n${fs.readFileSync(script, 'utf8')}`, { mode: 0o755 });
    const native = new RushEngine({ enginePath: executable, native: true, executablePath: '/must-not-be-launched' });
    try {
      await native.ready();
      assert.equal((await native.search(start, { moveTimeMs: 120 })).move, 'e2e4');
    } finally { native.dispose(); }
  }

  // Real Stockfish regression: a prewarmed search returns a legal mate, then
  // serves another position without starting a fresh process.
  const real = new RushEngine({ enginePath: path.resolve(import.meta.dirname, '../../node_modules/stockfish/bin/stockfish-19-lite-single.js') });
  try {
    const coldAt = performance.now(); await real.ready(); const coldMs = performance.now() - coldAt;
    const fen = 'rnb1k1nr/pppp1ppq/4p3/b3N1pQ/4P2P/2PP4/PP3PP1/RN2KB1R w - - 0 1';
    let firstMs: number | null = null;
    const result = await real.search(fen, { moveTimeMs: 150, onUpdate: r => { firstMs ??= r.elapsedMs; } });
    assert.equal(result.move, 'h5f7');
    const position = new Chess(fen);
    for (const move of result.pv) position.move({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) });
    assert.equal(position.isCheckmate(), true);
    const second = await real.search(black, { moveTimeMs: 150 });
    assert.ok(second.move); new Chess(black).move({ from: second.move.slice(0, 2), to: second.move.slice(2, 4) });
    console.log(JSON.stringify({ realEngine: { coldMs: Math.round(coldMs), firstArrowMs: firstMs === null ? null : Math.round(firstMs), finalMs: Math.round(result.elapsedMs), depth: result.depth, move: result.move } }));
  } finally { real.dispose(); }
  console.log('Rush engine protocol, cancellation and real Stockfish checks passed.');
} finally { engine.dispose(); fs.rmSync(folder, { recursive: true, force: true }); } }
void main().catch(error => { console.error(error); process.exitCode = 1; });
