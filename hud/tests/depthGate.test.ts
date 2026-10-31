import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { BrowserChessEngine, type BrowserEngineSearchOptions } from '../../src/lib/browserEngine';
import { inspectSacrifice } from '../../src/lib/brilliantMove';
import { detectBrilliant, IncompleteAnalysisError } from '../core/detector';
import { HudController } from '../core/controller';

const fen = 'r4rk1/1b2bppp/ppq1p3/2ppB2n/5P2/1P1BP3/P1PPQ1PP/R4RK1 w - - 0 15';
const offer = inspectSacrifice(fen, 'd3h7')!;
const moves = (root: string) => new Chess(root).moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
function scripted(mode: 'hold' | 'refuted' | 'shallow' | 'near-best' | 'best-changed') {
  let release!: () => void, reached!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const secondStage = new Promise<void>(resolve => { reached = resolve; });
  const calls: { root: string; options: BrowserEngineSearchOptions }[] = [];
  const engine = {
    dispose() {},
    async analyze(root: string, options: BrowserEngineSearchOptions = {}) {
      calls.push({ root, options });
      const depth = options.depth ?? 16;
      if (depth === 22) { reached(); if (mode === 'hold') await gate; }
      let allowed = options.searchMoves || moves(root);
      if (root === fen && allowed.includes(offer.uci)) allowed = [offer.uci, ...allowed.filter(m => m !== offer.uci)];
      if (root === fen && !options.searchMoves && (mode === 'near-best' || mode === 'best-changed' && depth === 22)) allowed = ['g1h1', ...allowed.filter(m => m !== 'g1h1')];
      const score = { kind: 'cp' as const, value: root === fen && !allowed.includes(offer.uci) ? -500
        : mode === 'refuted' && depth === 22 && offer.acceptances.some(a => a.fenAfterAcceptance === root) ? -500 : 0 };
      const actualDepth = mode === 'shallow' && depth === 22 ? 21 : depth;
      const lines = allowed.slice(0, options.multiPv ?? 1).map(bestMove => ({ bestMove, score, depth: actualDepth, pv: [bestMove] }));
      return { ...lines[0], lines: options.multiPv ? lines : undefined };
    },
  } as unknown as BrowserChessEngine;
  return { engine, release, secondStage, calls };
}
async function main() {
  const held = scripted('hold'); let notifications = 0;
  const controller = new HudController(() => held.engine, detectBrilliant, (_state, notify) => { if (notify) notifications++; });
  controller.accept(fen);
  await held.secondStage;
  assert(held.calls.some(c => c.root === offer.fenAfterMove && c.options.depth === 20), 'The provisional pass included unrestricted defense');
  assert.equal(controller.state.status, 'checking');
  assert.equal(controller.state.idea, false, 'A provisional positive must never appear in HUD');
  assert.equal(controller.notificationHistory.length, 0);
  held.release();
  const deadline = Date.now() + 1000;
  while (controller.state.status === 'checking' && Date.now() < deadline) await new Promise(r => setTimeout(r, 0));
  assert.equal(controller.state.status, 'checked'); assert(controller.state.idea); assert.equal(notifications, 1);
  for (const acceptance of offer.acceptances) assert(held.calls.some(c => c.root === acceptance.fenAfterAcceptance && c.options.depth === 22), 'Every acceptance was verified again at the final depth');
  assert(held.calls.some(c => c.root === offer.fenAfterMove && c.options.depth === 22));
  controller.dispose();

  const refuted = scripted('refuted');
  assert.deepEqual(await detectBrilliant(fen, refuted.engine, new AbortController().signal), { brilliant: false }, 'A sacrifice refuted at the later depth never signals');
  const shallow = scripted('shallow');
  await assert.rejects(detectBrilliant(fen, shallow.engine, new AbortController().signal), IncompleteAnalysisError, 'Requested depth alone is insufficient: returned depth must reach 22');
  for (const mode of ['near-best', 'best-changed'] as const) assert.deepEqual(await detectBrilliant(fen, scripted(mode).engine, new AbortController().signal), { brilliant: false }, 'An equal or changing near-best candidate is insufficient');
  console.log('Depth gate PASS: provisional verdict hidden, final depth reached, all acceptances/defense rechecked, deeper refutation rejected, capped shallow search incomplete.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
