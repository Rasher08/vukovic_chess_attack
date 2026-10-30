import assert from 'node:assert/strict';
import {
  deriveTrainingState, selectSession, TRAINING_DAY_MS as DAY,
  type TrainingAttemptRecord,
} from '../src/lib/trainingSchedule';

let serial = 0;
function record(day: number, overrides: Partial<TrainingAttemptRecord> = {}): TrainingAttemptRecord {
  serial += 1;
  return { id: `attempt-${serial}`, exerciseId: 'position-a', completedAt: day * DAY, outcome: 'passed', assisted: false, sessionKind: 'review', ...overrides };
}
function schedule(history: TrainingAttemptRecord[], now = 100 * DAY, exposures: number[] = []) {
  const { successfulReviews, nextReviewAt, mastered } = deriveTrainingState(history, now, exposures);
  return { successfulReviews, nextReviewAt, mastered };
}

assert.deepEqual(schedule([]), { successfulReviews: 0, nextReviewAt: null, mastered: false });
const first = record(0, { sessionKind: 'diagnostic' });
assert.deepEqual(schedule([first]), { successfulReviews: 0, nextReviewAt: DAY, mastered: false });
const recalls = [first, record(1), record(4), record(11), record(32)];
assert.equal(schedule(recalls.slice(0, 2)).nextReviewAt, 4 * DAY);
assert.equal(schedule(recalls.slice(0, 3)).nextReviewAt, 11 * DAY);
assert.deepEqual(schedule(recalls.slice(0, 4)), { successfulReviews: 3, nextReviewAt: 32 * DAY, mastered: false });
assert.deepEqual(schedule(recalls), { successfulReviews: 4, nextReviewAt: null, mastered: true });

const immediate = [first, record(0), record(0.2), record(0.99)];
assert.deepEqual(schedule(immediate), { successfulReviews: 0, nextReviewAt: 1.99 * DAY, mastered: false }, 'Immediate repetitions restart the full interval without advancing mastery');
assert.deepEqual(schedule([first, { ...first, completedAt: DAY }]), schedule([first]), 'Duplicate IDs preserve the original record');
assert.deepEqual(schedule([first, record(1, { assisted: true })]), { successfulReviews: 0, nextReviewAt: 2 * DAY, mastered: false }, 'Assisted recall restarts the interval without advancing the stage');
assert.deepEqual(schedule([record(0, { assisted: true })]), { successfulReviews: 0, nextReviewAt: DAY, mastered: false }, 'Assisted exposure schedules a retry but cannot start independent recall');
assert.deepEqual(schedule([first, record(5, { outcome: 'unverified' })]), { successfulReviews: 0, nextReviewAt: 6 * DAY, mastered: false }, 'Unverified play exposes the position, but cannot advance the stage');
assert.equal(schedule([first, record(100)], 100 * DAY).nextReviewAt, 103 * DAY, 'Late recall is scheduled from actual completion');
assert.deepEqual(schedule([first, record(2)], DAY), schedule([first]), 'Future records cannot advance current state');

const failed = [...recalls.slice(0, 4), record(12, { outcome: 'needs-review' })];
assert.deepEqual(schedule(failed), { successfulReviews: 0, nextReviewAt: 13 * DAY, mastered: false });
assert.deepEqual(schedule([...failed, record(12.5)]), { successfulReviews: 0, nextReviewAt: 13.5 * DAY, mastered: false }, 'Early retry restarts the failure cooldown');
assert.deepEqual(schedule([...failed, record(13)]), { successfulReviews: 0, nextReviewAt: 14 * DAY, mastered: false }, 'Relearning establishes a fresh initial solution');
assert.equal(schedule([...recalls, record(33, { outcome: 'incomplete' })]).mastered, false, 'Failure revokes previous mastery');

