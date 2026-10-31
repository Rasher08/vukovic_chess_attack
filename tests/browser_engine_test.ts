import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Chess } from 'chess.js';
import { BrowserChessEngine } from '../src/lib/browserEngine';

const initial='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const black='rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const mate='7k/6Q1/6K1/8/8/8/8/8 b - - 0 1';
class FakeWorker extends EventTarget {
  commands:string[]=[];terminated=false;fen=initial;thinking=false;silent=false;
  constructor(private mode:'normal'|'silent-start'|'silent-search'='normal'){super();}
  postMessage(command:string){
    this.commands.push(command);
    if(this.mode==='silent-start')return;
    if(command==='uci')queueMicrotask(()=>this.emit('id name Fake\nuciok'));
    if(command==='isready')queueMicrotask(()=>this.emit('readyok'));
    if(command.startsWith('position fen '))this.fen=command.slice(13);
    if(command.startsWith('go ')){
      assert.equal(this.thinking,false,'overlapping go commands');this.thinking=true;
      if(this.mode==='silent-search')return;
      setTimeout(()=>{
        this.thinking=false;
        if(this.fen===mate)this.emit('info depth 0 score mate 0\nbestmove (none)');
        else if(this.fen===black)this.emit('info depth 7 score mate -3 pv e7e5 g1f3\nbestmove e7e5');
        else this.emit('info depth 4 score cp 900 lowerbound pv d2d4\ninfo depth 9 score cp -123 pv e2e4 e7e5\nbestmove e2e4 ponder e7e5');
      },5);
    }
  }
  emit(data:string){this.dispatchEvent(new MessageEvent('message',{data}));}
  terminate(){this.terminated=true;}
}
class WatchdogWorker extends EventTarget {
  terminated = false;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  constructor(private mode: 'nodes' | 'depth' | 'repeated' | 'malformed' | 'heartbeat' | 'critical') { super(); }
  postMessage(command: string) {
    if (command === 'uci') queueMicrotask(() => this.emit('uciok'));
    if (command === 'isready') queueMicrotask(() => this.emit('readyok'));
    if (!command.startsWith('go ')) return;
    if (this.mode === 'critical') {
      this.timers.push(setTimeout(() => this.emit('info string CRITICAL ERROR: invalid position'), 5));
      return;
    }
    let tick = 0;
    this.interval = setInterval(() => {
      tick += 1;
      const line = this.mode === 'nodes' ? `info depth 5 nodes ${tick * 100} score cp -20 pv e2e4`
        : this.mode === 'depth' ? `info depth ${tick} score cp -20 pv e2e4`
        : this.mode === 'repeated' ? 'info depth 5 nodes 100 score cp -20 pv e2e4'
        : this.mode === 'heartbeat' ? `info string depth ${tick} nodes ${tick * 100}`
        : tick % 2 ? `info depth ${tick} nodes NaN score cp -20 pv e2e4` : `info depth ${tick} nodes ${tick * 100} score cp broken pv e2e4`;
      this.emit(line);
    }, 20);
    if (this.mode === 'nodes' || this.mode === 'depth') this.timers.push(setTimeout(() => {
      if (this.interval !== null) clearInterval(this.interval);
      this.interval = null;
      this.emit('info depth 12 nodes 1000 score cp -20 pv e2e4 e7e5\nbestmove e2e4');
    }, 210));
  }
  private emit(data: string) { if (!this.terminated) this.dispatchEvent(new MessageEvent('message', { data })); }
  terminate() {
    this.terminated = true;
    if (this.interval !== null) clearInterval(this.interval);
    this.timers.forEach(timer => clearTimeout(timer));
  }
}

class ScriptedWorker extends EventTarget {
  commands: string[] = [];
  terminated = false;
  constructor(private scripts: string[]) { super(); }
  postMessage(command: string) {
    this.commands.push(command);
    if (command === 'uci') queueMicrotask(() => this.emit('uciok'));
    if (command === 'isready') queueMicrotask(() => this.emit('readyok'));
    if (command.startsWith('go ')) {
      const script = this.scripts.shift();
      assert(script, 'No script available for this search');
      queueMicrotask(() => this.emit(script));
    }
  }
  emit(data: string) { this.dispatchEvent(new MessageEvent('message', { data })); }
  terminate() { this.terminated = true; }
}

