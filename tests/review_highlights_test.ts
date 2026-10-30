import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { analyzeReviewGame, parseReviewPgn, verifiedReviewPrefix } from '../src/lib/gameReview';
import { enhanceReviewMove, getVerifiedHighlightReason, hasVerifiedAdventure, highlightWinPercent, safeReviewClassification, sanitizeReviewHighlights } from '../src/lib/reviewHighlights';
import { inspectSacrifice } from '../src/lib/brilliantMove';
import type { EngineLike, EngineResult } from '../src/lib/autoTraining';
import type { ReviewBaseClassification, ReviewMoveResult } from '../src/types/gameReview';

const cp = (value: number) => ({ kind: 'cp' as const, value });
const mate = (value: number) => ({ kind: 'mate' as const, value });
const openingFen = '4k3/4p3/8/8/8/8/4P3/4K3 w - - 0 1';
const quietFen = '4k3/8/4p3/8/8/8/8/3QK3 w - - 0 1';
function row(fen: string, uci: string, classification: ReviewBaseClassification, before = cp(100), played = before, ply = 1): ReviewMoveResult {
  const game = new Chess(fen); const color = game.turn();
  const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  const loss = Math.max(0, highlightWinPercent(before) - highlightWinPercent(played));
  return { ply, moveNumber: Number(fen.split(' ')[5]), color, uci, san: move.san, fenBefore: fen, fenAfter: game.fen(), classification,
    bestSan: move.san, pvSan: [move.san], beforeScore: before, playedScore: played,
    beforeCpWhite: before.value * (color === 'w' ? 1 : -1), afterCpWhite: played.value * (color === 'w' ? 1 : -1),
    lossCp: Math.max(0, before.value - played.value), lossWinPercent: loss, accuracy: 98, depth: 18 };
}
const previous = row(openingFen, 'e2e4', 'blunder', cp(100), cp(-300));
const current = row(previous.fenAfter, 'e7e5', 'best', cp(200), cp(200), 2);
function fake(root: ReviewMoveResult, config: { best?: number; alternative?: number; accepted?: number; depth?: number; fail?: boolean; otherBest?: boolean } = {}) {
  const calls: { fen: string; nodes?: number; searchMoves?: string[] }[] = [];
  const engine: EngineLike = { async analyze(fen, options) {
    calls.push({ fen, ...options });
    if (config.fail) throw new Error('extra search offline');
    const legal = new Chess(fen).moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
    const bestMove = options?.searchMoves?.[0] || (fen === root.fenBefore && !config.otherBest ? root.uci : legal.find(m => m !== root.uci) || legal[0]);
    const alternative = fen === root.fenBefore && options?.searchMoves && !options.searchMoves.includes(root.uci);
    return { bestMove, score: cp(fen !== root.fenBefore ? config.accepted ?? 100 : alternative ? config.alternative ?? -200 : config.best ?? 100), depth: config.depth ?? 18, pv: [bestMove] };
  } };
  return { engine, calls };
}

