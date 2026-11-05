import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { inspectSoundSacrifice } from '../../src/lib/brilliantMove';
import type { BrowserChessEngine, BrowserEngineAnalysis, BrowserEngineSearchOptions } from '../../src/lib/browserEngine';
import { detectSacrifice, IncompleteAnalysisError } from '../core/detector';

const fen = 'r4rk1/1b2bppp/ppq1p3/2ppB2n/5P2/1P1BP3/P1PPQ1PP/R4RK1 w - - 0 15';
const uci = (root: string) => new Chess(root).moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
const candidates = uci(fen).map(move => inspectSoundSacrifice(fen, move)).filter(c => c !== null);
assert(candidates.length >= 7, 'Fixture must contain more than two ranking batches');
const quiet = uci(fen).find(move => !inspectSoundSacrifice(fen, move))!;
assert(quiet);
const cp = (value: number) => ({ kind: 'cp' as const, value });
type Config = { rootBest?: string; valid?: string; rejectPriority?: boolean; failAcceptance?: boolean; malformed?: 'duplicate' | 'foreign' | 'short' | 'checked' };
function scripted(config: Config = {}) {
  const calls: { root: string; options: BrowserEngineSearchOptions }[] = [];
  const rootBest = config.rootBest ?? quiet;
  const priority = candidates.find(c => c.uci === rootBest);
  const engine = { dispose() {}, async analyze(root: string, options: BrowserEngineSearchOptions = {}): Promise<BrowserEngineAnalysis> {
    calls.push({ root, options });
    const depth = options.depth ?? 16;
    if (options.multiPv) {
      let moves = options.searchMoves!.slice(0, options.multiPv);
      if (config.malformed === 'duplicate') moves = moves.map(() => moves[0]);
      if (config.malformed === 'foreign') moves[1] = quiet;
      if (config.malformed === 'short') moves.pop();
      if (config.malformed === 'checked') moves[1] = rootBest;
      const lines = moves.map(bestMove => ({ bestMove, score: cp(0), depth, pv: [bestMove] }));
      return { ...lines[0], lines };
    }
    if (priority?.acceptances.some(a => a.fenAfterAcceptance === root)) {
      if (config.failAcceptance) throw Error('Acceptance engine failed');
      if (config.rejectPriority) return { bestMove: uci(root)[0], score: cp(-200), depth, pv: [uci(root)[0]] };
    }
    const bestMove = root === fen ? options.searchMoves?.[0] ?? rootBest : uci(root)[0];
    const score = root === fen && options.searchMoves && bestMove !== config.valid ? cp(-200) : cp(0);
    return { bestMove, score, depth, pv: [bestMove] };
  } } as unknown as BrowserChessEngine;
  return { engine, calls };
}
async function main() {
  const fast = scripted({ rootBest: candidates[6].uci, valid: candidates[6].uci });
  assert.deepEqual(await detectSacrifice(fen, fast.engine, new AbortController().signal, { mode: 'fast' }), { brilliant: true });
  assert.equal(fast.calls.length, 1, 'Fast best-move signal comes from one complete unrestricted depth15 search');
  assert.equal(fast.calls[0].root, fen); assert.equal(fast.calls[0].options.depth, 15); assert.equal(fast.calls[0].options.searchMoves, undefined);
  const fastNear = scripted({ valid: candidates[6].uci });
  assert.deepEqual(await detectSacrifice(fen, fastNear.engine, new AbortController().signal, { mode: 'fast' }), { brilliant: true });
  assert(fastNear.calls.every(c => c.root === fen), 'Fast forced candidate searches remain full opponent searches from the original root');
  assert(fastNear.calls.some(c => c.options.depth === 15 && c.options.searchMoves?.[0] === candidates[6].uci));
  const losingFast = scripted();
  assert.deepEqual(await detectSacrifice(fen, losingFast.engine, new AbortController().signal, { mode: 'fast', maxSearches: 256 }), { brilliant: false });

  const priority = scripted({ rootBest: candidates[6].uci, valid: candidates[6].uci });
  assert.deepEqual(await detectSacrifice(fen, priority.engine, new AbortController().signal), { brilliant: true });
  assert.equal(priority.calls[0].options.depth, 15);
  assert(!priority.calls.some(c => c.options.multiPv), 'A fully verified root-best offer needs no ranking search');
  assert(priority.calls.some(c => c.root === candidates[6].fenAfterMove && !c.options.searchMoves));

  const later = scripted({ valid: candidates[6].uci });
  assert.deepEqual(await detectSacrifice(fen, later.engine, new AbortController().signal), { brilliant: true }, 'A sound seventh offer must not be cut off after three');
  const batches = later.calls.filter(c => c.options.multiPv);
  assert.equal(batches.length, 3);
  for (let i = 0; i < 3; i++) assert(!batches[i + 1]?.options.searchMoves?.includes(candidates[i].uci));
  const forced = later.calls.filter(c => c.root === fen && c.options.searchMoves?.length === 1 && !c.options.multiPv).map(c => c.options.searchMoves![0]);
  assert.equal(new Set(forced).size, forced.length, 'No candidate is independently verified twice');
  assert(forced.includes(candidates[6].uci));
  assert.equal(later.calls.filter(c => c.root === fen && !c.options.searchMoves).length, 1, 'One cached unrestricted root search');
  assert(!later.calls.some(c => c.options.depth === 20));

  const fallback = scripted({ rootBest: candidates[0].uci, valid: candidates[4].uci, rejectPriority: true });
  assert.deepEqual(await detectSacrifice(fen, fallback.engine, new AbortController().signal), { brilliant: true });
  assert(fallback.calls.filter(c => c.options.multiPv).every(c => !c.options.searchMoves!.includes(candidates[0].uci)), 'A refuted root-best offer is removed before fallback ranking');

  const negative = scripted();
  assert.deepEqual(await detectSacrifice(fen, negative.engine, new AbortController().signal, { maxSearches: 256 }), { brilliant: false });
  const rejected = negative.calls.filter(c => c.root === fen && c.options.depth === 15 && c.options.searchMoves?.length === 1).map(c => c.options.searchMoves![0]);
  assert.deepEqual(new Set(rejected), new Set(candidates.map(c => c.uci)), 'A completed negative must cover every generated offer');
  const capped = scripted({ valid: candidates[6].uci });
  await assert.rejects(detectSacrifice(fen, capped.engine, new AbortController().signal, { maxSearches: 4 }), IncompleteAnalysisError, 'Budget exhaustion with unchecked offers cannot become a completed negative');
  assert.equal(capped.calls.length, 4);

  for (const malformed of ['duplicate', 'foreign', 'short', 'checked'] as const) {
    const test = scripted({ malformed, ...(malformed === 'checked' ? { rootBest: candidates[0].uci, rejectPriority: true } : {}) });
    await assert.rejects(detectSacrifice(fen, test.engine, new AbortController().signal), IncompleteAnalysisError, `Malformed batch ${malformed} must fail, not loop or skip offers`);
    assert(test.calls.length <= 3, 'Malformed batches stop immediately');
  }
  const failed = scripted({ rootBest: candidates[0].uci, valid: candidates[6].uci, failAcceptance: true });
  await assert.rejects(detectSacrifice(fen, failed.engine, new AbortController().signal), IncompleteAnalysisError);
  assert(!failed.calls.some(c => c.options.multiPv), 'A swallowed acceptance error must not allow a later false positive');
  console.log('Candidate search PASS: root-best fast path, seventh offer, all-negative coverage, bounded incomplete results, deduplication, malformed batches and sticky acceptance failures.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
