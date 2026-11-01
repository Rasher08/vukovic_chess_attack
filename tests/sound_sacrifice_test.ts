import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { readFileSync } from 'node:fs';
import { inspectSacrifice, inspectSoundSacrifice, verifyBrilliantMove, verifySoundSacrifice, type SacrificeCandidate } from '../src/lib/brilliantMove';
import type { EngineLike, EngineResult } from '../src/lib/autoTraining';
import { NodeEngine } from '../hud/core/nodeEngine';

const cp = (value: number) => ({ kind: 'cp' as const, value });
const legal = (fen: string) => new Chess(fen).moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
const qgBoard = new Chess(); qgBoard.move('d4'); qgBoard.move('d5');
const pawn = inspectSoundSacrifice(qgBoard.fen(), 'c2c4')!;
assert(pawn && pawn.piece === 'p');
assert.equal(pawn.acceptances[0].san, 'dxc4');
assert.equal(pawn.acceptances[0].investmentCp, 100);
assert.equal(inspectSacrifice(qgBoard.fen(), 'c2c4'), null, 'Website brilliant material scope stays unchanged');
const exchangeFen = '6bk/5QR1/6K1/8/8/8/8/8 w - - 0 1';
const exchange = inspectSoundSacrifice(exchangeFen, 'g7h7')!;
assert(exchange && exchange.piece === 'r');
assert.equal(exchange.acceptances[0].investmentCp, 170, 'A rook offered for a bishop is a real exchange investment, not a fair trade');
assert.equal(inspectSacrifice(exchangeFen, exchange.uci), null, 'The existing website detector retains its200cp minimum');
assert.equal(inspectSoundSacrifice(new Chess().fen(), 'e2e4'), null);
assert.equal(inspectSoundSacrifice('4k3/8/4p3/3p4/2P5/8/8/4K3 w - - 0 1', 'c4d5'), null, 'Equal pawn trades do not become pawn sacrifices');
assert.equal(inspectSoundSacrifice('4k3/8/2p5/3n4/2B5/8/8/4K3 w - - 0 1', 'c4d5'), null);
assert.equal(inspectSoundSacrifice('7k/8/8/8/2b5/8/1B6/K6r w - - 0 1', 'b2c1'), null);
assert.equal(inspectSoundSacrifice('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', 'f7e6'), null, 'Stalemating the defender is not a sound winning sacrifice');

const reported = new Chess();
reported.loadPgn(readFileSync(new URL('./fixtures/konoxa-dg5167-2026-11-01.pgn', import.meta.url), 'utf8'));
const reportedHistory = reported.history({ verbose: true });
const quiet = inspectSoundSacrifice(reportedHistory[22].before, 'c4f7')!;
assert(quiet, 'Bf7 leaves a different piece available for capture');
assert.equal(quiet.san, 'Bf7');
assert.equal(quiet.acceptances.length, 1);
assert.equal(quiet.acceptances[0].san, 'Nxg4');
assert.equal(quiet.acceptances[0].investmentCp, 320, 'The sacrificed knight did not move');
assert.equal(inspectSacrifice(quiet.fenBefore, quiet.uci), null, 'Website direct-sacrifice scope is unchanged');
assert.equal(inspectSoundSacrifice('4k3/8/8/8/1b6/2N5/1P6/R3K3 w - - 0 1', 'a1a2'), null,
  'Leaving another defended piece available for an equal trade is not a sacrifice');
const nh6 = inspectSoundSacrifice(reportedHistory[20].before, 'g4h6')!;
assert(nh6 && nh6.san === 'Nxh6');
assert.equal(nh6.acceptances[0].investmentCp, 120, 'The existing direct pawn-adjusted offer stays recognized');

const multiple = inspectSoundSacrifice('4k2r/8/8/8/1b6/2N4B/8/R3K3 w - - 0 1', 'a1a2')!;
assert(multiple && multiple.acceptances.length === 2, 'Both offered pieces must be retained for verification');
assert.equal(inspectSoundSacrifice('K3k3/8/8/8/8/2q3q1/1PPPPPPP/R7 w - - 0 1', 'a1a4'), null,
  'Do not silently truncate more than four meaningful acceptance branches');