async function multiPvTests() {
  const worker = new ScriptedWorker([
    [
      'info depth 8 multipv 1 score cp 30 pv e2e4 e7e5',
      'info depth 8 multipv 2 score cp 20 pv d2d4 d7d5',
      'info depth 8 multipv 3 score cp 10 pv g1f3 d7d5',
      'info depth 9 multipv 1 score cp 45 pv e2e4 e7e5',
      'info depth 9 multipv 2 score cp 40 pv d2d4 d7d5',
      'info depth 9 multipv 3 score cp 35 pv g1f3 d7d5',
      // Invalid updates must not splice a score, depth or suffix into a valid PV.
      'info depth 11 multipv 1 score cp 999 pv e2e4 e2e5',
      'info depth 12 multipv 1 score cp 999',
      'info depth 13 multipv 1 score cp 999 upperbound pv e2e4 e7e5',
      'info depth 14 multipv 1 score cp 999 score cp 888 pv e2e4 e7e5',
      'info depth 99 multipv 1 pv e2e4 e7e5',
      'info depth 9 multipv 4 score cp 999 pv b1c3 d7d5',
      'info depth 7 multipv 1 score cp 999 pv e2e4 e7e5',
      'info depth 8 multipv 3 score cp 999 pv g1f3 d7d5',
      'bestmove e2e4',
    ].join('\n'),
    'info depth 10 multipv 2 score cp 999 pv d2d4 d7d5\ninfo depth 10 multipv 1 score cp 10 pv e2e4 e7e5\nbestmove e2e4',
    'info depth 11 multipv 2 score cp 40 pv e2e4 e7e5\ninfo depth 11 multipv 3 score cp 35 pv g1f3 d7d5\ninfo depth 12 multipv 1 score cp 45 pv d2d4 d7d5\nbestmove d2d4',
    'info depth 6 multipv 1 score mate -4 pv e7e5 g1f3\ninfo depth 6 multipv 2 score cp -222 pv c7c5 g1f3\nbestmove e7e5',
    'info depth 6 multipv 1 score cp 10 pv e2e4 e7e5\nbestmove d2d4',
    'info depth 6 multipv 1 score cp 10 pv e2e4 e7e5\ninfo depth 6 multipv 2 score cp 9 pv e2e4 c7c5\ninfo depth 6 multipv 3 score cp 8 pv d2d4 d7d5\nbestmove e2e4',
    'info depth 6 multipv 1 score cp 99 pv d2d4 d7d5\nbestmove e2e4',
    'info depth 0 score mate 0\nbestmove (none)',
    // The next iteration is cut off after its first line by the node budget.
    'info depth 14 multipv 1 score cp 40 pv e2e4 e7e5\ninfo depth 14 multipv 2 score cp 30 pv d2d4 d7d5\ninfo depth 14 multipv 3 score cp 20 pv g1f3 d7d5\ninfo depth 15 multipv 1 score cp 41 pv e2e4 c7c5\nbestmove e2e4',
    // A complete older ranking must not contradict the final choice.
    'info depth 14 multipv 1 score cp 40 pv e2e4 e7e5\ninfo depth 14 multipv 2 score cp 30 pv d2d4 d7d5\ninfo depth 14 multipv 3 score cp 20 pv g1f3 d7d5\ninfo depth 15 multipv 1 score cp 41 pv d2d4 d7d5\nbestmove d2d4',
    // Only one root is allowed, despite MultiPV=3 (including duplicate input).
    'info depth 14 multipv 1 score cp 40 pv e2e4 e7e5\ninfo depth 15 multipv 2 score cp 99 pv e2e4 c7c5\nbestmove e2e4',
  ]);
  const engine = new BrowserChessEngine({ workerFactory: () => worker as unknown as Worker });
  try {
    for (const multiPv of [0, 4, 1.5, NaN]) await assert.rejects(engine.analyze(initial, { multiPv }), /MultiPV/);
    const options = { multiPv: 3 };
    const pending = engine.analyze(initial, options); options.multiPv = 1;
    const result = await pending;
    assert.deepEqual(result.lines?.map(line => [line.bestMove, line.score.value, line.depth]), [['e2e4', 45, 9], ['d2d4', 40, 9], ['g1f3', 35, 9]]);
    assert.deepEqual(result.pv, ['e2e4', 'e7e5']); assert.equal(result.depth, 9); assert.equal(result.score?.value, 45);
    const ordinary = await engine.analyze(initial);
    assert.deepEqual(ordinary, { bestMove: 'e2e4', score: { kind: 'cp', value: 10 }, pv: ['e2e4', 'e7e5'], depth: 10 });
    const setOptions = worker.commands.filter(command => command.startsWith('setoption name MultiPV '));
    assert.deepEqual(setOptions.slice(-2), ['setoption name MultiPV value 3', 'setoption name MultiPV value 1'], 'Every search resets the worker option');
    const partial = await engine.analyze(initial, { multiPv: 3 });
    assert.deepEqual(partial.lines?.map(line => [line.bestMove, line.depth]), [['d2d4', 12]], 'Do not attach stale secondary lines from an older depth');
    const blackResult = await engine.analyze(black, { multiPv: 3 });
    assert.deepEqual(blackResult.lines?.map(line => line.score), [{ kind: 'mate', value: -4 }, { kind: 'cp', value: -222 }], 'All MultiPV scores retain the root side POV');
    const mismatch = await engine.analyze(initial, { multiPv: 3 });
    assert.equal(mismatch.bestMove, 'd2d4'); assert.equal(mismatch.score, null); assert.deepEqual(mismatch.pv, []); assert.deepEqual(mismatch.lines, []);
    const duplicate = await engine.analyze(initial, { multiPv: 3 });
    assert.deepEqual(duplicate.lines?.map(line => line.bestMove), ['e2e4', 'd2d4'], 'Root moves must be distinct');
    const outside = await engine.analyze(initial, { multiPv: 3, searchMoves: ['e2e4'] });
    assert.equal(outside.score, null); assert.deepEqual(outside.lines, [], 'A PV outside searchmoves cannot be displayed');
    const terminal = await engine.analyze(mate, { multiPv: 3 });
    assert.equal(terminal.bestMove, null); assert.deepEqual(terminal.lines, []);
    const truncated = await engine.analyze(initial, { multiPv: 3 });
    assert.equal(truncated.lines?.length, 3, 'Keep the complete prior iteration when the next is truncated');
    assert.equal(truncated.depth, 14); assert.equal(truncated.score?.value, 40);
    assert.deepEqual(truncated.pv, ['e2e4', 'e7e5']);
    assert(truncated.lines?.every(line => line.depth === truncated.depth));
    const changed = await engine.analyze(initial, { multiPv: 3 });
    assert.equal(changed.lines?.length, 1, 'An older full ranking with another bestmove cannot replace the final choice');
    assert.equal(changed.bestMove, 'd2d4'); assert.equal(changed.depth, 15);
    const forced = await engine.analyze(initial, { multiPv: 3, searchMoves: ['e2e4', 'e2e4'] });
    assert.equal(forced.lines?.length, 1); assert.equal(forced.depth, 14, 'A single allowed root is a complete iteration');
  } finally { engine.dispose(); }
  console.log('PASS MultiPV: real options, serialized resets, atomic legal PV/score/depth, immutable requests, stale depths, bounds, rank filtering, unique roots, black POV, terminal and restricted searches');
}

