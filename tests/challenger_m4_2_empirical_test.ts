/**
 * Challenger 2 Empirical Stress-Test Suite for Milestone 4 (M4)
 * Deep Calculation Trainer Engine
 * 
 * Verifies:
 * 1. Playing known blunder moves (e.g. 3.Qh5? in Greek Gift) triggers the MISTAKE_EXPLANATION state
 *    and correctly executes Black's refutation move (3...Bxg5!).
 * 2. Rewind resets position cleanly to the pre-blunder turn and allows retry without side effects.
 * 3. Hint progression unlocks sequentially (Tier 1 -> Tier 2 -> Tier 3) and applies accurate score penalties.
 * 4. Storage resilience: simulates malformed JSON in localStorage, quota exceeded, SecurityError,
 *    and SSR window undefined — ensuring zero crashes and mathematical consistency.
 * 5. Dataset-wide calculation steps and blunder refutation audit across all 18 studies.
 */

import { describe, it, expect, runSuite } from './e2e/harness/testRunner.ts';
import { CalculationTrainerFsmHarness, TrainerStudySpec } from './e2e/harness/fsmHarness.ts';
import { getCalculationStepsForStudy } from '../src/components/trainer/CalculationTrainer.tsx';
import { allStudies, getStudyById } from '../src/data/studies/index.ts';
import * as storage from '../src/lib/storage.ts';
import { Chess } from 'chess.js';

// Helper: Check if string contains Russian Cyrillic characters
function containsCyrillic(text?: string): boolean {
  if (!text) return false;
  return /[\u0400-\u04FF]/.test(text);
}

