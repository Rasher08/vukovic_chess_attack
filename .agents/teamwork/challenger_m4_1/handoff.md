# Handoff Report: Milestone 4 (M4: Deep Calculation Trainer Engine) — Empirical Review

**Agent**: `challenger_m4_1` (EMPIRICAL CHALLENGER: critic, specialist)  
**Date**: 2026-10-24  
**Project**: Vukovic Chess Attack Training Platform (`/Users/user/teamwork_projects/vukovic_chess_attack`)  
**Verdict**: **REQUEST_CHANGES**  

---

## 1. Observation

Direct tool execution results and observations:

1. **Existing Master E2E Suite (`bash tests/e2e/run_all_e2e.sh`)**:
   ```
   Total Test Suites Executed: 20
   Suites Passed:              20
   Suites Failed:              0
   Total Individual Tests:     72 / 72 PASS (100%)
   ```
   Exit code 0. However, inspection of test harnesses revealed that tests in `tests/e2e/` (such as `test_s1_colle_ohanlon_full_solve.ts` and `test_s2_ed_lasker_thomas_king_hunt.ts`) use internal mock study specifications rather than testing the application component `CalculationTrainer` or `getCalculationStepsForStudy`.

2. **Empirical Challenger Suite Execution (`npx tsx tests/challenger_m4_empirical_test.ts`)**:
   ```
   ============================================================
   🧪 SUITE: Challenger M4 Empirical Suite: Deep Calculation Trainer Engine
   ============================================================
     ✓ [PASS] CH-M4-01: Extraction of calculation steps across all 18 catalog studies (0.7ms, 813 assertions)
     ✓ [PASS] CH-M4-02: Simulating correct White moves and Black replies leads to completion (16.03ms, 256 assertions)
   Step 1 fenBefore: r1bqr3/pp1n1ppk/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 w - - 0 13
   Step 1 actual FEN after 13.Ng5+:   r1bqr3/pp1n1ppk/3bp3/6N1/3p4/2P5/PP3PPP/R1BQR1K1 b - -
   Step 1 expectedFenAfter declared:  r1bqr3/pp1n1ppk/3bp1N1/8/3p4/2P5/PP3PPP/R1BQR1K1 b - -
     ✗ [FAIL] CH-M4-03: Colle-O'Hanlon step 1 expectedFenAfter correctly reflects 13.Ng5+ (2.75ms)
        Error: expectedFenAfter in step 1 of Colle-O'Hanlon must place knight on g5 (6N1), not on g6 (3bp1N1)
   Evaluation result for 18.O-O-O#: {
     isAccepted: false,
     quality: 'blunder',
     blunderExplanation: 'Ход не соответствует форсированной линии Вуковича. Белые теряют темп и инициативу в атаке.'
   }
     ✗ [FAIL] CH-M4-04: Dual-win checkmate validation in Ed. Lasker vs Thomas (18.Kd2# vs 18.O-O-O#) (2.24ms)
        Error: Calculation trainer must accept 18.O-O-O# as a valid winning checkmate, not reject as blunder
   Evaluation result for 31.Qxf8#: {
     isAccepted: false,
     quality: 'blunder',
     blunderExplanation: 'Ход не соответствует форсированной линии Вуковича. Белые теряют темп и инициативу в атаке.'
   }
     ✗ [FAIL] CH-M4-05: Dual-win checkmate validation in Tarrasch vs von Scheve (31.Rxf8# vs 31.Qxf8#) (0.48ms)
        Error: Calculation trainer must accept 31.Qxf8# as a valid winning checkmate, not reject as blunder
     ✓ [PASS] CH-M4-06: Scoring algorithm formula awards 100% on first try and deducts hint penalties (0.29ms, 9 assertions)
     ✓ [PASS] CH-M4-07: Storage persistence saves records and computes user stats correctly (1.74ms, 5 assertions)
   ------------------------------------------------------------
   Summary: 4 passed, 3 failed of 7 total (25.42ms)
   ```
   Exit code 1.

