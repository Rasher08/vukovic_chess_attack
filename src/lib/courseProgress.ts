import type { AutoAudit } from './autoTraining';
import type { TrainingAttemptRecord } from './trainingSchedule';
import { compressToUTF16, decompressFromUTF16 } from 'lz-string';

export const COURSE_PROGRESS_KEY = 'vukovic-course-progress:v1';
export const COURSE_PROGRESS_EVENT = 'vukovic-course-progress';
const COMPRESSED_PREFIX = 'lz1:';
const COMPRESSION_THRESHOLD = 100_000;

// Cache only immutable text. Each reader parses its own object graph, so callers
// can edit loaded progress without changing either the cache or another reader.
let cachedRaw: string | null | undefined;
let cachedDecoded: string | null = null;

function decodeProgress(raw: string | null): string | null {
  if (raw !== cachedRaw) {
    const decoded = raw?.startsWith(COMPRESSED_PREFIX)
      ? decompressFromUTF16(raw.slice(COMPRESSED_PREFIX.length)) : raw;
    cachedRaw = raw;
    cachedDecoded = decoded;
  }
  return cachedDecoded;
}

export interface AutoAttempt {
  id: string;
  exerciseId: string;
  chapterId: string;
  initialFen: string;
  moves: string[];
  choiceId?: string;
  planLocked: boolean;
  phase: 'active' | 'completed';
  createdAt: number;
  updatedAt: number;
  assisted: boolean;
  isFirstAttempt: boolean;
  audit?: AutoAudit;
  /** Solutions stay hidden after grading until the learner explicitly opens them. */
  answerRevealed?: boolean;
  sessionId?: string;
  sessionKind?: TrainingAttemptRecord['sessionKind'];
  preparation?: { candidates: string; defense: string; evaluation: string };
}

/** Compact immutable results; the latest full board/audit remains in autoAttempt. */
export interface AutoAttemptHistory {
  id: string;
  exerciseId: string;
  createdAt: number;
  updatedAt: number;
  completedAt: number;
  assisted: boolean;
  sessionId?: string;
  sessionKind?: TrainingAttemptRecord['sessionKind'];
  moves: string[];
  preparation?: AutoAttempt['preparation'];
  themeVisible: boolean;
  audit: Pick<AutoAudit, 'outcome' | 'maxLossCp' | 'playedOwnMoves' | 'requiredOwnMoves'>;
}

export interface FirstAttemptResult {
  attemptId: string;
  outcome: AutoAudit['outcome'];
  independent: boolean;
  completedAt: number;
}

export interface ExerciseProgress {
  status: 'solved' | 'review';
  updatedAt: number;
  attempts?: number;
  draftSan?: string[];
  decisionId?: string;
  reviewed?: boolean;
  reviewedAt?: number;
  /** Actual visits to a completed audit, including visits long after completion. */
  revealedAt?: number[];
  mode?: 'board' | 'mental';
  everRevealed?: boolean;
  firstAttemptResult?: FirstAttemptResult;
  autoAttempt?: AutoAttempt;
  autoHistory?: AutoAttemptHistory[];
  manualSolvedAt?: number[];
}

export interface CourseProgress {
  version: 1;
  exercises: Record<string, ExerciseProgress>;
  lastChapterId?: string;
  lastExerciseId?: string;
  lastStudyView?: 'theory' | 'examples';
}

