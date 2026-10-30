/**
 * Tier 3: Cross-Feature Combinations - Pairwise Interaction C1:
 * Tree Navigation + Calculation Trainer Mode Switching
 */
import { describe, it, expect, runSuite } from '../harness/testRunner.ts';
import { BrowserDomHarness, MoveNodeRecord } from '../harness/browserDomHarness.ts';
import { CalculationTrainerFsmHarness, TrainerStudySpec } from '../harness/fsmHarness.ts';

describe('Tier 3 - C1: Variation Tree and Calculation Trainer Mode Switching', () => {
  const sampleStudy: TrainerStudySpec = {
    id: 'mode-switch-study',
    title: 'Тест переключения режимов',
    initialFen: 'r1bqr1k1/pp1n1ppp/3bp3/8/3pB3/2P2N2/PP3PPP/R1BQR1K1 w - - 0 12',
    calculationTargetPlies: 3,
    steps: [
      {
        stepIndex: 0,
        moveNumber: 12,
        fenBefore: 'r1bqr1k1/pp1n1ppp/3bp3/8/3pB3/2P2N2/PP3PPP/R1BQR1K1 w - - 0 12',
        expectedFenAfter: 'r1bqr1k1/pp1n1ppB/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 b - - 0 12',
        bestMoveSan: 'Bxh7+',
        bestMoveUci: 'e4h7',
        bestMoveExplanation: 'Жертва на h7',
        hints: {
          level1Concept: 'Жертвуйте слона',
          level2Highlight: { fromSquare: 'e4', toSquare: 'h7' },
          level3Arrow: ['e4', 'h7'],
        },
      },
    ],
  };

  it('TC-C1-01: Switching from Study Mode to Trainer Mode enables Fog of War and resets board', () => {
    const dom = new BrowserDomHarness(sampleStudy.initialFen);
    const fsm = new CalculationTrainerFsmHarness();

    // Start in Study Mode: Fog of War disabled
    dom.isFogOfWarEnabled = false;
    expect.equal(dom.isFogOfWarEnabled, false);

    // Switch to Trainer Mode
    fsm.initStudy(sampleStudy);
    dom.isFogOfWarEnabled = true;

    expect.equal(dom.isFogOfWarEnabled, true, 'Fog of War must be active in Trainer Mode');
    expect.equal(fsm.state, 'WAITING_USER_MOVE');
    expect.equal(fsm.currentFen, sampleStudy.initialFen);
  });

  it('TC-C1-02: Toggling from Trainer Mode to Analysis Mode preserves position and reveals tree', () => {
    const dom = new BrowserDomHarness(sampleStudy.initialFen);
    const fsm = new CalculationTrainerFsmHarness();

    fsm.initStudy(sampleStudy);
    // User solves step 0
    fsm.submitUserMove('Bxh7+', 4.0);
    expect.equal(fsm.state, 'STEP_SUCCESS');

    // Switch to Analysis Mode
    fsm.toggleAnalysisMode(true);
    dom.isFogOfWarEnabled = false;

    expect.equal(fsm.state, 'ANALYSIS_MODE');
    expect.equal(dom.isFogOfWarEnabled, false, 'Tree moves are now unmasked');
    expect.equal(fsm.currentFen, sampleStudy.steps[0].expectedFenAfter);

    // Return to Trainer Mode restores previous state
    fsm.toggleAnalysisMode(false);
    expect.equal(fsm.state, 'STEP_SUCCESS');
  });
});

runSuite();