async function watchdogTests() {
  for (const mode of ['nodes', 'depth'] as const) {
    const worker = new WatchdogWorker(mode);
    // Idle mode explicitly overrides the legacy absolute deadline. Healthy work
    // runs beyond both windows, and completes only after the engine's bestmove.
    const engine = new BrowserChessEngine({ workerFactory: () => worker as unknown as Worker, searchTimeoutMs: 30, searchIdleTimeoutMs: 80 });
    const started = Date.now();
    try {
      const result = await engine.analyze(initial, { nodes: 1000 });
      assert.equal(result.bestMove, 'e2e4'); assert.equal(result.depth, 12);
      assert.deepEqual(result.score, { kind: 'cp', value: -20 });
      assert(Date.now() - started >= 80, 'Healthy progress must outlive one inactivity window');
    } finally { engine.dispose(); }
    assert(worker.terminated);
  }
  for (const mode of ['repeated', 'malformed', 'heartbeat'] as const) {
    const worker = new WatchdogWorker(mode);
    const engine = new BrowserChessEngine({ workerFactory: () => worker as unknown as Worker, searchIdleTimeoutMs: 80 });
    await assert.rejects(engine.analyze(initial), /timed out/, `${mode} text must not keep a stuck worker alive`);
    assert(worker.terminated);
  }
  const legacyWorker = new WatchdogWorker('nodes');
  const legacy = new BrowserChessEngine({ workerFactory: () => legacyWorker as unknown as Worker, searchTimeoutMs: 60 });
  await assert.rejects(legacy.analyze(initial), /timed out/, 'Existing callers retain the legacy absolute deadline');
  assert(legacyWorker.terminated);
  const criticalWorker = new WatchdogWorker('critical');
  const critical = new BrowserChessEngine({ workerFactory: () => criticalWorker as unknown as Worker, searchIdleTimeoutMs: 5000 });
  const first = critical.analyze(initial); const queued = critical.analyze(initial);
  const criticalResults = await Promise.allSettled([first, queued]);
  assert(criticalResults.every(result => result.status === 'rejected' && /CRITICAL ERROR/.test(String(result.reason))));
  assert(criticalWorker.terminated);
  const cancelWorker = new WatchdogWorker('nodes');
  const cancel = new BrowserChessEngine({ workerFactory: () => cancelWorker as unknown as Worker, searchIdleTimeoutMs: 80 });
  const work = cancel.analyze(initial); const waiting = cancel.analyze(initial);
  const stopped = Promise.allSettled([work, waiting]);
  await new Promise(resolve => setTimeout(resolve, 35)); cancel.dispose();
  assert((await stopped).every(result => result.status === 'rejected' && result.reason instanceof Error && result.reason.name === 'AbortError'));
  assert(cancelWorker.terminated);
  const invalid = new BrowserChessEngine({ searchIdleTimeoutMs: 0 });
  await assert.rejects(invalid.analyze(initial), /positive integer/);
  invalid.dispose();
  console.log('PASS inactivity watchdog: real depth/node progress, stalled/malformed/heartbeat rejection, unchanged legacy deadlines, critical errors, cancellation and queued settlement');
}

