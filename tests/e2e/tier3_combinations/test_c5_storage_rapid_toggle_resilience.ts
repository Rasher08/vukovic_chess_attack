/**
 * Tier 3: Cross-Feature Combinations - Pairwise Interaction C5:
 * LocalStorage Persistence Under Rapid Mode Toggling & State Reload
 */
import { describe, it, expect, runSuite } from '../harness/testRunner.ts';
import { StorageHarness, MockLocalStorage, STORAGE_KEY } from '../harness/storageHarness.ts';
import { CalculationTrainerFsmHarness, TrainerStudySpec } from '../harness/fsmHarness.ts';

describe('Tier 3 - C5: Storage Persistence Under Rapid Mode Toggling & State Reload', () => {
  const quickStudy: TrainerStudySpec = {
    id: 'rapid-study-1',
    title: 'Быстрый этюд',
    initialFen: 'r1bqr1k1/pp1n1ppp/3bp3/8/3pB3/2P2N2/PP3PPP/R1BQR1K1 w - - 0 12',
    calculationTargetPlies: 1,
    steps: [
      {
        stepIndex: 0,
        moveNumber: 12,
        fenBefore: 'r1bqr1k1/pp1n1ppp/3bp3/8/3pB3/2P2N2/PP3PPP/R1BQR1K1 w - - 0 12',
        expectedFenAfter: 'r1bqr1k1/pp1n1ppB/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 b - - 0 12',
        bestMoveSan: 'Bxh7+',
        bestMoveUci: 'e4h7',
        bestMoveExplanation: 'Жертва слона на h7',
        hints: {
          level1Concept: 'Взятие на h7',
          level2Highlight: { fromSquare: 'e4', toSquare: 'h7' },
          level3Arrow: ['e4', 'h7'],
        },
      },
    ],
  };

  it('TC-C5-01: Rapid solve, mode switch, page reload simulation preserves stars and scores', () => {
    const mockStorage = new MockLocalStorage();
    const storageHarness = new StorageHarness(mockStorage);
    const fsm = new CalculationTrainerFsmHarness();

    // 1. Solve study in Trainer Mode
    fsm.initStudy(quickStudy);
    fsm.submitUserMove('Bxh7+', 4.0);
    fsm.advanceOpponentMove();
    expect.equal(fsm.state, 'STUDY_COMPLETED');

    const summary = fsm.calculateSessionSummary();
    storageHarness.saveStudyRecord({
      studyId: quickStudy.id,
      themeId: 'greek_gift',
      score: summary.totalScore,
      accuracyPercent: summary.accuracyPercent,
      cleanDepth: summary.cleanDepthPlies,
    });

    // 2. Toggle to Analysis Mode
    fsm.toggleAnalysisMode(true);
    expect.equal(fsm.state, 'ANALYSIS_MODE');

    // 3. Simulate browser reload (new harness instance with same mock storage)
    const reloadedStorage = new StorageHarness(mockStorage);
    const reloadedStats = reloadedStorage.loadUserStats();

    expect.equal(reloadedStats.totalStudiesCompleted, 1);
    expect.equal(reloadedStats.studies[quickStudy.id].completed, true);
    expect.equal(reloadedStats.studies[quickStudy.id].bestScore, 100);
    expect.equal(reloadedStats.studies[quickStudy.id].bestAccuracy, 100);
  });

  it('TC-C5-02: Concurrent session updates across multiple studies maintain aggregated catalog statistics', () => {
    const mockStorage = new MockLocalStorage();
    const storageHarness = new StorageHarness(mockStorage);

    // Save study 1: 100% score
    storageHarness.saveStudyRecord({
      studyId: 'colle-ohanlon-1930',
      themeId: 'greek_gift',
      score: 100,
      accuracyPercent: 100,
      cleanDepth: 7,
    });

    // Save study 2: 80% score
    storageHarness.saveStudyRecord({
      studyId: 'greco-model-study-1619',
      themeId: 'greek_gift',
      score: 80,
      accuracyPercent: 80,
      cleanDepth: 5,
    });

    // Save study 3: 90% score
    storageHarness.saveStudyRecord({
      studyId: 'ed-lasker-thomas-1912',
      themeId: 'king_hunt',
      score: 90,
      accuracyPercent: 90,
      cleanDepth: 7,
    });

    const stats = storageHarness.loadUserStats();
    expect.equal(stats.totalStudiesCompleted, 3, 'Must track 3 completed studies');
    expect.equal(stats.masteryPoints, 270, 'Sum of scores: 100 + 80 + 90 = 270');
    expect.equal(stats.overallAccuracy, 90, 'Average accuracy: (100 + 80 + 90) / 3 = 90%');
  });
});

runSuite();