async function run() {
  const test = fake(current, { best: 200, alternative: -100 });
  const great = await enhanceReviewMove(current, previous, test.engine, { nodes: 200_000 });
  assert.equal(great.classification, 'great'); assert.equal(great.baseClassification, 'best');
  assert.equal(safeReviewClassification(great), 'great'); assert.equal(test.calls.length, 2);
  assert(test.calls.every(call => call.fen === current.fenBefore && call.nodes! >= 600_000));
  assert(!test.calls[1].searchMoves!.includes(current.uci), 'Uniqueness compares the best alternative at the same root');
  assert.match(getVerifiedHighlightReason(great)!, /15 процентных пунктов/);
  assert.equal(sanitizeReviewHighlights(great, { ...previous, playedScore: cp(100) }, true).classification, 'best', 'A stored opponent-loss number must agree with the actual previous row');
  assert.equal(sanitizeReviewHighlights(great, undefined, true).classification, 'best');
  for (const patch of [{ previousPly: 0 }, { version: 99 }, { previousOpponentLoss: NaN }, { rootFen: openingFen }, { alternative: { uci: current.uci, score: cp(-300), depth: 18 } }]) {
    assert.equal(safeReviewClassification({ ...great, highlightEvidence: { ...great.highlightEvidence!, ...patch } } as ReviewMoveResult), 'best');
  }
  assert.equal(safeReviewClassification({ ...great, color: 'w' }), 'best', 'A positive highlight cannot move to the other player');
  assert.equal(safeReviewClassification({ ...great, fenAfter: openingFen }), 'best');
  const fail = fake(current, { fail: true });
  assert.equal((await enhanceReviewMove(current, previous, fail.engine, { nodes: 200_000 })).classification, 'best', 'Failure of optional evidence never un-verifies a completed numerical search');
  assert.equal((await enhanceReviewMove(current, previous, fake(current, { otherBest: true }).engine, { nodes: 200_000 })).classification, 'best');
  assert.equal((await enhanceReviewMove(current, previous, fake(current, { best: -100 }).engine, { nodes: 200_000 })).classification, 'best', 'A strengthened losing score cannot earn a positive highlight');
  const blocked = fake(current);
  for (const options of [{ isBook: true }, { previousIsBook: true }]) assert.equal((await enhanceReviewMove(current, previous, blocked.engine, { nodes: 200_000, ...options })).classification, 'best');
  assert.equal((await enhanceReviewMove(current, { ...previous, classification: 'forced' }, blocked.engine, { nodes: 200_000 })).classification, 'best');
  assert.equal(blocked.calls.length, 0, 'Book and forced previous moves never trigger extra searches');

  const missed = row(openingFen, 'e2e4', 'mistake', cp(200), cp(0));
  const miss = await enhanceReviewMove(missed, undefined, blocked.engine, { nodes: 50_000 });
  assert.equal(miss.classification, 'miss'); assert.equal(miss.baseClassification, 'mistake'); assert.equal(safeReviewClassification(miss), 'miss');
  assert.equal(blocked.calls.length, 0, 'A missed winning chance uses already-computed scores');
  assert.equal(safeReviewClassification({ ...miss, highlightEvidence: { ...miss.highlightEvidence!, baseClassification: 'blunder' }, baseClassification: 'blunder' }), 'mistake', 'Underlying severity cannot be invented in saved evidence');
  assert.equal((await enhanceReviewMove(row(openingFen, 'e2e4', 'blunder', cp(400), cp(100)), undefined, blocked.engine, { nodes: 200_000 })).classification, 'blunder', 'An error which retains an advantage is not this conservative missed-chance category');

  const quiet = { ...row(quietFen, 'd1d5', 'brilliant'), brilliantReason: 'Acceptance was verified by the separate brilliant detector.' };
  assert(inspectSacrifice(quietFen, quiet.uci));
  const quietTest = fake(quiet);
  const trilliant = await enhanceReviewMove(quiet, undefined, quietTest.engine, { nodes: 200_000 });
  assert.equal(trilliant.classification, 'trilliant'); assert.equal(safeReviewClassification(trilliant), 'trilliant');
  assert.equal(trilliant.baseClassification, 'brilliant'); assert(quietTest.calls.every(c => c.nodes! >= 1_200_000));
  assert.equal(quietTest.calls.length, 2 + inspectSacrifice(quietFen, quiet.uci)!.acceptances.length);
  assert.equal((await enhanceReviewMove(quiet, undefined, fake(quiet, { accepted: -250 }).engine, { nodes: 200_000 })).classification, 'brilliant', 'Failure of deeper acceptance suppresses !!! without inventing a new grade');
  assert.equal((await enhanceReviewMove(quiet, undefined, fake(quiet, { depth: 12 }).engine, { nodes: 200_000 })).classification, 'brilliant');
  assert.equal((await enhanceReviewMove({ ...quiet, classification: 'best' }, undefined, fake(quiet).engine, { nodes: 200_000 })).classification, 'best', 'A quiet material offer alone cannot bypass verified !!');
  assert.equal(safeReviewClassification({ ...trilliant, highlightEvidence: { ...trilliant.highlightEvidence!, acceptances: [] } }), 'best', 'Broken !!! evidence must never fall back to a fake !!');
  assert.equal(safeReviewClassification({ ...trilliant, beforeScore: null }), 'unverified');

  const speculative = row(quietFen, 'd1d5', 'blunder', cp(200), cp(-150));
  const replies = new Chess(speculative.fenAfter).moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
  let adventureCalls = 0;
  const defensive: EngineLike = { async analyze(fen, options) {
    adventureCalls++; assert.equal(fen, speculative.fenAfter);
    const bestMove = options?.searchMoves?.[0] || replies.find(uci => uci === 'e6d5')!;
    return { bestMove, score: cp(options?.searchMoves ? -100 : 250), pv: [bestMove], depth: 18 };
  } };
  const adventure = await enhanceReviewMove(speculative, undefined, defensive, { nodes: 200_000 });
  assert.equal(adventure.classification, 'miss'); assert.equal(adventure.baseClassification, 'blunder');
  assert(hasVerifiedAdventure(adventure)); assert.equal(adventureCalls, 2);
  assert.equal(hasVerifiedAdventure({ ...adventure, classification: 'unverified' }), false);
  assert.equal(hasVerifiedAdventure({ ...adventure, classification: 'forced' }), false);
  assert.equal(hasVerifiedAdventure({ ...adventure, classification: 'best' }), false, 'An adventurous warning cannot decorate a conflicting positive primary grade');
  assert.equal(hasVerifiedAdventure({ ...adventure, classification: 'brilliant' }), false);
  assert.equal(hasVerifiedAdventure({ ...adventure, color: 'b' }), false);
  assert.equal(hasVerifiedAdventure({ ...adventure, fenAfter: current.fenAfter, adventurous: { ...adventure.adventurous!, rootFen: current.fenAfter } }), false);
  assert.equal(hasVerifiedAdventure({ ...adventure, adventurous: { ...adventure.adventurous!, replyGapWinPercent: 99 } }), false, 'The claimed gap must equal score-derived percentage points');
  assert.equal(hasVerifiedAdventure({ ...adventure, adventurous: { ...adventure.adventurous!, replyScore: mate(-1) } }), false, 'Scores after the offer belong to the defending side, including mate signs');

  const detached = sanitizeReviewHighlights(trilliant); detached.highlightEvidence!.acceptances![0].score.value = -999;
  assert.equal(safeReviewClassification(trilliant), 'trilliant', 'Resumed and restored evidence must be detached');
  const abort = new AbortController(); abort.abort();
  await assert.rejects(enhanceReviewMove(current, previous, blocked.engine, { nodes: 200_000, signal: abort.signal }), { name: 'AbortError' });
  const during = new AbortController(); const interrupted: EngineLike = { async analyze() { during.abort(); throw new Error('cancelled worker'); } };
  await assert.rejects(enhanceReviewMove(current, previous, interrupted, { nodes: 200_000, signal: during.signal }), { name: 'AbortError' });

  const game = parseReviewPgn(`[SetUp "1"]\n[FEN "${openingFen}"]\n1.e4 e5 *`);
  let integrationCalls = 0;
  const integration: EngineLike = { async analyze(fen, options): Promise<EngineResult> {
    integrationCalls++;
    const legal = new Chess(fen).moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
    const own = game.moves.find(m => m.fenBefore === fen)!;
    const bestMove = options?.searchMoves?.[0] || (own.color === 'w' ? legal.find(m => m !== own.uci)! : own.uci);
    const score = own.color === 'w' ? cp(options?.searchMoves ? -300 : 100) : cp(options?.searchMoves ? -100 : 200);
    return { bestMove, score, pv: [bestMove], depth: 18 };
  } };
  const report = await analyzeReviewGame(game, integration);
  assert.deepEqual(report.results.map(r => r.classification), ['blunder', 'great']);
  assert.equal(report.black.counts.great, 1); assert.equal(integrationCalls, 5);
  assert.equal(verifiedReviewPrefix(game, report.results).length, 2);
  const resumed = await analyzeReviewGame(game, blocked.engine, { resumeResults: report.results });
  assert.deepEqual(resumed.results, report.results); assert.equal(blocked.calls.length, 0);
  console.log('Review highlights: contextual unique responses, missed winning edges, conservative quiet sacrifices, defensive-only secondary tags, exact roots/Black POV, optional-search failures, corruption guards, detached evidence, cancellation and resumable integration passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
