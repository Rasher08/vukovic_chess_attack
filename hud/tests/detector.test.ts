import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { detectBrilliant, IncompleteAnalysisError } from '../core/detector';
import { NodeEngine } from '../core/nodeEngine';
import { inspectSacrifice } from '../../src/lib/brilliantMove';
import { analyzeReviewGame, parseReviewPgn } from '../../src/lib/gameReview';
import type { BrowserEngineAnalysis, BrowserEngineSearchOptions } from '../../src/lib/browserEngine';

const good = 'r1bqk2r/ppp2ppp/2p2n2/2b3B1/4P3/3P4/PPP2PPP/RN1QKB1R b KQkq - 2 6';
const nearBestOnly = '2kr3r/ppp2ppp/8/2b1n3/5B2/8/PPP1BPPP/R3K2R b - - 3 13';
const refutedLater = '2kr4/ppp2ppp/8/2b1n3/5B2/8/PPP1BPPP/2K4R b - - 2 16';
const bad = 'rnbq1rk1/ppp1bppp/3ppn2/8/3P4/3BPN2/PPP2PPP/RNBQ1RK1 w - - 0 7';
const trade = '4k3/8/2p5/3n4/2B5/8/8/4K3 w - - 0 1';
const ordinary = new Chess().fen();
const easyWinning = '4k3/8/4p3/8/8/8/8/3QK3 w - - 0 1';
// User-reported position: ...Nxe4 is best, but another move also wins clearly.
// Both the website and HUD must use the same strengthened alternative check.
const reported = 'r1bqk2r/ppp2ppp/2p2n2/2b3B1/4P3/3P4/PPP2PPP/RN1QKB1R b KQkq - 2 6';

function rotated(fen: string) {
  const fields = fen.split(' ');
  // Rank reflection + color swap preserves pawn movement and castling files.
  const flip = (value: string) => value.split('').map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('');
  const placement = fields[0].split('/').reverse().map(flip).join('/');
  const rights = 'KQkq'.split('').filter(c => flip(fields[2]).includes(c)).join('') || '-';
  return `${placement} ${fields[1] === 'w' ? 'b' : 'w'} ${rights} - 0 15`;
}

class TracedEngine extends NodeEngine {
  traces: { fen: string; options: BrowserEngineSearchOptions; result: BrowserEngineAnalysis }[] = [];
  override async analyze(fen: string, options: BrowserEngineSearchOptions = {}) {
    const result = await super.analyze(fen, options);
    this.traces.push({ fen, options, result });
    return result;
  }
}

