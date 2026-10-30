/**
 * Tier 4: Real-World Application Scenario 3 (S3):
 * Greek Gift Error Handling and Blunder Refutation Scenario:
 * User plays 3.Qh5? -> Gets refuted with 3...Bxg5! -> Reads Russian explanation -> Rewinds -> Plays 3.h4! -> Wins.
 */
import { describe, it, expect, runSuite } from '../harness/testRunner.ts';
import { CalculationTrainerFsmHarness, TrainerStudySpec } from '../harness/fsmHarness.ts';
import { BrowserDomHarness } from '../harness/browserDomHarness.ts';

describe('Tier 4 - S3: Greek Gift Blunder Refutation & Recovery Scenario', () => {
  const greekGiftStudy: TrainerStudySpec = {
    id: 'colle-error-recovery',
    title: 'Колле: Отработка ошибки 14.Qh5??',
    initialFen: 'r1bqr1k1/pp1n1ppp/3bp3/8/3pB3/2P2N2/PP3PPP/R1BQR1K1 w - - 0 12',
    calculationTargetPlies: 5,
    steps: [
      {
        stepIndex: 0,
        moveNumber: 12,
        fenBefore: 'r1bqr1k1/pp1n1ppp/3bp3/8/3pB3/2P2N2/PP3PPP/R1BQR1K1 w - - 0 12',
        expectedFenAfter: 'r1bqr1k1/pp1n1ppB/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 b - - 0 12',
        bestMoveSan: 'Bxh7+',
        bestMoveUci: 'e4h7',
        bestMoveExplanation: '12.Bxh7+!',
        hints: {
          level1Concept: 'Жертвуйте слона.',
          level2Highlight: { fromSquare: 'e4', toSquare: 'h7' },
          level3Arrow: ['e4', 'h7'],
        },
        opponentResponse: {
          san: 'Kxh7',
          uci: 'g8h7',
          fenAfter: 'r1bqr3/pp1n1ppk/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 w - - 0 13',
          comment: '12...Kxh7',
        },
      },
      {
        stepIndex: 1,
        moveNumber: 13,
        fenBefore: 'r1bqr3/pp1n1ppk/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 w - - 0 13',
        expectedFenAfter: 'r1bqr3/pp1n1ppk/3bp3/6N1/3p4/2P5/PP3PPP/R1BQR1K1 b - - 1 13',
        bestMoveSan: 'Ng5+',
        bestMoveUci: 'f3g5',
        bestMoveExplanation: '13.Ng5+!',
        hints: {
          level1Concept: 'Вторжение коня.',
          level2Highlight: { fromSquare: 'f3', toSquare: 'g5' },
          level3Arrow: ['f3', 'g5'],
        },
        opponentResponse: {
          san: 'Kg6',
          uci: 'h7g6',
          fenAfter: 'r1bqr3/pp1n1pp1/3bp1k1/6N1/3p4/2P5/PP3PPP/R1BQR1K1 w - - 2 14',
          comment: '13...Kg6!',
        },
      },
      {
        stepIndex: 2,
        moveNumber: 14,
        fenBefore: 'r1bqr3/pp1n1pp1/3bp1k1/6N1/3p4/2P5/PP3PPP/R1BQR1K1 w - - 2 14',
        expectedFenAfter: 'r1bqr3/pp1n1pp1/3bp1k1/6N1/3p3P/2P5/PP3PP1/R1BQR1K1 b - - 0 14',
        bestMoveSan: 'h4!',
        bestMoveUci: 'h2h4',
        bestMoveExplanation: '14.h4! Ключевой тычок.',
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
          level1Concept: 'Пешечный таран.',
          level2Highlight: { fromSquare: 'h2', toSquare: 'h4' },
          level3Arrow: ['h2', 'h4'],
        },
        opponentResponse: {
          san: 'Rh8',
          uci: 'e8h8',
          fenAfter: 'r1bq3r/pp1n1pp1/3bp1k1/6N1/3p3P/2P5/PP3PP1/R1BQR1K1 w - - 1 15',
          comment: '14...Rh8',
        },
      },
    ],
  };

  it('TC-S3-01: User plays 3.Qh5? -> refuted by 3...Bxg5! -> reads explanation -> rewinds -> plays 3.h4! -> wins', () => {
    const fsm = new CalculationTrainerFsmHarness();
    const dom = new BrowserDomHarness(greekGiftStudy.initialFen);

    fsm.initStudy(greekGiftStudy);

    // 1. Correct 12.Bxh7+
    fsm.submitUserMove('Bxh7+', 3.0);
    fsm.advanceOpponentMove();

    // 2. Correct 13.Ng5+
    fsm.submitUserMove('Ng5+', 3.0);
    fsm.advanceOpponentMove();

    // 3. Blunder: User impulsively plays 14.Qh5??
    const blunderRes = fsm.submitUserMove('Qh5', 1.5);
    expect.equal(blunderRes.quality, 'blunder');
    expect.equal(fsm.state, 'MISTAKE_EXPLANATION');

    // 4. Verify refutation details displayed to user in Russian
    expect.ok(fsm.activeBlunder !== null);
    expect.equal(fsm.activeBlunder!.attemptedSan, 'Qh5');
    expect.equal(fsm.activeBlunder!.punishmentSan, 'Bxg5');
    expect.match(fsm.activeBlunder!.explanation, /Грубейшая ошибка/);
    expect.match(fsm.activeBlunder!.explanation, /Bxg5/);

    // 5. User clicks "Попробовать снова" (rewinds)
    fsm.dismissBlunder();
    expect.equal(fsm.state, 'WAITING_USER_MOVE');
    expect.equal(fsm.activeBlunder, null);

    // 6. User plays correct 14.h4!
    const correctRes = fsm.submitUserMove('h4!', 8.0);
    expect.equal(correctRes.quality, 'best');
    expect.equal(fsm.state, 'STEP_SUCCESS');

    fsm.advanceOpponentMove();
    expect.equal(fsm.state, 'STUDY_COMPLETED');

    const summary = fsm.calculateSessionSummary();
    expect.equal(summary.isCompleted, true);
    // Because step 2 required 2 attempts, score multiplier is 0.50 on that step
    expect.greaterThan(summary.totalScore, 60);
    expect.ok(summary.stars >= 2);
  });
});

runSuite();
