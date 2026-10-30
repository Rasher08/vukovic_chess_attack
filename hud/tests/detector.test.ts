import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { detectBrilliant, IncompleteAnalysisError } from '../core/detector';
import { NodeEngine } from '../core/nodeEngine';
import { inspectSacrifice } from '../../src/lib/brilliantMove';
import type { BrowserEngineAnalysis, BrowserEngineSearchOptions } from '../../src/lib/browserEngine';

const good = 'r4rk1/1b2bppp/ppq1p3/2ppB2n/5P2/1P1BP3/P1PPQ1PP/R4RK1 w - - 0 15';
const bad = 'rnbq1rk1/ppp1bppp/3ppn2/8/3P4/3BPN2/PPP2PPP/RNBQ1RK1 w - - 0 7';
const trade = '4k3/8/2p5/3n4/2B5/8/8/4K3 w - - 0 1';
const ordinary = new Chess().fen();

function rotated(fen: string) {
  const rows = fen.split(' ')[0].split('/').join('').replace(/[1-8]/g, n => '.'.repeat(Number(n))).split('').reverse()
    .map(c => c === '.' ? c : c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('');
  return `${Array.from({ length: 8 }, (_, i) => rows.slice(i * 8, i * 8 + 8).replace(/\.+/g, s => String(s.length))).join('/')} b - - 0 15`;
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
    const candidate = inspectSacrifice(good, 'd3h7')!;
    assert(candidate, 'fixture is a structural nonchalant sacrifice');
    assert.deepEqual(await detectBrilliant(good, engine, new AbortController().signal), { brilliant: true });
    assert(engine.traces.some(t => t.options.multiPv && t.options.searchMoves?.includes('d3h7')), 'restricted MultiPV is only the candidate generator');
    assert(engine.traces.some(t => t.fen === candidate.fenAfterMove && !t.options.searchMoves), 'independent unrestricted strongest defense was searched');
    for (const acceptance of candidate.acceptances) assert(engine.traces.some(t => t.fen === acceptance.fenAfterAcceptance), 'every legal acceptance was checked');
    assert(engine.traces.every(t => t.result.depth >= 12 && (t.options.nodes ?? 0) >= 600_000));
    console.log('PASS real Stockfish 19 Lite: correct sacrifice, acceptance and strongest defense.');

    assert.deepEqual(await detectBrilliant(rotated(good), engine, new AbortController().signal), { brilliant: true }, 'Black side-to-move uses correct score POV');
    console.log('PASS real Stockfish 19 Lite: Black side-to-move and reversed colors.');

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
    console.log('PASS ordinary exchange and ordinary best moves produce no signal.');
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
