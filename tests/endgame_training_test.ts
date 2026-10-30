import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { auditEndgameAttempt, chooseEndgameReply, endgameTerminalResult, replayEndgame, type EndgameSpec } from '../src/lib/endgameTraining';
import { EndgameTablebaseClient, parseEndgameTablebase, tablebaseOutcome, type EndgameTablebaseLike, type EndgameTablebasePosition } from '../src/lib/endgameTablebase';
import type { EngineLike, EngineResult } from '../src/lib/autoTraining';

// Synthetic tablebase fixtures test protocol and POV, not these positions' real WDL.
const initial = '7k/6p1/8/8/8/8/PP6/KR5r w - - 0 1';
const uci = (move: { from: string; to: string; promotion?: string }) => move.from + move.to + (move.promotion || '');
function fakePosition(fen: string, category: EndgameTablebasePosition['category'] = 'draw'): EndgameTablebasePosition {
  return { fen, category, dtz: 0, moves: new Chess(fen).moves({ verbose: true }).map(move => ({ uci: uci(move), san: move.san, category: category === 'win' ? 'loss' : category === 'loss' ? 'win' : 'draw', dtz: 0 })) };
}
const drawTable: EndgameTablebaseLike = { async probe(fen) { return fakePosition(fen); } };
const winTable: EndgameTablebaseLike = { async probe(fen) { return fakePosition(fen, new Chess(fen).turn() === 'w' ? 'win' : 'loss'); } };
const blackWinTable: EndgameTablebaseLike = { async probe(fen) { return fakePosition(fen, new Chess(fen).turn() === 'b' ? 'win' : 'loss'); } };
const forbidden: EngineLike = { async analyze() { throw new Error('Engine must not be needed for complete tablebase proof'); } };
const engine: EngineLike = { async analyze(fen, options) {
  const bestMove = options?.searchMoves?.[options.searchMoves.length - 1] || uci(new Chess(fen).moves({ verbose: true })[0]);
  return { bestMove, pv: [bestMove], score: { kind: 'cp', value: 0 }, depth: 15 };
} };
function quietTrace(plies: number): string[] {
  const board = new Chess(initial); const result: string[] = []; const seen = new Set([board.fen().split(' ').slice(0, 4).join(' ')]);
  for (let ply = 0; ply < plies; ply += 1) {
    const candidates = board.moves({ verbose: true }).filter(move => !move.captured && move.piece !== 'p');
    const chosen = candidates.find(move => { const test = new Chess(board.fen()); test.move(move.san); return !test.isGameOver() && !seen.has(test.fen().split(' ').slice(0, 4).join(' ')); });
    assert(chosen, 'Fixture must supply a fresh quiet legal position');
    result.push(uci(chosen)); board.move(chosen.san); seen.add(board.fen().split(' ').slice(0, 4).join(' '));
  }
  return result;
}

