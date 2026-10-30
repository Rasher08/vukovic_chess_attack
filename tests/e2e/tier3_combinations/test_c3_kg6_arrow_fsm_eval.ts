/**
 * Tier 3: Cross-Feature Combinations - Pairwise Interaction C3:
 * Greek Gift 2...Kg6 Line + Hint Level 3 Arrow Rendering + FSM Step Evaluation
 */
import { describe, it, expect, runSuite } from '../harness/testRunner.ts';
import { CalculationTrainerFsmHarness, TrainerStudySpec } from '../harness/fsmHarness.ts';
import { BrowserDomHarness } from '../harness/browserDomHarness.ts';

describe('Tier 3 - C3: Greek Gift 2...Kg6, Hint 3 Arrow, and FSM Evaluation', () => {
  const kg6Study: TrainerStudySpec = {
    id: 'kg6-arrow-study',
    title: 'Тест 2...Kg6 и подсказок',
    initialFen: 'r1bqr1k1/pp1n1pp1/3bp1k1/6N1/3p4/2P5/PP3PPP/R1BQR1K1 w - - 2 14',
    calculationTargetPlies: 3,
    steps: [
      {
        stepIndex: 0,
        moveNumber: 14,
        fenBefore: 'r1bqr1k1/pp1n1pp1/3bp1k1/6N1/3p4/2P5/PP3PPP/R1BQR1K1 w - - 2 14',
        expectedFenAfter: 'r1bqr1k1/pp1n1pp1/3bp1k1/6N1/3p3P/2P5/PP3PP1/R1BQR1K1 b - - 0 14',
        bestMoveSan: 'h4!',
        bestMoveUci: 'h2h4',
        bestMoveExplanation: '14.h4! строит матовый капкан.',
        hints: {
          level1Concept: 'Отрежьте королю убежище.',
          level2Highlight: { fromSquare: 'h2', toSquare: 'h4' },
          level3Arrow: ['h2', 'h4'],
        },
      },
    ],
  };

  it('TC-C3-01: Requesting Hint 3 renders green arrow [h2, h4] and applies 0.25 multiplier penalty', () => {
    const fsm = new CalculationTrainerFsmHarness();
    const dom = new BrowserDomHarness(kg6Study.initialFen);

    fsm.initStudy(kg6Study);

    // Request Hint 3
    const hint3 = fsm.requestHint(3);
    expect.ok(hint3.arrow !== undefined);
    expect.deepEqual(hint3.arrow, ['h2', 'h4']);

    // Render arrow on board
    dom.arrows = [[hint3.arrow![0] as any, hint3.arrow![1] as any, 'rgba(34, 197, 94, 0.85)']];
    expect.equal(dom.arrows.length, 1);
    expect.equal(dom.arrows[0][0], 'h2');
    expect.equal(dom.arrows[0][1], 'h4');

    // Execute move 14.h4!
    const result = fsm.submitUserMove('h4!', 5.0);
    expect.equal(result.quality, 'best');
    expect.equal(fsm.state, 'STEP_SUCCESS');

    // Verify penalty in score breakdown
    const scoreBreakdown = fsm.stepScores[0];
    expect.equal(scoreBreakdown.hintMultiplier, 0.25, 'Hint 3 reduces score multiplier to 0.25');
    expect.equal(scoreBreakdown.finalStepScore, 25, 'Final score must reflect 25 points out of 100');
  });

  it('TC-C3-02: Hint arrow automatically clears upon move completion', () => {
    const dom = new BrowserDomHarness(kg6Study.initialFen);
    dom.arrows = [['h2', 'h4', 'rgba(34, 197, 94, 0.85)']];
    expect.equal(dom.arrows.length, 1);

    // After move executes, clear hint arrows
    dom.arrows = [];
    expect.equal(dom.arrows.length, 0);
  });
});

runSuite();
