# Handoff Report: Deep Calculation Trainer Architecture (Requirement R3)

**Agent**: Calculation Trainer Explorer (`explorer_survey_trainer`)  
**Working Directory**: `/Users/user/teamwork_projects/vukovic_chess_attack/.agents/teamwork/explorer_survey_trainer`  
**Parent Orchestrator ID**: `346c2a84-85cf-439d-a9c6-a1fb930adf5b`  
**Date**: 2026-10-24  
**Handoff Type**: Hard (Task Complete)  

---

## 1. Observation

1. **User Requirement & Acceptance Criteria**:
   * File: `/Users/user/teamwork_projects/vukovic_chess_attack/.agents/teamwork/ORIGINAL_REQUEST.md`
   * Lines 26–32 (Requirement R3):
     > "### R3. Тренажер глубокого расчета (Deep Calculation Trainer)  
     > Реализовать режим «Тренировка расчета»:  
     > - Пользователь должен не просто сделать первый очевидный ход-жертву (Bxh7+), а рассчитать и последовательно сыграть точную цепочку из 3-7 последующих сильнейших ходов;  
     > - Автоматический ответ черных за наиболее упорные варианты защиты;  
     > - Интерактивный разбор типичных ложных следов («Почему не 3.Qh5 сразу?», «Почему здесь ферзь идет на d3, а не на h5?» и т.д.);  
     > - Индикатор прогресса освоения тем и точности решений."
   * Lines 48 (Acceptance Criteria):
     > "- [ ] В режиме тренировки система проверяет ходы пользователя, выдает обратную связь при неточностях и переключается на следующий шаг при верном ответе."
2. **Runtime Environment**:
   * Executed command: `node -v && npm -v && python3 --version`
   * Result: `v26.5.0`, `npm 11.17.0`, `Python 3.14.6`. Modern Node.js LTS/Current with native ES modules support.
3. **Team Roster & Coordination**:
   * Checked `/Users/user/teamwork_projects/vukovic_chess_attack/.agents/teamwork/orchestrator_1/BRIEFING.md` (lines 48–53) and peer folders `spec_miner_survey_dataset` and `explorer_survey_frontend`.
   * Found dataset mining focusing on 15–20 Vukovic positions, and frontend explorer focusing on Next.js App Router, `react-chessboard`, and `chess.js`.

---

## 2. Logic Chain

1. **Pedagogical Gap in Existing Platforms**:
   * Observation 1 highlights that standard puzzle platforms only require the first sacrifice (1.Bxh7+).
   * Inference: In Vladimir Vukovic's methodology, the critical skill is calculating subsequent forced lines ($2...Kg8$ with $3.Qh5$ vs $3.Qd3!$, or $2...Kg6$ with $3.h4!$ vs blunders $3.Qh5?$ and $3.Qg4?$).
   * Conclusion: The calculation trainer must enforce a 3–7 ply forced sequence of White moves, paired with automated defensive moves for Black's most stubborn responses.

2. **Refutation Mechanism Design**:
   * Observation 1 explicitly demands an "interactive breakdown of typical false paths («Почему не 3.Qh5 сразу?»)".
   * Inference: Simply rejecting the move with a red cross does not teach the tactical cause of failure.
   * Conclusion: An interactive refutation loop is required: when the user plays a blunder (e.g. 3.Qh5?), the board plays Black's punishing response (e.g. 3...Bxg5! or 3...Kxg5!), highlights the error, displays an educational Russian explanation, and provides a rewind button.

3. **Step-by-Step Hint Progression**:
   * To prevent premature solutions while avoiding user frustration, a 3-tier hint ladder was designed:
     * Tier 1: General strategic concept (Vukovic principle, -15% score).
     * Tier 2: Target piece/square highlight (amber visual glow, -40% score).
     * Tier 3: Concrete move arrow & SAN notation (-75% score).

4. **Finite State Machine & State Management**:
   * Chess UI interactions with drag-and-drop are prone to race conditions if user drags pieces while Black's counter-move or refutation is animating.
   * Solution: An 8-state FSM (`IDLE`, `WAITING_USER_MOVE`, `EVALUATING_USER_MOVE`, `STEP_SUCCESS`, `ANIMATING_OPPONENT`, `MISTAKE_EXPLANATION`, `STUDY_COMPLETED`, `ANALYSIS_MODE`) with explicit piece dragging locks during transitions.

5. **Calculation Metrics & Persistence**:
   * A scoring algorithm was formulated balancing deliberation time (preventing lucky blitz guesses <2s and rewarding thoughtful 10–35s calculation), clean calculation depth, and hint penalties.
   * Zero-external-backend persistence was structured via browser `localStorage` under `vukovic_chess_storage_v1`.

---

## 3. Caveats

1. **Chess Engine Verification**: The tactical evaluations (best moves, refutations) in the study dataset are validated against Vukovic's classic analysis and standard chess theory, but full engine depth-30 verification is delegated to the dataset mining / verification subagents.
2. **Mobile Screen Real Estate**: The calculation mode UI with board, timer, move counter, and refutation modal must be responsive. On mobile screens (<640px), the refutation card should render as a bottom sheet drawer rather than a side panel.
3. **No External Backend**: Per requirement R4, all calculation validation is done entirely client-side without API calls, relying on static study DAG objects.

---

## 4. Conclusion

The specification and architecture for Requirement R3 («Тренажер глубокого расчета») is fully drafted and validated. All components—multi-ply forced variations, interactive blunder refutation, 3-tier hints, robust FSM, calculation metrics, localStorage schema, and seamless mode switching—are documented in detail in:
`/Users/user/teamwork_projects/vukovic_chess_attack/.agents/teamwork/explorer_survey_trainer/survey_report.md`.

This report provides complete TypeScript interfaces ready to be integrated into the implementation contracts for `PROJECT.md`.

---

## 5. Verification Method

1. **Verify Report Files Existence & Content**:
   * Inspect `/Users/user/teamwork_projects/vukovic_chess_attack/.agents/teamwork/explorer_survey_trainer/survey_report.md` (size > 10 KB, complete sections 1–10).
   * Inspect `/Users/user/teamwork_projects/vukovic_chess_attack/.agents/teamwork/explorer_survey_trainer/handoff.md`.
2. **Verify TypeScript Contracts**:
   * Validate that all TypeScript interfaces (`CalculationStep`, `CalculationStudy`, `VukovicStudyRecord`, etc.) match the frontend stack (`react-chessboard` and `chess.js`) and dataset schema.
3. **Invalidation Conditions**:
   * If the project introduces a server-side database (e.g. Supabase/PostgreSQL) instead of client-side `localStorage`, the storage adapter will need to be wrapped in an async repository pattern.