async function fakeTests(){
  let created=0; const worker=new FakeWorker();
  const engine=new BrowserChessEngine({workerFactory:()=>{created++;return worker as unknown as Worker;}});
  assert.equal(created,0,'must be lazy');await Promise.all([engine.ready(),engine.ready()]);assert.equal(created,1);
  const [whiteResult,blackResult,terminal]=await Promise.all([engine.analyze(initial),engine.analyze(black,{moveTimeMs:15,searchMoves:['e7e5']}),engine.analyze(mate)]);
  assert.deepEqual(whiteResult,{bestMove:'e2e4',score:{kind:'cp',value:-123},pv:['e2e4','e7e5'],depth:9});
  assert.deepEqual(blackResult.score,{kind:'mate',value:-3},'must not flip black score');assert.equal(terminal.bestMove,null);
  assert(worker.commands.includes('go nodes 200000'));assert(worker.commands.includes('go movetime 15 searchmoves e7e5'));
  await assert.rejects(engine.analyze(initial,{searchMoves:['e2e5']}),/legal UCI/);
  await assert.rejects(engine.analyze(initial+'\ngo infinite'),/Invalid engine FEN/);
  await assert.rejects(engine.analyze(initial,{nodes:NaN}),/positive integers/);
  for(const depth of [0,129,1.5,NaN])await assert.rejects(engine.analyze(initial,{depth}),/depth/);
  await engine.analyze(initial,{nodes:1000000,depth:22});
  assert(worker.commands.includes('go nodes 1000000 depth 22'),'Forward bounded target depth to UCI');
  assert.equal((await engine.analyze(initial)).bestMove,'e2e4','invalid request must not poison queue');engine.dispose();assert(worker.terminated);
  await assert.rejects(engine.ready(),/disposed/);
  const stopped=new FakeWorker('silent-search');const active=new BrowserChessEngine({workerFactory:()=>stopped as unknown as Worker});await active.ready();
  const p=active.analyze(initial);const q=active.analyze(initial);const settled=Promise.allSettled([p,q]);
  await new Promise(r=>setTimeout(r,5));active.dispose();assert((await settled).every(r=>r.status==='rejected'));assert(stopped.terminated);
  const coldWorker=new FakeWorker('silent-start');const cold=new BrowserChessEngine({workerFactory:()=>coldWorker as unknown as Worker,startupTimeoutMs:5});
  await assert.rejects(cold.ready(),/timed out/);assert(coldWorker.terminated);
  const hangWorker=new FakeWorker('silent-search');const hang=new BrowserChessEngine({workerFactory:()=>hangWorker as unknown as Worker,searchTimeoutMs:5});
  await assert.rejects(hang.analyze(initial),/timed out/);assert(hangWorker.terminated);
  const failedWorker=new FakeWorker('silent-search');const failed=new BrowserChessEngine({workerFactory:()=>failedWorker as unknown as Worker});await failed.ready();
  const broken=failed.analyze(initial);await new Promise(r=>setTimeout(r,3));
  const error=new Event('error');Object.defineProperty(error,'message',{value:'wasm download failed'});failedWorker.dispatchEvent(error);
  await assert.rejects(broken,/wasm download failed/);assert(failedWorker.terminated);
  console.log('PASS fake Worker: lazy setup, concurrent ready, serial searches, options, score POV, terminal, malformed inputs, queue recovery, disposal, startup/search timeout, worker failure');
}
class RealWorkerBridge extends EventTarget {
  child=spawn(process.execPath,[new URL('../public/engine/stockfish-19-lite-single.js', import.meta.url).pathname],{stdio:['pipe','pipe','pipe']});
  constructor(){super();createInterface({input:this.child.stdout}).on('line',data=>this.dispatchEvent(new MessageEvent('message',{data})));this.child.stderr.on('data',b=>process.stderr.write(b));}
  postMessage(command:string){this.child.stdin.write(command+'\n');}
  terminate(){this.child.kill();}
}
async function actualWasm(){
  const bridge=new RealWorkerBridge();const engine=new BrowserChessEngine({workerFactory:()=>bridge as unknown as Worker,startupTimeoutMs:15000});
  try{await engine.ready();const results=await Promise.all([engine.analyze(initial,{nodes:20000}),engine.analyze(black,{nodes:20000,searchMoves:['e7e5']}),engine.analyze(mate,{nodes:1000})]);
  assert.match(results[0].bestMove!,/^[a-h][1-8][a-h][1-8][qrbn]?$/);assert.equal(results[1].bestMove,'e7e5');assert.equal(results[2].bestMove,null);assert(results[0].depth>0);assert(results[0].score);
  const multi = await engine.analyze(initial, { nodes: 100000, multiPv: 3 });
  assert.equal(multi.lines?.length, 3, 'Bundled WASM returns three genuine ranked lines');
  assert.equal(multi.lines[0].bestMove, multi.bestMove); assert.deepEqual(multi.lines[0].score, multi.score);
  assert.equal(new Set(multi.lines.map(line => line.bestMove)).size, 3);
  assert(multi.lines.every(line => line.depth === multi.depth && line.pv.length > 0));
  const reset = await engine.analyze(black, { nodes: 20000 }); assert.equal(reset.lines, undefined); assert(reset.score);
  const practicalBoard = new Chess('5b1k/5P1n/6p1/7p/1p3N2/1P4PP/P4K2/2Br4 w - - 0 40');
  practicalBoard.move('Bb2'); practicalBoard.move('Nf6');
  const practical = await engine.analyze(practicalBoard.fen(), { nodes: 1000000, multiPv: 3 });
  assert.equal(practical.lines?.length, 3, 'The practical endgame retains a full comparable three-line iteration');
  assert(practical.lines.every(line => line.depth === practical.depth));
  assert.equal(practical.lines[0].bestMove, practical.bestMove); assert.deepEqual(practical.lines[0].score, practical.score);
  console.log('PASS actual bundled WASM:',JSON.stringify({ ordinary: results, multi, reset, practical }));}finally{engine.dispose();}
}
(async()=>{await fakeTests();await multiPvTests();await watchdogTests();await actualWasm();})().catch(e=>{console.error(e);process.exitCode=1;});