export function loadCourseProgress(): CourseProgress {
  const empty: CourseProgress = { version: 1, exercises: {} };
  if (typeof window === 'undefined') return empty;
  try {
    const parsed = JSON.parse(decodeProgress(window.localStorage.getItem(COURSE_PROGRESS_KEY)) || 'null');
    if (!parsed || parsed.version !== 1 || typeof parsed.exercises !== 'object' || !parsed.exercises) return empty;
    const exercises: Record<string, ExerciseProgress> = {};
    for (const [id, raw] of Object.entries(parsed.exercises)) {
      const item = raw as Partial<ExerciseProgress> | null;
      if (!item || !['solved', 'review'].includes(item.status || '') || !Number.isFinite(item.updatedAt)) continue;
      exercises[id] = {
        status: item.status as ExerciseProgress['status'],
        updatedAt: item.updatedAt as number,
        attempts: typeof item.attempts === 'number' ? item.attempts : 0,
        draftSan: Array.isArray(item.draftSan) && item.draftSan.every((move) => typeof move === 'string') ? item.draftSan : [],
        decisionId: typeof item.decisionId === 'string' ? item.decisionId : undefined,
        reviewed: item.reviewed === true,
        reviewedAt: Number.isFinite(item.reviewedAt) ? item.reviewedAt : undefined,
        revealedAt: Array.isArray(item.revealedAt) ? item.revealedAt.filter((timestamp): timestamp is number => typeof timestamp === 'number' && Number.isFinite(timestamp)) : [],
        mode: item.mode === 'mental' ? 'mental' : 'board',
        everRevealed: item.everRevealed === true || item.reviewed === true || Number.isFinite(item.reviewedAt),
        firstAttemptResult: validFirstAttemptResult(item.firstAttemptResult) ? item.firstAttemptResult : undefined,
        autoAttempt: validAutoAttempt(item.autoAttempt) ? item.autoAttempt : undefined,
        autoHistory: Array.isArray(item.autoHistory) ? item.autoHistory.filter(validHistoryRecord) : [],
        manualSolvedAt: Array.isArray(item.manualSolvedAt) ? item.manualSolvedAt.filter((timestamp): timestamp is number => typeof timestamp === 'number' && Number.isFinite(timestamp)) : [],
      };
    }
    return {
      version: 1,
      exercises,
      lastChapterId: typeof parsed.lastChapterId === 'string' ? parsed.lastChapterId : undefined,
      lastExerciseId: typeof parsed.lastExerciseId === 'string' ? parsed.lastExerciseId : undefined,
      lastStudyView: parsed.lastStudyView === 'theory' || parsed.lastStudyView === 'examples' ? parsed.lastStudyView : undefined,
    };
  } catch {
    return empty;
  }
}

function validFirstAttemptResult(value: unknown): value is FirstAttemptResult {
  const item = value as Partial<FirstAttemptResult> | null;
  return Boolean(item && typeof item.attemptId === 'string' && ['passed', 'needs-review', 'incomplete', 'unverified'].includes(item.outcome || '') && typeof item.independent === 'boolean' && Number.isFinite(item.completedAt));
}

function validAutoAttempt(value: unknown): value is AutoAttempt {
  const item = value as Partial<AutoAttempt> | null;
  return Boolean(item && typeof item.id === 'string' && typeof item.exerciseId === 'string' && typeof item.chapterId === 'string' && typeof item.initialFen === 'string' && Array.isArray(item.moves) && item.moves.every((move) => typeof move === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) && ['active', 'completed'].includes(item.phase || '') && Number.isFinite(item.createdAt) && Number.isFinite(item.updatedAt) && typeof item.planLocked === 'boolean' && typeof item.assisted === 'boolean' && typeof item.isFirstAttempt === 'boolean');
}

function validHistoryRecord(value: unknown): value is AutoAttemptHistory {
  const item = value as Partial<AutoAttemptHistory> | null;
  return Boolean(item && typeof item.id === 'string' && typeof item.exerciseId === 'string' && Number.isFinite(item.createdAt) && Number.isFinite(item.updatedAt) && Number.isFinite(item.completedAt) && typeof item.assisted === 'boolean' && Array.isArray(item.moves) && item.moves.every(move => typeof move === 'string') && item.audit && ['passed', 'needs-review', 'incomplete', 'unverified'].includes(item.audit.outcome));
}

export function appendAutoHistory(previous: AutoAttemptHistory[] | undefined, attempt: AutoAttempt): AutoAttemptHistory[] {
  const history = previous || [];
  if (!attempt.audit || attempt.audit.outcome === 'unverified' || history.some(record => record.id === attempt.id)) return history;
  return [...history, {
    id: attempt.id, exerciseId: attempt.exerciseId, createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt, completedAt: attempt.updatedAt, assisted: attempt.assisted,
    sessionId: attempt.sessionId, sessionKind: attempt.sessionKind,
    moves: [...attempt.moves], themeVisible: !attempt.sessionId,
    // Retain the initial written assessment; later assessments remain in the latest full attempt.
    preparation: history.length === 0 && attempt.preparation ? { ...attempt.preparation } : undefined,
    audit: { outcome: attempt.audit.outcome, maxLossCp: attempt.audit.maxLossCp, playedOwnMoves: attempt.audit.playedOwnMoves, requiredOwnMoves: attempt.audit.requiredOwnMoves },
  }];
}

