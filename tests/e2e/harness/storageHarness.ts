/**
 * LocalStorage Mock and Persistence Harness.
 * Validates browser storage contracts, schema versioning, error recovery,
 * JSON corruption resilience, and QuotaExceeded fallback.
 */

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

export const STORAGE_KEY = 'vukovic_chess_storage_v1';
export const SESSION_KEY = 'vukovic_active_session_v1';

export class MockLocalStorage {
  private store: Map<string, string> = new Map();
  public quotaLimitChars: number = 5 * 1024 * 1024; // 5MB simulated
  public simulateQuotaError: boolean = false;

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.simulateQuotaError) {
      const err = new Error('QuotaExceededError: The quota has been exceeded.');
      err.name = 'QuotaExceededError';
      throw err;
    }
    const totalLength = Array.from(this.store.values()).reduce((a, b) => a + b.length, 0) + value.length;
    if (totalLength > this.quotaLimitChars) {
      const err = new Error('QuotaExceededError: Storage quota exceeded.');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

export class StorageHarness {
  public storage: MockLocalStorage;

  constructor(customStorage?: MockLocalStorage) {
    this.storage = customStorage || new MockLocalStorage();
  }

  getDefaultUserStats(): VukovicUserStats {
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

  loadUserStats(): VukovicUserStats {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return this.getDefaultUserStats();

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return this.getDefaultUserStats();
      }

      // Schema migration or field recovery
      const studies: Record<string, VukovicStudyRecord> = {};
      if (parsed.studies && typeof parsed.studies === 'object') {
        for (const [id, rec] of Object.entries(parsed.studies as Record<string, any>)) {
          studies[id] = {
            studyId: id,
            themeId: rec.themeId || 'unknown',
            completed: Boolean(rec.completed),
            bestScore: Math.min(100, Math.max(0, Number(rec.bestScore) || 0)),
            bestAccuracy: Math.min(100, Math.max(0, Number(rec.bestAccuracy) || 0)),
            cleanDepth: Math.max(0, Number(rec.cleanDepth) || 0),
            attemptsCount: Math.max(1, Number(rec.attemptsCount) || 1),
            lastCompletedAt: rec.lastCompletedAt || new Date().toISOString(),
          };
        }
      }

      return {
        version: 1,
        totalStudiesCompleted: Object.values(studies).filter((s) => s.completed).length,
        overallAccuracy: Math.min(100, Math.max(0, Number(parsed.overallAccuracy) || 0)),
        averageCalculationTimeSec: Math.max(0, Number(parsed.averageCalculationTimeSec) || 0),
        masteryPoints: Math.max(0, Number(parsed.masteryPoints) || 0),
        currentStreakDays: Math.max(1, Number(parsed.currentStreakDays) || 1),
        studies,
      };
    } catch {
      // Corrupted JSON or parsing exception: graceful recovery to default
      return this.getDefaultUserStats();
    }
  }

  saveStudyRecord(record: {
    studyId: string;
    themeId: string;
    score: number;
    accuracyPercent: number;
    cleanDepth: number;
  }): void {
    const stats = this.loadUserStats();
    const existing = stats.studies[record.studyId];

    const clampedScore = Math.min(100, Math.max(0, record.score));
    const clampedAccuracy = Math.min(100, Math.max(0, record.accuracyPercent));

    stats.studies[record.studyId] = {
      studyId: record.studyId,
      themeId: record.themeId,
      completed: true,
      bestScore: existing ? Math.max(existing.bestScore, clampedScore) : clampedScore,
      bestAccuracy: existing ? Math.max(existing.bestAccuracy, clampedAccuracy) : clampedAccuracy,
      cleanDepth: existing ? Math.max(existing.cleanDepth, record.cleanDepth) : record.cleanDepth,
      attemptsCount: existing ? existing.attemptsCount + 1 : 1,
      lastCompletedAt: new Date().toISOString(),
    };

    stats.totalStudiesCompleted = Object.values(stats.studies).filter((s) => s.completed).length;

    // Recalculate average accuracy
    const allRecords = Object.values(stats.studies);
    const sumAccuracy = allRecords.reduce((a, b) => a + b.bestAccuracy, 0);
    stats.overallAccuracy = allRecords.length > 0 ? Math.round(sumAccuracy / allRecords.length) : 0;
    stats.masteryPoints = allRecords.reduce((a, b) => a + b.bestScore, 0);

    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(stats));
    } catch (err: any) {
      if (err.name === 'QuotaExceededError') {
        // Safe fallback: clear temporary session and try compact save
        this.storage.removeItem(SESSION_KEY);
        try {
          this.storage.setItem(STORAGE_KEY, JSON.stringify(stats));
        } catch {
          // If still exceeding, keep existing
        }
      } else {
        throw err;
      }
    }
  }
}
