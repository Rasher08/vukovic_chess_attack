import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { analyzeReviewGame, parseReviewPgn, summarizeReview, verifiedReviewPrefix } from '../src/lib/gameReview';
import type { EngineLike, EngineResult } from '../src/lib/autoTraining';
import type { ReviewGame, ReviewMoveResult } from '../src/types/gameReview';

const cp = (value: number) => ({ kind: 'cp' as const, value });
const mate = (value: number) => ({ kind: 'mate' as const, value });
const pgn = '[Event "Core test"]\n[White "Белые"]\n[Black "Black"]\n\n1. e4 {comment} (1. d4 d5) e5 2. Nf3 Nc6 *';
const game = parseReviewPgn(pgn);
assert.deepEqual(game.moves.map(move => move.san), ['e4', 'e5', 'Nf3', 'Nc6']);
assert.equal(game.headers.White, 'Белые');
assert.equal(game.moves[0].ply, 1); assert.equal(game.moves[0].color, 'w');
assert.equal(game.moves[1].moveNumber, 1); assert.equal(game.moves[2].moveNumber, 2);
assert.equal(game.moves[0].fenAfter, game.moves[1].fenBefore);
assert.equal(parseReviewPgn('1.e4 e5 2.Nf3 Nc6 *').id, game.id, 'Comments/headers must not change the game identity');

const blackFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 12';
const blackGame = parseReviewPgn(`[SetUp "1"]\n[FEN "${blackFen}"]\n\n12...e5 13.Nf3 *`);
assert.equal(blackGame.initialFen, blackFen);
assert.deepEqual(blackGame.moves.map(move => [move.color, move.moveNumber]), [['b', 12], ['w', 13]]);

for (const invalid of ['', '[Event "No moves"]', '1.e4 e5 2.N', '1.e4 e5 {unfinished', '1.e4 e5 (1...c5',
  '1.e4 e5 *\n\n1.d4 d5 *', '[Event "A"]\n1.e4 *\n\n[Event "B"]\n1.d4 *',
  '[SetUp "1"]\n1.e4 *', '[Variant "Chess960"]\n1.e4 *']) {
  assert.throws(() => parseReviewPgn(invalid), undefined, `Must reject complete invalid input: ${invalid}`);
}
assert.throws(() => parseReviewPgn(`1.e4 {${'я'.repeat(51000)}} *`), /100 КБ/);
const longLine = Array.from({ length: 101 }, (_, index) => `${2 * index + 1}.Nf3 Nf6 ${2 * index + 2}.Ng1 Ng8`).join(' ') + ' *';
assert.throws(() => parseReviewPgn(longLine), /400 полуходов/);

function fakeEngine(review: ReviewGame, score: (fen: string, forced: boolean) => EngineResult['score'] = () => cp(100)) {
  const calls: { fen: string; forced?: string[] }[] = [];
  const actual = new Map(review.moves.map(move => [move.fenBefore, move.uci]));
  const engine: EngineLike = { async analyze(fen, options) {
    calls.push({ fen, forced: options?.searchMoves });
    const board = new Chess(fen);
    const legal = board.moves({ verbose: true }).map(move => `${move.from}${move.to}${move.promotion || ''}`);
    const bestMove = options?.searchMoves?.[0] || legal.find(move => move !== actual.get(fen)) || legal[0];
    return { bestMove, score: score(fen, Boolean(options?.searchMoves)), pv: bestMove ? [bestMove] : [], depth: 15 };
  } };
  return { calls, engine };
}

