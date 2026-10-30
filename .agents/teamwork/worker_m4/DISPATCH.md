## 2026-10-24T10:53:50Z

You are the Worker for Milestone 4 (M4: Deep Calculation Trainer Engine) of the Vukovic Chess Attack Training Platform.
Your working directory is /Users/user/teamwork_projects/vukovic_chess_attack/.agents/teamwork/worker_m4.
Project root is /Users/user/teamwork_projects/vukovic_chess_attack.

MANDATORY FIRST STEP: Read /Users/user/teamwork_projects/vukovic_chess_attack/.agents/teamwork/ORIGINAL_REQUEST.md, /Users/user/teamwork_projects/vukovic_chess_attack/PROJECT.md, and the trainer survey at /Users/user/teamwork_projects/vukovic_chess_attack/.agents/teamwork/explorer_survey_trainer/survey_report.md before starting.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your exclusive write ownership:
- src/components/trainer/CalculationTrainer.tsx
- src/components/trainer/BlunderModal.tsx
- src/components/trainer/HintPanel.tsx
- src/components/trainer/CalculationScoreCard.tsx
- src/components/trainer/ModeSwitcher.tsx
- src/lib/storage.ts
- src/components/study/StudyHeader.tsx (integrate Trainer and Mode Switcher into StudyViewLayout)

Your tasks for Milestone 4:
1. Implement `src/lib/storage.ts`:
   - Browser `localStorage` adapter (`vukovic_chess_storage_v1`)
   - Functions: `getStudyProgress(studyId)`, `saveStudyProgress(progress)`, `getAllProgress()`, `getStreakCount()`, `clearProgress()`.
   - SSR-safe (safe if `typeof window === 'undefined'`).
2. Implement `src/components/trainer/ModeSwitcher.tsx`:
   - Accessible toggle switch on the study view between «Режим изучения» (Variation tree exploration) and «Тренажер расчета» (Calculation trainer mode).
3. Implement `src/components/trainer/HintPanel.tsx`:
   - 3-tier hint progression:
     * Tier 1: General strategic concept (Vukovic principle, -15% score)
     * Tier 2: Target piece/square highlight (amber visual glow, -40% score)
     * Tier 3: Concrete move arrow & SAN notation (-75% score)
   - Disables higher hints until lower ones are viewed; displays score penalty warnings in Russian.
4. Implement `src/components/trainer/BlunderModal.tsx`:
   - Pedagogical Russian explanation when the user plays an incorrect move (blunder / false trail, e.g. 3.Qh5? when 3.h4! is required).
   - Shows the refutation played by Black (e.g. 3...Bxg5!), highlights the error square in red, displays the Vukovic explanation, and provides a «Попробовать снова» button to rewind.
5. Implement `src/components/trainer/CalculationScoreCard.tsx`:
   - Displayed upon completing the study's calculation sequence:
     * Accuracy percentage (100% on first try without hints)
     * Clean calculation depth ($D_{clean}$) reached (3-8 plies)
     * Time elapsed with thoughtful calculation badge
     * Attacking mastery rank («Практик атаки», «Мастер форсированного расчета», «Гроссмейстер атаки Вуковича»)
     * Buttons: «Повторить этюд», «Следующий этюд», «Анализ партии».
6. Implement `src/components/trainer/CalculationTrainer.tsx`:
   - 8-state FSM (`IDLE`, `WAITING_USER_MOVE`, `EVALUATING_USER_MOVE`, `STEP_SUCCESS`, `ANIMATING_OPPONENT`, `MISTAKE_EXPLANATION`, `STUDY_COMPLETED`, `ANALYSIS_MODE`).
   - Forces user to calculate and play 3-7 consecutive moves in the attack line (not just the initial 1.Bxh7+).
   - Automatically plays Black's most stubborn responses after a brief realistic animation delay (500ms) with move sound.
   - Intercepts blunders: physically plays the blunder, then immediately plays Black's punishing response with sound, triggers BlunderModal, and freezes board until user clicks rewind.
   - Supports 3-tier hints and passes custom square highlights / arrows to the ChessboardWrapper.
   - Saves final result to localStorage on completion.
7. Integrate into `src/components/study/StudyHeader.tsx` (`StudyViewLayout`):
   - Seamlessly switch between the VariationTree (Study Mode) and CalculationTrainer (Trainer Mode).
8. Verification:
   - Run `npx tsc --noEmit` (0 errors).
   - Run `npm run build` (exit code 0).
   - Run `npm run validate:dataset`.
   - Run `bash tests/e2e/run_all_e2e.sh` (100% pass).
9. Write your comprehensive handoff report to /Users/user/teamwork_projects/vukovic_chess_attack/.agents/teamwork/worker_m4/handoff.md.
Communicate completion to parent via send_message.
