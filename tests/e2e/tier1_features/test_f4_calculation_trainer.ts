/**
 * Tier 1: Feature 4 (F4) - Deep Calculation Trainer Mode & FSM
 * Tests the 8-state FSM, 3-7 ply forced moves requirement, stubborn opponent responses,
 * blunder refutations with playback, 3-tier hint ladder, and calculation scoring.
 */
import { describe, it, expect, runSuite } from '../harness/testRunner.ts';
import { CalculationTrainerFsmHarness, TrainerStudySpec } from '../harness/fsmHarness.ts';
import { StorageHarness } from '../harness/storageHarness.ts';

describe('Tier 1 - F4: Deep Calculation Trainer Mode & FSM', () => {
  // Model Colle vs O'Hanlon 1.Bxh7+ calculation path (4 user steps / 7 plies total)
  const colleStudy: TrainerStudySpec = {
    id: 'colle-ohanlon-1930',
    title: 'Колле — О\'Хэнлон (1930)',
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
        bestMoveExplanation: 'Классическая жертва слона (Greek Gift). Защитный конь f6 отсутствует.',
        hints: {
          level1Concept: 'Разрушьте пешечный щит черного короля жертвой на h7.',
          level2Highlight: { fromSquare: 'e4', toSquare: 'h7' },
          level3Arrow: ['e4', 'h7'],
        },
        opponentResponse: {
          san: 'Kxh7',
          uci: 'g8h7',
          fenAfter: 'r1bqr3/pp1n1ppk/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 w - - 0 13',
          comment: 'Черные принимают жертву.',
        },
      },
      {
        stepIndex: 1,
        moveNumber: 13,
        fenBefore: 'r1bqr3/pp1n1ppk/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 w - - 0 13',
        expectedFenAfter: 'r1bqr3/pp1n1ppk/3bp3/6N1/3p4/2P5/PP3PPP/R1BQR1K1 b - - 1 13',
        bestMoveSan: 'Ng5+',
        bestMoveUci: 'f3g5',
        bestMoveExplanation: 'Конь вторгается на g5 с шахом, подключая атакующие резервы.',
        hints: {
          level1Concept: 'Подключите вторую легкую фигуру с форсированным шахом.',
          level2Highlight: { fromSquare: 'f3', toSquare: 'g5' },
          level3Arrow: ['f3', 'g5'],
        },
        opponentResponse: {
          san: 'Kg6',
          uci: 'h7g6',
          fenAfter: 'r1bqr3/pp1n1pp1/3bp1k1/6N1/3p4/2P5/PP3PPP/R1BQR1K1 w - - 2 14',
          comment: 'Самое упорное возражение черных: король идет вперед на g6!',
        },
      },
      {
        stepIndex: 2,
        moveNumber: 14,
        fenBefore: 'r1bqr3/pp1n1pp1/3bp1k1/6N1/3p4/2P5/PP3PPP/R1BQR1K1 w - - 2 14',
        expectedFenAfter: 'r1bqr3/pp1n1pp1/3bp1k1/6N1/3p3P/2P5/PP3PP1/R1BQR1K1 b - - 0 14',
        bestMoveSan: 'h4!',
        bestMoveUci: 'h2h4',
        bestMoveExplanation: 'Ключевой ход Вуковича! Пешечный таран 14.h4! строит капкан.',
        blunders: [
          {
            san: 'Qh5',
            uci: 'd1h5',
            refutationSan: 'Bxg5',
            refutationUci: 'c8g5',
            refutationFen: 'r1bqr3/pp1n1pp1/3bp1k1/6bQ/3p4/2P5/PP3PPP/R1B1R1K1 w - - 0 15',
            explanation: 'Грубейшая ошибка! Преждевременный шах 14.Qh5?? позволяет черным бесплатно забрать коня 14...Bxg5! с выигранной позицией.',
          },
        ],
        hints: {
          level1Concept: 'Отрежьте королю убежище продвижением крайней пешки.',
          level2Highlight: { fromSquare: 'h2', toSquare: 'h4' },
          level3Arrow: ['h2', 'h4'],
        },
        opponentResponse: {
          san: 'Rh8',
          uci: 'e8h8',
          fenAfter: 'r1bq3r/pp1n1pp1/3bp1k1/6N1/3p3P/2P5/PP3PP1/R1BQR1K1 w - - 1 15',
          comment: 'Черные пытаются прикрыть пункт h5.',
        },
      },
      {
        stepIndex: 3,
        moveNumber: 15,
        fenBefore: 'r1bq3r/pp1n1pp1/3bp1k1/6N1/3p3P/2P5/PP3PP1/R1BQR1K1 w - - 1 15',
        expectedFenAfter: 'r1bq3r/pp1n1pp1/3bR1k1/6N1/3p3P/2P5/PP3PP1/R1BQ2K1 b - - 0 15',
        bestMoveSan: 'Rxe6+!',
        bestMoveUci: 'e1e6',
        bestMoveExplanation: 'Гениальная жертва ладьи! Разрушение пешечной цепи e6.',
        hints: {
          level1Concept: 'Пожертвуйте тяжелую фигуру на e6 для вскрытия короля.',
          level2Highlight: { fromSquare: 'e1', toSquare: 'e6' },
          level3Arrow: ['e1', 'e6'],
        },
      },
    ],
  };

  it('TC-F4-01: FSM state transitions across all 8 states in sequence', () => {
    const fsm = new CalculationTrainerFsmHarness();
    expect.equal(fsm.state, 'IDLE');

    fsm.initStudy(colleStudy);
    expect.equal(fsm.state, 'WAITING_USER_MOVE');

    // Submit step 0 (12.Bxh7+)
    const res0 = fsm.submitUserMove('Bxh7+', 4.0);
    expect.equal(res0.quality, 'best');
    expect.equal(fsm.state, 'STEP_SUCCESS');

    // Opponent response
    fsm.advanceOpponentMove();
    expect.equal(fsm.state, 'WAITING_USER_MOVE');
    expect.equal(fsm.currentStepIndex, 1);

    // Analysis mode toggle
    fsm.toggleAnalysisMode(true);
    expect.equal(fsm.state, 'ANALYSIS_MODE');
    fsm.toggleAnalysisMode(false);
    expect.equal(fsm.state, 'WAITING_USER_MOVE');
  });

  it('TC-F4-02: Multi-ply forcing moves requirement (cannot skip plies)', () => {
    const fsm = new CalculationTrainerFsmHarness();
    fsm.initStudy(colleStudy);

    expect.equal(colleStudy.calculationTargetPlies, 7, 'Target plies must be 7');
    expect.equal(colleStudy.steps.length, 4, 'Requires 4 distinct correct white moves');

    // Step 0
    fsm.submitUserMove('Bxh7+', 5.0);
    fsm.advanceOpponentMove();

    // User is now at step 1 (move 13)
    expect.equal(fsm.currentStepIndex, 1);
    expect.equal(fsm.state, 'WAITING_USER_MOVE');
    expect.equal(fsm.getCurrentStep().moveNumber, 13);
  });

  it('TC-F4-03: Opponent plays stubborn defensive lines automatically', () => {
    const fsm = new CalculationTrainerFsmHarness();
    fsm.initStudy(colleStudy);

    // Move 1
    fsm.submitUserMove('Bxh7+', 3.0);
    fsm.advanceOpponentMove(); // Black plays 12...Kxh7

    // Move 2
    fsm.submitUserMove('Ng5+', 4.0);
    fsm.advanceOpponentMove(); // Black plays stubborn 13...Kg6!

    // Verify FEN now has King on g6
    expect.match(fsm.currentFen, /3bp1k1/);
    expect.equal(fsm.getCurrentStep().moveNumber, 14);
  });

  it('TC-F4-04: Blunder refutation triggers physical countermove, modal, and retry', () => {
    const fsm = new CalculationTrainerFsmHarness();
    fsm.initStudy(colleStudy);

    fsm.submitUserMove('Bxh7+', 3.0);
    fsm.advanceOpponentMove();
    fsm.submitUserMove('Ng5+', 3.0);
    fsm.advanceOpponentMove();

    // In step 2, user mistakenly plays 14.Qh5??
    const blunderRes = fsm.submitUserMove('Qh5', 5.0);
    expect.equal(blunderRes.quality, 'blunder');
    expect.equal(fsm.state, 'MISTAKE_EXPLANATION');
    expect.ok(fsm.activeBlunder !== null);
    expect.equal(fsm.activeBlunder!.attemptedSan, 'Qh5');
    expect.equal(fsm.activeBlunder!.punishmentSan, 'Bxg5');
    expect.match(fsm.activeBlunder!.explanation, /Грубейшая ошибка/);

    // Click "Попробовать снова"
    fsm.dismissBlunder();
    expect.equal(fsm.state, 'WAITING_USER_MOVE');
    expect.equal(fsm.activeBlunder, null);

    // Now play correct 14.h4!
    const correctRes = fsm.submitUserMove('h4!', 5.0);
    expect.equal(correctRes.quality, 'best');
    expect.equal(fsm.state, 'STEP_SUCCESS');
  });

  it('TC-F4-05: 3-tier hint ladder progression and penalty multipliers', () => {
    const fsm = new CalculationTrainerFsmHarness();
    fsm.initStudy(colleStudy);

    // Hint 1: Concept text
    const hint1 = fsm.requestHint(1);
    expect.match(hint1.hintText, /Разрушьте пешечный щит/);
    expect.equal(hint1.arrow, undefined);

    // Hint 2: Highlight
    const hint2 = fsm.requestHint(2);
    expect.ok(hint2.highlight !== undefined);
    expect.equal(hint2.highlight.fromSquare, 'e4');
    expect.equal(hint2.highlight.toSquare, 'h7');

    // Hint 3: Direct Arrow
    const hint3 = fsm.requestHint(3);
    expect.ok(hint3.arrow !== undefined);
    expect.deepEqual(hint3.arrow, ['e4', 'h7']);

    // Submit move with hint level 3
    fsm.submitUserMove('Bxh7+', 5.0);
    const score0 = fsm.stepScores[0];
    expect.equal(score0.hintMultiplier, 0.25, 'Hint 3 reduces multiplier to 0.25');
    expect.equal(score0.finalStepScore, 25);
  });

  it('TC-F4-06: Calculation scoring equation and mastery ranks derivation', () => {
    const fsm = new CalculationTrainerFsmHarness();
    fsm.initStudy(colleStudy);

    // Solve all steps with first attempt, no hints, time in optimal window (5s)
    fsm.submitUserMove('Bxh7+', 5.0);
    fsm.advanceOpponentMove();

    fsm.submitUserMove('Ng5+', 5.0);
    fsm.advanceOpponentMove();

    fsm.submitUserMove('h4!', 5.0);
    fsm.advanceOpponentMove();

    fsm.submitUserMove('Rxe6+!', 5.0);
    fsm.advanceOpponentMove();

    expect.equal(fsm.state, 'STUDY_COMPLETED');
    const summary = fsm.calculateSessionSummary();

    expect.equal(summary.isCompleted, true);
    expect.equal(summary.totalScore, 100);
    expect.equal(summary.accuracyPercent, 100);
    expect.equal(summary.stars, 3);
    expect.equal(summary.rankTitleRu, 'Гроссмейстер атаки');
    expect.greaterThanOrEqual(summary.cleanDepthPlies, 6);
  });

  it('TC-F4-07: LocalStorage progress persistence and session recovery', () => {
    const storageHarness = new StorageHarness();
    storageHarness.saveStudyRecord({
      studyId: 'colle-ohanlon-1930',
      themeId: 'greek_gift',
      score: 95,
      accuracyPercent: 100,
      cleanDepth: 7,
    });

    const stats = storageHarness.loadUserStats();
    expect.equal(stats.totalStudiesCompleted, 1);
    expect.equal(stats.overallAccuracy, 100);
    expect.equal(stats.studies['colle-ohanlon-1930'].bestScore, 95);
    expect.equal(stats.studies['colle-ohanlon-1930'].completed, true);
  });
});

runSuite();
