import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { readFileSync } from 'node:fs';
import { detectSacrifice, IncompleteAnalysisError } from '../core/detector';
import { NodeEngine } from '../core/nodeEngine';
import { inspectSacrifice, inspectSoundSacrifice } from '../../src/lib/brilliantMove';
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
// Website !! still checks alternatives; Tal only needs compensated material investment.
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

async function expectNoSignal(fen: string, engine: TracedEngine) {
  let result;
  try { result = await detectSacrifice(fen, engine, new AbortController().signal); }
  catch (error) { assert(error instanceof IncompleteAnalysisError); return; }
  assert.deepEqual(result, { brilliant: false }, 'A negative fixture must not produce a confirmed sacrifice');
}

async function run() {
  const start = Date.now();
  const engine = new TracedEngine();
  try {
    const candidate = inspectSacrifice(good, 'f6e4')!;
    assert(candidate, 'fixture is a structural nonchalant sacrifice');
    assert.deepEqual(await detectSacrifice(good, engine, new AbortController().signal), { brilliant: true });
    const positiveTraces = engine.traces.slice();
    assert.equal(positiveTraces[0].options.depth, 22, 'The unrestricted root is searched before candidate ranking');
    assert(!positiveTraces.some(t => t.options.multiPv), 'The best verified offer bypasses coarse ranking');
    assert(engine.traces.some(t => t.fen === candidate.fenAfterMove && !t.options.searchMoves), 'independent unrestricted strongest defense was searched');
    for (const acceptance of candidate.acceptances) assert(engine.traces.some(t => t.fen === acceptance.fenAfterAcceptance), 'every legal acceptance was checked');
    for (const depth of [22]) {
      assert(engine.traces.some(t => t.fen === good && t.options.depth === depth && t.result.depth >= depth));
      assert(engine.traces.some(t => t.fen === candidate.fenAfterMove && t.options.depth === depth && t.result.depth >= depth));
    }
    assert(engine.traces.every(t => t.result.depth >= 12 && (t.options.nodes ?? 0) >= 600_000));
    console.log('PASS real Stockfish 19 Lite: correct sacrifice, acceptance and strongest defense.');

    assert.deepEqual(await detectSacrifice(rotated(good), engine, new AbortController().signal), { brilliant: true }, 'Black side-to-move uses correct score POV');
    console.log('PASS real Stockfish 19 Lite: Black side-to-move and reversed colors.');
    const neutralStart = engine.traces.length;
    // Cold depth22 may exhaust the budget on another rejected candidate. Both
    // a negative verdict and an explicitly incomplete search must stay silent.
    try {
      assert.deepEqual(await detectSacrifice(nearBestOnly, engine, new AbortController().signal), { brilliant: false });
    } catch (error) { assert(error instanceof IncompleteAnalysisError, 'No positive verdict or unexpected error for the borderline offer'); }
    const neutralOffer = inspectSoundSacrifice(nearBestOnly, 'e5c4')!;
    assert(engine.traces.slice(neutralStart).some(t => t.fen === neutralOffer.acceptances[0].fenAfterAcceptance && t.options.depth === 22 && t.result.score?.kind === 'cp' && t.result.score.value < 0), 'Rejection comes from a deeper negative acceptance, not from ranking another move first');
    await expectNoSignal(refutedLater, engine);
    console.log('PASS Tal profile: neutral Nc4 acceptance falls below strict zero on22; deeper-refuted Nc4 also rejected.');

    // Bxh7 is a tempting but unsound offer in this ordinary position.
    assert(inspectSacrifice(bad, 'd3h7'), 'negative fixture must actually offer material');
    const unsound = await engine.analyze(bad, { nodes: 600_000, searchMoves: ['d3h7'] });
    assert(unsound.score && (unsound.score.kind === 'mate' ? unsound.score.value < 0 : unsound.score.value < -35), 'actual forced sacrifice search is losing');
    await expectNoSignal(bad, engine);
    console.log('PASS real Stockfish 19 Lite: incorrect sacrifice suppressed.');

    assert.equal(inspectSacrifice(trade, 'c4d5'), null);
    const exchange = await engine.analyze(trade, { nodes: 600_000, searchMoves: ['c4d5'] });
    assert(exchange.bestMove === 'c4d5' && exchange.depth >= 12, 'ordinary exchange was also searched by the actual engine');
    assert.deepEqual(await detectSacrifice(trade, engine, new AbortController().signal), { brilliant: false });
    assert.deepEqual(await detectSacrifice(ordinary, engine, new AbortController().signal), { brilliant: false });
    assert(inspectSacrifice(easyWinning, 'd1d5'), 'The easy winning position really contains a material offer');
    await expectNoSignal(easyWinning, engine);
    console.log('PASS ordinary exchange and ordinary best moves produce no signal.');

    const reportedBest = positiveTraces.find(t => t.fen === reported && t.options.depth === 22 && !t.options.searchMoves)!.result;
    assert.equal(reportedBest.bestMove, 'f6e4', 'Reported idea is the actual strongest move');
    assert(inspectSacrifice(reported, 'f6e4'), 'Reported idea is a structural sacrifice');
    const reportedOffer = inspectSoundSacrifice(reported, 'f6e4')!;
    assert(!positiveTraces.some(t => t.fen === reported && t.options.searchMoves && !t.options.searchMoves.includes('f6e4') && !t.options.multiPv), 'Tal does not need a best-alternative uniqueness search');
    for (const depth of [22]) {
      assert(positiveTraces.some(t => t.fen === reportedOffer.acceptances[0].fenAfterAcceptance && t.options.depth === depth), 'Every acceptance is checked at the required quality stage');
      assert(positiveTraces.some(t => t.fen === reportedOffer.fenAfterMove && t.options.depth === depth && !t.options.searchMoves), 'Strongest unrestricted defense remains mandatory');
    }
    const reportGame = parseReviewPgn('1.e4 e5 2.Nf3 Nf6 3.Nxe5 Nc6 4.Nxc6 dxc6 5.d3 Bc5 6.Bg5 Nxe4 *');
    const report = await analyzeReviewGame(reportGame, engine);
    assert(report.completed);
    assert.equal(report.results.at(-1)?.classification, 'brilliant', 'This reported offer also meets the independent website brilliant criterion');
    console.log('PASS reported ...Nxe4: same candidate, both acceptance/defense checks, independent website grade retained.');

    const konoxaGame = new Chess();
    konoxaGame.loadPgn(readFileSync(new URL('../../tests/fixtures/brilliant-konoxa-2026-11-01.pgn', import.meta.url), 'utf8'));
    const bishop = konoxaGame.history({ verbose: true })[47];
    assert.equal(bishop.san, 'Bxf2+');
    const bishopBegin = engine.traces.length;
    assert.deepEqual(await detectSacrifice(bishop.before, engine, new AbortController().signal), { brilliant: true });
    const bishopTraces = engine.traces.slice(bishopBegin);
    assert(bishopTraces.some(t => t.options.depth === 22 && t.fen === bishop.before && t.result.bestMove === 'b6f2'));
    assert(!bishopTraces.some(t => t.options.depth === 20), 'No duplicate depth20 pass');
    console.log('PASS reported24...Bxf2+: real depth22-only result.');
    const konoxa = konoxaGame.history({ verbose: true })[57];
    assert.equal(konoxa.san, 'Qg1+');
    const konoxaOffer = inspectSacrifice(konoxa.before, 'd4g1')!;
    assert(konoxaOffer && konoxaOffer.learner === 'b');
    for (const fen of [konoxa.before, rotated(konoxa.before)]) {
      const begin = engine.traces.length;
      assert.deepEqual(await detectSacrifice(fen, engine, new AbortController().signal), { brilliant: true }, 'HUD recognizes the voluntary mate-in-two sacrifice despite other mating continuations');
      const traces = engine.traces.slice(begin);
      for (const depth of [22]) {
        assert(traces.some(t => t.fen === fen && t.options.depth === depth && !t.options.searchMoves && t.result.depth >= depth), 'Each color still requires an actual depth22 root search');
      }
      const offer = fen === konoxa.before ? konoxaOffer : inspectSacrifice(fen, 'd5g8')!;
      assert(offer);
      for (const depth of [22]) assert(traces.some(t => t.fen === offer.fenAfterMove && t.options.depth === depth && !t.options.searchMoves), 'Independent strongest defense is retained at depth22');
    }
    console.log('PASS reported Konoxa29...Qg1+: Tal quality, HUD depth22, strongest defense and both colors.');
    const dg = new Chess();
    dg.loadPgn(readFileSync(new URL('../../tests/fixtures/konoxa-dg5167-2026-11-01.pgn', import.meta.url), 'utf8'));
    const dgHistory = dg.history({ verbose: true });
    for (const item of [
      { fen: dgHistory[20].before, move: 'g4h6', san: 'Nxh6' },
      { fen: dgHistory[22].before, move: 'c4f7', san: 'Bf7' },
    ]) {
      const begin = engine.traces.length;
      assert.deepEqual(await detectSacrifice(item.fen, engine, new AbortController().signal), { brilliant: true }, item.san);
      const traces = engine.traces.slice(begin), offer = inspectSoundSacrifice(item.fen, item.move)!;
      assert(offer);
      assert(traces.some(t => t.fen === item.fen && t.options.depth === 22 && t.result.bestMove === item.move));
      for (const acceptance of offer.acceptances) assert(traces.some(t => t.fen === acceptance.fenAfterAcceptance && t.options.depth === 22 && t.result.depth >= 22), 'Every sacrifice acceptance is actually searched');
      assert(traces.some(t => t.fen === offer.fenAfterMove && t.options.depth === 22 && !t.options.searchMoves), 'Unrestricted defense checked even for a quiet other-piece offer');
      assert(!traces.some(t => t.options.depth === 20), 'Depth22 remains the only quality pass');
    }
    console.log('PASS reported11.Nxh6 and12.Bf7: capture of the unmoved knight verified, strongest defense retained, depth22 only.');
    const qg = new Chess(); qg.move('d4'); qg.move('d5');
    const newOffers = [
      { fen: qg.fen(), move: 'c2c4', investment: 100, label: 'Queen’s Gambit pawn compensation' },
      { fen: '6bk/5QR1/6K1/8/8/8/8/8 w - - 0 1', move: 'g7h7', investment: 170, label: 'rook-for-bishop mating exchange' },
    ];
    for (const item of newOffers) {
      const offer = inspectSoundSacrifice(item.fen, item.move)!;
      assert(offer); assert.equal(offer.acceptances[0].investmentCp, item.investment);
      assert.equal(inspectSacrifice(item.fen, item.move), null, 'The website’s old material eligibility is unchanged');
      const begin = engine.traces.length;
      assert.deepEqual(await detectSacrifice(item.fen, engine, new AbortController().signal), { brilliant: true }, item.label);
      const traces = engine.traces.slice(begin);
      for (const depth of [22]) {
        assert(traces.some(t => t.fen === item.fen && t.options.depth === depth && !t.options.searchMoves), 'One depth22 quality stage is required');
        assert(traces.some(t => t.fen === offer.fenAfterMove && t.options.depth === depth && !t.options.searchMoves), 'Strongest defense after the actual selected offer is required');
        for (const acceptance of offer.acceptances) assert(traces.some(t => t.fen === acceptance.fenAfterAcceptance && t.options.depth === depth), 'The same pawn/exchange offer was accepted at depth22');
      }
    }
    console.log('PASS actual Tal HUD: pawn compensation and170cp exchange sacrifice at depth22; website eligibility unchanged.');


  } finally { engine.dispose(); }

  const canceled = new NodeEngine();
  const controller = new AbortController();
  const running = detectSacrifice(good, canceled, controller.signal);
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(running, { name: 'AbortError' });
  const recovery = new NodeEngine();
  try {
    assert.deepEqual(await detectSacrifice(good, recovery, new AbortController().signal), { brilliant: true });
  } finally { recovery.dispose(); }
  console.log('PASS real worker canceled on rapid position change; replacement worker recovers.');

  const deadline = new NodeEngine();
  try {
    await assert.rejects(detectSacrifice(good, deadline, new AbortController().signal, { timeoutMs: 1 }), IncompleteAnalysisError);
  } finally { deadline.dispose(); }
  const broken = new NodeEngine({ enginePath: '/nonexistent/nonchalant-stockfish.js', startupTimeoutMs: 1500 });
  try {
    await assert.rejects(detectSacrifice(good, broken, new AbortController().signal), IncompleteAnalysisError);
  } finally { broken.dispose(); }
  console.log('PASS engine crash/startup failure and deadline are incomplete, never checked/positive.');
  console.log(`Detector tests passed in ${((Date.now() - start) / 1000).toFixed(1)}s.`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