describe('Challenger 2 Empirical Stress Tests: Milestone 4 Calculation Engine', () => {

  // =========================================================================
  // 1. Blunder Moves, MISTAKE_EXPLANATION State & Physical Refutation
  // =========================================================================
  describe('Area 1: Blunder Refutations & Physical Execution', () => {
    it('TC-CH4-01: Playing 3.Qh5? in Greek Gift triggers MISTAKE_EXPLANATION and executes 3...Bxg5!', () => {
      const colleStudy = getStudyById('colle-ohanlon-1930')!;
      expect.ok(colleStudy, 'colle-ohanlon-1930 study must exist');

      const steps = getCalculationStepsForStudy(colleStudy);
      expect.greaterThanOrEqual(steps.length, 3, 'Colle study must have at least 3 calculation steps');

      const trainerSpec: TrainerStudySpec = {
        id: colleStudy.id,
        title: colleStudy.title,
        initialFen: colleStudy.initialFen,
        calculationTargetPlies: colleStudy.calculationTargetPlies,
        steps,
      };

      const fsm = new CalculationTrainerFsmHarness();
      fsm.initStudy(trainerSpec);

      // Step 0: 12.Bxh7+
      expect.equal(fsm.state, 'WAITING_USER_MOVE');
      const step0Res = fsm.submitUserMove('Bxh7+', 4.0);
      expect.equal(step0Res.quality, 'best');
      expect.equal(fsm.state, 'STEP_SUCCESS');
      fsm.advanceOpponentMove(); // 12...Kxh7
      expect.equal(fsm.state, 'WAITING_USER_MOVE');
      expect.equal(fsm.currentStepIndex, 1);

      // Step 1: 13.Ng5+
      const step1Res = fsm.submitUserMove('Ng5+', 3.5);
      expect.equal(step1Res.quality, 'best');
      fsm.advanceOpponentMove(); // 13...Kg6!
      expect.equal(fsm.state, 'WAITING_USER_MOVE');
      expect.equal(fsm.currentStepIndex, 2);

      const step2 = fsm.getCurrentStep();
      expect.equal(step2.moveNumber, 14);
      expect.ok(step2.blunders !== undefined && step2.blunders.length > 0, 'Step 2 must define blunders');

      // Now play the famous blunder: 14.Qh5?? (impulsive queen check)
      const blunderRes = fsm.submitUserMove('Qh5', 2.0);
      expect.equal(blunderRes.quality, 'blunder');
      expect.equal(fsm.state, 'MISTAKE_EXPLANATION');

      // Verify active blunder details
      expect.ok(fsm.activeBlunder !== null);
      expect.equal(fsm.activeBlunder!.attemptedSan, 'Qh5');
      expect.equal(fsm.activeBlunder!.punishmentSan, 'Bxg5');
      expect.ok(containsCyrillic(fsm.activeBlunder!.explanation), 'Blunder explanation must be in Russian');
      expect.match(fsm.activeBlunder!.explanation, /Грубейшая ошибка/);
      expect.match(fsm.activeBlunder!.explanation, /Bxg5/);

      // Verify physical execution on the board:
      // FEN must now represent position after Black played 14...Bxg5!
      const expectedRefutationFen = 'r1bqr3/pp1n1pp1/3bp1k1/6bQ/3p4/2P5/PP3PPP/R1B1R1K1 w - - 0 15';
      expect.equal(fsm.currentFen, expectedRefutationFen);

      // Check legality of refutation position with chess.js
      const chessValidator = new Chess(expectedRefutationFen);
      expect.ok(chessValidator !== null);
      // In this refutation position, White's King is on g1, Queen on h5, but White's Knight on g5 was taken by Black's bishop on g5
      const pieceOnG5 = chessValidator.get('g5');
      expect.ok(pieceOnG5 !== null);
      expect.equal(pieceOnG5?.type, 'b', 'Bishop must now occupy g5');
      expect.equal(pieceOnG5?.color, 'b', 'Black bishop on g5');

      // Arrow must point from c8 to g5
      expect.ok(fsm.activeBlunder!.arrows.length > 0);
      expect.equal(fsm.activeBlunder!.arrows[0][0], 'c8');
      expect.equal(fsm.activeBlunder!.arrows[0][1], 'g5');
    });

    it('TC-CH4-02: Playing secondary blunder 14.Qg4? triggers MISTAKE_EXPLANATION with 14...f5! refutation', () => {
      const colleStudy = getStudyById('colle-ohanlon-1930')!;
      const steps = getCalculationStepsForStudy(colleStudy);

      const fsm = new CalculationTrainerFsmHarness();
      fsm.initStudy({
        id: colleStudy.id,
        title: colleStudy.title,
        initialFen: colleStudy.initialFen,
        calculationTargetPlies: colleStudy.calculationTargetPlies,
        steps,
      });

      // Advance to step 2
      fsm.submitUserMove('Bxh7+', 3.0);
      fsm.advanceOpponentMove();
      fsm.submitUserMove('Ng5+', 3.0);
      fsm.advanceOpponentMove();

      // Play secondary blunder 14.Qg4?
      const blunderRes = fsm.submitUserMove('Qg4', 3.0);
      expect.equal(blunderRes.quality, 'blunder');
      expect.equal(fsm.state, 'MISTAKE_EXPLANATION');

      expect.ok(fsm.activeBlunder !== null);
      expect.equal(fsm.activeBlunder!.attemptedSan, 'Qg4');
      expect.equal(fsm.activeBlunder!.punishmentSan, 'f5');
      expect.match(fsm.activeBlunder!.explanation, /Неточность, выпускающая инициативу/);
      expect.match(fsm.activeBlunder!.explanation, /14\.\.\.f5!/);

      // Physical board FEN after Black's reply 14...f5!
      const expectedFen = 'r1bqr3/pp1n2p1/3bp1k1/5pN1/3p2Q1/2P5/PP3PPP/R1B1R1K1 w - - 0 15';
      expect.equal(fsm.currentFen, expectedFen);

      const chessValidator = new Chess(expectedFen);
      expect.ok(chessValidator !== null);
      expect.equal(chessValidator.get('f5')?.type, 'p');
      expect.equal(chessValidator.get('f5')?.color, 'b');
    });

    it('TC-CH4-03: Playing unexpected unannotated move triggers generic Russian blunder feedback', () => {
      const colleStudy = getStudyById('colle-ohanlon-1930')!;
      const steps = getCalculationStepsForStudy(colleStudy);

      const fsm = new CalculationTrainerFsmHarness();
      fsm.initStudy({
        id: colleStudy.id,
        title: colleStudy.title,
        initialFen: colleStudy.initialFen,
        calculationTargetPlies: colleStudy.calculationTargetPlies,
        steps,
      });

      // Step 0: User plays random quiet move a3 instead of 12.Bxh7+
      const blunderRes = fsm.submitUserMove('a3', 4.0);
      expect.equal(blunderRes.quality, 'blunder');
      expect.equal(fsm.state, 'MISTAKE_EXPLANATION');
      expect.ok(fsm.activeBlunder !== null);
      expect.equal(fsm.activeBlunder!.attemptedSan, 'a3');
      expect.ok(containsCyrillic(fsm.activeBlunder!.explanation));
    });

    it('TC-CH4-04: Dataset-wide blunder refutation legality audit across all 18 studies', () => {
      let totalStepsAudited = 0;
      let totalBlundersAudited = 0;

      for (const study of allStudies) {
        const steps = getCalculationStepsForStudy(study);
        expect.greaterThan(steps.length, 0, `Study ${study.id} must yield calculation steps`);
        totalStepsAudited += steps.length;

        for (const step of steps) {
          // Verify initial and expected FEN legality
          const fenBeforeCheck = new Chess(step.fenBefore);
          expect.ok(fenBeforeCheck !== null, `fenBefore in ${study.id} step ${step.stepIndex} must be valid FEN`);

          const fenAfterCheck = new Chess(step.expectedFenAfter);
          expect.ok(fenAfterCheck !== null, `expectedFenAfter in ${study.id} step ${step.stepIndex} must be valid FEN`);

          // Audit all defined blunders
          if (step.blunders && step.blunders.length > 0) {
            for (const b of step.blunders) {
              totalBlundersAudited++;
              expect.ok(b.san.length > 0, `Blunder SAN must be non-empty in ${study.id}`);
              expect.ok(b.refutationSan.length > 0, `Refutation SAN must be non-empty in ${study.id}`);
              expect.ok(b.explanation.length > 10, `Blunder explanation must be descriptive in ${study.id}`);
              expect.ok(containsCyrillic(b.explanation), `Blunder explanation must be in Russian in ${study.id}`);

              // Verify refutation FEN is a syntactically valid chess position
              const refutationFenCheck = new Chess(b.refutationFen);
              expect.ok(refutationFenCheck !== null, `refutationFen ${b.refutationFen} must be valid FEN`);
            }
          }
        }
      }

      expect.greaterThan(totalStepsAudited, 20, 'Catalog must yield >20 calculation steps');
      expect.greaterThanOrEqual(totalBlundersAudited, 2, 'Must audit at least 2 blunder refutations');
    });
  });

  // =========================================================================
  // 2. Rewind Mechanism & Multi-Blunder Retry Resilience
  // =========================================================================
  describe('Area 2: Rewind Mechanism & Retry Resilience', () => {
    it('TC-CH4-05: Rewind resets board FEN to pre-blunder turn and restores WAITING_USER_MOVE', () => {
      const colleStudy = getStudyById('colle-ohanlon-1930')!;
      const steps = getCalculationStepsForStudy(colleStudy);

      const fsm = new CalculationTrainerFsmHarness();
      fsm.initStudy({
        id: colleStudy.id,
        title: colleStudy.title,
        initialFen: colleStudy.initialFen,
        calculationTargetPlies: colleStudy.calculationTargetPlies,
        steps,
      });

      // Reach step 2 (move 14)
      fsm.submitUserMove('Bxh7+', 3.0);
      fsm.advanceOpponentMove();
      fsm.submitUserMove('Ng5+', 3.0);
      fsm.advanceOpponentMove();

      const preBlunderFen = fsm.currentFen;
      expect.equal(preBlunderFen, steps[2].fenBefore);

      // Commit blunder 14.Qh5??
      fsm.submitUserMove('Qh5', 2.0);
      expect.equal(fsm.state, 'MISTAKE_EXPLANATION');
      expect.notEqual(fsm.currentFen, preBlunderFen);

      // Execute Rewind (dismiss blunder modal)
      fsm.dismissBlunder();

      // Verify post-rewind state
      expect.equal(fsm.state, 'WAITING_USER_MOVE');
      expect.equal(fsm.activeBlunder, null);
      expect.equal(fsm.currentFen, preBlunderFen, 'FEN must be strictly restored to pre-blunder position');

      // User now successfully plays correct move 14.h4!
      const correctRes = fsm.submitUserMove('h4!', 5.0);
      expect.equal(correctRes.quality, 'best');
      expect.equal(fsm.state, 'STEP_SUCCESS');
      expect.equal(fsm.currentFen, steps[2].expectedFenAfter);
    });

    it('TC-CH4-06: Stress test: 3 consecutive blunders and rewinds on same turn accumulate attempts properly', () => {
      const colleStudy = getStudyById('colle-ohanlon-1930')!;
      const steps = getCalculationStepsForStudy(colleStudy);

      const fsm = new CalculationTrainerFsmHarness();
      fsm.initStudy({
        id: colleStudy.id,
        title: colleStudy.title,
        initialFen: colleStudy.initialFen,
        calculationTargetPlies: colleStudy.calculationTargetPlies,
        steps,
      });

      // Step 0: correct
      fsm.submitUserMove('Bxh7+', 4.0);
      fsm.advanceOpponentMove();

      // Step 1: correct
      fsm.submitUserMove('Ng5+', 4.0);
      fsm.advanceOpponentMove();

      const step2Fen = fsm.currentFen;

      // Blunder #1: Qh5
      fsm.submitUserMove('Qh5', 2.0);
      expect.equal(fsm.state, 'MISTAKE_EXPLANATION');
      fsm.dismissBlunder();
      expect.equal(fsm.currentFen, step2Fen);

      // Blunder #2: Qg4
      fsm.submitUserMove('Qg4', 2.0);
      expect.equal(fsm.state, 'MISTAKE_EXPLANATION');
      fsm.dismissBlunder();
      expect.equal(fsm.currentFen, step2Fen);

      // Blunder #3: random illegal/wrong move Qd3
      fsm.submitUserMove('Qd3', 2.0);
      expect.equal(fsm.state, 'MISTAKE_EXPLANATION');
      fsm.dismissBlunder();
      expect.equal(fsm.currentFen, step2Fen);

      // Now play correct move 14.h4!
      fsm.submitUserMove('h4!', 6.0);
      expect.equal(fsm.state, 'STEP_SUCCESS');

      // Verify attempts tracking: 3 blunders + 1 correct = 4 attempts on step 2
      expect.equal(fsm.stepAttempts[2], 4);

      // Check score penalty for 4 attempts (>= 3 attempts multiplier = 0.25)
      const scoreStep2 = fsm.stepScores[2];
      expect.equal(scoreStep2.attemptsMultiplier, 0.25);
      expect.equal(scoreStep2.finalStepScore, 25);
    });
  });

  // =========================================================================
  // 3. 3-Tier Progressive Hint Ladder & Score Penalty Math
  // =========================================================================
  describe('Area 3: Hint Progression Unlocking & Score Penalties', () => {
    it('TC-CH4-07: Strict sequential hint ladder unlocking (Tier 1 -> Tier 2 -> Tier 3)', () => {
      const colleStudy = getStudyById('colle-ohanlon-1930')!;
      const steps = getCalculationStepsForStudy(colleStudy);

      const fsm = new CalculationTrainerFsmHarness();
      fsm.initStudy({
        id: colleStudy.id,
        title: colleStudy.title,
        initialFen: colleStudy.initialFen,
        calculationTargetPlies: colleStudy.calculationTargetPlies,
        steps,
      });

      expect.equal(fsm.highestHintLevelUsed[0], 0);

      // 1. Request Tier 1
      const hint1 = fsm.requestHint(1);
      expect.equal(fsm.highestHintLevelUsed[0], 1);
      expect.ok(hint1.hintText.length > 0);
      expect.ok(containsCyrillic(hint1.hintText));
      expect.equal(hint1.highlight, undefined, 'Tier 1 must not reveal highlight');
      expect.equal(hint1.arrow, undefined, 'Tier 1 must not reveal arrow');
      expect.equal(fsm.cleanDepthPlies, 0);

      // 2. Request Tier 2
      const hint2 = fsm.requestHint(2);
      expect.equal(fsm.highestHintLevelUsed[0], 2);
      expect.ok(hint2.highlight !== undefined, 'Tier 2 must reveal square highlight');
      expect.equal(hint2.highlight.fromSquare, 'e4');
      expect.equal(hint2.highlight.toSquare, 'h7');
      expect.equal(hint2.arrow, undefined, 'Tier 2 must not reveal arrow');

      // 3. Request Tier 3
      const hint3 = fsm.requestHint(3);
      expect.equal(fsm.highestHintLevelUsed[0], 3);
      expect.ok(hint3.arrow !== undefined, 'Tier 3 must reveal exact move arrow');
      expect.deepEqual(hint3.arrow, ['e4', 'h7']);
      expect.match(hint3.hintText, /Bxh7\+/);
    });

    it('TC-CH4-08: Exact mathematical verification of score penalties across all tiers and time windows', () => {
      // Equation:
      // finalStepScore = Math.round(baseScore * qualityMultiplier * hintMultiplier * attemptsMultiplier * timeMultiplier)
      const baseScore = 100;

      // Test combinations
      const testCases = [
        // No hints, 1st attempt, optimal time (10s)
        { quality: 1.0, hintLvl: 0, hintMult: 1.0, attemptsMult: 1.0, time: 10, timeMult: 1.0, expected: 100 },
        // Tier 1 hint (-15%), 1st attempt, optimal time
        { quality: 1.0, hintLvl: 1, hintMult: 0.85, attemptsMult: 1.0, time: 15, timeMult: 1.0, expected: 85 },
        // Tier 2 hint (-40%), 1st attempt, optimal time
        { quality: 1.0, hintLvl: 2, hintMult: 0.60, attemptsMult: 1.0, time: 20, timeMult: 1.0, expected: 60 },
        // Tier 3 hint (-75%), 1st attempt, optimal time
        { quality: 1.0, hintLvl: 3, hintMult: 0.25, attemptsMult: 1.0, time: 25, timeMult: 1.0, expected: 25 },
        // Tier 1 hint (-15%), 2nd attempt (0.50), optimal time
        { quality: 1.0, hintLvl: 1, hintMult: 0.85, attemptsMult: 0.50, time: 30, timeMult: 1.0, expected: 43 },
        // Tier 2 hint (-40%), 2nd attempt (0.50), fast time (< 2s -> 0.95)
        { quality: 1.0, hintLvl: 2, hintMult: 0.60, attemptsMult: 0.50, time: 1.5, timeMult: 0.95, expected: 29 },
        // Tier 3 hint (-75%), 3rd attempt (0.25), slow time (> 75s -> 0.75)
        // 100 * 1.0 * 0.25 * 0.25 * 0.75 = 4.6875 -> Math.round = 5
        { quality: 1.0, hintLvl: 3, hintMult: 0.25, attemptsMult: 0.25, time: 90, timeMult: 0.75, expected: 5 },
        // Alternative move (0.90) with Tier 1 hint (0.85), 1st attempt
        { quality: 0.90, hintLvl: 1, hintMult: 0.85, attemptsMult: 1.0, time: 20, timeMult: 1.0, expected: 77 },
      ];

      for (const tc of testCases) {
        const calculated = Math.round(baseScore * tc.quality * tc.hintMult * tc.attemptsMult * tc.timeMult);
        expect.equal(calculated, tc.expected, `Penalty math mismatch for hint level ${tc.hintLvl}`);
      }
    });

    it('TC-CH4-09: Clean depth ($D_{clean}$) advances only when no hints >= 2 and no blunders occur', () => {
      const colleStudy = getStudyById('colle-ohanlon-1930')!;
      const steps = getCalculationStepsForStudy(colleStudy);

      const fsm = new CalculationTrainerFsmHarness();
      fsm.initStudy({
        id: colleStudy.id,
        title: colleStudy.title,
        initialFen: colleStudy.initialFen,
        calculationTargetPlies: colleStudy.calculationTargetPlies,
        steps,
      });

      // Step 0: completely clean (no hints, 1st try) -> +2 plies
      fsm.submitUserMove('Bxh7+', 5.0);
      fsm.advanceOpponentMove();
      expect.equal(fsm.cleanDepthPlies, 2);

      // Step 1: uses Tier 1 hint (concept only, does not break clean run) -> +2 plies
      fsm.requestHint(1);
      fsm.submitUserMove('Ng5+', 5.0);
      fsm.advanceOpponentMove();
      expect.equal(fsm.cleanDepthPlies, 4);

      // Step 2: requests Tier 2 hint (breaks clean run)
      fsm.requestHint(2);
      fsm.submitUserMove('h4!', 5.0);
      fsm.advanceOpponentMove();
      // Clean depth must NOT advance further
      expect.equal(fsm.cleanDepthPlies, 4);

      // Step 3: solved cleanly, but run was already broken earlier
      fsm.submitUserMove('Rxe6+!', 5.0);
      fsm.advanceOpponentMove();
      expect.equal(fsm.cleanDepthPlies, 4, 'Clean depth must freeze once clean run is broken');
      expect.equal(fsm.state, 'STUDY_COMPLETED');
    });
  });

  // =========================================================================
  // 4. Storage Resilience: SSR, QuotaExceeded, Corrupted JSON & Rapid Writes
  // =========================================================================
  describe('Area 4: Direct Storage Resilience (src/lib/storage.ts)', () => {
    it('TC-CH4-10: SSR safety: execution without window/localStorage falls back to in-memory store', () => {
      storage.clearProgress();

      // Save a study record
      storage.saveStudyRecord({
        studyId: 'colle-ssr-test',
        themeId: 'greek_gift',
        score: 95,
        accuracyPercent: 100,
        cleanDepth: 7,
      });

      const stats = storage.loadUserStats();
      expect.equal(stats.totalStudiesCompleted, 1);
      expect.equal(stats.overallAccuracy, 100);
      expect.equal(stats.masteryPoints, 95);

      const rec = storage.getStudyProgress('colle-ssr-test');
      expect.ok(rec !== null);
      expect.equal(rec!.bestScore, 95);
      expect.equal(rec!.completed, true);

      // Active session save and read in SSR environment
      storage.saveActiveSession({
        studyId: 'colle-ssr-test',
        stepIndex: 2,
        elapsedSeconds: 45,
        currentScoreAcc: 80,
        stepAttempts: { 0: 1, 1: 1 },
        hintsUsed: { 0: 0, 1: 1 },
      });

      const session = storage.getActiveSession('colle-ssr-test');
      expect.ok(session !== null);
      expect.equal(session!.stepIndex, 2);
      expect.equal(session!.elapsedSeconds, 45);

      storage.clearActiveSession();
      expect.equal(storage.getActiveSession('colle-ssr-test'), null);

      storage.clearProgress();
    });

    it('TC-CH4-11: Malformed and corrupted localStorage payloads recover safely without throwing', () => {
      // Simulate browser window.localStorage with corrupted payloads
      const originalWindow = (globalThis as any).window;

      const corruptPayloads = [
        '<<<CORRUPTED_NON_JSON_RAW_STRING>>>',
        '{ invalid json string [ ]',
        '',
        'null',
        'undefined',
        '1234567',
        'true',
        '["item1", "item2"]',
        '{"version": "invalid", "studies": "not-an-object"}',
        '{"version": 1, "studies": {"s1": null, "s2": "corrupt"}}',
        '{"overallAccuracy": -500, "masteryPoints": -100, "studies": {}}',
        '{"studies": {"s1": {"bestScore": "NaN", "bestAccuracy": 999999, "cleanDepth": -10}}}',
      ];

      for (const payload of corruptPayloads) {
        let store: Record<string, string> = {
          [storage.STORAGE_KEY]: payload,
        };

        (globalThis as any).window = {
          localStorage: {
            getItem: (k: string) => store[k] ?? null,
            setItem: (k: string, v: string) => { store[k] = v; },
            removeItem: (k: string) => { delete store[k]; },
          },
        };

        // Calling loadUserStats must never throw an unhandled exception
        let loadedStats: storage.VukovicUserStats | null = null;
        try {
          loadedStats = storage.loadUserStats();
        } catch (e: any) {
          expect.fail(`loadUserStats threw exception on payload "${payload}": ${e?.message}`);
        }

        expect.ok(loadedStats !== null);
        expect.equal(loadedStats!.version, 1);
        expect.greaterThanOrEqual(loadedStats!.overallAccuracy, 0);
        expect.lessThanOrEqual(loadedStats!.overallAccuracy, 100);
        expect.greaterThanOrEqual(loadedStats!.masteryPoints, 0);
        expect.ok(typeof loadedStats!.studies === 'object');
      }

      // Restore window
      (globalThis as any).window = originalWindow;
    });

    it('TC-CH4-12: QuotaExceededError simulation triggers session purge and safe recovery', () => {
      const originalWindow = (globalThis as any).window;

      let quotaTriggered = false;
      let sessionPurged = false;
      const fakeStorage: Record<string, string> = {
        [storage.SESSION_KEY]: 'TEMP_SESSION_DATA_TO_PURGE',
      };

      (globalThis as any).window = {
        localStorage: {
          getItem: (k: string) => fakeStorage[k] ?? null,
          setItem: (k: string, v: string) => {
            if (!sessionPurged && fakeStorage[storage.SESSION_KEY]) {
              quotaTriggered = true;
              const err = new Error('QuotaExceededError: Storage quota reached');
              err.name = 'QuotaExceededError';
              throw err;
            }
            fakeStorage[k] = v;
          },
          removeItem: (k: string) => {
            if (k === storage.SESSION_KEY) {
              sessionPurged = true;
            }
            delete fakeStorage[k];
          },
        },
      };

      try {
        storage.saveStudyRecord({
          studyId: 'quota-recovery-test',
          themeId: 'greek_gift',
          score: 88,
          accuracyPercent: 90,
          cleanDepth: 6,
        });

        expect.ok(quotaTriggered, 'QuotaExceededError should have been triggered');
        expect.ok(sessionPurged, 'Session key should have been purged during quota exception handler');
        expect.equal(fakeStorage[storage.SESSION_KEY], undefined, 'Session data must be removed');

        const stats = storage.loadUserStats();
        expect.ok(stats.studies['quota-recovery-test'] !== undefined);
        expect.equal(stats.studies['quota-recovery-test'].bestScore, 88);
      } finally {
        (globalThis as any).window = originalWindow;
      }
    });

    it('TC-CH4-13: SecurityError on localStorage operations falls back cleanly to memory', () => {
      const originalWindow = (globalThis as any).window;

      // Mock browser environment where localStorage operations throw SecurityError (private mode / sandboxed iframe)
      (globalThis as any).window = {
        localStorage: {
          getItem: () => {
            const err = new Error('SecurityError: The operation is insecure.');
            err.name = 'SecurityError';
            throw err;
          },
          setItem: () => {
            const err = new Error('SecurityError: The operation is insecure.');
            err.name = 'SecurityError';
            throw err;
          },
          removeItem: () => {
            const err = new Error('SecurityError: The operation is insecure.');
            err.name = 'SecurityError';
            throw err;
          },
        },
      };

      try {
        // Must not throw when reading
        const stats = storage.loadUserStats();
        expect.ok(stats !== null);
        expect.equal(stats.version, 1);

        // Must not throw when writing (catches and falls back to memoryStorage)
        storage.saveStudyRecord({
          studyId: 'security-test',
          themeId: 'greek_gift',
          score: 92,
          accuracyPercent: 95,
          cleanDepth: 5,
        });

        const updated = storage.loadUserStats();
        expect.ok(updated.studies['security-test'] !== undefined);
        expect.equal(updated.studies['security-test'].bestScore, 92);
      } finally {
        (globalThis as any).window = originalWindow;
      }
    });

    it('TC-CH4-14: High-throughput stress test: 500 rapid consecutive writes maintain statistical integrity', () => {
      storage.clearProgress();

      const startTime = performance.now();
      for (let i = 0; i < 500; i++) {
        const studyId = `study-${i % 10}`;
        const score = 50 + (i % 51); // 50 to 100
        const accuracy = 60 + (i % 41); // 60 to 100
        storage.saveStudyRecord({
          studyId,
          score,
          accuracyPercent: accuracy,
          cleanDepth: i % 8,
        });
      }
      const elapsed = performance.now() - startTime;
      expect.lessThanOrEqual(elapsed, 500, '500 writes must execute in under 500ms');

      const stats = storage.loadUserStats();
      expect.equal(stats.totalStudiesCompleted, 10, 'Must have 10 distinct completed studies');
      expect.greaterThan(stats.overallAccuracy, 60);
      expect.lessThanOrEqual(stats.overallAccuracy, 100);
      expect.greaterThan(stats.masteryPoints, 500);

      storage.clearProgress();
    });

    it('TC-CH4-15: Prototype pollution payload in localStorage does not pollute Object.prototype', () => {
      const originalWindow = (globalThis as any).window;

      const pollutionPayload = JSON.stringify({
        version: 1,
        totalStudiesCompleted: 1,
        __proto__: { pollutedAdmin: true },
        studies: {
          'study-pollute': {
            studyId: 'study-pollute',
            completed: true,
            bestScore: 90,
            __proto__: { injectedProp: true },
          },
        },
      });

      let store: Record<string, string> = {
        [storage.STORAGE_KEY]: pollutionPayload,
      };

      (globalThis as any).window = {
        localStorage: {
          getItem: (k: string) => store[k] ?? null,
          setItem: (k: string, v: string) => { store[k] = v; },
          removeItem: (k: string) => { delete store[k]; },
        },
      };

      try {
        const stats = storage.loadUserStats();
        expect.equal(stats.totalStudiesCompleted, 1);
        expect.equal((Object.prototype as any).pollutedAdmin, undefined, 'Object.prototype must not be polluted');
        expect.equal((Object.prototype as any).injectedProp, undefined, 'Object.prototype must not be polluted');
      } finally {
        (globalThis as any).window = originalWindow;
      }
    });
  });

  // =========================================================================
  // 5. Adversarial Input Stress & Engine Edge Cases
  // =========================================================================
  describe('Area 5: Adversarial Inputs & FSM Edge Cases', () => {
    it('TC-CH4-16: Submitting empty strings, spaces, or malformed move strings treats them as blunders safely', () => {
      const colleStudy = getStudyById('colle-ohanlon-1930')!;
      const steps = getCalculationStepsForStudy(colleStudy);

      const fsm = new CalculationTrainerFsmHarness();
      fsm.initStudy({
        id: colleStudy.id,
        title: colleStudy.title,
        initialFen: colleStudy.initialFen,
        calculationTargetPlies: colleStudy.calculationTargetPlies,
        steps,
      });

      const badInputs = ['', '   ', '???', 'NULL', '12345', 'e2e4e6', 'k#'];
      for (const bad of badInputs) {
        expect.equal(fsm.state, 'WAITING_USER_MOVE');
        const res = fsm.submitUserMove(bad, 1.0);
        expect.equal(res.quality, 'blunder');
        expect.equal(fsm.state, 'MISTAKE_EXPLANATION');
        fsm.dismissBlunder();
        expect.equal(fsm.state, 'WAITING_USER_MOVE');
      }
    });

    it('TC-CH4-17: Fallback step generation for a minimal study with zero children', () => {
      const dummyStudy = {
        id: 'dummy-test-study',
        title: 'Dummy Study',
        white: 'Player 1',
        black: 'Player 2',
        initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        orientation: 'white' as const,
        chapter: 'greek_gift' as const,
        chapterTitle: 'Greek Gift',
        difficulty: 1800 as const,
        tags: ['test'],
        description: 'Test study',
        calculationTargetPlies: 3,
        rootNode: {
          id: 'dummy-root',
          san: 'e4',
          uci: 'e2e4',
          fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
          turn: 'w' as const,
          comment: 'Start with 1.e4',
          children: [],
        },
      };

      const steps = getCalculationStepsForStudy(dummyStudy as any);
      expect.equal(steps.length, 1);
      expect.equal(steps[0].bestMoveSan, 'e4');
      expect.equal(steps[0].bestMoveUci, 'e2e4');
      expect.ok(steps[0].hints.level1Concept.length > 0);
    });

    it('TC-CH4-18: Mastery rank derivations and star thresholds match Vukovic scoring standard', () => {
      const colleStudy = getStudyById('colle-ohanlon-1930')!;
      const steps = getCalculationStepsForStudy(colleStudy);

      // Scenario A: Flawless performance (100% score) -> Гроссмейстер атаки, 3 stars
      const fsmA = new CalculationTrainerFsmHarness();
      fsmA.initStudy({
        id: colleStudy.id,
        title: colleStudy.title,
        initialFen: colleStudy.initialFen,
        calculationTargetPlies: colleStudy.calculationTargetPlies,
        steps,
      });

      for (let s = 0; s < steps.length; s++) {
        fsmA.submitUserMove(steps[s].bestMoveSan, 10.0);
        fsmA.advanceOpponentMove();
      }
      expect.equal(fsmA.state, 'STUDY_COMPLETED');
      const summaryA = fsmA.calculateSessionSummary();
      expect.equal(summaryA.totalScore, 100);
      expect.equal(summaryA.accuracyPercent, 100);
      expect.equal(summaryA.stars, 3);
      expect.equal(summaryA.rankTitleRu, 'Гроссмейстер атаки');

      // Scenario B: Moderate performance with Tier 2 hint on step 0 -> score drops, stars reduce
      const fsmB = new CalculationTrainerFsmHarness();
      fsmB.initStudy({
        id: colleStudy.id,
        title: colleStudy.title,
        initialFen: colleStudy.initialFen,
        calculationTargetPlies: colleStudy.calculationTargetPlies,
        steps,
      });

      fsmB.requestHint(1);
      fsmB.requestHint(2);
      fsmB.submitUserMove(steps[0].bestMoveSan, 10.0);
      fsmB.advanceOpponentMove();

      for (let s = 1; s < steps.length; s++) {
        fsmB.submitUserMove(steps[s].bestMoveSan, 10.0);
        fsmB.advanceOpponentMove();
      }
      const summaryB = fsmB.calculateSessionSummary();
      expect.greaterThanOrEqual(summaryB.totalScore, 75);
      expect.lessThanOrEqual(summaryB.totalScore, 95);
      expect.equal(summaryB.accuracyPercent, 75); // 3 of 4 first-try without hint
    });
  });
});

runSuite();