const mirrorParts = quiet.fenBefore.split(' ');
const flip = (s: string) => s.replace(/[a-zA-Z]/g, c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase());
const blackFen = `${mirrorParts[0].split('/').reverse().map(flip).join('/')} b kq - 0 12`;
const blackQuiet = inspectSoundSacrifice(blackFen, 'c5f2')!;
assert(blackQuiet && blackQuiet.learner === 'b');
assert.equal(blackQuiet.acceptances[0].san, 'Nxg5');
assert.equal(blackQuiet.acceptances[0].investmentCp, 320);

function base(c: SacrificeCandidate, score: EngineResult['score'] = cp(20)): EngineResult {
  return { bestMove: c.uci, score, depth: 22, pv: [c.uci] };
}
function scripted(c: SacrificeCandidate, config: { best?: EngineResult['score']; chosen?: EngineResult['score']; accepted?: EngineResult['score']; different?: boolean; fail?: boolean; depth?: number } = {}) {
  const calls: { fen: string; searchMoves?: string[]; nodes?: number }[] = [];
  const engine: EngineLike = { async analyze(fen, options) {
    calls.push({ fen, ...options });
    if (config.fail) throw new Error('verification unavailable');
    const forced = options?.searchMoves?.length === 1 && options.searchMoves[0] === c.uci;
    const move = fen === c.fenBefore ? forced ? c.uci : config.different ? legal(fen).find(m => m !== c.uci)! : c.uci : legal(fen)[0];
    return { bestMove: move, score: fen !== c.fenBefore ? config.accepted ?? cp(10) : forced ? config.chosen ?? cp(10) : config.best ?? cp(20), depth: config.depth ?? 22, pv: [move] };
  } };
  return { engine, calls };
}

