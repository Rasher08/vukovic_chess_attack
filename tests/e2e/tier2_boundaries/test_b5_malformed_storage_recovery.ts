/**
 * Tier 2: Boundary & Corner Cases - Category B5: Malformed Storage Recovery
 * Tests corrupted JSON recovery, missing fields fallback, score clamping [0, 100],
 * QuotaExceededError handling, and schema migrations.
 */
import { describe, it, expect, runSuite } from '../harness/testRunner.ts';
import { StorageHarness, MockLocalStorage, STORAGE_KEY, SESSION_KEY } from '../harness/storageHarness.ts';

describe('Tier 2 - B5: Malformed LocalStorage Payload Recovery', () => {
  it('TC-B5-01: Corrupted non-JSON string in storage resets to clean default schema without crashing', () => {
    const mock = new MockLocalStorage();
    mock.setItem(STORAGE_KEY, '<<<INVALID NON-JSON GARBAGE>>>');

    const harness = new StorageHarness(mock);
    const stats = harness.loadUserStats();

    expect.equal(stats.version, 1);
    expect.equal(stats.totalStudiesCompleted, 0);
    expect.equal(stats.overallAccuracy, 0);
    expect.deepEqual(stats.studies, {});
  });

  it('TC-B5-02: Missing fields in saved study record handled with safe defaults', () => {
    const mock = new MockLocalStorage();
    // Incomplete study object missing attemptsCount, cleanDepth, and lastCompletedAt
    const partialStats = {
      version: 1,
      totalStudiesCompleted: 1,
      overallAccuracy: 80,
      studies: {
        'colle-1930': {
          studyId: 'colle-1930',
          completed: true,
          bestScore: 85,
        },
      },
    };
    mock.setItem(STORAGE_KEY, JSON.stringify(partialStats));

    const harness = new StorageHarness(mock);
    const stats = harness.loadUserStats();

    const record = stats.studies['colle-1930'];
    expect.ok(record !== undefined);
    expect.equal(record.completed, true);
    expect.equal(record.bestScore, 85);
    expect.equal(record.cleanDepth, 0, 'Missing cleanDepth defaults to 0');
    expect.equal(record.attemptsCount, 1, 'Missing attemptsCount defaults to 1');
    expect.ok(typeof record.lastCompletedAt === 'string', 'lastCompletedAt gets filled');
  });

  it('TC-B5-03: Out-of-bounds score or negative accuracy clamped to valid range [0, 100]', () => {
    const harness = new StorageHarness();

    // Save with negative score and out-of-bounds accuracy 150%
    harness.saveStudyRecord({
      studyId: 'study-bounds-test',
      themeId: 'greek_gift',
      score: -25,
      accuracyPercent: 150,
      cleanDepth: 5,
    });

    const stats = harness.loadUserStats();
    const record = stats.studies['study-bounds-test'];

    expect.equal(record.bestScore, 0, 'Negative score clamped to 0');
    expect.equal(record.bestAccuracy, 100, 'Accuracy > 100 clamped to 100');
  });

  it('TC-B5-04: QuotaExceededError simulation caught and session log purged to free space', () => {
    const mock = new MockLocalStorage();
    mock.setItem(SESSION_KEY, 'X'.repeat(1000)); // Active session temporary data
    mock.simulateQuotaError = true;

    const harness = new StorageHarness(mock);

    // Should not crash, catches quota error gracefully
    harness.saveStudyRecord({
      studyId: 'quota-test-study',
      themeId: 'greek_gift',
      score: 90,
      accuracyPercent: 90,
      cleanDepth: 4,
    });

    // Session key was purged during quota exception fallback
    expect.equal(mock.getItem(SESSION_KEY), null, 'Temporary session key must be purged on QuotaExceededError');
  });

  it('TC-B5-05: Storage schema version migration from legacy format to version 1', () => {
    const mock = new MockLocalStorage();
    // Legacy payload without version property
    const legacyPayload = {
      totalStudiesCompleted: 2,
      overallAccuracy: 75,
      studies: {
        'study-1': { studyId: 'study-1', completed: true, bestScore: 90 },
      },
    };
    mock.setItem(STORAGE_KEY, JSON.stringify(legacyPayload));

    const harness = new StorageHarness(mock);
    const stats = harness.loadUserStats();

    expect.equal(stats.version, 1, 'Migrated to schema version 1');
    expect.equal(stats.totalStudiesCompleted, 1);
    expect.ok(stats.studies['study-1'].completed);
  });
});

runSuite();
