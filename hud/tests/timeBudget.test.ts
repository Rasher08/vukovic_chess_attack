import assert from 'node:assert/strict';
import { mock } from 'node:test';
import type { BrowserChessEngine, BrowserEngineAnalysis, BrowserEngineSearchOptions } from '../../src/lib/browserEngine';
import { HudController } from '../core/controller';
import { detectSacrifice } from '../core/detector';

const fen = 'r4rk1/1b2bppp/ppq1p3/2ppB2n/5P2/1P1BP3/P1PPQ1PP/R4RK1 w - - 0 15';
const answer = (depth: number): BrowserEngineAnalysis => ({ bestMove: 'd3h7', score: { kind: 'cp', value: 100 }, depth, pv: ['d3h7'] });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

async function run() {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    let finish!: (value: BrowserEngineAnalysis) => void;
    let stop!: (error: Error) => void;
    let request: BrowserEngineSearchOptions | undefined;
    const engine = {
      analyze(_fen: string, options: BrowserEngineSearchOptions) {
        request = options;
        return new Promise<BrowserEngineAnalysis>((resolve, reject) => { finish = resolve; stop = reject; });
      },
      dispose() { stop?.(Object.assign(Error('Canceled'), { name: 'AbortError' })); },
    } as unknown as BrowserChessEngine;
    let notices = 0;
    const controller = new HudController(() => engine, (root, worker, signal) => detectSacrifice(root, worker, signal, { mode: 'fast' }), (_state, notify) => { if (notify) notices++; });
    controller.accept(fen);
    assert.equal(request?.moveTimeMs, 15_000);
    assert.equal(request?.depth, 15);
    assert.equal(request?.nodes, undefined);
    mock.timers.tick(5_001); await flush();
    assert.equal(controller.state.status, 'checking', 'Five seconds must not end unfinished analysis');
    mock.timers.tick(5_000); await flush();
    assert.equal(controller.state.status, 'checking', 'The same position can still be calculated after ten seconds');
    assert.equal(notices, 0);
    finish(answer(15)); await flush();
    assert.equal(controller.state.status, 'checked');
    assert.equal(notices, 1, 'A completed depth15 result may signal after ten seconds');
    controller.dispose();

    const shallow = new HudController(() => engine, (root, worker, signal) => detectSacrifice(root, worker, signal, { mode: 'fast' }), () => {});
    shallow.accept(fen); mock.timers.tick(15_000); finish(answer(14)); await flush();
    assert.equal(shallow.state.status, 'error', 'Time spent alone never validates insufficient depth');
    assert.equal(shallow.state.idea, false); shallow.dispose();

    const canceled = new HudController(() => engine, (root, worker, signal) => detectSacrifice(root, worker, signal, { mode: 'fast' }), () => {});
    canceled.accept(fen); mock.timers.tick(5_001); canceled.accept(null); finish(answer(15)); await flush();
    assert.equal(canceled.state.status, 'unknown');
    assert.equal(canceled.state.idea, false, 'A changed position immediately cancels the longer search');
    canceled.dispose();
    console.log('Time budget PASS: still checking after5s/10s, depth15 result accepted after10s, depth14 after15s rejected, changed position canceled immediately.');
  } finally { mock.timers.reset(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
