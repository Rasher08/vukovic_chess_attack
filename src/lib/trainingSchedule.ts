/**
 * Recall schedule for one exercise. A day is a full 24 hours, independent of
 * timezone/DST. History is append-only: duplicate IDs keep their first record.
 * Future-dated records stay in history but do not affect the current schedule.
 *
 * The initial independent solution is followed by four delayed recalls:
 * +1, +3, +7, +21 days, each measured from the last qualifying completion.
 * Every attempt or reopened explanation is an exposure. Early/assisted attempts
 * restart the current interval without advancing the recall stage. Unverified
 * attempts do not assess quality, but still expose the position to the learner.
 * A failed/incomplete attempt requires relearning: the next independent success
 * becomes a fresh initial solution, followed by all four delayed recalls.
 */
export interface TrainingAttemptRecord {
  readonly id: string;
  readonly exerciseId: string;
  readonly completedAt: number;
  readonly outcome: 'passed' | 'needs-review' | 'incomplete' | 'unverified';
  readonly assisted: boolean;
  readonly sessionKind: 'diagnostic' | 'practice' | 'review' | 'exam';
}

export interface TrainingExerciseState {
  history: TrainingAttemptRecord[];
  successfulReviews: number;
  nextReviewAt: number | null;
  mastered: boolean;
  lastExposureAt?: number | null;
}

export const TRAINING_DAY_MS = 24 * 60 * 60 * 1000;
export const TRAINING_REVIEW_INTERVAL_DAYS = [1, 3, 7, 21] as const;

function canonicalHistory(history: readonly TrainingAttemptRecord[]): TrainingAttemptRecord[] {
  const seen = new Set<string>();
  const records: TrainingAttemptRecord[] = [];
  for (const record of history) {
    if (seen.has(record.id) || !Number.isFinite(record.completedAt)) continue;
    seen.add(record.id);
    records.push({ ...record });
  }
  const exerciseIds = new Set(records.map((record) => record.exerciseId));
  if (exerciseIds.size > 1) throw new Error('deriveTrainingState expects history for one exercise.');
  return records.sort((left, right) => left.completedAt - right.completedAt);
}

export function deriveTrainingState(history: readonly TrainingAttemptRecord[], now: number = Date.now(), exposures: readonly number[] = []): TrainingExerciseState {
  const records = canonicalHistory(history);
  let hasInitialSolution = false;
  let successfulReviews = 0;
  let nextReviewAt: number | null = null;
  let mastered = false;
  let lastExposureAt: number | null = null;
  type Event = { timestamp: number; attempt: TrainingAttemptRecord | null };
  const events: Event[] = [
    ...records.map((attempt) => ({ timestamp: attempt.completedAt, attempt })),
    ...exposures.filter(Number.isFinite).map((timestamp) => ({ timestamp, attempt: null })),
  ];
  // Showing the just-completed audit at the same instant cannot invalidate recall.
  events.sort((left, right) => left.timestamp - right.timestamp || Number(left.attempt === null) - Number(right.attempt === null));

  for (const event of events) {
    if (event.timestamp > now) continue;
    const attempt = event.attempt;
    if (attempt?.outcome === 'needs-review' || attempt?.outcome === 'incomplete') {
      hasInitialSolution = false;
      successfulReviews = 0;
      mastered = false;
    } else if (attempt?.outcome === 'passed' && !attempt.assisted && !mastered && (nextReviewAt === null || attempt.completedAt >= nextReviewAt)) {
      if (!hasInitialSolution) hasInitialSolution = true;
      else successfulReviews += 1;
      if (successfulReviews >= TRAINING_REVIEW_INTERVAL_DAYS.length) {
        successfulReviews = TRAINING_REVIEW_INTERVAL_DAYS.length;
        mastered = true;
      }
    }
    lastExposureAt = event.timestamp;
    nextReviewAt = mastered ? null : event.timestamp + TRAINING_REVIEW_INTERVAL_DAYS[successfulReviews] * TRAINING_DAY_MS;
  }

  return { history: records, successfulReviews, nextReviewAt, mastered, lastExposureAt };
}

export interface TrainingSessionItem {
  exerciseId: string;
  reason: 'review' | 'new' | 'retry';
}

/**
 * Due recall first, then due retries, then unseen positions. A completed attempt
 * imposes a conservative 24h session cooldown. Reopened explanations count as
 * exposures too; deriveTrainingState already schedules the full current interval.
 */
export function selectSession(ids: string[], states: Record<string, TrainingExerciseState>, now: number, limit: number): TrainingSessionItem[] {
  if (!Number.isFinite(now) || Number.isNaN(limit) || limit <= 0) return [];
  const candidates: (TrainingSessionItem & { priority: number; due: number; order: number })[] = [];
  Array.from(new Set(ids)).forEach((exerciseId, order) => {
    const state = states[exerciseId];
    if (!state) { candidates.push({ exerciseId, reason: 'new', priority: 2, due: 0, order }); return; }
    if (state.mastered) return;
    const completed = state.history.filter((attempt) => Number.isFinite(attempt.completedAt) && attempt.completedAt <= now);
    const latest = completed.reduce<TrainingAttemptRecord | null>((current, attempt) => !current || attempt.completedAt > current.completedAt ? attempt : current, null);
    const lastExposureAt = state.lastExposureAt ?? latest?.completedAt ?? null;
    if (lastExposureAt !== null && now - lastExposureAt < TRAINING_DAY_MS) return;
    if (state.nextReviewAt !== null && state.nextReviewAt > now) return;
    if (!completed.length && lastExposureAt === null) { candidates.push({ exerciseId, reason: 'new', priority: 2, due: 0, order }); return; }
    const scheduleEvents = completed.filter((attempt) => attempt.outcome === 'needs-review' || attempt.outcome === 'incomplete' || (attempt.outcome === 'passed' && !attempt.assisted));
    const lastScheduleEvent = scheduleEvents.reduce<TrainingAttemptRecord | null>((current, attempt) => !current || attempt.completedAt >= current.completedAt ? attempt : current, null);
    const reason = lastScheduleEvent?.outcome === 'passed' && state.nextReviewAt !== null ? 'review' : 'retry';
    candidates.push({ exerciseId, reason, priority: reason === 'review' ? 0 : 1, due: state.nextReviewAt ?? lastExposureAt ?? 0, order });
  });
  return candidates.sort((left, right) => left.priority - right.priority || left.due - right.due || left.order - right.order)
    .slice(0, Math.floor(limit)).map(({ exerciseId, reason }) => ({ exerciseId, reason }));
}