async function run() {
  for (const accepted of [cp(500), cp(-100)]) {
    const test = scripted(quiet, { best: cp(500), chosen: cp(500), accepted });
    const result = await verifySoundSacrifice(quiet, base(quiet, cp(500)), base(quiet, cp(500)), test.engine, { nodes: 600_000 });
    assert.equal(result.brilliant, accepted.value >= 0, 'Ignoring another attacked piece still needs actual compensation');
    assert(test.calls.some(call => call.fen === quiet.acceptances[0].fenAfterAcceptance), 'Nxg4 acceptance is evaluated');
    if (result.brilliant) assert(!result.reason!.startsWith('Жертва слона'), 'Do not call Bf7 a bishop sacrifice when the knight is offered');
  }
  const twoBranches = scripted(multiple, { best: cp(0), chosen: cp(0), accepted: cp(0) });
  const both: EngineLike = { async analyze(fen, options) {
    const result = await twoBranches.engine.analyze(fen, options);
    return fen === multiple.acceptances[1].fenAfterAcceptance ? { ...result, score: cp(-100) } : result;
  } };
  assert.equal((await verifySoundSacrifice(multiple, base(multiple, cp(0)), base(multiple, cp(0)), both, { nodes: 600_000 })).brilliant, false,
    'One losing acceptance among two suppresses a quiet other-piece sacrifice');
  assert(multiple.acceptances.every(a => twoBranches.calls.some(c => c.fen === a.fenAfterAcceptance)));
  assert.equal((await verifySoundSacrifice(blackQuiet, base(blackQuiet), base(blackQuiet), scripted(blackQuiet).engine, { nodes: 600_000 })).brilliant, true,
    'Black other-piece acceptance keeps the correct score perspective');
  const near = scripted(pawn, { different: true, best: cp(30), chosen: cp(0), accepted: cp(0) });
  assert.equal((await verifySoundSacrifice(pawn, base(pawn, cp(30)), base(pawn, cp(0)), near.engine, { nodes: 600_000 })).brilliant, true, 'Equality is adequate compensation; the offered move need not rank first');
  assert.equal(near.calls.length, 3);
  assert.deepEqual(near.calls[1].searchMoves, [pawn.uci]);
  assert(near.calls.every(c => !c.searchMoves || c.searchMoves.length === 1), 'Tal does not compare unrelated winning alternatives');
  for (const config of [
    { different: true, best: cp(10), chosen: cp(-1), accepted: cp(0) },
    { different: true, best: cp(50), chosen: cp(0), accepted: cp(0) },
    { accepted: cp(-1) }, { accepted: cp(-100) }, { best: cp(200), accepted: cp(100) }, { fail: true }, { depth: 8 },
  ]) assert.equal((await verifySoundSacrifice(pawn, base(pawn), base(pawn), scripted(pawn, config).engine, { nodes: 600_000 })).brilliant, false, 'A losing, substantially inferior, unverified or shallow offer cannot signal');

  assert.equal((await verifySoundSacrifice(pawn, base(pawn, cp(200)), base(pawn, cp(200)), scripted(pawn, { best: cp(200), accepted: cp(120) }).engine, { nodes: 600_000 })).brilliant, true, 'Exactly80cp acceptance drift remains inside the explicit verification tolerance');

  const greekFen = 'r4rk1/1b2bppp/ppq1p3/2ppB2n/5P2/1P1BP3/P1PPQ1PP/R4RK1 w - - 0 15';
  const greek = inspectSoundSacrifice(greekFen, 'd3h7')!;
  const winning = scripted(greek, { best: cp(500), accepted: cp(500) });
  assert.equal((await verifySoundSacrifice(greek, base(greek, cp(500)), base(greek, cp(500)), winning.engine, { nodes: 600_000 })).brilliant, true);
  assert.equal(winning.calls.length, 2, 'A winning offer does not need uniqueness or a separate best-alternative search');

  const drawn = inspectSoundSacrifice('k7/8/1Q6/8/8/8/8/K7 w - - 0 1', 'b6b7')!;
  assert(new Chess(drawn.acceptances[0].fenAfterAcceptance).isDraw());
  assert.equal((await verifySoundSacrifice(drawn, base(drawn, cp(0)), base(drawn, cp(0)), scripted(drawn, { best: cp(0) }).engine, { nodes: 600_000 })).brilliant, true, 'A terminal draw is handled as exact equality rather than asking an engine to move in a finished game');
  assert.equal((await verifySoundSacrifice(drawn, base(drawn, cp(200)), base(drawn, cp(200)), scripted(drawn, { best: cp(200) }).engine, { nodes: 600_000 })).brilliant, false, 'Do not exchange a verified winning advantage for a drawn acceptance');
  const canceled = new AbortController(); canceled.abort();
  await assert.rejects(verifySoundSacrifice(pawn, base(pawn), base(pawn), near.engine, { nodes: 600_000, signal: canceled.signal }), { name: 'AbortError' });

  const engine = new NodeEngine();
  try {
    for (const c of [pawn, exchange]) {
      const before = await engine.analyze(c.fenBefore, { nodes: 600_000 });
      const chosen = before.bestMove === c.uci ? before : await engine.analyze(c.fenBefore, { nodes: 600_000, searchMoves: [c.uci] });
      assert.equal((await verifySoundSacrifice(c, before, chosen, engine, { nodes: 600_000 })).brilliant, true, 'Actual Stockfish confirms a pawn and an exchange offer with adequate compensation');
      assert.equal((await verifyBrilliantMove(c, before, chosen, engine, { nodes: 600_000 })).brilliant, false, 'Tal positives do not silently redefine the website brilliant badge');
    }
    const unsound = inspectSoundSacrifice('rnbq1rk1/ppp1bppp/3ppn2/8/3P4/3BPN2/PPP2PPP/RNBQ1RK1 w - - 0 7', 'd3h7')!;
    const before = await engine.analyze(unsound.fenBefore, { nodes: 600_000 });
    const chosen = await engine.analyze(unsound.fenBefore, { nodes: 600_000, searchMoves: [unsound.uci] });
    assert.equal((await verifySoundSacrifice(unsound, before, chosen, engine, { nodes: 600_000 })).brilliant, false, 'An actual refuted piece offer remains rejected');
  } finally { engine.dispose(); }
  console.log('Sound sacrifices: pawn/exchange scope, fair trades/forced exclusions, compensated near-best alternatives, strict nonnegative floor, verified acceptances, winning-vs-drawn handling, cancellation, website independence and actual WASM passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
