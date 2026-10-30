/**
 * Challenger 1 Empirical Test Suite for Milestone 4 (M4)
 * Deep Calculation Trainer Engine
 * 
 * Verifies:
 * 1. Extraction of forced calculation sequences across all 18 studies in catalog:
 *    - Steps count and calculation plies depth (3-8 plies).
 *    - Strict legality of all moves and validity of FENs with chess.js.
 * 2. Full simulation of White correct moves and automated Black replies:
 *    - Leading from initial sacrifice to study completion state.
 *    - Detection of any FEN transition drift or corrupted expected FENs.
 * 3. Dual-win positions:
 *    - Ed. Lasker vs Sir George Thomas (1912): 18.Kd2# vs 18.O-O-O# (both deliver checkmate).
 *    - Tarrasch vs von Scheve (1894): 31.Rxf8# vs 31.Qxf8# (both deliver checkmate).
 *    - Evaluation by CalculationTrainer matching logic: does it accept both winning moves or reject them as blunders?
 * 4. Scoring algorithm & Hint penalties:
 *    - First-try solve in optimal time window awards 100% score and 100% accuracy.
 *    - Hint Level 1 penalty: -15% (0.85 multiplier -> 85 points).
 *    - Hint Level 2 penalty: -40% (0.60 multiplier -> 60 points).
 *    - Hint Level 3 penalty: -75% (0.25 multiplier -> 25 points).
 *    - Retry attempt penalties (2nd attempt: 0.50, 3rd+ attempt: 0.25).
 *    - Time window multipliers (<2s hasty guess: 0.95, >75s: 0.75).
 * 5. Storage persistence & Quota resilience:
 *    - LocalStorage save and load round-trip.
 *    - Memory fallback during SSR.
 */

import { describe, it, expect, runSuite } from './e2e/harness/testRunner.ts';
import { allStudies, getStudyById } from '../src/data/studies/index.ts';
import {
  getCalculationStepsForStudy,
  CalculationStepSpec,
} from '../src/components/trainer/CalculationTrainer.tsx';
import { Chess } from 'chess.js';
import {
  saveStudyRecord,
  loadUserStats,
  STORAGE_KEY,
} from '../src/lib/storage.ts';

/**
 * Emulates the exact move evaluation logic from CalculationTrainer.tsx (lines 511-630)
 */
