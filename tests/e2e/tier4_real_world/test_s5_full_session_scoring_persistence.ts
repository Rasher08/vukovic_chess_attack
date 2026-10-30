/**
 * Tier 4: Real-World Application Scenario 5 (S5):
 * Full Multi-Study Training Session Persistence in LocalStorage with Accuracy Scoring:
 * User completes a full curriculum session across Greek Gift, Rook Lift, and King Hunt,
 * verifies aggregate mastery points, accuracy percentage, and browser reload persistence.
 */
import { describe, it, expect, runSuite } from '../harness/testRunner.ts';
import { StorageHarness, MockLocalStorage, STORAGE_KEY } from '../harness/storageHarness.ts';
import { CalculationTrainerFsmHarness, TrainerStudySpec } from '../harness/fsmHarness.ts';

describe('Tier 4 - S5: Full Training Session Persistence & Mastery Scoring', () => {
  it('TC-S5-01: Multi-study training curriculum session with persistent mastery ranking', () => {
    const mockStorage = new MockLocalStorage();
    const storage = new StorageHarness(mockStorage);

    // Initial state: 0 completed
    const initialStats = storage.loadUserStats();
    expect.equal(initialStats.totalStudiesCompleted, 0);
    expect.equal(initialStats.masteryPoints, 0);

    // Session Part 1: Solve Greek Gift Study (Colle vs O'Hanlon)
    storage.saveStudyRecord({
      studyId: 'colle-ohanlon-1930',
      themeId: 'greek_gift',
      score: 95,
      accuracyPercent: 95,
      cleanDepth: 7,
    });

    // Session Part 2: Solve Rook Lift Study (Marshall vs Burn)
    storage.saveStudyRecord({
      studyId: 'marshall-burn-1900',
      themeId: 'rook_lift',
      score: 90,
      accuracyPercent: 90,
      cleanDepth: 5,
    });

    // Session Part 3: Solve King Hunt Study (Ed. Lasker vs Thomas)
    storage.saveStudyRecord({
      studyId: 'ed-lasker-thomas-1912',
      themeId: 'king_hunt',
      score: 100,
      accuracyPercent: 100,
      cleanDepth: 7,
    });

    // Verify session aggregates
    const midStats = storage.loadUserStats();
    expect.equal(midStats.totalStudiesCompleted, 3, 'Must track 3 completed studies');
    expect.equal(midStats.masteryPoints, 285, 'Mastery points: 95 + 90 + 100 = 285');
    expect.equal(midStats.overallAccuracy, 95, 'Average accuracy: (95 + 90 + 100) / 3 = 95%');

    // Verify individual study record properties
    const colleRecord = midStats.studies['colle-ohanlon-1930'];
    expect.equal(colleRecord.completed, true);
    expect.equal(colleRecord.themeId, 'greek_gift');
    expect.equal(colleRecord.bestScore, 95);
    expect.equal(colleRecord.cleanDepth, 7);

    // Session Part 4: Simulate browser page reload (new instance with existing localStorage)
    const reloadedStorage = new StorageHarness(mockStorage);
    const reloadedStats = reloadedStorage.loadUserStats();

    expect.equal(reloadedStats.version, 1);
    expect.equal(reloadedStats.totalStudiesCompleted, 3);
    expect.equal(reloadedStats.masteryPoints, 285);
    expect.equal(reloadedStats.overallAccuracy, 95);
    expect.equal(reloadedStats.studies['ed-lasker-thomas-1912'].bestScore, 100);
    expect.equal(reloadedStats.studies['marshall-burn-1900'].bestScore, 90);
  });
});

runSuite();