const beforeLongRecall = recalls.slice(0, 4);
assert.deepEqual(schedule(beforeLongRecall, 40 * DAY, [20 * DAY]), { successfulReviews: 3, nextReviewAt: 41 * DAY, mastered: false }, 'Reopening an audit restarts the current 21-day interval');
assert.deepEqual(schedule([...beforeLongRecall, record(32)], 40 * DAY, [20 * DAY]), { successfulReviews: 3, nextReviewAt: 53 * DAY, mastered: false }, 'A would-be 21-day recall after an intervening exposure cannot count');
assert.equal(schedule([...beforeLongRecall, record(32), record(53)], 60 * DAY, [20 * DAY]).mastered, true, 'A real full interval after the latest exposure qualifies');
assert.deepEqual(schedule(beforeLongRecall, 40 * DAY, [11 * DAY]), schedule(beforeLongRecall), 'The current audit at the completion timestamp cannot invalidate that recall');
assert.deepEqual(schedule([...beforeLongRecall, record(32, { assisted: true })], 40 * DAY), { successfulReviews: 3, nextReviewAt: 53 * DAY, mastered: false }, 'Assisted attempts must restart even long intervals');
const dailyExposures = Array.from({ length: 20 }, (_, index) => (12 + index) * DAY);
assert.equal(schedule([...beforeLongRecall, record(32)], 40 * DAY, dailyExposures).mastered, false, 'Daily audit reading cannot masquerade as a long delayed recall');
assert.equal(schedule([...beforeLongRecall, record(32)], 40 * DAY, dailyExposures).nextReviewAt, 53 * DAY);
assert.deepEqual(schedule([first], DAY, [5 * DAY]), schedule([first]), 'Future exposures must not alter current scheduling');
assert.deepEqual(schedule([], 2 * DAY, [0]), { successfulReviews: 0, nextReviewAt: DAY, mastered: false });
assert.equal(deriveTrainingState(beforeLongRecall, 40 * DAY, [20 * DAY]).lastExposureAt, 20 * DAY);
const exposures = [20 * DAY, 2 * DAY, 10 * DAY];
const exposureSnapshot = JSON.stringify(exposures);
deriveTrainingState(beforeLongRecall, 40 * DAY, exposures);
assert.equal(JSON.stringify(exposures), exposureSnapshot, 'Exposures must never be sorted in place');

const input = [record(4), first, record(1)];
const snapshot = JSON.stringify(input);
const result = deriveTrainingState(input, 5 * DAY);
assert.equal(JSON.stringify(input), snapshot, 'Deriving state must not sort or mutate input history');
assert.deepEqual(result.history.map((item) => item.completedAt), [0, DAY, 4 * DAY]);
assert.notEqual(result.history[0], first, 'Returned records are independent snapshots');
assert.throws(() => deriveTrainingState([first, record(1, { exerciseId: 'another-position' })]), /one exercise/);

const due = deriveTrainingState([record(0, { exerciseId: 'due' })], 3 * DAY);
const olderDue = deriveTrainingState([record(-1, { exerciseId: 'older-due' })], 3 * DAY);
const retry = deriveTrainingState([record(0, { exerciseId: 'retry', outcome: 'needs-review' })], 3 * DAY);
const recent = deriveTrainingState([record(2.9, { exerciseId: 'recent' })], 3 * DAY);
const mastered = deriveTrainingState(recalls.map((item) => ({ ...item, exerciseId: 'mastered' })), 40 * DAY);
const states = { due, 'older-due': olderDue, retry, recent, mastered };
assert.deepEqual(selectSession(['new', 'retry', 'due', 'older-due', 'recent', 'mastered', 'due'], states, 3 * DAY, 10), [
  { exerciseId: 'older-due', reason: 'review' }, { exerciseId: 'due', reason: 'review' },
  { exerciseId: 'retry', reason: 'retry' }, { exerciseId: 'new', reason: 'new' },
]);
assert.equal(selectSession(['new', 'due'], states, 3 * DAY, 1)[0].exerciseId, 'due');
assert.deepEqual(selectSession(['new'], states, 3 * DAY, 0), []);
const practicedToday = deriveTrainingState([record(0), record(3.1)], 3.2 * DAY);
assert.deepEqual(selectSession(['position-a'], { 'position-a': practicedToday }, 3.2 * DAY, 5), [], 'Do not select just-completed exercises again');
const freshUnverified = deriveTrainingState([record(3.1, { outcome: 'unverified' })], 3.2 * DAY);
assert.deepEqual(selectSession(['position-a'], { 'position-a': freshUnverified }, 3.2 * DAY, 5), [], 'Session cooldown also prevents immediate unverified repetitions');
const reopenedToday = deriveTrainingState([record(0)], 3.2 * DAY, [3.1 * DAY]);
assert.deepEqual(selectSession(['position-a'], { 'position-a': reopenedToday }, 3.2 * DAY, 5), [], 'Reopened audits prevent immediate recall sessions');
const seenOnly = deriveTrainingState([], 3 * DAY, [DAY]);
assert.deepEqual(selectSession(['seen'], { seen: seenOnly }, 3 * DAY, 5), [{ exerciseId: 'seen', reason: 'retry' }], 'An exposed position without an attempt is not a new position');

process.stdout.write('Training schedule checks passed\n');
