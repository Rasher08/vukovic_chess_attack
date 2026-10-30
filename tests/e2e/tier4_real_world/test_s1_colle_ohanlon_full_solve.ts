/**
 * Tier 4: Real-World Application Scenario 1 (S1):
 * Complete solve of Edgar Colle vs John O'Hanlon (Nice, 1930) 1.Bxh7+ calculation path.
 * 7 plies deep forced attack against stubborn king raid 2...Kg6.
 */
import { describe, it, expect, runSuite } from '../harness/testRunner.ts';
import { CalculationTrainerFsmHarness, TrainerStudySpec } from '../harness/fsmHarness.ts';
import { ChessEngineHarness } from '../harness/chessEngineHarness.ts';
import { StorageHarness, MockLocalStorage } from '../harness/storageHarness.ts';

describe('Tier 4 - S1: Complete Solve of Colle vs O\'Hanlon Calculation Trainer Path', () => {
  const colleMasterStudy: TrainerStudySpec = {
    id: 'colle-ohanlon-1930',
    title: 'Эдгар Колле — Джон О\'Хэнлон (Ницца, 1930)',
    initialFen: 'r1bqr1k1/pp1n1ppp/3bp3/8/3pB3/2P2N2/PP3PPP/R1BQR1K1 w - - 0 12',
    calculationTargetPlies: 7,
    steps: [
      {
        stepIndex: 0,
        moveNumber: 12,
        fenBefore: 'r1bqr1k1/pp1n1ppp/3bp3/8/3pB3/2P2N2/PP3PPP/R1BQR1K1 w - - 0 12',
        expectedFenAfter: 'r1bqr1k1/pp1n1ppB/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 b - - 0 12',
        bestMoveSan: 'Bxh7+',
        bestMoveUci: 'e4h7',
        bestMoveExplanation: '12.Bxh7+! Классическая жертва слона (Greek Gift).',
        hints: {
          level1Concept: 'Разрушьте пешечный щит.',
          level2Highlight: { fromSquare: 'e4', toSquare: 'h7' },
          level3Arrow: ['e4', 'h7'],
        },
        opponentResponse: {
          san: 'Kxh7',
          uci: 'g8h7',
          fenAfter: 'r1bqr3/pp1n1ppk/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 w - - 0 13',
          comment: 'Черные принимают слона.',
        },
      },
      {
        stepIndex: 1,
        moveNumber: 13,
        fenBefore: 'r1bqr3/pp1n1ppk/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 w - - 0 13',
        expectedFenAfter: 'r1bqr3/pp1n1ppk/3bp3/6N1/3p4/2P5/PP3PPP/R1BQR1K1 b - - 1 13',
        bestMoveSan: 'Ng5+',
        bestMoveUci: 'f3g5',
        bestMoveExplanation: '13.Ng5+! Конь подключается с форсированным шахом.',
        hints: {
          level1Concept: 'Вторжение коня на g5.',
          level2Highlight: { fromSquare: 'f3', toSquare: 'g5' },
          level3Arrow: ['f3', 'g5'],
        },
        opponentResponse: {
          san: 'Kg6',
          uci: 'h7g6',
          fenAfter: 'r1bqr3/pp1n1pp1/3bp1k1/6N1/3p4/2P5/PP3PPP/R1BQR1K1 w - - 2 14',
          comment: 'Главное упорство защиты по Вуковичу: король выходит на g6!',
        },
      },
      {
        stepIndex: 2,
        moveNumber: 14,
        fenBefore: 'r1bqr3/pp1n1pp1/3bp1k1/6N1/3p4/2P5/PP3PPP/R1BQR1K1 w - - 2 14',
        expectedFenAfter: 'r1bqr3/pp1n1pp1/3bp1k1/6N1/3p3P/2P5/PP3PP1/R1BQR1K1 b - - 0 14',
        bestMoveSan: 'h4!',
        bestMoveUci: 'h2h4',
        bestMoveExplanation: '14.h4! Пешечный клин лишает короля спасения.',
        hints: {
          level1Concept: 'Пешечный таран.',
          level2Highlight: { fromSquare: 'h2', toSquare: 'h4' },
          level3Arrow: ['h2', 'h4'],
        },
        opponentResponse: {
          san: 'Rh8',
          uci: 'e8h8',
          fenAfter: 'r1bq3r/pp1n1pp1/3bp1k1/6N1/3p3P/2P5/PP3PP1/R1BQR1K1 w - - 1 15',
          comment: 'Черные пытаются прикрыть вертикаль h.',
        },
      },
      {
        stepIndex: 3,
        moveNumber: 15,
        fenBefore: 'r1bq3r/pp1n1pp1/3bp1k1/6N1/3p3P/2P5/PP3PP1/R1BQR1K1 w - - 1 15',
        expectedFenAfter: 'r1bq3r/pp1n1pp1/3bR1k1/6N1/3p3P/2P5/PP3PP1/R1BQ2K1 b - - 0 15',
        bestMoveSan: 'Rxe6+!',
        bestMoveUci: 'e1e6',
        bestMoveExplanation: '15.Rxe6+! Гениальная жертва ладьи за разрушение пешечной цепи.',
        hints: {
          level1Concept: 'Жертва ладьи на e6.',
          level2Highlight: { fromSquare: 'e1', toSquare: 'e6' },
          level3Arrow: ['e1', 'e6'],
        },
      },
    ],
  };

  it('TC-S1-01: End-to-end execution of Colle - O\'Hanlon calculation path with 100% accuracy', () => {
    const fsm = new CalculationTrainerFsmHarness();
    const engine = new ChessEngineHarness(colleMasterStudy.initialFen);
    const storage = new StorageHarness(new MockLocalStorage());

    fsm.initStudy(colleMasterStudy);
    expect.equal(fsm.state, 'WAITING_USER_MOVE');

    // Step 0: 12.Bxh7+
    const move0 = fsm.submitUserMove('Bxh7+', 4.0);
    expect.equal(move0.quality, 'best');
    engine.makeMove('e4', 'h7');
    fsm.advanceOpponentMove();
    engine.makeMove('g8', 'h7');

    // Step 1: 13.Ng5+
    const move1 = fsm.submitUserMove('Ng5+', 3.5);
    expect.equal(move1.quality, 'best');
    engine.makeMove('f3', 'g5');
    fsm.advanceOpponentMove();
    engine.makeMove('h7', 'g6'); // Stubborn 13...Kg6!

    // Step 2: 14.h4!
    const move2 = fsm.submitUserMove('h4!', 5.0);
    expect.equal(move2.quality, 'best');
    engine.makeMove('h2', 'h4');
    fsm.advanceOpponentMove();
    engine.makeMove('e8', 'h8');

    // Step 3: 15.Rxe6+!
    const move3 = fsm.submitUserMove('Rxe6+!', 4.5);
    expect.equal(move3.quality, 'best');
    engine.makeMove('e1', 'e6');
    fsm.advanceOpponentMove();

    // Verification of completion
    expect.equal(fsm.state, 'STUDY_COMPLETED');
    const summary = fsm.calculateSessionSummary();

    expect.equal(summary.isCompleted, true);
    expect.equal(summary.totalScore, 100);
    expect.equal(summary.accuracyPercent, 100);
    expect.equal(summary.stars, 3);
    expect.equal(summary.rankTitleRu, 'Гроссмейстер атаки');
    expect.greaterThanOrEqual(summary.cleanDepthPlies, 6);

    // Save to persistence
    storage.saveStudyRecord({
      studyId: colleMasterStudy.id,
      themeId: 'greek_gift',
      score: summary.totalScore,
      accuracyPercent: summary.accuracyPercent,
      cleanDepth: summary.cleanDepthPlies,
    });

    const stats = storage.loadUserStats();
    expect.equal(stats.totalStudiesCompleted, 1);
    expect.equal(stats.studies[colleMasterStudy.id].bestScore, 100);
    expect.equal(stats.studies[colleMasterStudy.id].completed, true);
  });
});

runSuite();
