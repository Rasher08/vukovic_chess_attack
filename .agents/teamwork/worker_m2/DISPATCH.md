## 2026-10-24T10:12:03Z
You are the Worker for Milestone 2 (M2: Interactive Chessboard & Audio Engine) of the Vukovic Chess Attack Training Platform.
Your working directory is /Users/user/teamwork_projects/vukovic_chess_attack/.agents/teamwork/worker_m2.
Project root is /Users/user/teamwork_projects/vukovic_chess_attack.

MANDATORY FIRST STEP: Read the authoritative user request at /Users/user/teamwork_projects/vukovic_chess_attack/.agents/teamwork/ORIGINAL_REQUEST.md, the project blueprint at /Users/user/teamwork_projects/vukovic_chess_attack/PROJECT.md, and the frontend survey at /Users/user/teamwork_projects/vukovic_chess_attack/.agents/teamwork/explorer_survey_frontend/survey_report.md before starting.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your exclusive write ownership:
- src/components/chess/ChessboardWrapper.tsx
- src/components/chess/PromotionModal.tsx
- src/components/chess/BoardControls.tsx
- src/lib/audioSynth.ts
- src/lib/chessUtils.ts

Your tasks for Milestone 2:
1. Implement `src/lib/audioSynth.ts` using the Web Audio API for zero-external-dependency sound effects:
   - `playMoveSound()`: subtle crisp wood click
   - `playCaptureSound()`: heavier percussive strike
   - `playCheckSound()`: sharp warning bell/tone
   - `playVictorySound()`: rewarding rising chord
   - `playErrorSound()`: low dull error thud
   - Graceful fallback: handles SSR (window undefined) and audio context resumption on first user gesture without errors.
2. Implement `src/components/chess/ChessboardWrapper.tsx`:
   - 'use client' directive with SSR hydration safety (`isMounted` state)
   - Wrapping `react-chessboard` (v4.7.3)
   - Support both Drag & Drop (`onPieceDrop`) and Click-to-Move (`onSquareClick`)
   - Legal move indicators: render small dots on legal empty destination squares, and ring/bracket on legal capture squares
   - Custom SVG arrows: threat arrows (red), maneuver/attack arrows (green/blue), sacrifice/special arrows (gold) matching `ArrowConfig` and `PROJECT.md` contracts
   - Custom square highlighting (selected square glow, source/target highlights, check alert on king)
   - Dynamic auto-resizing with container observation (ResizeObserver or responsive width)
3. Implement `src/components/chess/PromotionModal.tsx`:
   - Modal popup when pawn reaches 8th/1st rank allowing user to select Queen, Rook, Bishop, or Knight with piece icons/labels in Russian.
4. Implement `src/components/chess/BoardControls.tsx`:
   - Controls below board: Flip board (orientation toggle), Sound on/off toggle, Reset position.
5. Verification:
   - Run `npx tsc --noEmit` and ensure 0 errors.
   - Run `npm run validate:dataset`.
   - Run `bash tests/e2e/run_all_e2e.sh`.
6. Write your comprehensive handoff report to /Users/user/teamwork_projects/vukovic_chess_attack/.agents/teamwork/worker_m2/handoff.md documenting all implemented files, methods, and verification test outputs.
Communicate completion to parent via send_message.