3. **Direct Inspection of `src/components/trainer/CalculationTrainer.tsx`**:
   - **Lines 511-630 (`handleEvaluateMove`)**:
     The evaluator strictly compares against `currentStep.bestMoveSan` and `currentStep.alternativeMoves`. If `alternativeMoves` is empty or undefined, any other legal move — even a delivered checkmate like 18.O-O-O# or 31.Qxf8# — falls through to default blunder logic:
     ```typescript
     // Неожиданный неверный ход
     const defaultBlunder: BlunderDetail = {
       attemptedSan: moveSan,
       punishmentSan: '??',
       punishmentFen: currentStep.fenBefore,
       explanation:
         'Ход не соответствует форсированной линии Вуковича. Белые теряют темп и инициативу в атаке.',
       arrows: [],
       highlights: {},
     };
     setActiveBlunder(defaultBlunder);
     setFsmState('MISTAKE_EXPLANATION');
     setIsBlunderModalOpen(true);
     ```
   - **Line 94 (`expectedFenAfter` in `colle-ohanlon-1930`)**:
     ```typescript
     fenBefore: 'r1bqr3/pp1n1ppk/3bp3/8/3p4/2P2N2/PP3PPP/R1BQR1K1 w - - 0 13',
     expectedFenAfter: 'r1bqr3/pp1n1ppk/3bp1N1/8/3p4/2P5/PP3PPP/R1BQR1K1 b - - 1 13',
     bestMoveSan: 'Ng5+',
     ```
     The actual position resulting from 13.Ng5+ puts the knight on `g5` (`...3bp3/6N1...`). The string in line 94 places the knight on `g6` (`...3bp1N1/8...`), which is an illegal destination for a knight leaping from `f3`. In the UI (line 440: `setBoardFen(currentStep.expectedFenAfter)`), this causes the board to visibly display a corrupted piece placement upon making move 13.
   - **Lines 203-219 (Generic Blunder Extractor)**:
     ```typescript
     if (currentNode.children) {
       for (const child of currentNode.children) {
         if (child.isBlunderRefutation || (child.nag && child.nag.includes('?'))) {
     ```
     `currentNode` is a White move, so `currentNode.children` are Black's response moves. When a Black move has a NAG of `?` (e.g. 12...Kh8? in `ed-lasker-thomas-1912`), it is extracted as a blunder option for White (`step.blunders: [ { san: 'Kh8' } ]`). A player playing White cannot play Black's king move `Kh8`.

4. **TypeScript and Build Status**:
   - `npx tsc --noEmit`: Exit code 0.
   - `npm run build`: Exit code 0 (22/22 static pages generated).

---

## 2. Logic Chain

1. **Mission Mandate on Dual-Win Positions**:
   - *Observation*: The orchestrator prompt explicitly required: *"Dual-win positions (e.g. Ed. Lasker - Thomas 18.Kd2# vs 18.O-O-O#) accept both winning moves;"*.
   - *Logic*: In Edward Lasker vs Sir George Thomas (London, 1912), the King Hunt reaches the finale after 17...Kg1 (`r4r2/pbppq1p1/1pn1pN2/8/3P2NP/6P1/PPP1BP1R/R3K1k1 w Q - 5 18`). White can deliver checkmate either by 18.Kd2# (quiet king step discovering checkmate from Ra1) or 18.O-O-O# (queenside castling discovering checkmate from Ra1). Both are legal checkmates verified by `chess.js` (CH-M4-04).
   - *Empirical Defect*: In `CalculationTrainer.tsx`, `getCalculationStepsForStudy` does not populate `alternativeMoves` for this step. When a user submits 18.O-O-O#, `handleEvaluateMove` rejects it, sets `fsmState = 'MISTAKE_EXPLANATION'`, breaks the clean calculation run (`cleanRunBroken = true`), and displays a Blunder Modal stating that 18.O-O-O# lost tempo and initiative. Similarly, in Tarrasch vs von Scheve (31.Rxf8# vs 31.Qxf8#), 31.Qxf8# is rejected as a blunder.

