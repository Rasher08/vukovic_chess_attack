import assert from 'node:assert/strict';
import LZString from 'lz-string';
import {
  COURSE_PROGRESS_KEY, COURSE_PROGRESS_EVENT, appendAutoHistory,
  loadCourseProgress, noteAutoAuditViewed, restartAutoAttempt, saveCourseProgress,
  type AutoAttempt, type CourseProgress, type ExerciseProgress,
} from '../src/lib/courseProgress';
import type { AutoAudit } from '../src/lib/autoTraining';
import { deriveTrainingState } from '../src/lib/trainingSchedule';

class TestStorage {
  values = new Map<string, string>();
  failWrites = false;
  writes = 0;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    this.values.set(key, value); this.writes += 1;
  }
}
const storage = new TestStorage();
let events = 0;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', { configurable: true, value: {
  localStorage: storage,
  dispatchEvent(event: Event) { assert.equal(event.type, COURSE_PROGRESS_EVENT); events += 1; return true; },
} });
const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const audit: AutoAudit = {
  outcome: 'passed', moves: [{
    ply: 1, san: 'e4', fenBefore: fen,
    fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    bestSan: 'e4', bestLineSan: ['e4', 'e5', 'Nf3', 'Nc6'], lossCp: 0,
    classification: 'sound', beforeCp: 32, afterCp: 32,
  }], playedOwnMoves: 3, requiredOwnMoves: 3, maxLossCp: 0,
  summary: 'План проведён. Удержаны активность фигур и безопасность короля.',
  terminalResult: null, limits: 'Stockfish 19 Lite, один поток; 300 000 узлов на поиск.',
};
function attempt(exerciseId = 'unicode-position', serial = 0): AutoAttempt {
  return {
    id: exerciseId + '-attempt-' + serial, exerciseId, chapterId: 'training',
    initialFen: fen, moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'],
    planLocked: true, phase: 'completed', createdAt: 1000 + serial * 1000,
    updatedAt: 1500 + serial * 1000, assisted: false, isFirstAttempt: serial === 0,
    sessionId: 'session-' + serial, sessionKind: serial ? 'review' : 'diagnostic',
    preparation: { candidates: 'Сравниваю Сxh7+ и Кg5 — ♞♔', defense: 'Проверяю ...Крg6 и отказ от жертвы.', evaluation: 'Инициатива, затем выигрыш фигуры. 🙂' },
    audit: structuredClone(audit),
  };
}
function exercise(record = attempt()): ExerciseProgress {
  return {
    status: 'solved', updatedAt: record.updatedAt, autoAttempt: record,
    autoHistory: appendAutoHistory([], record),
    firstAttemptResult: { attemptId: record.id, outcome: 'passed', independent: true, completedAt: record.updatedAt },
  };
}
function fixture(record = attempt()): CourseProgress {
  return { version: 1, exercises: { [record.exerciseId]: exercise(record) }, lastChapterId: 'training', lastExerciseId: record.exerciseId };
}

