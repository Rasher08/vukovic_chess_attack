import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { BrowserChessEngine, type BrowserEngineSearchOptions } from '../../src/lib/browserEngine';
import { inspectSacrifice } from '../../src/lib/brilliantMove';
import { detectBrilliant, detectSacrifice, IncompleteAnalysisError } from '../core/detector';
import { HudController } from '../core/controller';

const fen = 'r4rk1/1b2bppp/ppq1p3/2ppB2n/5P2/1P1BP3/P1PPQ1PP/R4RK1 w - - 0 15';
const offer = inspectSacrifice(fen, 'd3h7')!;
const moves = (root: string) => new Chess(root).moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
function scripted(mode: 'hold' | 'refuted' | 'shallow' | 'near-best' | 'best-changed' | 'negative') {
  let release!: () => void, reached!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const finalDefense = new Promise<void>(resolve => { reached = resolve; });
  const calls: { root: string; options: BrowserEngineSearchOptions }[] = [];
  const engine = {
    dispose() {},
    async analyze(root: string, options: BrowserEngineSearchOptions = {}) {
      calls.push({ root, options });
      const depth = options.depth ?? 16;
      if (depth === 22 && root === offer.fenAfterMove) { reached(); if (mode === 'hold') await gate; }
      let allowed = options.searchMoves || moves(root);
      if (root === fen && allowed.includes(offer.uci)) allowed = [offer.uci, ...allowed.filter(m => m !== offer.uci)];
      if (root === fen && !options.searchMoves && (mode === 'near-best' || mode === 'negative' || mode === 'best-changed' && depth === 22)) allowed = ['g1h1', ...allowed.filter(m => m !== 'g1h1')];
      const score = { kind: 'cp' as const, value: mode === 'negative' && root === fen && options.searchMoves?.length === 1 ? -1 : root === fen && !allowed.includes(offer.uci) ? 0
        : mode === 'refuted' && depth === 22 && root !== fen ? -500 : 0 };
      const actualDepth = mode === 'shallow' && depth === 22 ? 21 : depth;
      const lines = allowed.slice(0, options.multiPv ?? 1).map(bestMove => ({ bestMove, score, depth: actualDepth, pv: [bestMove] }));
      return { ...lines[0], lines: options.multiPv ? lines : undefined };
    },
  } as unknown as BrowserChessEngine;
  return { engine, release, finalDefense, calls };
}
async function main() {
  const held = scripted('hold'); let notifications = 0;
  const controller = new HudController(() => held.engine, detectBrilliant, (_state, notify) => { if (notify) notifications++; });
  controller.accept(fen);
  await held.finalDefense;
  assert(held.calls.some(c => c.root === offer.acceptances[0].fenAfterAcceptance && c.options.depth === 22), 'Acceptance was checked before the final unrestricted defense');
  assert(!held.calls.some(c => c.options.depth === 20), 'The old depth20 pass must not run');
  assert.equal(controller.state.status, 'checking');
  assert.equal(controller.state.idea, false, 'A provisional positive must never appear in HUD');
  assert.equal(controller.notificationHistory.length, 0);
  held.release();
  const deadline = Date.now() + 1000;
  while (controller.state.status === 'checking' && Date.now() < deadline) await new Promise(r => setTimeout(r, 0));
  assert.equal(controller.state.status, 'checked'); assert(controller.state.idea); assert.equal(notifications, 1);
  for (const acceptance of offer.acceptances) assert(held.calls.some(c => c.root === acceptance.fenAfterAcceptance && c.options.depth === 22), 'Every acceptance was verified at the required depth');
  assert(held.calls.some(c => c.root === offer.fenAfterMove && c.options.depth === 22));
  controller.dispose();

  const refuted = scripted('refuted');
  assert.deepEqual(await detectBrilliant(fen, refuted.engine, new AbortController().signal), { brilliant: false }, 'A sacrifice refuted at the required depth never signals');
  const shallow = scripted('shallow');
  await assert.rejects(detectBrilliant(fen, shallow.engine, new AbortController().signal), IncompleteAnalysisError, 'Requested depth alone is insufficient: returned depth must reach 22');
  assert.equal(detectSacrifice, detectBrilliant, 'Legacy transport name aliases the new Tal detector');
  for (const mode of ['near-best', 'best-changed'] as const) {
    const test = scripted(mode);
    assert.deepEqual(await detectSacrifice(fen, test.engine, new AbortController().signal), { brilliant: true }, 'A compensated offer remains valid when another move ranks first');
    for (const depth of [22]) {
      assert(test.calls.some(c => c.root === offer.acceptances[0].fenAfterAcceptance && c.options.depth === depth), 'The same material offer is accepted and checked at depth22');
      assert(test.calls.some(c => c.root === offer.fenAfterMove && c.options.depth === depth), 'Independent unrestricted defense is still checked at depth22');
    }
    assert(test.calls.some(c => c.root === fen && c.options.depth === 22 && c.options.searchMoves?.length === 1 && c.options.searchMoves[0] === offer.uci), 'The selected offer, rather than a changed best move, gets a forced search');
    assert(test.calls.length <= 36, 'Near-best checks stay inside the bounded search count');
  }
  const negative = scripted('negative');
  assert.deepEqual(await detectSacrifice(fen, negative.engine, new AbortController().signal), { brilliant: false }, 'Even minus one centipawn fails the explicit nonlosing Tal floor');
  console.log('Depth gate PASS: provisional Tal verdict hidden, same compensated candidate checked once at22 even when another move ranks first, forced searches/defense/acceptances retained, negative floor and refutation rejected, capped shallow search incomplete.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
