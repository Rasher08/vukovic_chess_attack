/**
 * Vukovic Chess Attack Platform — LocalStorage Persistence Adapter
 * 
 * Provides client-side persistence for calculation trainer progress,
 * accuracy metrics, streak counts, and session state.
 * Fully SSR-safe, supports in-memory fallback in Node/SSR,
 * and is resilient against JSON corruption and storage quota limits.
 */

export const STORAGE_KEY = 'vukovic_chess_storage_v1';
export const SESSION_KEY = 'vukovic_active_session_v1';

export interface VukovicStudyRecord {
  studyId: string;
  themeId: string;
  completed: boolean;
  bestScore: number;
  bestAccuracy: number;
  cleanDepth: number;
  attemptsCount: number;
  lastCompletedAt: string;
}

export interface VukovicUserStats {
  version: 1;
  totalStudiesCompleted: number;
  overallAccuracy: number;
  averageCalculationTimeSec: number;
  masteryPoints: number;
  currentStreakDays: number;
  studies: Record<string, VukovicStudyRecord>;
}

export interface VukovicActiveSession {
  studyId: string;
  stepIndex: number;
  elapsedSeconds: number;
  currentScoreAcc: number;
  stepAttempts: Record<number, number>;
  hintsUsed: Record<number, number>;
}

// In-memory резервное хранилище на случай SSR или отсутствия localStorage в среде выполнения
let memoryStorage: Record<string, string> = {};

/**
 * Чтение значения из localStorage с резервным fallback
 */
function getItem(key: string): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memoryStorage[key] ?? null;
    }
  }
  return memoryStorage[key] ?? null;
}

/**
 * Запись значения в localStorage с обработкой QuotaExceededError и fallback
 */
function setItem(key: string, value: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(key, value);
      return;
    } catch (err: any) {
      if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
        try {
          window.localStorage.removeItem(SESSION_KEY);
          window.localStorage.setItem(key, value);
          return;
        } catch {
          // Переход на память при стойком переполнении
        }
      }
    }
  }
  memoryStorage[key] = value;
}

/**
 * Удаление ключа из хранилища
 */
function removeItem(key: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Безопасный перехват
    }
  }
  delete memoryStorage[key];
}

/**
 * Возвращает дефолтную структуру профиля пользователя
 */
export function getDefaultUserStats(): VukovicUserStats {
  return {
    version: 1,
    totalStudiesCompleted: 0,
    overallAccuracy: 0,
    averageCalculationTimeSec: 0,
    masteryPoints: 0,
    currentStreakDays: 1,
    studies: {},
  };
}

/**
 * Загружает агрегированную статистику пользователя из localStorage
 */
export function loadUserStats(): VukovicUserStats {
  try {
    const raw = getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultUserStats();
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return getDefaultUserStats();
    }

    // Восстановление и санитарная обработка записей этюдов
    const studies: Record<string, VukovicStudyRecord> = {};
    if (parsed.studies && typeof parsed.studies === 'object') {
      for (const [id, rec] of Object.entries(parsed.studies as Record<string, any>)) {
        if (!rec || typeof rec !== 'object') continue;
        studies[id] = {
          studyId: id,
          themeId: String(rec.themeId || 'greek_gift'),
          completed: Boolean(rec.completed),
          bestScore: Math.min(100, Math.max(0, Number(rec.bestScore) || 0)),
          bestAccuracy: Math.min(100, Math.max(0, Number(rec.bestAccuracy) || 0)),
          cleanDepth: Math.max(0, Number(rec.cleanDepth) || 0),
          attemptsCount: Math.max(1, Number(rec.attemptsCount) || 1),
          lastCompletedAt:
            typeof rec.lastCompletedAt === 'string' ? rec.lastCompletedAt : new Date().toISOString(),
        };
      }
    }

    const completedStudiesCount = Object.values(studies).filter((s) => s.completed).length;

    return {
      version: 1,
      totalStudiesCompleted: completedStudiesCount,
      overallAccuracy: Math.min(100, Math.max(0, Number(parsed.overallAccuracy) || 0)),
      averageCalculationTimeSec: Math.max(0, Number(parsed.averageCalculationTimeSec) || 0),
      masteryPoints: Math.max(0, Number(parsed.masteryPoints) || 0),
      currentStreakDays: Math.max(1, Number(parsed.currentStreakDays) || 1),
      studies,
    };
  } catch {
    // В случае поврежденного JSON восстанавливаем дефолтную схему
    return getDefaultUserStats();
  }
}

