/**
 * Tier 3: Cross-Feature Combinations - Pairwise Interaction C4:
 * Promotion Modal + FSM Step Evaluation + Retry Multiplier Deduction
 */
import { describe, it, expect, runSuite } from '../harness/testRunner.ts';
import { CalculationTrainerFsmHarness, TrainerStudySpec } from '../harness/fsmHarness.ts';
import { BrowserDomHarness } from '../harness/browserDomHarness.ts';

describe('Tier 3 - C4: Promotion Modal, FSM Evaluation, and Retry Penalty', () => {
  const promotionStudy: TrainerStudySpec = {
    id: 'promotion-fsm-study',
    title: 'Тест превращения пешки и скоринга',
    initialFen: '3r4/4Pk2/8/8/8/8/8/4K3 w - - 0 1',
    calculationTargetPlies: 1,
    steps: [
      {
        stepIndex: 0,
        moveNumber: 1,
        fenBefore: '3r4/4Pk2/8/8/8/8/8/4K3 w - - 0 1',
        expectedFenAfter: '3Q4/5k2/8/8/8/8/8/4K3 b - - 0 1',
        bestMoveSan: 'exd8=Q',
        bestMoveUci: 'e7d8q',
        bestMoveExplanation: 'Взятие ладьи с превращением в ферзя.',
        hints: {
          level1Concept: 'Заберите ладью с превращением.',
          level2Highlight: { fromSquare: 'e7', toSquare: 'd8' },
          level3Arrow: ['e7', 'd8'],
        },
      },
    ],
  };

  it('TC-C4-01: Pawn moving to rank 8 triggers promotion modal and evaluates selected piece', () => {
    const dom = new BrowserDomHarness(promotionStudy.initialFen);
    const fsm = new CalculationTrainerFsmHarness();

    fsm.initStudy(promotionStudy);

    // Click e7 (White pawn)
    const click1 = dom.clickSquare('e7');
    expect.equal(click1.action, 'selected');

    // Click d8 (Capture on 8th rank)
    const click2 = dom.clickSquare('d8');
    expect.equal(click2.action, 'promotion_opened');
    expect.equal(dom.isPromotionModalOpen, true);
    expect.deepEqual(dom.pendingPromotion, { from: 'e7', to: 'd8' });

    // Choose Queen from promotion dialog
    const confirmed = dom.confirmPromotion('q');
    expect.equal(confirmed, true);
    expect.equal(dom.isPromotionModalOpen, false);
    expect.equal(dom.engine.getPiece('d8')?.type, 'q');

    // Evaluate in FSM
    const evalRes = fsm.submitUserMove('exd8=Q', 5.0);
    expect.equal(evalRes.quality, 'best');
    expect.equal(fsm.state, 'STEP_SUCCESS');
  });

  it('TC-C4-02: Retry penalty scales from 1.0 (1st try) to 0.50 (2nd try) to 0.25 (3rd+ try)', () => {
    const fsm = new CalculationTrainerFsmHarness();
    fsm.initStudy(promotionStudy);

    // Attempt 1: wrong move
    fsm.submitUserMove('e1e2', 3.0);
    expect.equal(fsm.state, 'MISTAKE_EXPLANATION');
    fsm.dismissBlunder();

    // Attempt 2: another wrong move
    fsm.submitUserMove('e1f2', 3.0);
    expect.equal(fsm.state, 'MISTAKE_EXPLANATION');
    fsm.dismissBlunder();

    // Attempt 3: correct move
    fsm.submitUserMove('exd8=Q', 5.0);
    expect.equal(fsm.state, 'STEP_SUCCESS');

    // Score on 3rd attempt must have 0.25 multiplier
    const score = fsm.stepScores[0];
    expect.equal(score.attemptsMultiplier, 0.25, '3rd attempt must have 0.25 attempts multiplier');
    expect.equal(score.finalStepScore, 25);
  });
});

runSuite();
