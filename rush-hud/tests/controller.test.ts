import assert from 'node:assert/strict';
import { RushController, type SearchEngine } from '../core/controller';
import type { RushResult } from '../core/engine';
const white = 'rnb1k1nr/pppp1ppq/4p3/b3N1pQ/4P2P/2PP4/PP3PP1/RN2KB1R w - - 0 1';
const black = '1r4k1/r4pp1/7p/2R1p3/4b3/P3P3/2N2PPP/1R4K1 b - - 0 1';
const result = (move: string): RushResult => ({ move, depth: 15, elapsedMs: 100, final: true, pv: [move] });
class Fake implements SearchEngine {
  jobs: { fen: string; time: number; resolve: (result: RushResult) => void; update?: (result: RushResult) => void }[] = [];
  cancelled = 0; disposed = false; starts = 0;
  async ready() { this.starts++; }
  search(fen: string, options: { moveTimeMs: number; onUpdate?: (result: RushResult) => void }) {
    return new Promise<RushResult>(resolve => { this.jobs.push({ fen, time: options.moveTimeMs, resolve, update: options.onUpdate }); });
  }
  cancel() { this.cancelled++; }
  dispose() { this.disposed = true; }
}
async function main() {
  const engine = new Fake(); let updates = 0;
  const controller = new RushController(engine, () => { updates++; });
  await controller.warm(); assert.equal(controller.state.status, 'waiting'); assert.equal(engine.starts, 1);
  const first = controller.analyze(white); const firstError = first.catch(error => error);
  assert.equal(controller.analyze(white), first, 'same-position heartbeat shares pending search');
  const second = controller.analyze(black);
  engine.jobs[0].update?.({ ...result('h5f7'), final: false });
  assert.equal(controller.state.result, null, 'late streamed result cannot attach to new board');
  engine.jobs[0].resolve(result('h5f7'));
  assert.equal((await firstError).name, 'AbortError');
  engine.jobs[1].resolve(result('b8b1')); await second;
  const currentMove = () => controller.state.result?.move;
  assert.equal(currentMove(), 'b8b1');
  await controller.analyze(black); assert.equal(engine.jobs.length, 2); assert.equal(controller.state.cached, true);
  const cachedAfterOther = controller.analyze(white); engine.jobs.at(-1)!.resolve(result('h5f7')); await cachedAfterOther;
  await controller.analyze(black); assert.equal(currentMove(), 'b8b1');
  controller.configure({ budget: 100 }); assert.equal(controller.state.result, null);
  const rerun = controller.analyze(black); assert.equal(engine.jobs.at(-1)?.time, 100); engine.jobs.at(-1)!.resolve(result('b8b1')); await rerun;
  controller.configure({ paused: true }); await assert.rejects(controller.analyze(white), /паузе/);
  assert.equal(controller.state.status, 'paused');
  controller.configure({ paused: false });
  const late = controller.analyze(white); const lateError = late.catch(error => error); controller.invalidate();
  engine.jobs.at(-1)!.resolve(result('h5f7')); assert.equal((await lateError).name, 'AbortError'); assert.equal(controller.state.result, null);
  await assert.rejects(controller.analyze('bad FEN')); assert.equal(controller.state.fen, null);
  const bad = controller.analyze(black); const badError = bad.catch(error => error); engine.jobs.at(-1)!.resolve(result('a1a8'));
  assert(await badError instanceof Error); assert.equal(controller.state.status, 'error'); assert.equal(controller.state.result, null);
  controller.dispose(); assert(engine.disposed); assert(updates > 10);
  console.log('Rush controller PASS: warm reuse, pending deduplication, stale stream/final fencing, exact FEN cache, budget invalidation, pause, withdrawal, illegal move guard.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