2. **FEN State Drift in Colle-O'Hanlon**:
   - *Observation*: `src/components/trainer/CalculationTrainer.tsx` line 94 declares `expectedFenAfter` with `3bp1N1/8` instead of `3bp3/6N1`.
   - *Logic*: On step success, `CalculationTrainer` calls `setBoardFen(currentStep.expectedFenAfter)` (line 440). Because line 94 has `3bp1N1`, the board briefly updates to a board state where White's knight is on g6 instead of g5. When Black automatically replies with 13...Kg6 (line 106), the FEN jumps back to `6N1`.
   - *Empirical Defect*: FEN comparison in CH-M4-03 fails with mismatch.

3. **Inversion of Opponent Blunder Extraction**:
   - *Observation*: In `CalculationTrainer.tsx` line 204, `child` of `currentNode` represents Black's move.
   - *Logic*: Iterating over `currentNode.children` and checking `child.nag.includes('?')` extracts Black's mistakes (e.g. 12...Kh8? in Lasker-Thomas) and adds them to `blunders` of White's calculation step.
   - *Empirical Defect*: White's step in Lasker-Thomas lists `Kh8` as a user blunder option, which is illegal for White to play.

---

## 3. Caveats

- The scoring equation (100% on first try, -15% for Hint 1, -40% for Hint 2, -75% for Hint 3, attempt penalties, and time penalties) is correctly implemented and verified by test CH-M4-06.
- The localStorage persistence layer (`src/lib/storage.ts`) and fallback mechanisms function properly and pass all resilience tests.
- The existing 20 E2E test suites in `tests/e2e/run_all_e2e.sh` pass, but this is because those test files used simplified mock step arrays rather than testing the real `CalculationTrainer` component against alternative winning moves and actual FEN outputs.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

Milestone 4 cannot be approved in its current state because it fails the explicit mission requirement regarding dual-win positions and contains corrupted FEN data in the canonical Greek Gift study:
1. **Dual-Win Rejection**: In `ed-lasker-thomas-1912`, 18.O-O-O# must be accepted as a winning move alongside 18.Kd2# (as required by mission R3 and study description). In `tarrasch-scheve-1894`, 31.Qxf8# should likewise be accepted as alternative checkmate alongside 31.Rxf8#.
2. **Corrupted FEN in Colle-O'Hanlon**: In `src/components/trainer/CalculationTrainer.tsx` line 94, `expectedFenAfter` must be corrected from `r1bqr3/pp1n1ppk/3bp1N1/8/3p4/2P5/PP3PPP/R1BQR1K1 b - - 1 13` to `r1bqr3/pp1n1ppk/3bp3/6N1/3p4/2P5/PP3PPP/R1BQR1K1 b - - 1 13`.
3. **Dual-Win / Alternative Move Support in `CalculationTrainer.tsx`**:
   - In `getCalculationStepsForStudy`, add `alternativeMoves` for dual-win positions (e.g. `alternativeMoves: [{ san: 'O-O-O#', uci: 'e1c1', explanation: 'Эстетически безупречный мат длинной рокировкой!' }]` for Ed. Lasker step 7, and `alternativeMoves: [{ san: 'Qxf8#', uci: 'f6f8', explanation: 'Мат ферзем!' }]` for Tarrasch step 6).
   - Alternatively, or in addition, in `handleEvaluateMove`, if the user move delivers legal checkmate according to `chess.js` (`chess.isCheckmate()`), accept it as a valid winning solution.
4. **Fix Blunder Extraction**: In `CalculationTrainer.tsx` line 204, ensure only White blunders (or blunders attached to the position before White's move) are extracted, rather than Black's responses in `currentNode.children`.

---

## 5. Verification Method

To independently verify these findings:

1. **Run the empirical challenger test suite**:
   ```bash
   npx tsx tests/challenger_m4_empirical_test.ts
   ```
   *Observed result*: 4 passed, 3 failed (CH-M4-03, CH-M4-04, CH-M4-05 fail).
   *Target pass result after fix*: 7 passed, 0 failed.

2. **Run existing E2E test suite**:
   ```bash
   bash tests/e2e/run_all_e2e.sh
   ```
   *Expected result*: 20 passed, 0 failed.

3. **Verify Next.js build**:
   ```bash
   npm run build
   ```
   *Expected result*: Exit code 0, 22/22 static pages generated.