/**
 * Сохраняет результат решения этюда с расчетом очков мастерства и точности
 */
export function saveStudyRecord(record: {
  studyId: string;
  themeId?: string;
  score: number;
  accuracyPercent: number;
  cleanDepth: number;
}): void {
  const stats = loadUserStats();
  const existing = stats.studies[record.studyId];

  const clampedScore = Math.min(100, Math.max(0, Math.round(record.score)));
  const clampedAccuracy = Math.min(100, Math.max(0, Math.round(record.accuracyPercent)));
  const themeId = record.themeId || (existing ? existing.themeId : 'greek_gift');

  stats.studies[record.studyId] = {
    studyId: record.studyId,
    themeId,
    completed: true,
    bestScore: existing ? Math.max(existing.bestScore, clampedScore) : clampedScore,
    bestAccuracy: existing ? Math.max(existing.bestAccuracy, clampedAccuracy) : clampedAccuracy,
    cleanDepth: existing ? Math.max(existing.cleanDepth, record.cleanDepth) : record.cleanDepth,
    attemptsCount: existing ? existing.attemptsCount + 1 : 1,
    lastCompletedAt: new Date().toISOString(),
  };

  const allRecords = Object.values(stats.studies);
  stats.totalStudiesCompleted = allRecords.filter((s) => s.completed).length;

  const sumAccuracy = allRecords.reduce((acc, curr) => acc + curr.bestAccuracy, 0);
  stats.overallAccuracy = allRecords.length > 0 ? Math.round(sumAccuracy / allRecords.length) : 0;
  stats.masteryPoints = allRecords.reduce((acc, curr) => acc + curr.bestScore, 0);

  setItem(STORAGE_KEY, JSON.stringify(stats));
}

/**
 * Получить прогресс по конкретному этюду
 */
export function getStudyProgress(studyId: string): VukovicStudyRecord | null {
  const stats = loadUserStats();
  return stats.studies[studyId] || null;
}

/**
 * Сохранить прогресс по этюду (совместимый алиас для saveStudyRecord)
 */
export function saveStudyProgress(
  progress:
    | {
        studyId: string;
        themeId?: string;
        score: number;
        accuracyPercent: number;
        cleanDepth: number;
      }
    | VukovicStudyRecord
): void {
  const score = 'bestScore' in progress ? progress.bestScore : progress.score;
  const accuracyPercent =
    'bestAccuracy' in progress ? progress.bestAccuracy : progress.accuracyPercent;

  saveStudyRecord({
    studyId: progress.studyId,
    themeId: progress.themeId,
    score,
    accuracyPercent,
    cleanDepth: progress.cleanDepth,
  });
}

/**
 * Получить записи по всем пройденным этюдам
 */
export function getAllProgress(): Record<string, VukovicStudyRecord> {
  const stats = loadUserStats();
  return stats.studies;
}

/**
 * Получить текущую серию тренировок (дней подряд)
 */
export function getStreakCount(): number {
  const stats = loadUserStats();
  return stats.currentStreakDays;
}

/**
 * Очистить весь сохраненный прогресс
 */
export function clearProgress(): void {
  removeItem(STORAGE_KEY);
  removeItem(SESSION_KEY);
  memoryStorage = {};
}

/**
 * Сохранить состояние активной расчетной сессии
 */
export function saveActiveSession(session: VukovicActiveSession): void {
  setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * Получить сохраненное состояние активной сессии
 */
export function getActiveSession(studyId: string): VukovicActiveSession | null {
  try {
    const raw = getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as VukovicActiveSession;
    if (session && session.studyId === studyId) {
      return session;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Удалить сохраненную сессию
 */
export function clearActiveSession(): void {
  removeItem(SESSION_KEY);
}