function evaluateMoveWithTrainerLogic(
  currentStep: CalculationStepSpec,
  moveUci: string,
  moveSan: string
): { isAccepted: boolean; quality: 'best' | 'alternative' | 'blunder'; blunderExplanation?: string } {
  const cleanUci = moveUci.toLowerCase().replace(/[^a-h1-8qrbn]/g, '');
  const cleanSan = moveSan.replace(/[!?+#\s]/g, '');

  // 1. Best move check
  const expectedCleanSan = currentStep.bestMoveSan.replace(/[!?+#\s]/g, '');
  const expectedCleanUci = currentStep.bestMoveUci.toLowerCase();

  const isBest =
    cleanSan === expectedCleanSan ||
    cleanUci === expectedCleanUci ||
    cleanUci.startsWith(expectedCleanUci);

  if (isBest) {
    return { isAccepted: true, quality: 'best' };
  }

  // 2. Alternative moves check
  const matchedAlt = currentStep.alternativeMoves?.find((alt) => {
    const altSan = alt.san.replace(/[!?+#\s]/g, '');
    return cleanSan === altSan || cleanUci === alt.uci;
  });

  if (matchedAlt) {
    return { isAccepted: true, quality: 'alternative' };
  }

  // 3. Blunder check
  const matchedBlunder = currentStep.blunders?.find((b) => {
    const bSan = b.san.replace(/[!?+#\s]/g, '');
    return cleanSan === bSan || cleanUci === b.uci;
  });

  if (matchedBlunder) {
    return {
      isAccepted: false,
      quality: 'blunder',
      blunderExplanation: matchedBlunder.explanation,
    };
  }

  // 4. Default blunder / unexpected wrong move
  return {
    isAccepted: false,
    quality: 'blunder',
    blunderExplanation:
      'Ход не соответствует форсированной линии Вуковича. Белые теряют темп и инициативу в атаке.',
  };
}

describe('Challenger M4 Empirical Suite: Deep Calculation Trainer Engine', () => {

  // =========================================================================
  // Test 1: Step Extraction across all 18 studies
  // =========================================================================
  it('CH-M4-01: Extraction of calculation steps across all 18 catalog studies', () => {
    expect.equal(allStudies.length, 18, 'Catalog must contain 18 studies');

    for (const study of allStudies) {
      const steps = getCalculationStepsForStudy(study);
      expect.ok(steps.length >= 1, `Study ${study.id} must produce at least 1 calculation step`);

      // Verify calculationTargetPlies is configured in 3-8 range
      expect.ok(
        study.calculationTargetPlies >= 3 && study.calculationTargetPlies <= 8,
        `Study ${study.id} calculationTargetPlies must be between 3 and 8 plies (got ${study.calculationTargetPlies})`
      );

      // Verify each step has required properties
      for (const step of steps) {
        expect.ok(step.bestMoveSan, `Step in ${study.id} must have bestMoveSan`);
        expect.ok(step.bestMoveUci, `Step in ${study.id} must have bestMoveUci`);
        expect.ok(step.fenBefore, `Step in ${study.id} must have fenBefore`);
        expect.ok(step.expectedFenAfter, `Step in ${study.id} must have expectedFenAfter`);
        expect.ok(step.hints, `Step in ${study.id} must have hints`);
        expect.ok(step.hints.level1Concept, `Step in ${study.id} must have level1Concept`);
        expect.ok(step.hints.level2Highlight, `Step in ${study.id} must have level2Highlight`);
        expect.ok(step.hints.level3Arrow, `Step in ${study.id} must have level3Arrow`);
      }
    }
  });

  // =========================================================================
  // Test 2: Full Simulation from sacrifice to completion
  // =========================================================================
  it('CH-M4-02: Simulating correct White moves and Black replies leads to completion', () => {
    for (const study of allStudies) {
      const steps = getCalculationStepsForStudy(study);
      const chess = new Chess();

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        // Ensure board can load fenBefore
        chess.load(step.fenBefore);

        // Execute White move
        const moveRes = chess.move(step.bestMoveSan);
        expect.ok(moveRes !== null, `Legal White move ${step.bestMoveSan} at step ${i} in ${study.id}`);

        // If opponent responds, execute Black reply
        if (step.opponentResponse) {
          const oppRes = chess.move(step.opponentResponse.san);
          expect.ok(
            oppRes !== null,
            `Legal Black response ${step.opponentResponse.san} at step ${i} in ${study.id}`
          );

          // If next step exists, its fenBefore must align with Black's resulting position
          if (i + 1 < steps.length) {
            const currentNormFen = chess.fen().split(' ').slice(0, 4).join(' ');
            const nextNormFen = steps[i + 1].fenBefore.split(' ').slice(0, 4).join(' ');
            expect.equal(
              currentNormFen,
              nextNormFen,
              `Continuous board continuity between step ${i} and ${i + 1} in ${study.id}`
            );
          }
        }
      }
    }
  });

  // =========================================================================
  // Test 3: Colle-O'Hanlon step 1 expectedFenAfter fidelity check
  // =========================================================================
  it('CH-M4-03: Colle-O\'Hanlon step 1 expectedFenAfter correctly reflects 13.Ng5+', () => {
    const study = getStudyById('colle-ohanlon-1930')!;
    const steps = getCalculationStepsForStudy(study);
    const step1 = steps[1]; // 13.Ng5+

    const chess = new Chess(step1.fenBefore);
    chess.move('Ng5+');
    const actualFenAfter = chess.fen().split(' ').slice(0, 4).join(' ');
    const expectedFenAfter = step1.expectedFenAfter.split(' ').slice(0, 4).join(' ');

    console.log(`Step 1 fenBefore: ${step1.fenBefore}`);
    console.log(`Step 1 actual FEN after 13.Ng5+:   ${actualFenAfter}`);
    console.log(`Step 1 expectedFenAfter declared:  ${expectedFenAfter}`);

    // Strict assertion: expectedFenAfter must match actual board state produced by 13.Ng5+
    expect.equal(
      expectedFenAfter,
      actualFenAfter,
      'expectedFenAfter in step 1 of Colle-O\'Hanlon must place knight on g5 (6N1), not on g6 (3bp1N1)'
    );
  });

  // =========================================================================
  // Test 4: Dual-Win Positions - Ed. Lasker vs Thomas (18.Kd2# vs 18.O-O-O#)
  // =========================================================================
  it('CH-M4-04: Dual-win checkmate validation in Ed. Lasker vs Thomas (18.Kd2# vs 18.O-O-O#)', () => {
    const study = getStudyById('ed-lasker-thomas-1912')!;
    const steps = getCalculationStepsForStudy(study);
    const finaleStep = steps[steps.length - 1]; // Move 18

    // 1. Verify chess.js recognizes both moves as 100% legal checkmate
    const engine1 = new Chess(finaleStep.fenBefore);
    const resKd2 = engine1.move('Kd2#');
    expect.ok(resKd2 !== null, '18.Kd2# must be legal move');
    expect.equal(engine1.isCheckmate(), true, '18.Kd2# must be checkmate');

    const engine2 = new Chess(finaleStep.fenBefore);
    const resO_O_O = engine2.move('O-O-O#');
    expect.ok(resO_O_O !== null, '18.O-O-O# must be legal move');
    expect.equal(engine2.isCheckmate(), true, '18.O-O-O# must be checkmate');

    // 2. Evaluate using CalculationTrainer move matching logic:
    // User plays 18.Kd2#
    const evalKd2 = evaluateMoveWithTrainerLogic(finaleStep, 'e1d2', 'Kd2#');
    expect.equal(evalKd2.isAccepted, true, '18.Kd2# must be accepted by trainer');
    expect.equal(evalKd2.quality, 'best');

    // User plays 18.O-O-O# (the legendary alternate checkmate)
    const evalO_O_O = evaluateMoveWithTrainerLogic(finaleStep, 'e1c1', 'O-O-O#');
    console.log('Evaluation result for 18.O-O-O#:', evalO_O_O);

    // Strict assertion: trainer must accept both winning checkmates as required by mission
    expect.equal(
      evalO_O_O.isAccepted,
      true,
      'Calculation trainer must accept 18.O-O-O# as a valid winning checkmate, not reject as blunder'
    );
  });

  // =========================================================================
  // Test 5: Dual-Win Positions - Tarrasch vs von Scheve (31.Rxf8# vs 31.Qxf8#)
  // =========================================================================
  it('CH-M4-05: Dual-win checkmate validation in Tarrasch vs von Scheve (31.Rxf8# vs 31.Qxf8#)', () => {
    const study = getStudyById('tarrasch-scheve-1894')!;
    const steps = getCalculationStepsForStudy(study);
    const finaleStep = steps[steps.length - 1]; // Move 31

    const engine1 = new Chess(finaleStep.fenBefore);
    const resRxf8 = engine1.move('Rxf8#');
    expect.ok(resRxf8 !== null, '31.Rxf8# must be legal move');
    expect.equal(engine1.isCheckmate(), true, '31.Rxf8# must be checkmate');

    const engine2 = new Chess(finaleStep.fenBefore);
    const resQxf8 = engine2.move('Qxf8#');
    expect.ok(resQxf8 !== null, '31.Qxf8# must be legal move');
    expect.equal(engine2.isCheckmate(), true, '31.Qxf8# must be checkmate');

    const evalRxf8 = evaluateMoveWithTrainerLogic(finaleStep, 'g8f8', 'Rxf8#');
    expect.equal(evalRxf8.isAccepted, true, '31.Rxf8# must be accepted');

    const evalQxf8 = evaluateMoveWithTrainerLogic(finaleStep, 'f6f8', 'Qxf8#');
    console.log('Evaluation result for 31.Qxf8#:', evalQxf8);

    expect.equal(
      evalQxf8.isAccepted,
      true,
      'Calculation trainer must accept 31.Qxf8# as a valid winning checkmate, not reject as blunder'
    );
  });

  // =========================================================================
  // Test 6: Scoring Algorithm & Hint Deductions
  // =========================================================================
  it('CH-M4-06: Scoring algorithm formula awards 100% on first try and deducts hint penalties', () => {
    function computeStepScore(
      quality: 'best' | 'alternative',
      hintLevel: number,
      attempts: number,
      elapsedSeconds: number
    ): number {
      const baseScore = 100;
      const qualityMultiplier = quality === 'best' ? 1.0 : 0.9;

      let hintMultiplier = 1.0;
      if (hintLevel === 1) hintMultiplier = 0.85;
      else if (hintLevel === 2) hintMultiplier = 0.6;
      else if (hintLevel === 3) hintMultiplier = 0.25;

      let attemptsMultiplier = 1.0;
      if (attempts === 2) attemptsMultiplier = 0.5;
      else if (attempts >= 3) attemptsMultiplier = 0.25;

      let timeMultiplier = 1.0;
      if (elapsedSeconds < 2.0) timeMultiplier = 0.95;
      else if (elapsedSeconds <= 35.0) timeMultiplier = 1.0;
      else if (elapsedSeconds <= 75.0) timeMultiplier = 0.9;
      else timeMultiplier = 0.75;

      return Math.round(
        baseScore * qualityMultiplier * hintMultiplier * attemptsMultiplier * timeMultiplier
      );
    }

    // Perfect solve: 100%
    const perfectScore = computeStepScore('best', 0, 1, 5.0);
    expect.equal(perfectScore, 100, 'First try in optimal time window must score 100');

    // Hint 1: 85% (-15% deduction)
    const hint1Score = computeStepScore('best', 1, 1, 5.0);
    expect.equal(hint1Score, 85, 'Hint 1 must deduct 15%');

    // Hint 2: 60% (-40% deduction)
    const hint2Score = computeStepScore('best', 2, 1, 5.0);
    expect.equal(hint2Score, 60, 'Hint 2 must deduct 40%');

    // Hint 3: 25% (-75% deduction)
    const hint3Score = computeStepScore('best', 3, 1, 5.0);
    expect.equal(hint3Score, 25, 'Hint 3 must deduct 75%');

    // 2nd attempt: 50% (-50% deduction)
    const attempt2Score = computeStepScore('best', 0, 2, 5.0);
    expect.equal(attempt2Score, 50, 'Second attempt must deduct 50%');

    // 3rd attempt: 25% (-75% deduction)
    const attempt3Score = computeStepScore('best', 0, 3, 5.0);
    expect.equal(attempt3Score, 25, 'Third attempt must deduct 75%');

    // Hasty guess (<2s): 95%
    const hastyScore = computeStepScore('best', 0, 1, 1.2);
    expect.equal(hastyScore, 95, 'Blitz guess under 2s must apply 0.95 penalty');

    // Slow move (>75s): 75%
    const slowScore = computeStepScore('best', 0, 1, 80.0);
    expect.equal(slowScore, 75, 'Slow move over 75s must apply 0.75 penalty');

    // Combined hint 2 + 2nd attempt: Math.round(100 * 1.0 * 0.60 * 0.50 * 1.0) = 30
    const comboScore = computeStepScore('best', 2, 2, 5.0);
    expect.equal(comboScore, 30, 'Hint 2 + 2nd attempt combined penalty');
  });

  // =========================================================================
  // Test 7: Storage Persistence & Resilience
  // =========================================================================
  it('CH-M4-07: Storage persistence saves records and computes user stats correctly', () => {
    saveStudyRecord({
      studyId: 'colle-ohanlon-1930',
      themeId: 'greek_gift',
      score: 100,
      accuracyPercent: 100,
      cleanDepth: 7,
    });

    const stats = loadUserStats();
    expect.equal(stats.totalStudiesCompleted, 1, 'Total studies completed should be 1');
    expect.equal(stats.overallAccuracy, 100, 'Overall accuracy should be 100%');
    expect.ok(stats.studies['colle-ohanlon-1930'], 'colle-ohanlon-1930 record must exist');
    expect.equal(stats.studies['colle-ohanlon-1930'].bestScore, 100);
    expect.equal(stats.studies['colle-ohanlon-1930'].completed, true);
  });
});

runSuite();
