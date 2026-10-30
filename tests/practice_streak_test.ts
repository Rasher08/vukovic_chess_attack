import assert from 'node:assert/strict';
import { getPracticeStreak, practiceDayNumber } from '../src/lib/practiceStreak';
import type { AutoAttempt, AutoAttemptHistory, CourseProgress } from '../src/lib/courseProgress';

const time = (date: string) => Date.parse(date);
function history(id: string, date: string, outcome: AutoAttemptHistory['audit']['outcome'] = 'passed', assisted = false): AutoAttemptHistory {
  const completedAt = time(date);
  return {
    id, exerciseId: 'one', createdAt: completedAt - 1000, updatedAt: completedAt, completedAt,
    assisted, moves: ['e2e4'], themeVisible: false,
    audit: { outcome, maxLossCp: null, playedOwnMoves: 1, requiredOwnMoves: 1 },
  };
}
function progress(records: AutoAttemptHistory[]): CourseProgress {
  return { version: 1, exercises: { one: { status: 'review', updatedAt: 0, autoHistory: records } } };
}
const result = (records: AutoAttemptHistory[], now: string) => getPracticeStreak(progress(records), time(now));

assert.deepEqual(result([], '2026-10-24T12:00:00Z'), { currentDays: 0, longestDays: 0, todayComplete: false });
const consecutive = [history('a', '2026-10-22T10:00:00Z'), history('b', '2026-10-23T10:00:00Z')];
assert.deepEqual(result(consecutive, '2026-10-24T12:00:00Z'), { currentDays: 2, longestDays: 2, todayComplete: false }, 'Yesterday keeps the live streak until today ends');
assert.deepEqual(result([...consecutive, history('c', '2026-10-24T10:00:00Z')], '2026-10-24T12:00:00Z'), { currentDays: 3, longestDays: 3, todayComplete: true });
assert.deepEqual(result(consecutive, '2026-10-25T00:00:00Z'), { currentDays: 0, longestDays: 2, todayComplete: false }, 'A missed Moscow calendar day breaks the current series');
assert.deepEqual(result([...consecutive, history('d', '2026-10-25T10:00:00Z')], '2026-10-25T12:00:00Z'), { currentDays: 1, longestDays: 2, todayComplete: true });
assert.equal(result([history('a', '2026-10-24T10:00:00Z'), history('b', '2026-10-24T11:00:00Z')], '2026-10-24T12:00:00Z').currentDays, 1, 'Several tasks on one day count as one calendar day');

// The Moscow boundary occurs at 21:00 UTC, independently of the machine timezone.
assert.deepEqual(result([history('a', '2026-10-23T20:59:59Z')], '2026-10-23T21:00:00Z'), { currentDays: 1, longestDays: 1, todayComplete: false });
assert.deepEqual(result([history('a', '2026-10-23T21:00:00Z')], '2026-10-24T20:59:59Z'), { currentDays: 1, longestDays: 1, todayComplete: true });
assert.equal(result([history('a', '2026-10-23T20:59:59Z'), history('b', '2026-10-23T21:00:00Z')], '2026-10-24T12:00:00Z').currentDays, 2);
assert.equal(practiceDayNumber(time('2026-10-23T20:59:59Z'))! + 1, practiceDayNumber(time('2026-10-23T21:00:00Z')));
assert.equal(result([history('a', '2026-12-31T10:00:00Z'), history('b', '2027-01-01T10:00:00Z')], '2027-01-01T12:00:00Z').currentDays, 2, 'Year boundary');
assert.equal(result([history('a', '2026-01-31T10:00:00Z'), history('b', '2026-02-01T10:00:00Z')], '2026-02-01T12:00:00Z').currentDays, 2, 'Month boundary');
assert.equal(result([history('a', '2028-02-28T10:00:00Z'), history('b', '2028-02-29T10:00:00Z'), history('c', '2028-03-01T10:00:00Z')], '2028-03-01T12:00:00Z').currentDays, 3, 'Leap day');

