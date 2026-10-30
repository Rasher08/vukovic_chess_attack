import assert from 'node:assert/strict';
import { analyzeReviewGame, parseReviewPgn } from '../src/lib/gameReview';
import { runReviewWithRecovery, type DisposableReviewEngine, type ReviewRecoveryState } from '../src/lib/reviewRecovery';
import type { ReviewGame, ReviewMoveResult } from '../src/types/gameReview';
import type { EngineResult } from '../src/lib/autoTraining';

const game = parseReviewPgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 *');
const moves = new Map(game.moves.map(move => [move.fenBefore, move]));
const success = (fen: string): EngineResult => {
  const move = moves.get(fen);
  assert(move, 'Each resumed query must use an actual root from the same game');
  return { bestMove: move.uci, score: { kind: 'cp', value: 10 }, pv: [move.uci], depth: 15 };
};

function fakeEngine(behavior?: (fen: string, call: number) => EngineResult | Promise<EngineResult>) {
  const queries: { fen: string; nodes: number | undefined }[] = [];
  let disposals = 0;
  const engine: DisposableReviewEngine = {
    async analyze(fen, options) { queries.push({ fen, nodes: options?.nodes }); return behavior ? behavior(fen, queries.length) : success(fen); },
    dispose() { disposals += 1; },
  };
  return { engine, queries, get disposals() { return disposals; } };
}

