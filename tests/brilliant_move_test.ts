import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { inspectSacrifice, verifyBrilliantMove, type SacrificeCandidate } from '../src/lib/brilliantMove';
import type { EngineLike, EngineResult } from '../src/lib/autoTraining';
import { BrowserChessEngine } from '../src/lib/browserEngine';

const cp = (value: number) => ({ kind: 'cp' as const, value });
const mate = (value: number) => ({ kind: 'mate' as const, value });
const uci = (move: { from: string; to: string; promotion?: string }) => move.from + move.to + (move.promotion || '');
const greekFen = 'r4rk1/1b2bppp/ppq1p3/2ppB2n/5P2/1P1BP3/P1PPQ1PP/R4RK1 w - - 0 15';
const greek = inspectSacrifice(greekFen, 'd3h7')!;
assert.ok(greek);
assert.equal(greek.san, 'Bxh7+');
assert.equal(greek.acceptances.length, 1);
assert.equal(greek.acceptances[0].san, 'Kxh7');
assert.equal(greek.acceptances[0].investmentCp, 230, 'Account for the captured pawn, not just the lost bishop');
assert.equal(greek.learner, 'w');
assert.equal(new Chess(greek.acceptances[0].fenAfterAcceptance).turn(), 'w');

assert.equal(inspectSacrifice(new Chess().fen(), 'g1f3'), null, 'An ordinary best move is not a sacrifice');
assert.equal(inspectSacrifice(new Chess().fen(), 'e2e4'), null, 'Pawn moves do not enter this conservative piece-sacrifice detector');
assert.equal(inspectSacrifice(new Chess().fen(), 'e2e5'), null);
assert.equal(inspectSacrifice('invalid', 'e2e4'), null);
assert.equal(inspectSacrifice(greekFen, 'd3h7\ngo infinite'), null);
const trade = '4k3/8/2p5/3n4/2B5/8/8/4K3 w - - 0 1';
assert.equal(inspectSacrifice(trade, 'c4d5'), null, 'Bxd5 cxd5 is an ordinary fair exchange');
const protectedRook = 'k7/1r6/1Q6/8/8/8/8/R3K3 w - - 0 1';
assert.equal(inspectSacrifice(protectedRook, 'a1a7'), null, 'Ra7+ Rxa7 Qxa7 is not a material sacrifice');
const forced = '7k/8/8/8/2b5/8/1B6/K6r w - - 0 1';
assert.deepEqual(new Chess(forced).moves(), ['Bc1']);
assert.equal(inspectSacrifice(forced, 'b2c1'), null, 'A sole legal move is not labelled brilliant');

const opera = new Chess();
for (const san of ['e4', 'e5', 'Nf3', 'd6', 'd4', 'Bg4', 'dxe5', 'Bxf3', 'Qxf3', 'dxe5', 'Bc4', 'Nf6', 'Qb3', 'Qe7', 'Nc3', 'c6', 'Bg5', 'b5', 'Nxb5', 'cxb5', 'Bxb5+', 'Nbd7', 'O-O-O', 'Rd8', 'Rxd7', 'Rxd7', 'Rd1', 'Qe6', 'Bxd7+', 'Nxd7']) opera.move(san);
const queen = inspectSacrifice(opera.fen(), 'b3b8')!;
assert.ok(queen);
assert.equal(queen.san, 'Qb8+');
assert.equal(queen.acceptances[0].san, 'Nxb8');
assert.equal(queen.acceptances[0].investmentCp, 900);
const acceptedQueen = new Chess(queen.acceptances[0].fenAfterAcceptance);
acceptedQueen.move('Rd8#');
assert.equal(acceptedQueen.isCheckmate(), true, 'The classic queen sacrifice has a legal mating continuation');

function result(game: Chess, score: EngineResult['score'], preferred?: string, depth = 16): EngineResult {
  const legal = game.moves({ verbose: true });
  const bestMove = preferred || uci(legal.find(move => move.san.endsWith('#')) || legal[0]);
  return { bestMove, score, pv: [bestMove], depth };
}

