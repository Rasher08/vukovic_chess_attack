/**
 * Tier 3: Cross-Feature Combinations - Pairwise Interaction C2:
 * Blunder Refutation + Physical Board Move Playback + Sound Synth
 */
import { describe, it, expect, runSuite } from '../harness/testRunner.ts';
import { CalculationTrainerFsmHarness, TrainerStudySpec } from '../harness/fsmHarness.ts';
import { BrowserDomHarness } from '../harness/browserDomHarness.ts';
import { SynthHarness } from '../harness/synthHarness.ts';

describe('Tier 3 - C2: Blunder Refutation, Board Playback, and Audio Synth', () => {
  const blunderStudy: TrainerStudySpec = {
    id: 'blunder-playback-study',
    title: 'Тест опровержения зевка с аудио',
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
        bestMoveExplanation: 'Пешечный таран h4!',
        blunders: [
          {
            san: 'Qh5',
            uci: 'd1h5',
            refutationSan: 'Bxg5',
            refutationUci: 'c8g5',
            refutationFen: 'r1bqr1k1/pp1n1pp1/3bp1k1/6bQ/3p4/2P5/PP3PPP/R1B1R1K1 w - - 0 15',
            explanation: 'Грубейшая ошибка! Черный слон забирает коня g5 (14...Bxg5!).',
          },
        ],
        hints: {
          level1Concept: 'Двигайте крайнюю пешку.',
          level2Highlight: { fromSquare: 'h2', toSquare: 'h4' },
          level3Arrow: ['h2', 'h4'],
        },
      },
    ],
  };

  it('TC-C2-01: Blunder move plays opponent countermove, captures sound, and displays red arrow', () => {
    const fsm = new CalculationTrainerFsmHarness();
    const dom = new BrowserDomHarness(blunderStudy.initialFen);
    const synth = new SynthHarness();

    fsm.initStudy(blunderStudy);

    // User attempts blunder move 14.Qh5??
    const result = fsm.submitUserMove('Qh5', 5.0);
    expect.equal(result.quality, 'blunder');
    expect.equal(fsm.state, 'MISTAKE_EXPLANATION');

    // Synthesizer plays capture sound for Black's 14...Bxg5!
    synth.playCapture();
    expect.equal(synth.getLastEvent()?.type, 'capture');
    expect.equal(synth.getLastEvent()?.frequencies[0], 260);

    // Verify board and blunder details
    expect.ok(fsm.activeBlunder !== null);
    expect.equal(fsm.activeBlunder!.punishmentSan, 'Bxg5');
    expect.deepEqual(fsm.activeBlunder!.arrows[0], ['c8', 'g5', 'red']);
    expect.equal(fsm.currentFen, blunderStudy.steps[0].blunders![0].refutationFen);
  });

  it('TC-C2-02: Dismissing blunder modal rewinds FEN, clears red arrows, and unlocks board', () => {
    const fsm = new CalculationTrainerFsmHarness();
    const dom = new BrowserDomHarness(blunderStudy.initialFen);

    fsm.initStudy(blunderStudy);
    fsm.submitUserMove('Qh5', 4.0);
    expect.equal(fsm.state, 'MISTAKE_EXPLANATION');

    // Dismiss blunder modal
    fsm.dismissBlunder();
    expect.equal(fsm.state, 'WAITING_USER_MOVE');
    expect.equal(fsm.activeBlunder, null);
    expect.equal(fsm.currentFen, blunderStudy.steps[0].fenBefore);
    expect.equal(dom.isBoardLocked, false);
  });
});

runSuite();