async function run() {
  const failed = fakeEngine(fen => { if (moves.get(fen)?.ply === 3) throw new Error('worker temporarily failed'); return success(fen); });
  const restored = fakeEngine();
  const done: number[] = []; const recoveries: ReviewRecoveryState[] = [];
  const report = await runReviewWithRecovery(game, {
    nodes: 197777, retryDelayMs: 0,
    createEngine: attempt => attempt === 1 ? failed.engine : restored.engine,
    onProgress: (rows, count, total) => { assert.equal(rows.length, count); assert.equal(total, 6); assert(rows.every(row => row.classification !== 'unverified')); done.push(count); },
    onRecovery: state => { if (state) recoveries.push(state); },
  });
  assert.equal(report.completed, true);
  assert.deepEqual(done, [1, 2, 3, 4, 5, 6], 'Recovery must neither erase nor duplicate verified progress');
  assert.deepEqual(failed.queries.map(query => moves.get(query.fen)!.ply), [1, 2, 3]);
  assert.deepEqual(restored.queries.map(query => moves.get(query.fen)!.ply), [3, 4, 5, 6], 'The new worker starts at the failed ply');
  assert([...failed.queries, ...restored.queries].every(query => query.nodes === 197777), 'Recovery cannot lower the selected quality budget');
  assert.equal(failed.disposals, 1); assert.equal(restored.disposals, 1);
  assert.equal(recoveries[0].verified, 2); assert.equal(recoveries[0].attempt, 1);

  const invalidScore = fakeEngine(fen => ({ ...success(fen), score: null }));
  const illegalMove = fakeEngine(fen => ({ ...success(fen), bestMove: 'a1a8' }));
  const valid = fakeEngine(); const invalidProgress: number[] = []; const invalidRecovery: number[] = [];
  const repaired = await runReviewWithRecovery(game, {
    nodes: 50000, retryDelayMs: 0,
    createEngine: attempt => [invalidScore.engine, illegalMove.engine, valid.engine][attempt - 1],
    onProgress: (_rows, count) => invalidProgress.push(count),
    onRecovery: state => { if (state) invalidRecovery.push(state.verified); },
  });
  assert.equal(repaired.completed, true);
  assert.deepEqual(invalidRecovery, [0, 0], 'Missing scores and illegal responses are retried, never counted as verified');
  assert.deepEqual(invalidProgress, [1, 2, 3, 4, 5, 6]);
  assert.equal(invalidScore.disposals, 1); assert.equal(illegalMove.disposals, 1); assert.equal(valid.disposals, 1);

  let constructionAttempts = 0; const afterConstructionFailure = fakeEngine();
  await runReviewWithRecovery(game, { nodes: 1000, retryDelayMs: 0, createEngine: () => {
    constructionAttempts += 1;
    if (constructionAttempts === 1) throw new Error('Worker could not be created');
    return afterConstructionFailure.engine;
  } });
  assert.equal(constructionAttempts, 2); assert.equal(afterConstructionFailure.disposals, 1);

  const baseline = await analyzeReviewGame(game, fakeEngine().engine);
  const frozenPrefix = baseline.results.slice(0, 2).map(row => Object.freeze({ ...row,
    beforeScore: Object.freeze({ ...row.beforeScore! }), playedScore: Object.freeze({ ...row.playedScore! }), pvSan: Object.freeze([...row.pvSan]) as unknown as string[],
  }));
  Object.freeze(frozenPrefix);
  const prefixJson = JSON.stringify(frozenPrefix); const resumed = fakeEngine(); const resumedProgress: number[] = [];
  const resumedReport = await runReviewWithRecovery(game, { nodes: 6000, resumeResults: frozenPrefix, createEngine: () => resumed.engine,
    onProgress: (rows, count) => { resumedProgress.push(count); rows[0].san = 'observer edited'; rows[0].beforeScore!.value = 999; },
  });
  assert.equal(JSON.stringify(frozenPrefix), prefixJson, 'The caller-owned prefix must not change');
  assert.equal(resumedReport.results[0].san, 'e4', 'Observer snapshots cannot mutate the runner prefix');
  assert.equal(resumedReport.results[0].beforeScore!.value, 10);
  assert.deepEqual(resumedProgress, [2, 3, 4, 5, 6]);
  assert.deepEqual(resumed.queries.map(query => moves.get(query.fen)!.ply), [3, 4, 5, 6]);

  let fullFactoryCalls = 0;
  const full = await runReviewWithRecovery(game, { nodes: 5000, resumeResults: baseline.results, createEngine: () => { fullFactoryCalls += 1; return fakeEngine().engine; } });
  assert.equal(full.completed, true); assert.equal(fullFactoryCalls, 0, 'A complete verified prefix needs no worker');

  const waitingAbort = new AbortController(); let waitingFactories = 0; let waitingDisposed = 0;
  const waiting = runReviewWithRecovery(game, { nodes: 5000, retryDelayMs: 1000, signal: waitingAbort.signal,
    createEngine: () => { waitingFactories += 1; return { async analyze() { throw new Error('offline'); }, dispose() { waitingDisposed += 1; } }; },
    onRecovery: state => { if (state) setTimeout(() => waitingAbort.abort(), 5); },
  });
  await assert.rejects(waiting, { name: 'AbortError' });
  assert.equal(waitingFactories, 1); assert.equal(waitingDisposed, 1, 'Cancel during retry delay must not create another worker');

  const activeAbort = new AbortController(); let activeDispose = 0; let rejectSearch: ((error: Error) => void) | undefined;
  let searchStarted!: () => void; const started = new Promise<void>(resolve => { searchStarted = resolve; });
  const active = runReviewWithRecovery(game, { nodes: 5000, signal: activeAbort.signal,
    createEngine: () => ({ analyze() { searchStarted(); return new Promise<EngineResult>((_resolve, reject) => { rejectSearch = reject; }); }, dispose() { activeDispose += 1; rejectSearch?.(new Error('disposed active search')); } }),
  });
  await started; activeAbort.abort();
  await assert.rejects(active, { name: 'AbortError' });
  assert.equal(activeDispose, 1, 'Cancel must terminate the current worker exactly once');

  const earlyAbort = new AbortController(); earlyAbort.abort();
  await assert.rejects(runReviewWithRecovery(game, { nodes: 1, signal: earlyAbort.signal, createEngine: () => { throw new Error('must not construct'); } }), { name: 'AbortError' });

  let corruptFactories = 0;
  const corrupt: ReviewGame = { ...game, moves: game.moves.map((move, index) => index ? move : { ...move, fenAfter: game.initialFen }) };
  await assert.rejects(runReviewWithRecovery(corrupt, { nodes: 1, createEngine: () => { corruptFactories += 1; return fakeEngine().engine; } }), /повреждена/);
  assert.equal(corruptFactories, 0, 'Deterministic input corruption must not trigger endless retries');
  await assert.rejects(runReviewWithRecovery(game, { nodes: NaN }), /бюджет/);
  await assert.rejects(runReviewWithRecovery(game, { nodes: 1, retryDelayMs: -1 }), /интервал/);

  const repeatedAbort = new AbortController(); const delays: number[] = []; let repeatedFactories = 0; const start = Date.now();
  await assert.rejects(runReviewWithRecovery(game, { nodes: 1, retryDelayMs: 4, signal: repeatedAbort.signal,
    createEngine: () => { repeatedFactories += 1; return { async analyze() { throw new Error('offline'); }, dispose() {} }; },
    onRecovery: state => { if (state) { delays.push(state.retryInMs); assert.equal(state.verified, 0); if (state.attempt === 4) repeatedAbort.abort(); } },
  }), { name: 'AbortError' });
  assert.deepEqual(delays, [4, 8, 16, 32]); assert.equal(repeatedFactories, 4); assert(Date.now() - start >= 20, 'Repeated failures must wait rather than spin');
  const capAbort = new AbortController(); let capDelay = 0;
  await assert.rejects(runReviewWithRecovery(game, { nodes: 1, retryDelayMs: 20000, signal: capAbort.signal,
    createEngine: () => ({ async analyze() { throw new Error('offline'); }, dispose() {} }),
    onRecovery: state => { if (state) { capDelay = state.retryInMs; capAbort.abort(); } },
  }), { name: 'AbortError' });
  assert.equal(capDelay, 15000);

  console.log('Review recovery: fresh-worker retries, preserved prefix, unchanged quality, verified-only progress, corrupt/partial safeguards, immutable snapshots, abortable search/waits and capped backoff passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
