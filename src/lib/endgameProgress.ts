import { Chess } from 'chess.js';
import { compressToUTF16, decompressFromUTF16 } from 'lz-string';
import { playUci } from './autoTraining';
import type { EndgameAudit } from './endgameTraining';

export const ENDGAME_PROGRESS_KEY = 'nonchalant-endgame-progress:v1';
export const ENDGAME_PROGRESS_EVENT = 'nonchalant-endgame-progress';
const HISTORY_LIMIT = 4;
const DAY = 86_400_000;
const REPEAT_DAYS = [1, 3, 7, 21];
export interface EndgameAttempt {
  id: string; lessonId: string; initialFen: string; moves: string[]; plan: string; planLocked: boolean;
  phase: 'active' | 'completed'; assisted: boolean; revealed: boolean; createdAt: number; updatedAt: number; audit?: EndgameAudit;
}
export interface EndgameLessonProgress {
  activeAttempt?: EndgameAttempt; history: EndgameAttempt[]; successfulRepeats: number;
  nextReviewAt: number | null; lastPassedAt: number | null; masteredAt: number | null;
}
export interface EndgameProgress { version: 1; lessons: Record<string, EndgameLessonProgress>; solvedAt: number[] }
function empty(): EndgameProgress { return { version: 1, lessons: {}, solvedAt: [] }; }
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const nullableTimestamp = (value: unknown) => value === null || timestamp(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,119}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
function validAudit(value: unknown): value is EndgameAudit {
  if (!value || typeof value !== 'object') return false;
  const audit = value as EndgameAudit;
  return ['passed', 'needs-review', 'incomplete', 'unverified'].includes(audit.outcome) && (audit.terminalResult === null || ['won', 'lost', 'draw'].includes(audit.terminalResult)) &&
    Number.isSafeInteger(audit.playedOwnMoves) && audit.playedOwnMoves >= 0 && audit.playedOwnMoves <= 300 && Number.isSafeInteger(audit.requiredOwnMoves) && audit.requiredOwnMoves > 0 && audit.requiredOwnMoves <= 100 &&
    typeof audit.summary === 'string' && audit.summary.length < 10000 && typeof audit.limits === 'string' && audit.limits.length < 10000 && ['win', 'draw'].includes(audit.goal) &&
    [audit.exactMoves, audit.engineMoves, audit.criticalErrors].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 300) &&
    Array.isArray(audit.moves) && audit.moves.length === audit.playedOwnMoves && new Set(audit.moves.map(row => row?.ply)).size === audit.moves.length && audit.moves.every(row => row && typeof row === 'object' && Number.isSafeInteger(row.ply) && row.ply >= 1 && row.ply <= 600 && typeof row.uci === 'string' && typeof row.san === 'string' && typeof row.fenBefore === 'string' && typeof row.fenAfter === 'string' && typeof row.exact === 'boolean' && typeof row.explanation === 'string' && row.explanation.length < 10000 && ['sound', 'inaccuracy', 'mistake', 'unverified'].includes(row.classification) && [row.lossCp, row.beforeCp, row.afterCp].every(value => value === null || (typeof value === 'number' && Number.isFinite(value))) && [row.beforeOutcome, row.afterOutcome].every(value => value === null || [-1, 0, 1].includes(value)) && (row.bestSan === null || typeof row.bestSan === 'string') && Array.isArray(row.bestLineSan) && row.bestLineSan.length <= 12 && row.bestLineSan.every(san => typeof san === 'string'));
}
function validAttempt(value: unknown): value is EndgameAttempt {
  if (!value || typeof value !== 'object') return false;
  const attempt = value as EndgameAttempt;
  if (!identifier(attempt.id) || !identifier(attempt.lessonId) || typeof attempt.initialFen !== 'string' || attempt.initialFen.length > 150 || !Array.isArray(attempt.moves) || attempt.moves.length > 600 || !attempt.moves.every(move => typeof move === 'string') || typeof attempt.plan !== 'string' || attempt.plan.length > 10000 || typeof attempt.planLocked !== 'boolean' || !['active', 'completed'].includes(attempt.phase) || typeof attempt.assisted !== 'boolean' || typeof attempt.revealed !== 'boolean' || !timestamp(attempt.createdAt) || !timestamp(attempt.updatedAt) || attempt.updatedAt < attempt.createdAt || (attempt.phase === 'completed' && !validAudit(attempt.audit)) || (attempt.audit !== undefined && !validAudit(attempt.audit))) return false;
  try {
    const board = new Chess(attempt.initialFen);
    for (const move of attempt.moves) { if (board.isGameOver()) return false; playUci(board, move); }
    if (attempt.moves.length && !attempt.planLocked) return false;
    if (attempt.audit) {
      const history = board.history({ verbose: true });
      if (attempt.audit.moves.some(row => {
        const actual = history[row.ply - 1];
        return !actual || row.uci !== actual.from + actual.to + (actual.promotion || '') || row.san !== actual.san || row.fenBefore !== actual.before || row.fenAfter !== actual.after;
      })) return false;
      const color = attempt.audit.moves.length ? history[attempt.audit.moves[0].ply - 1]?.color : null;
      if (attempt.audit.outcome === 'passed') {
        if (!color || attempt.audit.criticalErrors !== 0) return false;
        const actualTerminal = board.isCheckmate() ? board.turn() === color ? 'lost' : 'won' : board.isDraw() ? 'draw' : null;
        if (attempt.audit.terminalResult !== actualTerminal || (attempt.audit.goal === 'win' && actualTerminal !== 'won')) return false;
        if (attempt.audit.goal === 'draw' && actualTerminal === null && (attempt.audit.playedOwnMoves < attempt.audit.requiredOwnMoves || attempt.audit.moves.some(row => !row.exact || row.beforeOutcome === null || row.beforeOutcome < 0 || row.afterOutcome === null || row.afterOutcome < 0))) return false;
      }
    }
  } catch { return false; }
  return true;
}
function read(): { valid: boolean; progress: EndgameProgress } {
  if (typeof window === 'undefined') return { valid: true, progress: empty() };
  const raw = window.localStorage.getItem(ENDGAME_PROGRESS_KEY);
  if (!raw) return { valid: true, progress: empty() };
  try {
    if (raw.length > 4_000_000) return { valid: false, progress: empty() };
    const value = JSON.parse(raw.startsWith('lz1:') ? decompressFromUTF16(raw.slice(4)) || 'null' : raw) as EndgameProgress;
    if (!value || value.version !== 1 || !value.lessons || typeof value.lessons !== 'object' || Array.isArray(value.lessons) || Object.keys(value.lessons).length > 200 || !Array.isArray(value.solvedAt) || value.solvedAt.length > 5000 || !value.solvedAt.every(timestamp)) return { valid: false, progress: empty() };
    for (const [id, lesson] of Object.entries(value.lessons)) {
      if (!identifier(id) || !lesson || typeof lesson !== 'object' || !Array.isArray(lesson.history) || lesson.history.length > HISTORY_LIMIT || !lesson.history.every(attempt => validAttempt(attempt) && attempt.phase === 'completed' && attempt.lessonId === id) || (lesson.activeAttempt !== undefined && (!validAttempt(lesson.activeAttempt) || lesson.activeAttempt.phase !== 'active' || lesson.activeAttempt.lessonId !== id)) || !Number.isSafeInteger(lesson.successfulRepeats) || lesson.successfulRepeats < 0 || lesson.successfulRepeats > 4 || !nullableTimestamp(lesson.nextReviewAt) || !nullableTimestamp(lesson.lastPassedAt) || !nullableTimestamp(lesson.masteredAt)) return { valid: false, progress: empty() };
    }
    return { valid: true, progress: value };
  } catch { return { valid: false, progress: empty() }; }
}
export function loadEndgameProgress(): EndgameProgress { try { return read().progress; } catch { return empty(); } }
export function getEndgameSolvedTimestamps(progress: EndgameProgress): number[] { return [...progress.solvedAt]; }
function dayKey(value: number): string { return new Date(value + 3 * 3_600_000).toISOString().slice(0, 10); }
function success(attempt: EndgameAttempt): boolean { return attempt.phase === 'completed' && attempt.audit?.outcome === 'passed' && !attempt.assisted && !attempt.revealed; }