assert.equal(result([history('repeat', '2026-10-24T10:00:00Z', 'passed', true)], '2026-10-24T12:00:00Z').todayComplete, true, 'Successful practice repeats count towards daily engagement');
for (const outcome of ['needs-review', 'incomplete', 'unverified'] as const) {
  assert.equal(result([history(outcome, '2026-10-24T10:00:00Z', outcome)], '2026-10-24T12:00:00Z').todayComplete, false, `${outcome} does not satisfy the goal`);
}
assert.equal(result([history('future', '2026-10-24T13:00:00Z')], '2026-10-24T12:00:00Z').todayComplete, false, 'Future timestamps do not count even within today');
assert.equal(getPracticeStreak(progress([{ ...history('invalid', '2026-10-24T10:00:00Z'), completedAt: 1e99 }]), time('2026-10-24T12:00:00Z')).currentDays, 0);

const latest: AutoAttempt = {
  id: 'same', exerciseId: 'one', chapterId: 'training', initialFen: '', moves: [],
  phase: 'completed', planLocked: true, createdAt: time('2026-10-24T10:00:00Z'), updatedAt: time('2026-10-24T10:30:00Z'),
  assisted: false, isFirstAttempt: true,
  audit: { outcome: 'passed', moves: [], playedOwnMoves: 1, requiredOwnMoves: 1, maxLossCp: null, terminalResult: null, summary: '', limits: '' },
};
const legacy = progress([]);
legacy.exercises.one.autoAttempt = latest;
assert.equal(getPracticeStreak(legacy, time('2026-10-24T12:00:00Z')).todayComplete, true, 'Legacy completed snapshot counts');
legacy.exercises.one.autoAttempt = { ...latest, phase: 'active' };
assert.equal(getPracticeStreak(legacy, time('2026-10-24T12:00:00Z')).todayComplete, false, 'Active attempt cannot count');
legacy.exercises.one.autoAttempt = undefined;
legacy.exercises.one.firstAttemptResult = { attemptId: 'same', outcome: 'passed', independent: true, completedAt: time('2026-10-24T10:00:00Z') };
assert.equal(getPracticeStreak(legacy, time('2026-10-24T12:00:00Z')).todayComplete, true, 'Legacy first result counts');
legacy.exercises.one.autoAttempt = { ...latest, updatedAt: time('2026-10-25T10:00:00Z') };
assert.equal(getPracticeStreak(legacy, time('2026-10-25T12:00:00Z')).todayComplete, false, 'A later edit of the same legacy snapshot cannot move its first completion to another day');
legacy.exercises.one.autoHistory = [history('same', '2026-10-23T10:00:00Z', 'incomplete')];
legacy.exercises.one.autoAttempt = latest;
assert.equal(getPracticeStreak(legacy, time('2026-10-24T12:00:00Z')).todayComplete, false, 'Immutable history wins over conflicting latest/first snapshots');
const immutable = progress(consecutive);
const before = JSON.stringify(immutable);
getPracticeStreak(immutable, time('2026-10-24T12:00:00Z'));
assert.equal(JSON.stringify(immutable), before);
const manual = progress([]);
manual.exercises.one.status = 'solved';
manual.exercises.one.updatedAt = time('2026-10-24T10:00:00Z');
assert.equal(getPracticeStreak(manual, time('2026-10-24T12:00:00Z')).todayComplete, false, 'A solved status plus an updated timestamp is not proof of today’s completed task');
manual.exercises.one.manualSolvedAt = [time('2026-10-23T10:00:00Z'), time('2026-10-24T10:00:00Z'), time('2026-10-24T11:00:00Z')];
assert.deepEqual(getPracticeStreak(manual, time('2026-10-24T12:00:00Z')), { currentDays: 2, longestDays: 2, todayComplete: true }, 'Successful manual variants count once per Moscow day');
assert.deepEqual(getPracticeStreak(progress(consecutive), time('2026-10-24T12:00:00Z'), [time('2026-10-24T10:00:00Z')]), { currentDays: 3, longestDays: 3, todayComplete: true }, 'An independently completed endgame extends the same daily series');
assert.deepEqual(getPracticeStreak(progress([]), time('2026-10-24T12:00:00Z'), [NaN, Infinity, 1e99, time('2026-10-25T10:00:00Z')]), { currentDays: 0, longestDays: 0, todayComplete: false }, 'Invalid or future additional completions cannot award a streak');
console.log('Practice streak: Moscow calendar boundaries, yesterday grace, missed days, duplicate attempts, legacy history, successful repeats and failed/future exclusions passed.');