async function run() {
  const test = fakeEngine(game);
  const progress: number[] = [];
  const report = await analyzeReviewGame(game, test.engine, { onProgress: (_result, done) => progress.push(done) });
  assert.equal(report.completed, true);
  assert.deepEqual(progress, [1, 2, 3, 4]);
  assert.equal(report.results.length, 4);
  assert.equal(report.white.reviewedMoves, 2); assert.equal(report.black.totalMoves, 2);
  assert(report.white.accuracy! > 99 && report.black.accuracy! > 99);
  assert.equal(test.calls.length, 8, 'Each different played move must receive its own forced root search');
  for (let index = 0; index < test.calls.length; index += 2) {
    assert.equal(test.calls[index].fen, test.calls[index + 1].fen, 'Compare evaluations at the same root');
    assert.deepEqual(test.calls[index + 1].forced, [game.moves[index / 2].uci]);
  }

  const povGame = parseReviewPgn('1.e4 e5 *');
  const pov = await analyzeReviewGame(povGame, fakeEngine(povGame, (fen, forced) => fen.split(' ')[1] === 'w' ? cp(forced ? -300 : 100) : cp(forced ? -100 : 200)).engine);
  assert.equal(pov.results[0].beforeCpWhite, 100); assert.equal(pov.results[0].afterCpWhite, -300);
  assert.equal(pov.results[1].beforeCpWhite, -200); assert.equal(pov.results[1].afterCpWhite, 100);
  assert.equal(pov.results[1].lossCp, 300, 'Black move loss is positive in Black root POV');
  assert.equal(pov.results[0].classification, 'blunder'); assert.equal(pov.results[1].classification, 'blunder');
  assert.equal(pov.white.counts.blunder, 1); assert.equal(pov.black.counts.blunder, 1);

  const oneMove = parseReviewPgn('1.e4 *');
  for (const [loss, label] of [[0.4, 'excellent'], [3, 'good'], [6, 'inaccuracy'], [12, 'mistake'], [25, 'blunder']] as const) {
    const chosenWin = (50 - loss) / 100;
    const chosenCp = Math.log(chosenWin / (1 - chosenWin)) / 0.00368208;
    const graded = await analyzeReviewGame(oneMove, fakeEngine(oneMove, (_fen, forced) => cp(forced ? chosenCp : 0)).engine);
    assert.equal(graded.results[0].classification, label, `${loss} percentage-point loss`);
  }

  const forcedFen = '7k/7R/5K2/8/8/8/2B5/8 b - - 0 1';
  const forcedGame = parseReviewPgn(`[SetUp "1"]\n[FEN "${forcedFen}"]\n1...Kg8 *`);
  const forced = await analyzeReviewGame(forcedGame, fakeEngine(forcedGame).engine);
  assert.equal(forced.results[0].classification, 'forced');
  assert.equal(forced.black.accuracy, null, 'Only forced moves provide no independent quality measurement');
  assert.equal(forced.black.counts.forced, 1);
  assert.equal(verifiedReviewPrefix(forcedGame, forced.results).length, 1, 'A verified forced move remains resumable');

  const mateFen = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1';
  const mateGame = parseReviewPgn(`[SetUp "1"]\n[FEN "${mateFen}"]\n1.Qh7# 1-0`);
  const mating: EngineLike = { async analyze() { return { bestMove: 'f7g7', score: mate(1), pv: ['f7g7'], depth: 10 }; } };
  const matingResult = await analyzeReviewGame(mateGame, mating);
  assert.equal(matingResult.results[0].classification, 'excellent', 'A different actual checkmate is equally winning');
  assert.equal(matingResult.results[0].lossWinPercent, 0);
  assert.equal(matingResult.results[0].lossCp, null, 'Mate is not a made-up centipawn value');
  assert.equal(matingResult.results[0].afterCpWhite, null);
  assert.equal(verifiedReviewPrefix(mateGame, matingResult.results).length, 1, 'Valid mate scores and SAN can be retained');

  const drawGame = parseReviewPgn(`[SetUp "1"]\n[FEN "${mateFen}"]\n1.Qe6 1/2-1/2`);
  const drawResult = await analyzeReviewGame(drawGame, mating);
  assert.equal(drawResult.results[0].classification, 'miss', 'Giving stalemate in a forced win loses the winning chance');
  assert.equal(drawResult.results[0].baseClassification, 'blunder', 'A missed chance keeps the underlying severity');
  assert.equal(drawResult.results[0].playedScore?.kind, 'cp');
  assert.equal(drawResult.results[0].playedScore?.value, 0);
  assert.equal(verifiedReviewPrefix(drawGame, drawResult.results).length, 1, 'A verified terminal draw remains resumable');

  const missing: EngineLike = { async analyze() { return { bestMove: 'e2e4', score: null, pv: [], depth: 0 }; } };
  const failed = await analyzeReviewGame(game, missing);
  assert.equal(failed.completed, false); assert.equal(failed.results.length, 1);
  assert.equal(failed.results[0].classification, 'unverified');
  assert.equal(failed.white.accuracy, null); assert.equal(failed.black.accuracy, null);
  assert.equal(failed.results[0].afterCpWhite, null);
  const offline: EngineLike = { async analyze() { throw new Error('offline'); } };
  assert.equal((await analyzeReviewGame(game, offline)).completed, false);
  const prefixEngine = fakeEngine(game); let prefixCalls = 0;
  const interrupted: EngineLike = { async analyze(fen, options) {
    prefixCalls += 1;
    if (prefixCalls > 2) throw new Error('connection lost');
    return prefixEngine.engine.analyze(fen, options);
  } };
  const partial = await analyzeReviewGame(game, interrupted);
  assert.equal(partial.completed, false); assert.equal(partial.results.length, 2);
  assert.equal(partial.results[0].classification, 'excellent'); assert.equal(partial.results[1].classification, 'unverified');
  assert.equal(partial.white.reviewedMoves, 1); assert.equal(partial.black.reviewedMoves, 0);

  const thirdMove = fakeEngine(game);
  const failedAtThird: EngineLike = { async analyze(fen, options) {
    if (fen === game.moves[2].fenBefore) throw new Error('temporary worker failure');
    return thirdMove.engine.analyze(fen, options);
  } };
  const beforeRetry = await analyzeReviewGame(game, failedAtThird);
  assert.deepEqual(beforeRetry.results.map(result => result.classification), ['excellent', 'excellent', 'unverified']);
  const retrySnapshot = JSON.stringify(beforeRetry);
  const prefix = verifiedReviewPrefix(game, beforeRetry.results);
  assert.equal(prefix.length, 2);
  assert.notEqual(prefix[0], beforeRetry.results[0]);
  assert.notEqual(prefix[0].beforeScore, beforeRetry.results[0].beforeScore);
  assert.notEqual(prefix[0].playedScore, beforeRetry.results[0].playedScore);
  assert.notEqual(prefix[0].pvSan, beforeRetry.results[0].pvSan);
  prefix[0].pvSan.push('invalid external mutation');
  assert.equal(JSON.stringify(beforeRetry), retrySnapshot, 'Resuming must detach mutable scores/PV arrays');
  const frozenResume = Object.freeze(beforeRetry.results.map(result => Object.freeze({
    ...result, beforeScore: result.beforeScore && Object.freeze({ ...result.beforeScore }),
    playedScore: result.playedScore && Object.freeze({ ...result.playedScore }),
    pvSan: Object.freeze([...result.pvSan]),
  }))) as unknown as readonly ReviewMoveResult[];
  const resumedEngine = fakeEngine(game);
  const resumedProgress: number[] = [];
  const resumed = await analyzeReviewGame(game, resumedEngine.engine, {
    resumeResults: frozenResume,
    onProgress: (_result, done, total) => { resumedProgress.push(done); assert.equal(total, 4); },
  });
  assert.equal(resumed.completed, true);
  assert.deepEqual(resumedProgress, [3, 4], 'Only new rows notify; progress includes the retained prefix');
  assert.equal(resumedEngine.calls.length, 4, 'Verified moves must not consume new engine searches');
  assert(resumedEngine.calls.every(call => !game.moves.slice(0, 2).some(move => call.fen === move.fenBefore)));
  assert.deepEqual(resumed.results, report.results);
  assert.equal(JSON.stringify(beforeRetry), retrySnapshot, 'Resume input must remain unchanged');

  const noWork = await analyzeReviewGame(game, offline, { resumeResults: resumed.results });
  assert.equal(noWork.completed, true, 'A complete verified prefix needs no worker calls');
  assert.deepEqual(noWork.results, resumed.results);
  assert.notEqual(noWork.results, resumed.results);
  const otherGame = parseReviewPgn('1.d4 d5 *');
  assert.deepEqual(verifiedReviewPrefix(otherGame, resumed.results), [], 'A different game cannot borrow the prefix');
  const otherEngine = fakeEngine(otherGame);
  const otherProgress: number[] = [];
  const otherReview = await analyzeReviewGame(otherGame, otherEngine.engine, {
    resumeResults: resumed.results, onProgress: (_result, done) => otherProgress.push(done),
  });
  assert.equal(otherReview.completed, true); assert.deepEqual(otherProgress, [1, 2]);
  assert.equal(otherEngine.calls.length, 4);

  const invalidRows: Partial<ReviewMoveResult>[] = [
    { ply: 3 }, { color: 'w' }, { san: 'd5' }, { uci: 'd7d5' },
    { fenBefore: game.initialFen }, { fenAfter: game.initialFen },
    { classification: 'unverified' }, { beforeScore: null }, { playedScore: cp(NaN) },
    { depth: 0 }, { depth: NaN }, { accuracy: null }, { accuracy: 101 },
    { lossWinPercent: NaN }, { lossCp: -1 }, { beforeCpWhite: -999 },
    { bestSan: null }, { bestSan: 'Qh9' }, { pvSan: ['e5', 'Qh9'] },
  ];
  for (const invalid of invalidRows) {
    const rows = resumed.results.map(result => ({ ...result, pvSan: [...result.pvSan] }));
    rows[1] = { ...rows[1], ...invalid };
    assert.equal(verifiedReviewPrefix(game, rows).length, 1, `Invalid prefix row must stop reuse: ${JSON.stringify(invalid)}`);
  }
  const skipped = [resumed.results[0], resumed.results[2], resumed.results[3]];
  assert.equal(verifiedReviewPrefix(game, skipped).length, 1, 'Never reuse rows after a gap');

  const repetitionGame = parseReviewPgn('1.Nf3 Nf6 2.Ng1 Ng8 3.Nf3 Nf6 4.Ng1 Ng8 1/2-1/2');
  const repetition = await analyzeReviewGame(repetitionGame, fakeEngine(repetitionGame, () => cp(150)).engine);
  assert.equal(repetition.results[7].playedScore?.value, 0, 'Threefold repetition is scored as a draw');
  const repetitionEngine = fakeEngine(repetitionGame, () => cp(150));
  const resumedRepetition = await analyzeReviewGame(repetitionGame, repetitionEngine.engine, { resumeResults: repetition.results.slice(0, 7) });
  assert.equal(resumedRepetition.completed, true);
  assert.equal(resumedRepetition.results[7].playedScore?.value, 0, 'Resume must replay prior moves, not load only the last FEN');
  assert.equal(repetitionEngine.calls.length, 1, 'The resumed terminal draw needs only the final root search');
  assert.deepEqual(resumedRepetition.results, repetition.results);

  const earlyAbort = new AbortController(); earlyAbort.abort();
  await assert.rejects(analyzeReviewGame(game, offline, { signal: earlyAbort.signal }), { name: 'AbortError' });
  await assert.rejects(analyzeReviewGame(game, offline, { signal: earlyAbort.signal, resumeResults: resumed.results }), { name: 'AbortError' });
  const activeAbort = new AbortController(); let calls = 0;
  const abortEngine: EngineLike = { async analyze() { calls += 1; activeAbort.abort(); return { bestMove: 'e2e4', score: cp(0), pv: [], depth: 10 }; } };
  await assert.rejects(analyzeReviewGame(game, abortEngine, { signal: activeAbort.signal }), { name: 'AbortError' });
  assert.equal(calls, 1);
  await assert.rejects(analyzeReviewGame(game, offline, { nodes: NaN }), /бюджет/);

  const duplicate = summarizeReview(game, [...report.results, report.results[0]]);
  assert.equal(duplicate.white.reviewedMoves, 2, 'Duplicate result rows cannot inflate player summaries');
  console.log('Game review: complete PGN validation, black/custom roots, same-root grading, White POV chart, forced moves, mate alternatives, stalemate, resumable verified prefixes/draw history, failure, cancellation and summaries passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