function fakeEngine(candidate: SacrificeCandidate, config: {
  best?: EngineResult['score']; chosen?: EngineResult['score']; alternative?: EngineResult['score'];
  accepted?: EngineResult['score']; depth?: number; bestIsDifferent?: boolean; failAcceptance?: boolean;
  deeperAlternative?: EngineResult['score'];
  onSearch?: (call: number) => void;
} = {}) {
  const calls: { fen: string; searchMoves?: string[]; nodes?: number }[] = [];
  const engine: EngineLike = { async analyze(fen, options) {
    calls.push({ fen, searchMoves: options?.searchMoves, nodes: options?.nodes });
    config.onSearch?.(calls.length);
    const game = new Chess(fen);
    if (fen !== candidate.fenBefore) {
      if (config.failAcceptance) throw new Error('WASM unavailable');
      return result(game, config.accepted === undefined ? cp(120) : config.accepted, undefined, config.depth);
    }
    const forcedCandidate = options?.searchMoves?.length === 1 && options.searchMoves[0] === candidate.uci;
    const alternative = options?.searchMoves && !options.searchMoves.includes(candidate.uci);
    const bestMove = options?.searchMoves?.[0] || (config.bestIsDifferent ? game.moves({ verbose: true }).map(uci).find(move => move !== candidate.uci)! : candidate.uci);
    const score = alternative ? (options?.nodes ?? 0) >= 1_200_000 && config.deeperAlternative !== undefined ? config.deeperAlternative : config.alternative === undefined ? cp(0) : config.alternative
      : forcedCandidate ? config.chosen === undefined ? cp(100) : config.chosen
        : config.best === undefined ? cp(100) : config.best;
    return result(game, score, bestMove, config.depth);
  } };
  return { engine, calls };
}

function baseline(candidate: SacrificeCandidate, score: EngineResult['score'] = cp(100)) {
  return result(new Chess(candidate.fenBefore), score, candidate.uci);
}

function rotateAndSwap(fen: string): string {
  const parts = fen.split(' ');
  const expanded = parts[0].split('/').join('').replace(/[1-8]/g, digit => '.'.repeat(Number(digit)));
  const swapped = expanded.split('').reverse().map(piece => piece === '.' ? '.' : piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase()).join('');
  const rows = Array.from({ length: 8 }, (_, index) => swapped.slice(index * 8, index * 8 + 8).replace(/\.+/g, empty => String(empty.length)));
  return `${rows.join('/')} ${parts[1] === 'w' ? 'b' : 'w'} - - 0 15`;
}

