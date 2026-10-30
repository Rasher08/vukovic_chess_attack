import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { auditAutoAttempt, preparedPuzzleReply, evaluateEngineChange, type EngineLike, type EngineResult } from '../src/lib/autoTraining';

const cp = (value: number) => ({ kind: 'cp' as const, value });
const mate = (value: number) => ({ kind: 'mate' as const, value });
assert.equal(evaluateEngineChange(cp(160), cp(81)).classification, 'sound');
assert.equal(evaluateEngineChange(cp(160), cp(80)).classification, 'inaccuracy');
assert.equal(evaluateEngineChange(cp(200), cp(0)).classification, 'mistake');
assert.equal(evaluateEngineChange(cp(1000), cp(600)).classification, 'sound', 'another winning line is valid');
assert.deepEqual(evaluateEngineChange(mate(2), mate(10)), { lossCp: null, classification: 'sound' });
assert.equal(evaluateEngineChange(mate(3), cp(0)).classification, 'mistake');
assert.equal(evaluateEngineChange(cp(100), mate(-2)).classification, 'mistake');
assert.equal(evaluateEngineChange(null, cp(0)).classification, 'unverified');

function fakeEngine(chosenScore = 100, fail = false) {
  const calls: { fen: string; forced?: string[] }[] = [];
  const engine: EngineLike = { async analyze(fen, options) {
    calls.push({ fen, forced: options?.searchMoves });
    if (fail) throw new Error('offline');
    const game = new Chess(fen);
    const legal = game.moves({ verbose: true });
    const first = legal[0];
    const bestMove = options?.searchMoves?.[0] || `${first.from}${first.to}${first.promotion || ''}`;
    const result: EngineResult = { bestMove, score: cp(options?.searchMoves ? chosenScore : 100), pv: [bestMove], depth: 12 };
    return result;
  } };
  return { engine, calls };
}
async function run() {
  const exercise = { initialFen: new Chess().fen(), solutionSan: ['e4', 'e5', 'Nf3', 'Nc6'] };
  const played = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];
  const good = fakeEngine();
  assert.equal((await auditAutoAttempt(exercise, played, good.engine)).outcome, 'passed');
  assert.equal(good.calls.length, 4);
  assert.equal(good.calls[0].fen, good.calls[1].fen, 'compare forced and best move from same root');
  assert.deepEqual(good.calls[1].forced, ['e2e4']);
  assert.equal((await auditAutoAttempt(exercise, played, fakeEngine(-120).engine)).outcome, 'needs-review');
  assert.equal((await auditAutoAttempt(exercise, played.slice(0, 2), fakeEngine().engine)).outcome, 'incomplete');
  assert.equal((await auditAutoAttempt(exercise, played.slice(0, 3), fakeEngine().engine)).outcome, 'incomplete', 'last opponent reply is required');
  assert.equal((await auditAutoAttempt(exercise, played, fakeEngine(100, true).engine)).outcome, 'unverified');
  assert.equal((await auditAutoAttempt(exercise, played, fakeEngine().engine, { decisionCorrect: false })).outcome, 'needs-review');
  await assert.rejects(auditAutoAttempt(exercise, ['e2e5'], fakeEngine().engine));
  const blackGame = new Chess(); blackGame.move('e4');
  const black = { initialFen: blackGame.fen(), solutionSan: ['e5', 'Nf3'] };
  const blackAudit = await auditAutoAttempt(black, ['e7e5', 'g1f3'], fakeEngine(-120).engine);
  assert.equal(blackAudit.moves[0].san, 'e5');
  assert.equal(blackAudit.moves[0].lossCp, 220, 'Black POV must not be negated');
  assert.equal(blackAudit.outcome, 'needs-review');
  const checkmate = { initialFen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', solutionSan: ['Qg7#', 'Kh8', 'Qg7#'] };
  assert.equal((await auditAutoAttempt(checkmate, ['f7g7'], fakeEngine().engine)).outcome, 'passed', 'early checkmate completes attempt');
  console.log('Auto training: same-root grading, thresholds, winning alternatives, mate, Black POV, horizon, illegal moves and failed analysis passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

const preparedExercise = { initialFen: new Chess().fen(), solutionSan: ['e4', 'e5', 'Nf3', 'Nc6'], trainingMeta: {} };
const preparedBoard = new Chess(); preparedBoard.move('e4');
assert.equal(preparedPuzzleReply(preparedExercise, preparedBoard.fen()), 'e7e5');
preparedBoard.move('c5'); preparedBoard.move('Nf3');
assert.equal(preparedPuzzleReply(preparedExercise, preparedBoard.fen()), null, 'deviation must use actual-position engine');
assert.equal(preparedPuzzleReply({ ...preparedExercise, trainingMeta: undefined }, new Chess().fen()), null);