async function run() {
  const start = Date.now();
  const engine = new TracedEngine();
  try {
    const candidate = inspectSacrifice(good, 'f6e4')!;
    assert(candidate, 'fixture is a structural nonchalant sacrifice');
    assert.deepEqual(await detectBrilliant(good, engine, new AbortController().signal), { brilliant: true });
    const positiveTraces = engine.traces.slice();
    assert(engine.traces.some(t => t.options.multiPv && t.options.searchMoves?.includes('f6e4')), 'restricted MultiPV is only the candidate generator');
    assert(engine.traces.some(t => t.fen === candidate.fenAfterMove && !t.options.searchMoves), 'independent unrestricted strongest defense was searched');
    for (const acceptance of candidate.acceptances) assert(engine.traces.some(t => t.fen === acceptance.fenAfterAcceptance), 'every legal acceptance was checked');
    for (const depth of [20, 22]) {
      assert(engine.traces.some(t => t.fen === good && t.options.depth === depth && t.result.depth >= depth));
      assert(engine.traces.some(t => t.fen === candidate.fenAfterMove && t.options.depth === depth && t.result.depth >= depth));
    }
    assert(engine.traces.every(t => t.result.depth >= 12 && (t.options.nodes ?? 0) >= 600_000));
    console.log('PASS real Stockfish 19 Lite: correct sacrifice, acceptance and strongest defense.');

    assert.deepEqual(await detectBrilliant(rotated(good), engine, new AbortController().signal), { brilliant: true }, 'Black side-to-move uses correct score POV');
    console.log('PASS real Stockfish 19 Lite: Black side-to-move and reversed colors.');
    assert.deepEqual(await detectBrilliant(nearBestOnly, engine, new AbortController().signal), { brilliant: false }, 'A sound but non-best equal tactic does not signal');
    assert.deepEqual(await detectBrilliant(refutedLater, engine, new AbortController().signal), { brilliant: false }, 'The second reported Nc4 signal is rejected by deeper verification');
    console.log('PASS reported game: both Nc4 signals suppressed; mere near-best equality is insufficient.');

    // Bxh7 is a tempting but unsound offer in this ordinary position.
    assert(inspectSacrifice(bad, 'd3h7'), 'negative fixture must actually offer material');
    const unsound = await engine.analyze(bad, { nodes: 600_000, searchMoves: ['d3h7'] });
    assert(unsound.score && (unsound.score.kind === 'mate' ? unsound.score.value < 0 : unsound.score.value < -35), 'actual forced sacrifice search is losing');
    assert.deepEqual(await detectBrilliant(bad, engine, new AbortController().signal), { brilliant: false });
    console.log('PASS real Stockfish 19 Lite: incorrect sacrifice suppressed.');

    assert.equal(inspectSacrifice(trade, 'c4d5'), null);
    const exchange = await engine.analyze(trade, { nodes: 600_000, searchMoves: ['c4d5'] });
    assert(exchange.bestMove === 'c4d5' && exchange.depth >= 12, 'ordinary exchange was also searched by the actual engine');
    assert.deepEqual(await detectBrilliant(trade, engine, new AbortController().signal), { brilliant: false });
    assert.deepEqual(await detectBrilliant(ordinary, engine, new AbortController().signal), { brilliant: false });
    assert(inspectSacrifice(easyWinning, 'd1d5'), 'The easy winning position really contains a material offer');
    assert.deepEqual(await detectBrilliant(easyWinning, engine, new AbortController().signal), { brilliant: false }, 'Offering material in an ordinary won position does not earn a notification');
    console.log('PASS ordinary exchange and ordinary best moves produce no signal.');

    const reportedBest = positiveTraces.find(t => t.fen === reported && t.options.depth === 22 && !t.options.searchMoves)!.result;
    assert.equal(reportedBest.bestMove, 'f6e4', 'Reported idea is the actual strongest move');
    assert(inspectSacrifice(reported, 'f6e4'), 'Reported idea is a structural sacrifice');
    const alternative = positiveTraces.find(t => t.fen === reported && t.options.depth === 22 && t.options.searchMoves && !t.options.searchMoves.includes('f6e4'))!.result;
    assert(alternative.score?.kind === 'cp' && alternative.score.value >= 300, 'A different move still keeps a clear win');
    const strengthened = positiveTraces;
    assert(strengthened.some(t => t.fen === reported && (t.options.nodes ?? 0) >= 1_200_000 && t.options.searchMoves && !t.options.searchMoves.includes('f6e4')), 'Recheck the best alternative at doubled budget');
    const reportedOffer = inspectSacrifice(reported, 'f6e4')!;
    assert(strengthened.some(t => t.fen === reportedOffer.acceptances[0].fenAfterAcceptance && (t.options.nodes ?? 0) >= 1_200_000), 'Acceptance is also searched at the strengthened budget');
    assert(strengthened.some(t => t.fen === reportedOffer.fenAfterMove && !t.options.searchMoves), 'Strongest unrestricted defense remains mandatory');
    const reportGame = parseReviewPgn('1.e4 e5 2.Nf3 Nf6 3.Nxe5 Nc6 4.Nxc6 dxc6 5.d3 Bc5 6.Bg5 Nxe4 *');
    const report = await analyzeReviewGame(reportGame, engine);
    assert(report.completed);
    assert.equal(report.results.at(-1)?.classification, 'brilliant', 'Website review and pre-move HUD agree on the reported game');
    console.log('PASS reported ...Nxe4: doubled root/alternative/acceptance verification, strongest defense, website and HUD agreement.');
  } finally { engine.dispose(); }

  const canceled = new NodeEngine();
  const controller = new AbortController();
  const running = detectBrilliant(good, canceled, controller.signal);
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(running, { name: 'AbortError' });
  const recovery = new NodeEngine();
  try {
    assert.deepEqual(await detectBrilliant(good, recovery, new AbortController().signal), { brilliant: true });
  } finally { recovery.dispose(); }
  console.log('PASS real worker canceled on rapid position change; replacement worker recovers.');

  const deadline = new NodeEngine();
  try {
    await assert.rejects(detectBrilliant(good, deadline, new AbortController().signal, { timeoutMs: 1 }), IncompleteAnalysisError);
  } finally { deadline.dispose(); }
  const broken = new NodeEngine({ enginePath: '/nonexistent/nonchalant-stockfish.js', startupTimeoutMs: 1500 });
  try {
    await assert.rejects(detectBrilliant(good, broken, new AbortController().signal), IncompleteAnalysisError);
  } finally { broken.dispose(); }
  console.log('PASS engine crash/startup failure and deadline are incomplete, never checked/positive.');
  console.log(`Detector tests passed in ${((Date.now() - start) / 1000).toFixed(1)}s.`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