/** Prepare one atomic restart: retain the first result and never credit a retry as independent. */
export function restartAutoAttempt(progress: CourseProgress, request: {
  exerciseId: string; attemptId: string; nextAttemptId: string; requiredOwnMoves: number; now: number;
}): CourseProgress | null {
  const previous = progress.exercises[request.exerciseId];
  const current = previous?.autoAttempt;
  if (!current || current.id !== request.attemptId || request.nextAttemptId === current.id) return null;
  const recorded: AutoAttempt = current.phase === 'completed' && current.audit && current.audit.outcome !== 'unverified' ? current : {
    ...current, phase: 'completed', updatedAt: request.now,
    audit: {
      outcome: 'incomplete', moves: [], playedOwnMoves: Math.ceil(current.moves.length / 2),
      requiredOwnMoves: request.requiredOwnMoves, maxLossCp: null, terminalResult: null,
      summary: 'Позиция начата заново. Предыдущая попытка сохранена как незавершённая.',
      limits: 'При перезапуске движковая проверка не выполнялась. Качество ходов не оценивалось.',
    },
  };
  const next: AutoAttempt = {
    ...current, id: request.nextAttemptId, moves: [], phase: 'active',
    createdAt: request.now, updatedAt: request.now, assisted: true, isFirstAttempt: false, audit: undefined, answerRevealed: false,
    preparation: current.preparation ? { ...current.preparation } : undefined,
  };
  return { ...progress, exercises: { ...progress.exercises, [request.exerciseId]: {
    ...previous, updatedAt: request.now, autoAttempt: next,
    autoHistory: appendAutoHistory(previous.autoHistory, recorded),
    firstAttemptResult: previous.firstAttemptResult || (current.isFirstAttempt ? {
      attemptId: recorded.id, outcome: recorded.audit!.outcome,
      independent: recorded.audit!.outcome === 'passed' && !recorded.assisted, completedAt: recorded.updatedAt,
    } : undefined),
  } } };
}

/** Record exposure only after the exact saved attempt has a verified audit. */
export function noteAutoAuditViewed(exerciseId: string, attemptId: string): boolean {
  const progress = loadCourseProgress();
  const previous = progress.exercises[exerciseId];
  const attempt = previous?.autoAttempt;
  if (!attempt || attempt.id !== attemptId || attempt.phase !== 'completed' || !attempt.audit || attempt.audit.outcome === 'unverified') return false;
  const now = Date.now();
  const revealedAt = previous.revealedAt || [];
  if (revealedAt.some(timestamp => Math.abs(now - timestamp) < 1000)) return true;
  return saveCourseProgress({ ...progress, exercises: { ...progress.exercises, [exerciseId]: {
    ...previous, revealedAt: [...revealedAt, now],
  } } });
}

/** Assistance is historical; restarting an exercise never erases it. */
export function markCourseRevealed(exerciseId: string): boolean {
  const progress = loadCourseProgress();
  const previous = progress.exercises[exerciseId];
  const now = Date.now();
  return saveCourseProgress({ ...progress, exercises: { ...progress.exercises, [exerciseId]: {
    ...previous, status: previous?.status || 'review', updatedAt: now,
    reviewed: true, reviewedAt: now, everRevealed: true,
    autoAttempt: previous?.autoAttempt?.phase === 'active' ? { ...previous.autoAttempt, assisted: true, updatedAt: now } : previous?.autoAttempt,
  } } });
}

/** Returns false when browser storage is unavailable; the lesson still works. */
export function saveCourseProgress(progress: CourseProgress): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const json = JSON.stringify({ ...progress, version: 1 });
    const raw = json.length > COMPRESSION_THRESHOLD ? COMPRESSED_PREFIX + compressToUTF16(json) : json;
    // setItem is atomic: never remove the previous value to make room. A failed
    // write leaves both the previous stored result and its decoded cache intact.
    window.localStorage.setItem(COURSE_PROGRESS_KEY, raw);
    window.dispatchEvent(new Event(COURSE_PROGRESS_EVENT));
    return true;
  } catch {
    return false;
  }
}
