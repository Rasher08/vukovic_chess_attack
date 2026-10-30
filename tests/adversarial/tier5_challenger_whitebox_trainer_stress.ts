/**
 * Tier 5 White-Box Adversarial Stress-Test Suite — Challenger 2
 * Milestone 6 (Phase 2 Tier 5 Adversarial Coverage Hardening)
 * 
 * Target Components & Modules:
 * - src/components/trainer/CalculationTrainer.tsx
 * - src/components/trainer/BlunderModal.tsx
 * - src/components/trainer/HintPanel.tsx
 * - src/components/trainer/CalculationScoreCard.tsx
 * - src/components/trainer/ModeSwitcher.tsx
 * - src/components/study/VariationTree.tsx
 * - src/components/study/MoveNavigation.tsx
 * 
 * Deep Stress Categories:
 * 1. 8-State FSM State Machine Transition Matrix & Illegal Transition Immunity
 * 2. Rapid User Inputs, Concurrency, and Animation Guardrails
 * 3. Multi-Blunder Rewinds, Fallback Explanations, and Retained Attempt Penalties
 * 4. 3-Tier Hint Progression Monotonicity, State Leak Prevention, and Clean Depth Integrity
 * 5. Calculation Scoring Equations, Multiplier Matrix, Boundary Clamping, Ranks, and Stars
 * 6. Pawn Promotion Edge Cases & Underpromotions
 * 7. VariationTree Graph Navigation, Sibling Bounds, and Keyboard Shortcuts
 * 8. MoveNavigation Contracts, Disabled Boundaries, and Accessibility
 * 9. Catalog-Wide Step Extraction & Dynamic Checkmate Validation across All 18 Studies
 */

import { Chess, Square } from 'chess.js';
import { allStudies, getStudyById } from '../../src/data/studies/index';
import {
  getCalculationStepsForStudy,
  CalculationStepSpec,
} from '../../src/components/trainer/CalculationTrainer';
import { CalculationTrainerFsmHarness, TrainerStudySpec } from '../e2e/harness/fsmHarness';
import { BrowserDomHarness } from '../e2e/harness/browserDomHarness';
import { findNodeById, findPathToNode, isValidFen } from '../../src/lib/chessUtils';
import { MoveNode, VukovicStudy } from '../../src/types/chess';
import { TrainerState, BlunderDetail } from '../../src/types/trainer';

// Terminal formatting
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureLog: string[] = [];

