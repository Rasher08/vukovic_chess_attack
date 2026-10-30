## 2026-10-24T09:39:19Z
Sender: 346c2a84-85cf-439d-a9c6-a1fb930adf5b (parent)
Recipient: test_writer_e2e

You are the E2E Test Writer for the Vukovic Chess Attack Training Platform (E2E Testing Track).
Your working directory is /Users/user/teamwork_projects/vukovic_chess_attack/.agents/teamwork/test_writer_e2e.
Project root is /Users/user/teamwork_projects/vukovic_chess_attack.

MANDATORY FIRST STEP: Read the authoritative user request at /Users/user/teamwork_projects/vukovic_chess_attack/.agents/teamwork/ORIGINAL_REQUEST.md and the project blueprint at /Users/user/teamwork_projects/vukovic_chess_attack/PROJECT.md before doing any work.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All tests must be genuine, comprehensive, and independently verifiable. DO NOT write dummy assertions (e.g. assert(true)) or tautologies. A teamwork_preview_auditor will independently verify your work.

Your exclusive write ownership:
- /Users/user/teamwork_projects/vukovic_chess_attack/TEST_INFRA.md
- /Users/user/teamwork_projects/vukovic_chess_attack/tests/e2e/ (all test files, harness, runners)
- /Users/user/teamwork_projects/vukovic_chess_attack/TEST_READY.md

Your mission:
Design and implement the complete, requirement-driven, opaque-box E2E test suite according to the 4-tier test case design methodology:
1. Create TEST_INFRA.md at project root outlining test philosophy, test architecture, and coverage thresholds.
2. Build the test harness and runner scripts in tests/e2e/:
   - Tier 1: Feature Coverage (>=5 test cases per feature for F1 to F5):
     * F1: Dataset integrity, 15-20 studies presence, Russian annotations, Greek gift lines, prerequisite checklists;
     * F2: Chessboard interaction contracts, legal moves, click/drag, arrows, square highlights, sound synth;
     * F3: Variation tree navigation, branch selection, keyboard shortcuts, strategic callouts;
     * F4: Calculation trainer FSM states, 3-7 ply forcing moves, stubborn black responses, blunder refutation triggers, 3-tier hints, localStorage scoring;
     * F5: Build readiness, Next.js SSG exports, static params, Vercel configuration, README documentation.
   - Tier 2: Boundary & Corner Cases (>=5 per feature):
     * Empty moves, terminal mate states, king in check, draw/stalemate, double checkmate (e.g. 18.Kd2# vs 18.O-O-O#), long calculation sequences (7 plies), malformed localStorage payload recovery.
   - Tier 3: Cross-Feature Combinations (pairwise interactions):
     * Tree navigation + calculation trainer mode switching;
     * Blunder refutation + physical board move playback + sound synth;
     * Greek Gift 2...Kg6 line + hint level 3 arrow rendering + FSM step evaluation.
   - Tier 4: Real-World Application Scenarios (>=5 full scenarios):
     * Complete solve of Colle - O'Hanlon 1.Bxh7+ calculation trainer path;
     * Complete solve of Ed. Lasker - Thomas king hunt calculation trainer path;
     * Greek Gift error handling scenario (user plays 3.Qh5? -> gets refuted with 3...Bxg5! -> reads Russian explanation -> rewinds -> plays 3.h4! -> wins);
     * Study mode full variation tree walkthrough;
     * Full training session persistence in localStorage with accuracy scoring.
3. Implement `tests/e2e/run_all_e2e.sh` executable script that runs the entire test suite and reports clean test results with exit code 0 when all tests pass.
4. When the test suite and harness are fully implemented and passing or ready, write `TEST_READY.md` at project root summarizing the runner command, tier coverage counts, and feature checklist.
5. Write your handoff report to /Users/user/teamwork_projects/vukovic_chess_attack/.agents/teamwork/test_writer_e2e/handoff.md.
Communicate completion to parent via send_message.
