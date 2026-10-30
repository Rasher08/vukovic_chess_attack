import type { CourseProgress } from './courseProgress';

const DAY_MS = 24 * 60 * 60 * 1000;
const calendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Calendar days, rather than elapsed 24-hour intervals, define a daily streak. */
export function practiceDayNumber(timestamp: number): number | null {
  if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) return null;
  const parts = calendar.formatToParts(timestamp);
  const value = (name: string) => Number(parts.find(part => part.type === name)?.value);
  return Date.UTC(value('year'), value('month') - 1, value('day')) / DAY_MS;
}

export interface PracticeStreak {
  currentDays: number;
  longestDays: number;
  todayComplete: boolean;
}

/** Successful repeats count as practice; merely viewing or restarting a task does not. */
export function getPracticeStreak(progress: CourseProgress, now = Date.now(), additionalSolvedAt: readonly number[] = []): PracticeStreak {
  const today = practiceDayNumber(now);
  if (today === null) return { currentDays: 0, longestDays: 0, todayComplete: false };
  const days = new Set<number>();
  for (const timestamp of additionalSolvedAt) {
    if (!Number.isFinite(timestamp) || timestamp > now) continue;
    const day = practiceDayNumber(timestamp);
    if (day !== null && day <= today) days.add(day);
  }

  for (const [exerciseId, exercise] of Object.entries(progress.exercises)) {
    for (const timestamp of exercise.manualSolvedAt || []) {
      if (!Number.isFinite(timestamp) || timestamp > now) continue;
      const day = practiceDayNumber(timestamp);
      if (day !== null && day <= today) days.add(day);
    }
    const seen = new Set<string>();
    const record = (id: string, outcome: string, completedAt: number) => {
      // Immutable history wins over duplicate legacy/latest snapshots.
      const key = `${exerciseId}:${id}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (outcome !== 'passed' || !Number.isFinite(completedAt) || completedAt > now) return;
      const day = practiceDayNumber(completedAt);
      if (day !== null && day <= today) days.add(day);
    };
    for (const attempt of exercise.autoHistory || []) record(attempt.id, attempt.audit.outcome, attempt.completedAt);
    const first = exercise.firstAttemptResult;
    if (first) record(first.attemptId, first.outcome, first.completedAt);
    const latest = exercise.autoAttempt;
    if (latest?.phase === 'completed' && latest.audit) record(latest.id, latest.audit.outcome, latest.updatedAt);
  }

  const ordered = Array.from(days).sort((left, right) => left - right);
  let longestDays = 0;
  let run = 0;
  ordered.forEach((day, index) => {
    run = index > 0 && day === ordered[index - 1] + 1 ? run + 1 : 1;
    longestDays = Math.max(longestDays, run);
  });
  const todayComplete = days.has(today);
  let cursor = todayComplete ? today : today - 1;
  let currentDays = 0;
  while (days.has(cursor)) { currentDays += 1; cursor -= 1; }
  return { currentDays, longestDays, todayComplete };
}