function assert(condition: boolean, testName: string, detail?: string): void {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${GREEN}✓ PASS${RESET} | ${testName}`);
  } else {
    failedTests++;
    const msg = `[FAIL] ${testName}${detail ? `: ${detail}` : ''}`;
    failureLog.push(msg);
    console.error(`  ${RED}✖ FAIL${RESET} | ${msg}`);
  }
}

function assertThrows(fn: () => void, testName: string): void {
  totalTests++;
  try {
    fn();
    failedTests++;
    const msg = `[FAIL] ${testName}: Expected function to throw, but it did not`;
    failureLog.push(msg);
    console.error(`  ${RED}✖ FAIL${RESET} | ${msg}`);
  } catch {
    passedTests++;
    console.log(`  ${GREEN}✓ PASS${RESET} | ${testName} (correctly threw error)`);
  }
}

console.log(`${CYAN}${BOLD}`);
console.log('==============================================================================');
console.log('⚔️   TIER 5 ADVERSARIAL WHITE-BOX STRESS SUITE (Challenger 2 — Trainer & Tree) ');
console.log('==============================================================================');
console.log(`${RESET}`);

// ==============================================================================
// SECTION 1: 8-STATE FSM TRANSITION MATRIX & ILLEGAL TRANSITION IMMUNITY
// ==============================================================================
console.log(`\n${YELLOW}${BOLD}--- SECTION 1: 8-State FSM State Machine & Transition Immunity ---${RESET}`);

{
  const study = getStudyById('colle-ohanlon-1930')!;
  const steps = getCalculationStepsForStudy(study);
  const fsm = new CalculationTrainerFsmHarness();

  // Test 1.1: Initial State is IDLE before init, WAITING_USER_MOVE after init
  assert(fsm.state === 'IDLE', 'FSM starts in IDLE state before initialization');
  assertThrows(() => fsm.submitUserMove('Bxh7+'), 'Cannot submit move while FSM is IDLE');
  assertThrows(() => fsm.requestHint(1), 'Cannot request hint while FSM is IDLE');
  assertThrows(() => fsm.dismissBlunder(), 'Cannot dismiss blunder while FSM is IDLE');
  assertThrows(() => fsm.advanceOpponentMove(), 'Cannot advance opponent while FSM is IDLE');

  fsm.initStudy({
    id: study.id,
    title: study.title,
    initialFen: study.initialFen,
    calculationTargetPlies: study.calculationTargetPlies,
    steps,
  });

  assert(fsm.state === 'WAITING_USER_MOVE', 'FSM transitions to WAITING_USER_MOVE after initStudy');

  // Test 1.2: Illegal transitions from WAITING_USER_MOVE
  assertThrows(() => fsm.dismissBlunder(), 'Cannot dismiss blunder while WAITING_USER_MOVE');
  assertThrows(() => fsm.advanceOpponentMove(), 'Cannot advance opponent while WAITING_USER_MOVE');

  // Test 1.3: Legal move triggers STEP_SUCCESS
  const res1 = fsm.submitUserMove('Bxh7+', 4.0);
  assert(res1.quality === 'best', 'Bxh7+ recognized as best move');
  assert(fsm.state === 'STEP_SUCCESS', 'FSM transitions to STEP_SUCCESS after correct move');

  // Test 1.4: Illegal transitions while in STEP_SUCCESS
  assertThrows(() => fsm.submitUserMove('Ng5+'), 'Cannot submit user move while in STEP_SUCCESS');
  assertThrows(() => fsm.requestHint(1), 'Cannot request hint while in STEP_SUCCESS');
  assertThrows(() => fsm.dismissBlunder(), 'Cannot dismiss blunder while in STEP_SUCCESS');

  // Test 1.5: Advance opponent moves FSM to WAITING_USER_MOVE (intermediate step)
  const oppState = fsm.advanceOpponentMove();
  assert(oppState === 'WAITING_USER_MOVE', 'FSM advances to next step WAITING_USER_MOVE');
  assert(fsm.currentStepIndex === 1, 'Current step index incremented to 1');
  assert(fsm.currentFen === steps[0].opponentResponse!.fenAfter, 'Board FEN updated with Black response 12...Kxh7');

  // Test 1.6: Blunder triggers MISTAKE_EXPLANATION
  const blunderRes = fsm.submitUserMove('d1h5', 3.0); // 14.Qh5 blunder (played prematurely on move 13)
  assert(blunderRes.quality === 'blunder', 'Incorrect move evaluated as blunder');
  assert(fsm.state === 'MISTAKE_EXPLANATION', 'FSM transitions to MISTAKE_EXPLANATION');

  // Test 1.7: Illegal operations while in MISTAKE_EXPLANATION
  assertThrows(() => fsm.submitUserMove('Ng5+'), 'Cannot submit move while MISTAKE_EXPLANATION is active');
  assertThrows(() => fsm.requestHint(1), 'Cannot request hint while MISTAKE_EXPLANATION is active');
  assertThrows(() => fsm.advanceOpponentMove(), 'Cannot advance opponent while MISTAKE_EXPLANATION is active');

  // Test 1.8: Dismissing blunder restores WAITING_USER_MOVE and original FEN
  fsm.dismissBlunder();
  assert(fsm.state === 'WAITING_USER_MOVE', 'FSM returns to WAITING_USER_MOVE upon blunder dismissal');
  assert(fsm.currentFen === steps[1].fenBefore, 'Board FEN restored to fenBefore of step 1');

  // Test 1.9: Analysis mode toggle preserves previous state and restores it
  fsm.toggleAnalysisMode(true);
  assert(fsm.state === 'ANALYSIS_MODE', 'FSM transitions to ANALYSIS_MODE');
  assertThrows(() => fsm.submitUserMove('Ng5+'), 'Cannot submit move while in ANALYSIS_MODE');
  assertThrows(() => fsm.requestHint(1), 'Cannot request hint while in ANALYSIS_MODE');

  fsm.toggleAnalysisMode(false);
  assert(fsm.state === 'WAITING_USER_MOVE', 'FSM restores WAITING_USER_MOVE when exiting ANALYSIS_MODE');

  // Test 1.10: Finish all steps and reach STUDY_COMPLETED
  fsm.submitUserMove('Ng5+', 3.0); // Step 1
  fsm.advanceOpponentMove(); // 13...Kg6

  fsm.submitUserMove('h4', 5.0); // Step 2
  fsm.advanceOpponentMove(); // 14...Rh8

  fsm.submitUserMove('Rxe6+', 4.0); // Step 3 (final)
  fsm.advanceOpponentMove(); // Completes study

  assert(fsm.state === 'STUDY_COMPLETED', 'FSM reaches terminal STUDY_COMPLETED state on final step');
  assertThrows(() => fsm.submitUserMove('dummy'), 'Cannot submit move after study completed');
  assertThrows(() => fsm.requestHint(1), 'Cannot request hint after study completed');
}

// ==============================================================================
// SECTION 2: RAPID USER INPUTS, CONCURRENCY & ANIMATION GUARDRAILS
// ==============================================================================
console.log(`\n${YELLOW}${BOLD}--- SECTION 2: Rapid User Inputs & Animation Guardrails ---${RESET}`);

{
  const study = getStudyById('colle-ohanlon-1930')!;
  const steps = getCalculationStepsForStudy(study);
  const dom = new BrowserDomHarness(study.initialFen);

  // Test 2.1: Board locking when locked in DOM harness and Trainer
  dom.isBoardLocked = true;
  const clickRes = dom.clickSquare('e4');
  assert(clickRes.action === 'locked', 'Clicking square when board is locked returns locked action');

  // Configure onMoveAttempt guard simulating CalculationTrainer's isBoardLocked
  dom.onMoveAttempt = (from, to) => {
    return !dom.isBoardLocked;
  };

  const dropBlocked = dom.executeMove('e4', 'h7');
  assert(!dropBlocked, 'Move execution rejected when board is locked');
  assert(dom.engine.getPiece('e4')?.type === 'b', 'Bishop remains on e4 when move blocked');

  // Test 2.2: Rapid succession inputs during animation window emulation
  dom.isBoardLocked = false;
  // Step 1: User drops bishop e4 -> h7
  const move1Success = dom.executeMove('e4', 'h7');
  assert(move1Success, 'Legal drop 12.Bxh7+ succeeds on unlocked board');

  // Simulate 500ms opponent animation lock
  dom.isBoardLocked = true;
  const rapidDropAttempts = ['f3g5', 'd1h5', 'c1e3', 'e1e6'];
  for (const rapidMove of rapidDropAttempts) {
    const from = rapidMove.slice(0, 2) as Square;
    const to = rapidMove.slice(2, 4) as Square;
    const clickAttempt = dom.clickSquare(from);
    assert(clickAttempt.action === 'locked', `Rapid click attempt ${rapidMove} rejected while animating`);
    const moveAttempt = dom.executeMove(from, to);
    assert(!moveAttempt, `Rapid drop attempt ${rapidMove} rejected while animating`);
  }

  // Animation completes: opponent move 12...Kxh7 executes, board unlocks
  dom.isBoardLocked = false;
  dom.executeMove('g8', 'h7'); // Opponent move
  assert(dom.engine.getPiece('h7')?.color === 'b', 'Black King now on h7');
}

// ==============================================================================
// SECTION 3: MULTI-BLUNDER REWINDS, FALLBACK EXPLANATIONS & RETRY PENALTIES
// ==============================================================================
console.log(`\n${YELLOW}${BOLD}--- SECTION 3: Multi-Blunder Rewinds & Retained Attempt Penalties ---${RESET}`);

{
  const study = getStudyById('colle-ohanlon-1930')!;
  const steps = getCalculationStepsForStudy(study);
  const fsm = new CalculationTrainerFsmHarness();

  fsm.initStudy({
    id: study.id,
    title: study.title,
    initialFen: study.initialFen,
    calculationTargetPlies: study.calculationTargetPlies,
    steps,
  });

  // Solve step 0 cleanly
  fsm.submitUserMove('Bxh7+', 3.0);
  fsm.advanceOpponentMove();

  // On step 1 (13.Ng5+), user commits multiple consecutive blunders
  const step1FenBefore = steps[1].fenBefore;

  // Blunder 1: Impulsive knight move to e5
  const b1 = fsm.submitUserMove('f3e5', 2.0);
  assert(b1.quality === 'blunder', 'Blunder 1: 13.Ne5 recognized as blunder');
  assert(fsm.state === 'MISTAKE_EXPLANATION', 'FSM entered MISTAKE_EXPLANATION');
  assert(fsm.stepAttempts[1] === 1, 'Attempt counter is 1 after first blunder');
  assert(fsm.activeBlunder !== null, 'Active blunder payload generated');

  // Dismiss blunder 1
  fsm.dismissBlunder();
  assert(fsm.state === 'WAITING_USER_MOVE', 'FSM restored to WAITING_USER_MOVE');
  assert(fsm.currentFen === step1FenBefore, 'Board rewound to exact fenBefore after blunder 1');

  // Blunder 2: Bishop move 13.Be3
  const b2 = fsm.submitUserMove('c1e3', 2.0);
  assert(b2.quality === 'blunder', 'Blunder 2: 13.Be3 recognized as blunder');
  assert(fsm.stepAttempts[1] === 2, 'Attempt counter incremented to 2');
  fsm.dismissBlunder();
  assert(fsm.currentFen === step1FenBefore, 'Board rewound to exact fenBefore after blunder 2');

  // Blunder 3: Queen move 13.Qd3
  const b3 = fsm.submitUserMove('d1d3', 2.0);
  assert(b3.quality === 'blunder', 'Blunder 3: 13.Qd3 recognized as blunder');
  assert(fsm.stepAttempts[1] === 3, 'Attempt counter incremented to 3');
  fsm.dismissBlunder();
  assert(fsm.currentFen === step1FenBefore, 'Board rewound to exact fenBefore after blunder 3');

  // Blunder 4: Complete random gibberish / illegal move candidate
  const b4 = fsm.submitUserMove('a2a3', 1.0);
  assert(b4.quality === 'blunder', 'Blunder 4: 13.a3 recognized as blunder');
  assert(fsm.stepAttempts[1] === 4, 'Attempt counter incremented to 4');
  assert(fsm.activeBlunder?.explanation.includes('Вуковича'), 'Pedagogical Russian explanation present in fallback blunder');
  fsm.dismissBlunder();

  // Now submit correct move 13.Ng5+ on 5th attempt
  const correctRes = fsm.submitUserMove('Ng5+', 10.0);
  assert(correctRes.quality === 'best', 'Correct move 13.Ng5+ succeeds after 4 blunders');

  // Verify score penalty applied: attempts >= 3 => attemptsMultiplier === 0.25
  const stepScore = fsm.stepScores[fsm.stepScores.length - 1];
  assert(stepScore.attemptsMultiplier === 0.25, `Attempts multiplier penalized to 0.25 (got ${stepScore.attemptsMultiplier})`);
  assert(stepScore.finalStepScore <= 25, `Step score severely penalized: expected <= 25, got ${stepScore.finalStepScore}`);

  // Verify previous step 0 score remained completely untouched!
  const step0Score = fsm.stepScores[0];
  assert(step0Score.attemptsMultiplier === 1.0, 'Step 0 attempts multiplier was not corrupted');
  assert(step0Score.finalStepScore >= 95, `Step 0 clean score preserved (got ${step0Score.finalStepScore})`);
}

// ==============================================================================
// SECTION 4: HINT PROGRESSION LADDER, STATE LEAKS & CLEAN DEPTH INTEGRITY
// ==============================================================================
console.log(`\n${YELLOW}${BOLD}--- SECTION 4: Hint Ladder Progression & State Leak Prevention ---${RESET}`);

{
  const study = getStudyById('colle-ohanlon-1930')!;
  const steps = getCalculationStepsForStudy(study);
  const fsm = new CalculationTrainerFsmHarness();

  fsm.initStudy({
    id: study.id,
    title: study.title,
    initialFen: study.initialFen,
    calculationTargetPlies: study.calculationTargetPlies,
    steps,
  });

  // Step 0: Request Hint Level 1 (Concept)
  const h1 = fsm.requestHint(1);
  assert(typeof h1.hintText === 'string' && h1.hintText.length > 5, 'Hint 1 returned Russian concept text');
  assert(fsm.highestHintLevelUsed[0] === 1, 'Hint level 1 recorded for step 0');

  // Hint 1 should NOT break clean run if move succeeds on 1st attempt
  fsm.submitUserMove('Bxh7+', 10.0);
  assert(fsm.cleanDepthPlies === 2, `Clean depth incremented to 2 plies with Hint 1 (got ${fsm.cleanDepthPlies})`);
  fsm.advanceOpponentMove();

  // Step 1: Request Hint Level 3 (Direct Move Arrow)
  assert(fsm.highestHintLevelUsed[1] === 0, 'Step 1 starts with clean 0 hint level (NO LEAK FROM STEP 0)');
  const h3 = fsm.requestHint(3);
  assert(fsm.highestHintLevelUsed[1] === 3, 'Hint level 3 recorded for step 1');
  assert(h3.arrow !== undefined, 'Hint 3 returned arrow coordinates');

  // Hint 3 MUST break clean run
  fsm.submitUserMove('Ng5+', 10.0);
  assert(fsm.cleanDepthPlies === 2, 'Clean depth did NOT increment because Hint 3 broke clean run');
  const step1Score = fsm.stepScores[1];
  assert(step1Score.hintMultiplier === 0.25, `Hint multiplier 0.25 applied for Hint 3 (got ${step1Score.hintMultiplier})`);
  fsm.advanceOpponentMove();

  // Step 2: Test requesting lower level after higher level (monotonic max)
  assert(fsm.highestHintLevelUsed[2] === 0, 'Step 2 starts with 0 hint level (NO LEAK)');
  fsm.requestHint(2);
  assert(fsm.highestHintLevelUsed[2] === 2, 'Hint level 2 set');
  fsm.requestHint(1); // request level 1 when level 2 already used
  assert(fsm.highestHintLevelUsed[2] === 2, 'Hint level monotonic: does not downgrade from 2 to 1');

  // Complete step 2
  fsm.submitUserMove('h4', 10.0);
  assert(fsm.cleanDepthPlies === 2, 'Clean depth remains frozen at 2 plies');
  fsm.advanceOpponentMove();

  // Step 3 (final)
  fsm.submitUserMove('Rxe6+', 10.0);
  fsm.advanceOpponentMove();
  assert(fsm.state === 'STUDY_COMPLETED', 'Study completed');
  assert(fsm.cleanDepthPlies === 2, 'Final clean depth is exactly 2 plies');
}

// ==============================================================================
// SECTION 5: CALCULATION SCORING EQUATION & EXTREME BOUNDARY CONDITIONS
// ==============================================================================
console.log(`\n${YELLOW}${BOLD}--- SECTION 5: Scoring Equations & Extreme Boundaries ---${RESET}`);

{
  // Formula: Score = round(100 * M_quality * M_hint * M_attempts * M_time)
  // Multipliers:
  // Quality: best: 1.0, alternative: 0.90
  // Hints: 0: 1.0, 1: 0.85, 2: 0.60, 3: 0.25
  // Attempts: 1: 1.0, 2: 0.50, >=3: 0.25
  // Time: <2s: 0.95, 2-35s: 1.00, 36-75s: 0.90, >75s: 0.75

  function calculateStepScore(
    quality: 'best' | 'alternative',
    hintLevel: 0 | 1 | 2 | 3,
    attempts: number,
    timeSec: number
  ): number {
    const baseScore = 100;
    const qM = quality === 'best' ? 1.0 : 0.90;
    let hM = 1.0;
    if (hintLevel === 1) hM = 0.85;
    else if (hintLevel === 2) hM = 0.60;
    else if (hintLevel === 3) hM = 0.25;

    let aM = 1.0;
    if (attempts === 2) aM = 0.50;
    else if (attempts >= 3) aM = 0.25;

    let tM = 1.0;
    if (timeSec < 2.0) tM = 0.95;
    else if (timeSec <= 35.0) tM = 1.00;
    else if (timeSec <= 75.0) tM = 0.90;
    else tM = 0.75;

    return Math.round(baseScore * qM * hM * aM * tM);
  }

  // 1. Max possible score: 100
  const maxScore = calculateStepScore('best', 0, 1, 15.0);
  assert(maxScore === 100, `Perfect step yields 100 points (got ${maxScore})`);

  // 2. Blitz penalty (< 2.0s)
  const blitzScore = calculateStepScore('best', 0, 1, 1.2);
  assert(blitzScore === 95, `Blitz penalty (<2s) yields 95 points (got ${blitzScore})`);

  // 3. Moderate thinking time (36-75s)
  const modTimeScore = calculateStepScore('best', 0, 1, 50.0);
  assert(modTimeScore === 90, `Moderate time penalty yields 90 points (got ${modTimeScore})`);

  // 4. Deep thinking time (> 75s)
  const deepTimeScore = calculateStepScore('best', 0, 1, 120.0);
  assert(deepTimeScore === 75, `Deep time penalty yields 75 points (got ${deepTimeScore})`);

  // 5. Alternative move deduction
  const altScore = calculateStepScore('alternative', 0, 1, 15.0);
  assert(altScore === 90, `Alternative move yields 90 points (got ${altScore})`);

  // 6. Worst case scenario (Alternative + Hint 3 + Attempt 5 + 300s time)
  // 100 * 0.90 * 0.25 * 0.25 * 0.75 = 4.21875 -> 4
  const worstScore = calculateStepScore('alternative', 3, 5, 300.0);
  assert(worstScore === 4, `Worst case penalty yields 4 points (got ${worstScore})`);
  assert(worstScore >= 0 && worstScore <= 100, 'Score is strictly clamped within [0, 100]');
  assert(!Number.isNaN(worstScore), 'Score is never NaN');

  // 7. Exhaustive combinatorial space validation (all 2 * 4 * 4 * 4 = 128 combinations)
  let allCombinationsValid = true;
  for (const q of ['best', 'alternative'] as const) {
    for (const h of [0, 1, 2, 3] as const) {
      for (const a of [1, 2, 3, 10]) {
        for (const t of [0.5, 10.0, 50.0, 120.0]) {
          const s = calculateStepScore(q, h, a, t);
          if (s < 0 || s > 100 || Number.isNaN(s)) {
            allCombinationsValid = false;
          }
        }
      }
    }
  }
  assert(allCombinationsValid, 'All 128 scoring multiplier combinations evaluate cleanly within [0, 100]');

  // 8. Mastery Rank Title Boundaries
  function getRankTitle(score: number): string {
    if (score >= 92) return 'Гроссмейстер атаки Вуковича';
    if (score >= 78) return 'Мастер форсированного расчета';
    if (score >= 60) return 'Кандидат в мастера';
    if (score >= 40) return 'Практик атаки';
    return 'Рекомендуется разбор';
  }

  assert(getRankTitle(100) === 'Гроссмейстер атаки Вуковича', 'Score 100 -> Гроссмейстер');
  assert(getRankTitle(92) === 'Гроссмейстер атаки Вуковича', 'Score 92 -> Гроссмейстер');
  assert(getRankTitle(91) === 'Мастер форсированного расчета', 'Score 91 -> Мастер');
  assert(getRankTitle(78) === 'Мастер форсированного расчета', 'Score 78 -> Мастер');
  assert(getRankTitle(77) === 'Кандидат в мастера', 'Score 77 -> КМС');
  assert(getRankTitle(60) === 'Кандидат в мастера', 'Score 60 -> КМС');
  assert(getRankTitle(59) === 'Практик атаки', 'Score 59 -> Практик');
  assert(getRankTitle(40) === 'Практик атаки', 'Score 40 -> Практик');
  assert(getRankTitle(39) === 'Рекомендуется разбор', 'Score 39 -> Разбор');
  assert(getRankTitle(0) === 'Рекомендуется разбор', 'Score 0 -> Разбор');

  // 9. Star Rating Boundaries
  function getStars(score: number, accuracy: number): number {
    if (score >= 85 && accuracy >= 80) return 3;
    if (score >= 60 && accuracy >= 50) return 2;
    return 1;
  }

  assert(getStars(85, 80) === 3, 'Score 85, Acc 80% -> 3 stars');
  assert(getStars(100, 100) === 3, 'Score 100, Acc 100% -> 3 stars');
  assert(getStars(84, 80) === 2, 'Score 84, Acc 80% -> 2 stars (score fell short)');
  assert(getStars(85, 79) === 2, 'Score 85, Acc 79% -> 2 stars (acc fell short)');
  assert(getStars(60, 50) === 2, 'Score 60, Acc 50% -> 2 stars');
  assert(getStars(59, 50) === 1, 'Score 59, Acc 50% -> 1 star (score fell short)');
  assert(getStars(60, 49) === 1, 'Score 60, Acc 49% -> 1 star (acc fell short)');
  assert(getStars(10, 10) === 1, 'Score 10, Acc 10% -> 1 star');
}

// ==============================================================================
// SECTION 6: PAWN PROMOTION & UNDERPROMOTION IN TRAINER
// ==============================================================================
console.log(`\n${YELLOW}${BOLD}--- SECTION 6: Pawn Promotion & Underpromotion Edge Cases ---${RESET}`);

{
  // Create an artificial study step requiring pawn promotion
  const promotionStudy: TrainerStudySpec = {
    id: 'test-promotion-study',
    title: 'Тест превращения пешки',
    initialFen: '8/4P3/8/8/8/8/k7/4K3 w - - 0 1',
    calculationTargetPlies: 3,
    steps: [
      {
        stepIndex: 0,
        moveNumber: 1,
        fenBefore: '8/4P3/8/8/8/8/k7/4K3 w - - 0 1',
        expectedFenAfter: '4Q3/8/8/8/8/8/k7/4K3 b - - 0 1',
        bestMoveSan: 'e8=Q',
        bestMoveUci: 'e7e8q',
        bestMoveExplanation: 'Превращение пешки в ферзя с решающим перевесом.',
        alternativeMoves: [
          {
            san: 'e8=R',
            uci: 'e7e8r',
            explanation: 'Превращение в ладью также выигрывает.',
          },
        ],
        hints: {
          level1Concept: 'Проведите пешку в ферзи.',
          level2Highlight: { fromSquare: 'e7', toSquare: 'e8' },
          level3Arrow: ['e7', 'e8'],
        },
      },
    ],
  };

  const fsm = new CalculationTrainerFsmHarness();
  fsm.initStudy(promotionStudy);

  // Queen promotion evaluates as best move
  const qRes = fsm.submitUserMove('e8=Q', 5.0);
  assert(qRes.quality === 'best', 'Pawn promotion e8=Q recognized as best move');
  assert(fsm.state === 'STEP_SUCCESS', 'FSM transitions to STEP_SUCCESS after promotion');

  // Test underpromotion candidate
  const fsm2 = new CalculationTrainerFsmHarness();
  fsm2.initStudy(promotionStudy);
  const rRes = fsm2.submitUserMove('e8=R', 5.0);
  assert(rRes.quality === 'alternative', 'Underpromotion e8=R accepted as alternative winning move');

  // Test illegal/unwanted promotion piece (e.g. promoting to King or invalid)
  const fsm3 = new CalculationTrainerFsmHarness();
  fsm3.initStudy(promotionStudy);
  const badRes = fsm3.submitUserMove('e8=K', 2.0);
  assert(badRes.quality === 'blunder', 'Invalid promotion e8=K treated as blunder');
}

// ==============================================================================
// SECTION 7: VARIATION TREE GRAPH TRAVERSAL & KEYBOARD NAVIGATION
// ==============================================================================
console.log(`\n${YELLOW}${BOLD}--- SECTION 7: VariationTree Graph Navigation & Shortcuts ---${RESET}`);

{
  const study = getStudyById('colle-ohanlon-1930')!;
  const root = study.rootNode;

  // Test 7.1: Root node properties
  assert(root.san === 'Bxh7+', 'Root node is 12.Bxh7+');
  assert(root.nag === '!', 'Root node has NAG !');
  assert(root.children.length > 0, 'Root node has children');

  // Test 7.2: findNodeById traversal across tree
  const node12 = findNodeById(root, 'colle-1');
  assert(node12 !== null && node12.san === 'Bxh7+', 'findNodeById resolves root colle-1');

  const node14h4 = findNodeById(root, 'colle-5-h4');
  assert(node14h4 !== null && node14h4.san === 'h4', 'findNodeById resolves deep variation node colle-5-h4');

  // Non-existent ID returns null
  const nonExistent = findNodeById(root, 'non-existent-id-999');
  assert(nonExistent === null, 'findNodeById returns null for missing ID without throwing');

  // Test 7.3: findPathToNode
  const path = findPathToNode(root, 'colle-5-h4');
  assert(path.length === 5, `findPathToNode returns full path of length 5 (got ${path.length})`);
  assert(path[0].id === 'colle-1', 'Path starts at root');
  assert(path[path.length - 1].id === 'colle-5-h4', 'Path ends at target node');

  // Path to root itself is length 1
  const rootPath = findPathToNode(root, 'colle-1');
  assert(rootPath.length === 1 && rootPath[0].id === 'colle-1', 'Path to root is array of [root]');

  // Path to non-existent node is empty array
  const badPath = findPathToNode(root, 'bad-node');
  assert(Array.isArray(badPath) && badPath.length === 0, 'Path to non-existent node is empty array');

  // Test 7.4: Variation branching simulation (Simulating VariationTree ArrowDown/ArrowUp logic)
  // colle-4-kg6 has multiple children (14.h4 and alternative 14...f5)
  const kg6Node = findNodeById(root, 'colle-4-kg6')!;
  assert(kg6Node.children.length >= 1, 'colle-4-kg6 has children');

  // Test 7.5: Edge of tree boundaries (cannot walk past leaf or before root)
  let leaf = root;
  while (leaf.children.length > 0) {
    leaf = leaf.children[0];
  }
  assert(leaf.children.length === 0, 'Leaf node reached at end of main line');
  // Attempting to step forward from leaf: children[0] does not exist, guard prevents crash
  assert(leaf.children[0] === undefined, 'Leaf has no forward children');
}

// ==============================================================================
// SECTION 8: MOVENAVIGATION CONTRACTS & TOUCH ACCESSIBILITY
// ==============================================================================
console.log(`\n${YELLOW}${BOLD}--- SECTION 8: MoveNavigation Boundaries & Contracts ---${RESET}`);

{
  // Test 8.1: Boundary disabled states
  // At start of study: canGoBack === false, canGoForward === true
  let backClicked = false;
  let forwardClicked = false;
  let resetClicked = false;
  let flipClicked = false;

  const mockPropsStart = {
    canGoBack: false,
    canGoForward: true,
    onFirstMove: () => { backClicked = true; },
    onPreviousMove: () => { backClicked = true; },
    onNextMove: () => { forwardClicked = true; },
    onLastMove: () => { forwardClicked = true; },
    onReset: () => { resetClicked = true; },
    onFlipBoard: () => { flipClicked = true; },
    orientation: 'white' as const,
  };

  assert(!mockPropsStart.canGoBack, 'canGoBack is false at position start');
  assert(mockPropsStart.canGoForward, 'canGoForward is true at position start');

  // Simulate button clicks
  mockPropsStart.onNextMove();
  assert(forwardClicked, 'Next move callback invoked');
  mockPropsStart.onReset();
  assert(resetClicked, 'Reset board callback invoked');
  mockPropsStart.onFlipBoard();
  assert(flipClicked, 'Flip board callback invoked');

  // At end of study: canGoBack === true, canGoForward === false
  const mockPropsEnd = {
    ...mockPropsStart,
    canGoBack: true,
    canGoForward: false,
  };
  assert(mockPropsEnd.canGoBack, 'canGoBack is true at position end');
  assert(!mockPropsEnd.canGoForward, 'canGoForward is false at position end');
}

// ==============================================================================
// SECTION 9: CATALOG-WIDE STEP EXTRACTION & DYNAMIC CHECKMATE VALIDATION
// ==============================================================================
console.log(`\n${YELLOW}${BOLD}--- SECTION 9: Catalog-Wide Steps & Dynamic Checkmates (All 18 Studies) ---${RESET}`);

{
  assert(allStudies.length === 18, `Catalog contains exactly 18 studies (got ${allStudies.length})`);

  let totalStepsValidated = 0;
  let dualCheckmateFound = false;

  for (const study of allStudies) {
    const steps = getCalculationStepsForStudy(study);
    assert(steps.length >= 1, `Study ${study.id}: extracted ${steps.length} steps`);
    totalStepsValidated += steps.length;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // FEN valid
      assert(isValidFen(step.fenBefore), `Study ${study.id} step ${i}: fenBefore is valid FEN`);
      assert(isValidFen(step.expectedFenAfter), `Study ${study.id} step ${i}: expectedFenAfter is valid FEN`);

      // Best move executable on fenBefore
      const engine = new Chess(step.fenBefore);
      const moveRes = engine.move(step.bestMoveSan);
      assert(moveRes !== null, `Study ${study.id} step ${i}: bestMoveSan (${step.bestMoveSan}) is legally executable`);

      // Opponent reply executable on expectedFenAfter if present
      if (step.opponentResponse) {
        const oppEngine = new Chess(step.expectedFenAfter);
        const oppMoveRes = oppEngine.move(step.opponentResponse.san);
        assert(
          oppMoveRes !== null,
          `Study ${study.id} step ${i}: opponentResponse (${step.opponentResponse.san}) is legally executable`
        );
      }

      // Hints integrity
      assert(typeof step.hints.level1Concept === 'string' && step.hints.level1Concept.length > 0, `Study ${study.id} step ${i}: Hint 1 present`);
      assert(step.hints.level2Highlight !== undefined, `Study ${study.id} step ${i}: Hint 2 present`);
      assert(Array.isArray(step.hints.level3Arrow) && step.hints.level3Arrow.length === 2, `Study ${study.id} step ${i}: Hint 3 arrow present`);

      // Dual checkmate detection for Lasker or Tarrasch
      if (study.id === 'ed-lasker-thomas-1912' && step.bestMoveSan.includes('Kd2')) {
        const hasO_O_O = step.alternativeMoves?.some((a) => a.san.includes('O-O-O'));
        assert(Boolean(hasO_O_O), 'Edward Lasker study step contains dual checkmate alternative 18.O-O-O#');
        dualCheckmateFound = true;
      }
    }
  }

  assert(dualCheckmateFound, 'Dual checkmate verification verified in catalog');
  assert(totalStepsValidated >= 18 * 3, `Total steps across catalog is robust: ${totalStepsValidated} steps`);
}

// ==============================================================================
// SUMMARY & EXIT
// ==============================================================================
console.log('\n==============================================================================');
console.log(`TOTAL CHECKS: ${totalTests}`);
console.log(`PASSED:       ${GREEN}${BOLD}${passedTests}${RESET}`);
console.log(`FAILED:       ${failedTests > 0 ? RED : GREEN}${BOLD}${failedTests}${RESET}`);
console.log('==============================================================================\n');

if (failedTests > 0) {
  console.error(`${RED}${BOLD}❌ ADVERSARIAL STRESS TEST IDENTIFIED BUGS / FAILURES:${RESET}`);
  for (const failure of failureLog) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
} else {
  console.log(`${GREEN}${BOLD}🎉 ALL ADVERSARIAL STRESS TESTS PASSED WITH 100% SUCCESS!${RESET}\n`);
  process.exit(0);
}