async function run() {
  const verified = fakeEngine(greek, { bestIsDifferent: true });
  const yes = await verifyBrilliantMove(greek, baseline(greek), baseline(greek), verified.engine, { nodes: 200_000 });
  assert.equal(yes.brilliant, true);
  assert.match(yes.reason!, /Bxh7\+/); assert.match(yes.reason!, /Kxh7/);
  assert.equal(verified.calls.length, 3, 'Unrestricted, forced chosen, and actual acceptance must all be verified');
  assert(verified.calls.every(call => call.nodes! >= 600_000));
  assert.deepEqual(verified.calls[1].searchMoves, [greek.uci]);
  assert.equal(verified.calls[2].fen, greek.acceptances[0].fenAfterAcceptance);

  const losingAcceptance = fakeEngine(greek, { accepted: cp(-250) });
  assert.equal((await verifyBrilliantMove(greek, baseline(greek), baseline(greek), losingAcceptance.engine, { nodes: 600_000 })).brilliant, false, 'A refutation after accepting the sacrifice suppresses the badge');
  assert.equal((await verifyBrilliantMove(greek, baseline(greek), baseline(greek), fakeEngine(greek, { chosen: cp(-100), bestIsDifferent: true }).engine, { nodes: 600_000 })).brilliant, false);
  assert.equal((await verifyBrilliantMove(greek, baseline(greek), baseline(greek), fakeEngine(greek, { failAcceptance: true }).engine, { nodes: 600_000 })).brilliant, false, 'Failure cannot manufacture a brilliant');
  assert.equal((await verifyBrilliantMove(greek, baseline(greek), baseline(greek), fakeEngine(greek, { accepted: null }).engine, { nodes: 600_000 })).brilliant, false);
  assert.equal((await verifyBrilliantMove(greek, baseline(greek), baseline(greek), fakeEngine(greek, { depth: 8 }).engine, { nodes: 600_000 })).brilliant, false, 'Unresolved shallow analysis is insufficient');

  const easyWin = fakeEngine(queen, { best: mate(2), alternative: cp(700), accepted: mate(1) });
  assert.equal((await verifyBrilliantMove(queen, baseline(queen, mate(2)), baseline(queen, mate(2)), easyWin.engine, { nodes: 600_000 })).brilliant, true, 'A legally proven mate-in-two sacrifice qualifies despite another winning move');
  assert.equal(easyWin.calls.length, 3, 'The material acceptance remains mandatory after the legal mate proof');
  const onlyWin = fakeEngine(queen, { best: mate(2), alternative: cp(0), accepted: mate(1) });
  assert.equal((await verifyBrilliantMove(queen, baseline(queen, mate(2)), baseline(queen, mate(2)), onlyWin.engine, { nodes: 600_000 })).brilliant, true, 'A unique mating sacrifice is not excluded merely because best score is mate');
  assert(onlyWin.calls[1].searchMoves!.every(move => move !== queen.uci));
  assert.equal((await verifyBrilliantMove(queen, baseline(queen, mate(2)), baseline(queen, mate(2)), fakeEngine(queen, { best: mate(2), alternative: mate(5), accepted: mate(1) }).engine, { nodes: 600_000 })).brilliant, true, 'A slower alternative mate does not erase a proven mating sacrifice');
  assert.equal((await verifyBrilliantMove(queen, baseline(queen, mate(1)), baseline(queen, mate(2)), fakeEngine(queen, { best: mate(1), chosen: mate(2), alternative: mate(1), accepted: mate(1), bestIsDifferent: true }).engine, { nodes: 600_000 })).brilliant, false, 'Do not award a delayed sacrifice when an immediate mate was available');
  assert.equal((await verifyBrilliantMove(greek, baseline(greek, mate(2)), baseline(greek, mate(2)), fakeEngine(greek, { best: mate(2), alternative: mate(5), accepted: mate(1) }).engine, { nodes: 600_000 })).brilliant, false, 'A fabricated mate score cannot replace checking every legal defense');
  const drawingOffer = inspectSacrifice('k7/8/1Q6/8/8/8/8/K7 w - - 0 1', 'b6b7')!;
  assert(drawingOffer);
  assert(new Chess(drawingOffer.acceptances[0].fenAfterAcceptance).isDraw());
  assert.equal((await verifyBrilliantMove(drawingOffer, baseline(drawingOffer, mate(2)), baseline(drawingOffer, mate(2)), fakeEngine(drawingOffer, { best: mate(2), alternative: mate(5), accepted: mate(1) }).engine, { nodes: 600_000 })).brilliant, false, 'An acceptance that draws cannot be a mating proof');
  assert.equal(inspectSacrifice('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', 'f7e6'), null, 'A stalemating offer is not a sound mating sacrifice');

  const significant = fakeEngine(greek, { best: cp(500), alternative: cp(350), accepted: cp(510) });
  assert.equal((await verifyBrilliantMove(greek, baseline(greek, cp(500)), baseline(greek, cp(500)), significant.engine, { nodes: 600_000 })).brilliant, true, 'A substantially weaker winning alternative does not automatically disqualify a sound sacrifice');
  assert(significant.calls.filter(c => c.fen === greek.fenBefore && c.nodes === 1_200_000).length >= 2, 'Confirm the root and alternative again at doubled budget');
  assert.equal(significant.calls.at(-1)?.nodes, 1_200_000, 'Do not compare strengthened root scores with a weaker acceptance search');
  for (const config of [
    { best: cp(500), alternative: cp(450), accepted: cp(500) },
    { best: cp(500), alternative: cp(350), deeperAlternative: cp(450), accepted: cp(500) },
    { best: cp(500), alternative: cp(350), accepted: cp(100) },
  ]) assert.equal((await verifyBrilliantMove(greek, baseline(greek, cp(500)), baseline(greek, cp(500)), fakeEngine(greek, config).engine, { nodes: 600_000 })).brilliant, false, 'Close alternatives, an unstable gap and refuted acceptance still suppress the badge');

  const blackFen = rotateAndSwap(greekFen);
  const black = inspectSacrifice(blackFen, 'e6a2')!;
  assert.ok(black); assert.equal(black.learner, 'b');
  assert.equal(new Chess(black.acceptances[0].fenAfterAcceptance).turn(), 'b');
  assert.equal((await verifyBrilliantMove(black, baseline(black), baseline(black), fakeEngine(black).engine, { nodes: 600_000 })).brilliant, true, 'Acceptance scores are already learner POV even for Black');
  assert.equal((await verifyBrilliantMove(black, baseline(black), baseline(black), fakeEngine(black, { accepted: cp(-120) }).engine, { nodes: 600_000 })).brilliant, false);

  const abort = new AbortController(); abort.abort();
  await assert.rejects(verifyBrilliantMove(greek, baseline(greek), baseline(greek), fakeEngine(greek).engine, { nodes: 600_000, signal: abort.signal }), { name: 'AbortError' });
  const during = new AbortController();
  const interrupted = fakeEngine(greek, { onSearch: () => during.abort() });
  await assert.rejects(verifyBrilliantMove(greek, baseline(greek), baseline(greek), interrupted.engine, { nodes: 600_000, signal: during.signal }), { name: 'AbortError' });
  assert.equal(interrupted.calls.length, 1, 'Cancellation must stop later searches');
  console.log('Brilliant detector: legal sacrifice investment, fair trades, protected offers, forced moves, verified acceptance, same-root quality, Black POV, unique mating sacrifice, failures and cancellation passed.');

  class RealWorkerBridge extends EventTarget {
    child = spawn(process.execPath, [new URL('../public/engine/stockfish-19-lite-single.js', import.meta.url).pathname], { stdio: ['pipe', 'pipe', 'pipe'] });
    constructor() {
      super();
      createInterface({ input: this.child.stdout }).on('line', data => this.dispatchEvent(new MessageEvent('message', { data })));
      this.child.stderr.on('data', bytes => process.stderr.write(bytes));
    }
    postMessage(command: string) { this.child.stdin.write(command + '\n'); }
    terminate() { this.child.kill(); }
  }
  const bridge = new RealWorkerBridge();
  const real = new BrowserChessEngine({ workerFactory: () => bridge as unknown as Worker, startupTimeoutMs: 15000 });
  try {
    const best = await real.analyze(queen.fenBefore, { nodes: 200000 });
    const played = best.bestMove === queen.uci ? best : await real.analyze(queen.fenBefore, { nodes: 200000, searchMoves: [queen.uci] });
    const traces: unknown[] = [];
    const traced: EngineLike = { async analyze(fen, options) { const response = await real.analyze(fen, options); traces.push({ type: fen === queen.fenBefore ? options?.searchMoves ? 'alternative/forced' : 'root' : 'acceptance', bestMove: response.bestMove, score: response.score, depth: response.depth }); return response; } };
    const actual = await verifyBrilliantMove(queen, best, played, traced, { nodes: 600000 });
    assert.equal(actual.brilliant, true, 'Morphy Qb8+ has the same general legal mate-in-two proof even when Qb7 also wins');
    assert.match(actual.reason!, /Полный перебор легальных защит/);
    assert(traces.length >= 2);
    const reportedGame = new Chess();
    reportedGame.loadPgn(readFileSync(new URL('fixtures/brilliant-konoxa-2026-11-01.pgn', import.meta.url), 'utf8'));
    const reportedPly = reportedGame.history({ verbose: true })[57];
    assert.equal(reportedPly.san, 'Qg1+');
    assert.equal(Number(reportedPly.before.split(' ')[5]), 29);
    const reported = inspectSacrifice(reportedPly.before, 'd4g1')!;
    assert(reported && reported.learner === 'b');
    assert.equal(reported.acceptances[0].san, 'Rxg1');
    assert.equal(reported.acceptances[0].investmentCp, 400, 'Conservative investment accounts for possible Nxg1, even though the actual continuation mates with Nf2');
    const afterOffer = new Chess(reported.fenAfterMove);
    assert.deepEqual(afterOffer.moves(), ['Rxg1']);
    afterOffer.move('Rxg1'); afterOffer.move('Nf2#');
    assert(afterOffer.isCheckmate());
    for (const candidate of [reported, inspectSacrifice(rotateAndSwap(reported.fenBefore), 'e5b8')!]) {
      assert(candidate, 'The reported mating idea works for both colors');
      const base = await real.analyze(candidate.fenBefore, { nodes: 200_000 });
      const chosen = base.bestMove === candidate.uci ? base : await real.analyze(candidate.fenBefore, { nodes: 200_000, searchMoves: [candidate.uci] });
      const verified = await verifyBrilliantMove(candidate, base, chosen, real, { nodes: 600_000 });
      assert.equal(verified.brilliant, true, 'The actual engine and exhaustive legal-defense proof recognize the reported sacrifice');
      assert.match(verified.reason!, /Полный перебор легальных защит/);
    }
    assert.equal(inspectSacrifice(reported.fenBefore.replace('8 29', '99 29'), reported.uci), null, 'A claimable fifty-move draw after the quiet offer prevents a false mating claim');
    const escapeFen = reported.fenBefore.replace('PP1N2BP', 'PP1N2B1');
    const escapable = inspectSacrifice(escapeFen, reported.uci)!;
    assert(escapable);
    const escapeLine = new Chess(escapable.fenAfterMove); escapeLine.move('Rxg1'); escapeLine.move('Nf2+');
    assert(escapeLine.moves().includes('Kh2'), 'An extra defensive king square refutes the apparent smothered mate');
    assert.equal((await verifyBrilliantMove(escapable, baseline(escapable, mate(2)), baseline(escapable, mate(2)), fakeEngine(escapable, { best: mate(2), alternative: mate(5), accepted: mate(1) }).engine, { nodes: 600_000 })).brilliant, false, 'Even plausible mate scores cannot hide a legal escape in the otherwise identical mating pattern');

    const greekBest = await real.analyze(greek.fenBefore, { nodes: 200000 });
    const greekPlayed = greekBest.bestMove === greek.uci ? greekBest : await real.analyze(greek.fenBefore, { nodes: 200000, searchMoves: [greek.uci] });
    const greekTraces: unknown[] = [];
    const greekTraced: EngineLike = { async analyze(fen, options) { const response = await real.analyze(fen, options); greekTraces.push({ type: fen === greek.fenBefore ? options?.searchMoves ? 'alternative/forced' : 'root' : 'acceptance', bestMove: response.bestMove, score: response.score, depth: response.depth }); return response; } };
    const actualGreek = await verifyBrilliantMove(greek, greekBest, greekPlayed, greekTraced, { nodes: 600000 });
    assert.equal(actualGreek.brilliant, true, 'The actual bundled WASM verifies Lasker Bxh7+, its alternatives and Kxh7 acceptance');
    assert.match(actualGreek.reason!, /Bxh7\+/);
    assert(greekTraces.length >= 3);
    console.log('PASS actual bundled WASM: Lasker Bxh7+, Morphy Qb8+ and Konoxa Qg1+ (both colors) verified with legal mating proofs where applicable.');
  } finally { real.dispose(); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