try {
  // Restart while the opponent/audit is pending, without evaluating or erasing the abandoned line.
  const playing = attempt('restart');
  playing.answerRevealed = true;
  playing.phase = 'active'; playing.audit = undefined; playing.moves = ['e2e4'];
  const restartProgress: CourseProgress = { version: 1, exercises: { restart: { status: 'review', updatedAt: playing.updatedAt, autoAttempt: playing } } };
  const restartSnapshot = JSON.stringify(restartProgress);
  const request = { exerciseId: 'restart', attemptId: playing.id, nextAttemptId: 'retry-1', requiredOwnMoves: 3, now: 5000 };
  const restarted = restartAutoAttempt(restartProgress, request)!;
  assert.equal(JSON.stringify(restartProgress), restartSnapshot, 'Restart must not mutate the loaded progress');
  const retry = restarted.exercises.restart.autoAttempt!;
  assert.deepEqual(retry.moves, []);
  assert.equal(retry.initialFen, playing.initialFen);
  assert.equal(retry.phase, 'active'); assert.equal(retry.audit, undefined);
  assert.equal(retry.planLocked, true); assert.deepEqual(retry.preparation, playing.preparation);
  assert.equal(retry.sessionId, playing.sessionId); assert.equal(retry.sessionKind, playing.sessionKind);
  assert.equal(retry.assisted, true); assert.equal(retry.isFirstAttempt, false);
  assert.equal(retry.answerRevealed, false, 'A retry must hide a previously opened answer');
  assert.deepEqual(restarted.exercises.restart.autoHistory![0].moves, ['e2e4']);
  assert.equal(restarted.exercises.restart.autoHistory![0].audit.outcome, 'incomplete');
  assert.equal(restarted.exercises.restart.firstAttemptResult!.independent, false);
  assert.equal(restarted.exercises.restart.status, 'review');
  assert.equal(restartAutoAttempt(restarted, request), null, 'A stale restart cannot overwrite a newer attempt');
  assert.equal(restartAutoAttempt(restartProgress, { ...request, nextAttemptId: playing.id }), null);
  const retryCompleted = { ...retry, phase: 'completed' as const, audit, updatedAt: 6000 };
  const withRetry = appendAutoHistory(restarted.exercises.restart.autoHistory, retryCompleted);
  assert.equal(withRetry.length, 2);
  const state = deriveTrainingState(withRetry.map(record => ({ ...record, outcome: record.audit.outcome, sessionKind: record.sessionKind! })), 6000);
  assert.equal(state.successfulReviews, 0); assert.equal(state.mastered, false, 'A restart cannot award independent recall');
  assert.equal(restarted.exercises.restart.firstAttemptResult!.outcome, 'incomplete', 'Passing a retry cannot erase the first result');
  const finished = fixture();
  const finishedRestart = restartAutoAttempt(finished, { ...request, exerciseId: 'unicode-position', attemptId: finished.exercises['unicode-position'].autoAttempt!.id })!;
  assert.deepEqual(finishedRestart.exercises['unicode-position'].firstAttemptResult, finished.exercises['unicode-position'].firstAttemptResult);
  assert.deepEqual(finishedRestart.exercises['unicode-position'].autoHistory, finished.exercises['unicode-position'].autoHistory);
  assert.equal(finishedRestart.exercises['unicode-position'].status, 'solved', 'A restart must preserve previously earned progress');
  assert.equal(saveCourseProgress(restarted), true);
  assert.deepEqual(loadCourseProgress().exercises.restart.autoAttempt, JSON.parse(JSON.stringify(retry)), 'Reload restores the initial board and retry marker');

  // Existing uncompressed JSON remains readable and small writes remain JSON.
  const legacy = fixture();
  storage.setItem(COURSE_PROGRESS_KEY, JSON.stringify(legacy));
  assert.deepEqual(loadCourseProgress().exercises['unicode-position'].autoAttempt, legacy.exercises['unicode-position'].autoAttempt);
  assert.equal(saveCourseProgress(legacy), true);
  assert.ok(storage.getItem(COURSE_PROGRESS_KEY)!.startsWith('{'));
  const firstRead = loadCourseProgress();
  firstRead.exercises['unicode-position'].autoAttempt!.moves[0] = 'd2d4';
  firstRead.exercises['unicode-position'].autoHistory![0].audit.outcome = 'needs-review';
  firstRead.exercises['unicode-position'].firstAttemptResult!.independent = false;
  const secondRead = loadCourseProgress();
  assert.equal(secondRead.exercises['unicode-position'].autoAttempt!.moves[0], 'e2e4');
  assert.equal(secondRead.exercises['unicode-position'].autoHistory![0].audit.outcome, 'passed');
  assert.equal(secondRead.exercises['unicode-position'].firstAttemptResult!.independent, true);

  // Append snapshots detach mutable preparation/moves/audit from the original attempt.
  const original = attempt('append');
  const history = appendAutoHistory([], original);
  const snapshot = JSON.stringify(history);
  original.moves[0] = 'd2d4'; original.preparation!.candidates = 'изменено';
  original.audit!.outcome = 'needs-review';
  assert.equal(JSON.stringify(history), snapshot);
  assert.equal(appendAutoHistory(history, original), history, 'The first result for an attempt ID is immutable');
  const next = appendAutoHistory(history, attempt('append', 1));
  assert.equal(history.length, 1); assert.equal(next.length, 2);
  assert.equal(next[1].preparation, undefined, 'Only the first preparation is retained in compact history');

  // Unicode roundtrip with 480 positions, five records each, and 800-character
  // first preparations. Distinct deterministic text avoids an unrealistically
  // identical preparation for every position.
  let seed = 872391;
  const alphabet = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  function text(length: number) {
    let value = '';
    for (let index = 0; index < length; index += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      value += alphabet[seed % alphabet.length];
    }
    return value;
  }
  const large: CourseProgress = { version: 1, exercises: {} };
  for (let position = 0; position < 480; position += 1) {
    const id = 'bank-' + position;
    const records = Array.from({ length: 5 }, (_, serial) => {
      const record = attempt(id, serial);
      record.preparation = { candidates: text(240), defense: text(320), evaluation: text(240) };
      record.audit!.moves = Array.from({ length: 5 }, (_, index) => ({ ...record.audit!.moves[0], ply: 1 + index * 2, bestLineSan: [...record.audit!.moves[0].bestLineSan] }));
      return record;
    });
    large.exercises[id] = {
      ...exercise(records[4]),
      firstAttemptResult: { attemptId: records[0].id, outcome: 'passed', independent: true, completedAt: records[0].updatedAt },
      autoHistory: records.reduce((result, record) => appendAutoHistory(result, record), [] as ReturnType<typeof appendAutoHistory>),
      revealedAt: [2000, 100000, 200000],
    };
  }
  assert.ok(JSON.stringify(large).length > 100_000);
  assert.equal(saveCourseProgress(large), true);
  const compressed = storage.getItem(COURSE_PROGRESS_KEY)!;
  assert.ok(compressed.startsWith('lz1:'));
  const utf16Bytes = (compressed.length + COURSE_PROGRESS_KEY.length) * 2;
  assert.ok(utf16Bytes < 3 * 1024 * 1024, 'All 480 × 5 records must fit within 3 MiB UTF-16 storage');
  const roundtrip = loadCourseProgress();
  assert.equal(Object.keys(roundtrip.exercises).length, 480);
  assert.deepEqual(roundtrip.exercises['bank-201'].autoHistory, JSON.parse(JSON.stringify(large.exercises['bank-201'].autoHistory)));
  assert.deepEqual(roundtrip.exercises['bank-201'].autoAttempt, large.exercises['bank-201'].autoAttempt);
  assert.equal(roundtrip.exercises['bank-201'].autoHistory![0].preparation!.candidates.length
    + roundtrip.exercises['bank-201'].autoHistory![0].preparation!.defense.length
    + roundtrip.exercises['bank-201'].autoHistory![0].preparation!.evaluation.length, 800);

  // Unchanged raw values decode once; parsed results remain independent objects.
  storage.setItem(COURSE_PROGRESS_KEY, JSON.stringify(legacy)); loadCourseProgress();
  const originalDecompress = LZString.decompressFromUTF16;
  let decompressions = 0;
  LZString.decompressFromUTF16 = (value: string) => { decompressions += 1; return originalDecompress(value); };
  try {
    storage.setItem(COURSE_PROGRESS_KEY, compressed);
    const loaded = loadCourseProgress();
    loaded.exercises['bank-0'].autoAttempt!.preparation!.evaluation = 'mutated';
    loadCourseProgress(); loadCourseProgress();
    assert.equal(decompressions, 1);
    assert.notEqual(loadCourseProgress().exercises['bank-0'].autoAttempt!.preparation!.evaluation, 'mutated');
  } finally { LZString.decompressFromUTF16 = originalDecompress; }

  // A failed write never removes/replaces the preceding raw value or emits success.
  const eventsBeforeFailure = events;
  storage.failWrites = true;
  assert.equal(saveCourseProgress(legacy), false);
  assert.equal(storage.getItem(COURSE_PROGRESS_KEY), compressed);
  assert.equal(events, eventsBeforeFailure);
  assert.equal(Object.keys(loadCourseProgress().exercises).length, 480);
  storage.failWrites = false;

  // Only an audited, completed, matching attempt records a view. StrictMode's
  // immediate duplicate is idempotent; later reopening creates a new exposure.
  saveCourseProgress(legacy);
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    const writesBeforeView = storage.writes;
    assert.equal(noteAutoAuditViewed('missing', 'missing'), false);
    assert.equal(noteAutoAuditViewed('unicode-position', 'wrong-id'), false);
    assert.equal(noteAutoAuditViewed('unicode-position', legacy.exercises['unicode-position'].autoAttempt!.id), true);
    now += 999;
    assert.equal(noteAutoAuditViewed('unicode-position', legacy.exercises['unicode-position'].autoAttempt!.id), true);
    assert.equal(storage.writes - writesBeforeView, 1);
    now += 1;
    assert.equal(noteAutoAuditViewed('unicode-position', legacy.exercises['unicode-position'].autoAttempt!.id), true);
    const viewed = loadCourseProgress().exercises['unicode-position'];
    assert.deepEqual(viewed.revealedAt, [1_000_000, 1_001_000]);
    assert.deepEqual(viewed.autoHistory, legacy.exercises['unicode-position'].autoHistory);
    assert.deepEqual(viewed.firstAttemptResult, legacy.exercises['unicode-position'].firstAttemptResult);
    assert.equal(viewed.autoAttempt!.updatedAt, legacy.exercises['unicode-position'].autoAttempt!.updatedAt);
    for (const changes of [{ phase: 'active' as const }, { audit: { ...audit, outcome: 'unverified' as const } }, { audit: undefined }]) {
      const invalid = fixture({ ...attempt(), ...changes });
      saveCourseProgress(invalid);
      assert.equal(noteAutoAuditViewed('unicode-position', invalid.exercises['unicode-position'].autoAttempt!.id), false);
      assert.deepEqual(loadCourseProgress().exercises['unicode-position'].revealedAt, []);
    }
    saveCourseProgress(legacy); storage.failWrites = true;
    const rawBeforeView = storage.getItem(COURSE_PROGRESS_KEY);
    assert.equal(noteAutoAuditViewed('unicode-position', legacy.exercises['unicode-position'].autoAttempt!.id), false);
    assert.equal(storage.getItem(COURSE_PROGRESS_KEY), rawBeforeView);
    storage.failWrites = false;
  } finally { Date.now = realNow; }

  storage.setItem(COURSE_PROGRESS_KEY, '{"version":1,"exercises":{"finite":{"status":"review","updatedAt":1,"revealedAt":[1,null,"2",1e999,3],"reviewedAt":1e999},"invalid":{"status":"review","updatedAt":1e999}}}');
  assert.deepEqual(loadCourseProgress().exercises.finite.revealedAt, [1, 3]);
  assert.equal(loadCourseProgress().exercises.finite.reviewedAt, undefined);
  assert.equal(loadCourseProgress().exercises.invalid, undefined);
  storage.setItem(COURSE_PROGRESS_KEY, 'lz1:broken');
  assert.deepEqual(loadCourseProgress(), { version: 1, exercises: {} });

  console.log(`Course progress: legacy, Unicode compression/cache isolation, immutable history, quota retention, audit exposures passed. 480 × 5 records: ${utf16Bytes} UTF-16 bytes.`);
} finally {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
}