async function run() {
  const spec: EndgameSpec = { initialFen: initial, playerColor: 'w', goal: 'draw', targetHumanMoves: 16 };
  const trace = quietTrace(32);
  const held = await auditEndgameAttempt(spec, trace, forbidden, { tablebase: drawTable });
  assert.equal(held.outcome, 'passed'); assert.equal(held.playedOwnMoves, 16); assert.equal(held.terminalResult, null);
  assert.equal(held.exactMoves, 16); assert.equal(held.criticalErrors, 0);
  const short = await auditEndgameAttempt(spec, trace.slice(0, 30), forbidden, { tablebase: drawTable });
  assert.equal(short.outcome, 'incomplete', 'Fifteen moves are not sixteen');
  const unanswered = await auditEndgameAttempt(spec, trace.slice(0, 31), forbidden, { tablebase: drawTable });
  assert.equal(unanswered.outcome, 'incomplete', 'The sixteenth human move still requires the opponent reply');
  const approximate = await auditEndgameAttempt(spec, trace, engine, { tablebase: false, nodes: 12345 });
  assert.equal(approximate.outcome, 'incomplete', 'Sixteen roughly equal engine evaluations do not prove a draw');
  const blackHeld = await auditEndgameAttempt({ ...spec, playerColor: 'b' }, quietTrace(33), forbidden, { tablebase: drawTable });
  assert.equal(blackHeld.outcome, 'passed'); assert.equal(blackHeld.playedOwnMoves, 16, 'Black can start after an opening computer reply');
  const notConverted = await auditEndgameAttempt({ ...spec, goal: 'win' }, trace, forbidden, { tablebase: winTable });
  assert.equal(notConverted.outcome, 'incomplete', 'Preserving a win is not converting it');

  const mateSpec: EndgameSpec = { initialFen: '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', playerColor: 'w', goal: 'win' };
  const mate = await auditEndgameAttempt(mateSpec, ['g6g7'], forbidden, { tablebase: winTable });
  assert.equal(mate.outcome, 'passed'); assert.equal(mate.terminalResult, 'won');
  assert.equal(endgameTerminalResult(replayEndgame(mateSpec, ['g6g7']), 'b'), 'lost');
  assert.throws(() => replayEndgame(mateSpec, ['g6g7', 'h8h7']), /завершения/);
  assert.throws(() => replayEndgame(spec, ['b1b8']), /Invalid move/);

  const fifty: EndgameSpec = { ...spec, initialFen: initial.replace(' 0 1', ' 99 1'), goal: 'win' };
  const quiet = quietTrace(1)[0];
  const lostWin = await auditEndgameAttempt(fifty, [quiet], forbidden, { tablebase: winTable });
  assert.equal(lostWin.terminalResult, 'draw'); assert.equal(lostWin.outcome, 'needs-review');
  assert.equal(lostWin.moves[0].afterOutcome, 0, 'Actual fifty-move draw overrides a FEN-only child claim');
  const defended = await auditEndgameAttempt({ ...fifty, goal: 'draw' }, [quiet], forbidden, { tablebase: drawTable });
  assert.equal(defended.outcome, 'passed', 'An actual draw can finish before sixteen own moves');

  const blackSpec: EndgameSpec = { initialFen: initial.replace(' w ', ' b '), playerColor: 'b', goal: 'win' };
  const blackMove = uci(new Chess(blackSpec.initialFen).moves({ verbose: true })[0]);
  const black = await auditEndgameAttempt(blackSpec, [blackMove], forbidden, { tablebase: blackWinTable });
  assert.equal(black.moves[0].beforeOutcome, 1); assert.equal(black.moves[0].afterOutcome, 1); assert.equal(black.moves[0].classification, 'sound');
  const repeated = { ...spec, initialFen: initial.replace(' w ', ' b '), goal: 'win' as const };
  const repetition = await auditEndgameAttempt(repeated, ['h1h2', 'b1c1', 'h2h1', 'c1b1', 'h1h2', 'b1c1', 'h2h1', 'c1b1'], forbidden, { tablebase: winTable });
  assert.equal(repetition.terminalResult, 'draw'); assert.equal(repetition.moves.at(-1)!.classification, 'mistake', 'Threefold history overrides a winning FEN-only tablebase claim');

  const human = trace[0]; const alternative = new Chess(initial).moves({ verbose: true }).map(uci).find(move => move !== human)!;
  const evaluation = (playedScore: number): EngineLike => ({ async analyze(_fen, options) {
    const chosen = options?.searchMoves?.[0];
    return { bestMove: chosen || alternative, score: { kind: 'cp', value: chosen ? playedScore : 350 }, pv: [chosen || alternative], depth: 18 };
  } });
  const strongAlternative = await auditEndgameAttempt({ ...spec, goal: 'win' }, trace.slice(0, 2), evaluation(220), { tablebase: false });
  assert.equal(strongAlternative.moves[0].classification, 'sound'); assert.equal(strongAlternative.outcome, 'incomplete');
  const lostAdvantage = await auditEndgameAttempt({ ...spec, goal: 'win' }, trace.slice(0, 2), evaluation(50), { tablebase: false });
  assert.equal(lostAdvantage.moves[0].classification, 'mistake'); assert.equal(lostAdvantage.outcome, 'needs-review');
  const mateZero: EngineLike = { async analyze(fen) { const move = uci(new Chess(fen).moves({ verbose: true })[0]); return { bestMove: move, pv: [move], depth: 15, score: { kind: 'mate', value: 0 } }; } };
  await assert.rejects(chooseEndgameReply({ ...spec, playerColor: 'b' }, [], mateZero, { tablebase: false }), /не подтвердил/);
  const badAudit = await auditEndgameAttempt(spec, trace.slice(0, 2), mateZero, { tablebase: false });
  assert.equal(badAudit.outcome, 'unverified');

  const position = fakePosition(initial);
  assert(parseEndgameTablebase(initial, position));
  assert.equal(parseEndgameTablebase(initial, { ...position, moves: position.moves.slice(1) }), null);
  assert.equal(parseEndgameTablebase(initial, { ...position, moves: position.moves.map((move, index) => index ? move : { ...move, uci: 'a1a8' }) }), null);
  assert.equal(parseEndgameTablebase(initial, { ...position, moves: position.moves.map((move, index) => index ? move : { ...move, san: 'Fake' }) }), null);
  assert.equal(parseEndgameTablebase(initial, { ...position, category: 'win' }), null, 'A winning root needs a preserving losing child');
  for (const category of ['unknown', 'maybe-win', 'maybe-loss', 'syzygy-win', 'syzygy-loss'] as const) assert.equal(tablebaseOutcome(category), null);
  assert.equal(tablebaseOutcome('cursed-win'), 0); assert.equal(tablebaseOutcome('blessed-loss'), 0);

  let replyOptions: string[] | undefined;
  const restricted: EngineLike = { async analyze(fen, options) { replyOptions = options?.searchMoves; return engine.analyze(fen, options); } };
  const reply = await chooseEndgameReply({ ...spec, playerColor: 'b' }, [], restricted, { tablebase: drawTable });
  assert(replyOptions && replyOptions.length > 1); assert.equal(reply.uci, replyOptions[replyOptions.length - 1]);
  assert.equal(reply.exact, true, 'An alternative preserving move is accepted instead of a predetermined first line');
  const winningReply = await chooseEndgameReply({ ...spec, playerColor: 'b' }, [], forbidden, { tablebase: winTable });
  assert.equal(winningReply.source, 'tablebase'); assert.equal(winningReply.uci, fakePosition(initial, 'win').moves[0].uci);
  await assert.rejects(chooseEndgameReply(spec, [], engine), /ход ученика/);

  let requests = 0;
  const client = new EndgameTablebaseClient({ minIntervalMs: 0, fetcher: (async (url: string | URL | Request) => {
    requests += 1; const fen = new URL(String(url)).searchParams.get('fen')!;
    return new Response(JSON.stringify(fakePosition(fen)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch });
  const [cachedA, cachedB] = await Promise.all([client.probe(initial), client.probe(initial)]);
  assert.equal(requests, 1, 'Concurrent same-position requests are serialized and cached');
  cachedA!.moves[0].uci = 'bad'; assert.notEqual((await client.probe(initial))!.moves[0].uci, 'bad'); assert.notEqual(cachedB!.moves[0].uci, 'bad');
  await client.probe(initial.replace(' 0 1', ' 1 1')); assert.equal(requests, 2, 'The fifty-move counter belongs in the cache key');
  let rateRequests = 0;
  const limited = new EndgameTablebaseClient({ minIntervalMs: 0, fetcher: (async () => { rateRequests += 1; return new Response(null, { status: 429 }); }) as typeof fetch });
  assert.equal(await limited.probe(initial), null); assert.equal(await limited.probe(initial.replace(' 0 1', ' 1 1')), null); assert.equal(rateRequests, 1, '429 triggers a minute cooldown, not a rapid retry loop');
  const originalNow = Date.now; let fakeNow = originalNow(); let advisedRequests = 0;
  Date.now = () => fakeNow;
  try {
    const advised = new EndgameTablebaseClient({ minIntervalMs: 0, fetcher: (async () => { advisedRequests += 1; return new Response(null, { status: 429, headers: { 'Retry-After': '120' } }); }) as typeof fetch });
    await advised.probe(initial); fakeNow += 61_000; await advised.probe(initial); assert.equal(advisedRequests, 1, 'A longer Retry-After must be respected');
    fakeNow += 60_000; await advised.probe(initial); assert.equal(advisedRequests, 2);
  } finally { Date.now = originalNow; }
  assert.throws(() => new EndgameTablebaseClient({ minIntervalMs: -1 }), /интервал/);
  const cancelled = new AbortController();
  const never: EngineLike = { analyze() { return new Promise<EngineResult>(() => undefined); } };
  const waiting = chooseEndgameReply({ ...spec, playerColor: 'b' }, [], never, { tablebase: false, signal: cancelled.signal });
  cancelled.abort(); await assert.rejects(waiting, { name: 'AbortError' });
  const auditAbort = new AbortController();
  const blockedAudit = auditEndgameAttempt(spec, trace.slice(0, 2), never, { tablebase: false, signal: auditAbort.signal });
  auditAbort.abort(); await assert.rejects(blockedAudit, { name: 'AbortError' });
  console.log('Endgame training: exact alternative WDL, Black POV, terminal conversion, sixteen-pair draw proof, unknown/fallback safeguards, fifty-move history, API validation/cache/rate-limit and cancellation passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