/** Storage is isolated from attack-course progress; corrupt/future data is never overwritten. */
export function saveEndgameAttempt(attempt: EndgameAttempt): { saved: boolean; error?: string } {
  if (typeof window === 'undefined') return { saved: false, error: 'Сохранение доступно в браузере.' };
  if (!validAttempt(attempt)) return { saved: false, error: 'Попытка не сохранена: некорректная запись позиции или результата.' };
  try {
    const stored = read();
    if (!stored.valid) return { saved: false, error: 'Сохранённые эндшпили имеют неизвестный формат. Прежняя история не была заменена.' };
    const progress = stored.progress;
    const previous = progress.lessons[attempt.lessonId] || { history: [], successfulRepeats: 0, nextReviewAt: null, lastPassedAt: null, masteredAt: null };
    const known = previous.history.find(item => item.id === attempt.id);
    const priorAttempt = known || (previous.activeAttempt?.id === attempt.id ? previous.activeAttempt : undefined);
    if ((priorAttempt && attempt.updatedAt < priorAttempt.updatedAt) || (previous.activeAttempt && previous.activeAttempt.id !== attempt.id && attempt.createdAt < previous.activeAttempt.createdAt)) return { saved: false, error: 'В другой вкладке уже есть более новая попытка. Открой сохранённую позицию заново.' };
    if (priorAttempt && (priorAttempt.initialFen !== attempt.initialFen || priorAttempt.createdAt !== attempt.createdAt || (priorAttempt.assisted && !attempt.assisted) || (priorAttempt.revealed && !attempt.revealed))) return { saved: false, error: 'Нельзя изменить исходную позицию или скрыть помощь в той же попытке. Начни новую попытку.' };
    const lesson = { ...previous, history: [...previous.history] };
    if (attempt.phase === 'active') lesson.activeAttempt = attempt;
    else {
      if (lesson.activeAttempt?.id === attempt.id) delete lesson.activeAttempt;
      // A passed completion is a fixed historical event. Continuing that same
      // attempt may not rewrite its date or earn another solved day.
      lesson.history = [known?.audit?.outcome === 'passed' ? known : attempt, ...lesson.history.filter(item => item.id !== attempt.id)].slice(0, HISTORY_LIMIT);
      if (success(attempt) && known?.audit?.outcome !== 'passed') {
        const at = attempt.updatedAt;
        if (lesson.lastPassedAt === null) { lesson.successfulRepeats = 0; lesson.nextReviewAt = at + DAY; }
        else if (lesson.nextReviewAt !== null && at >= lesson.nextReviewAt) {
          lesson.successfulRepeats = Math.min(4, lesson.successfulRepeats + 1);
          lesson.nextReviewAt = lesson.successfulRepeats < 4 ? at + REPEAT_DAYS[lesson.successfulRepeats] * DAY : null;
          if (lesson.successfulRepeats === 4) lesson.masteredAt = at;
        }
        else if (lesson.nextReviewAt !== null) lesson.nextReviewAt = at + REPEAT_DAYS[lesson.successfulRepeats] * DAY;
        lesson.lastPassedAt = at;
        if (!progress.solvedAt.some(value => dayKey(value) === dayKey(at))) progress.solvedAt = [...progress.solvedAt, at].slice(-5000);
      } else if (known?.audit?.outcome !== 'passed' && (attempt.assisted || attempt.revealed || attempt.audit?.outcome === 'needs-review')) {
        lesson.successfulRepeats = 0; lesson.nextReviewAt = attempt.updatedAt + DAY; lesson.masteredAt = null;
      }
    }
    progress.lessons[attempt.lessonId] = lesson;
    const encoded = 'lz1:' + compressToUTF16(JSON.stringify(progress));
    window.localStorage.setItem(ENDGAME_PROGRESS_KEY, encoded);
    try { window.dispatchEvent(new Event(ENDGAME_PROGRESS_EVENT)); } catch { /* A listener must not turn a successful write into a reported failure. */ }
    return { saved: true };
  } catch { return { saved: false, error: 'Не удалось сохранить эндшпиль. Прежняя история сохранена; текущая попытка остаётся на экране.' }; }
}
