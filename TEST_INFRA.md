# Test Infrastructure Specification: Vukovic Chess Attack Training Platform

> **Target Platform**: Vukovic Chess Attack Training Platform (Next.js 14 / TypeScript / Tailwind CSS / chess.js / react-chessboard)  
> **Methodology**: 4-Tier Requirement-Driven Opaque-Box E2E Testing  
> **Source Documents**: `ORIGINAL_REQUEST.md`, `PROJECT.md`, Chapter V of Vladimir Vuković's *The Art of Attack in Chess*  
> **Test Harness Location**: `tests/e2e/harness/`  
> **Test Suites Location**: `tests/e2e/` (tier1_features, tier2_boundaries, tier3_combinations, tier4_real_world)  
> **Execution Runner**: `tests/e2e/run_all_e2e.sh`

---

## 1. Testing Philosophy & Guiding Principles

The Vukovic Chess Attack Training Platform is designed for advanced club players (rating 2000+ Chess.com) who require rigorous calculation discipline rather than superficial tactics. In accordance with this pedagogical mission, our test infrastructure adheres to the following foundational principles:

1. **Opaque-Box Requirement-Driven Design**:
   Tests are written strictly against the authoritative requirements (`ORIGINAL_REQUEST.md`), interface contracts (`PROJECT.md`), and Vladimir Vukovic's chess methodology. Tests treat implementation modules as opaque components, validating externally observable behavior, FEN/SAN state transformations, FSM transitions, Web Audio events, and browser storage persistence.

2. **Anti-Cheating & Verifiable Integrity**:
   - Zero tautological assertions (no `assert(true)` or dummy checks).
   - All expected outputs are derived from authoritative chess sources: FEN board geometry, official FIDE move rules, Vukovic's annotated games, and the 6-point prerequisite checklist.
   - Every move sequence is verified by an independent chess logic engine.

3. **Multi-Ply Forcing Calculation**:
   Tactical calculation in Vukovic's doctrine requires calculating 3 to 7 consecutive plies without guessing. The test harness models multi-ply calculation depth, verifying that premature success is never awarded on the first move sacrifice (`Bxh7+`) and that defensive stubbornly branching lines are played accurately.

4. **Self-Contained & Deterministic Execution**:
   - Zero external network dependencies.
   - Zero flaky timeouts or race conditions.
   - Node.js 26 native TypeScript execution (`--experimental-strip-types`) with built-in strict assertions (`node:assert/strict`).
   - Clean state isolation: every test sets up its own virtual board, FSM context, and mock storage.

---

## 2. Test Architecture: 4-Tier Methodology

The test suite is structured into four distinct tiers:

```
tests/e2e/
├── harness/                           # Reusable test engines & browser simulators
│   ├── testRunner.ts                  # Assertions, test grouping, timing & reporting
│   ├── chessEngineHarness.ts          # FEN/SAN validation, legal move engine & board geometry
│   ├── fsmHarness.ts                  # 8-state calculation trainer FSM & scoring formula
│   ├── storageHarness.ts              # LocalStorage mock, schema validation & recovery
│   ├── browserDomHarness.ts           # Drag/drop, click-to-move, arrows & keyboard shortcuts
│   ├── synthHarness.ts                # Web Audio API sound event inspector
│   └── datasetHarness.ts              # 18-study dataset schemas & prerequisite checker
│
├── tier1_features/                    # TIER 1: Feature Coverage (>=5 test cases per feature)
│   ├── test_f1_dataset_integrity.ts   # F1: 18 studies, Russian texts, Greek Gift lines, checklist
│   ├── test_f2_chessboard_contracts.ts# F2: ChessboardWrapper, clicks, drags, arrows, audio synth
│   ├── test_f3_variation_tree.ts      # F3: MoveNode graph, branches, keyboard navigation, callouts
│   ├── test_f4_calculation_trainer.ts # F4: FSM states, multi-ply forcing moves, refutations, hints
│   └── test_f5_build_and_deploy.ts    # F5: package.json, tsconfig, next.config, vercel.json, README
│
├── tier2_boundaries/                  # TIER 2: Boundary & Corner Cases (>=5 test cases per area)
│   ├── test_b1_empty_and_illegal_moves.ts      # Empty inputs, illegal trajectories, turn violations
│   ├── test_b2_terminal_mate_and_stalemate.ts  # Checkmate states, draw detection, board locking
│   ├── test_b3_king_checks_and_pins.ts         # Absolute pins, double checks, king walk bounds
│   ├── test_b4_double_mate_and_long_sequences.ts# Dual solutions (18.Kd2# vs 18.O-O-O#), 7 plies
│   └── test_b5_malformed_storage_recovery.ts   # Corrupt JSON, schema migrations, quota limits
│
├── tier3_combinations/                # TIER 3: Cross-Feature Pairwise Interactions
│   ├── test_c1_tree_trainer_mode_switching.ts  # Study mode <-> Calculation trainer mode toggling
│   ├── test_c2_blunder_playback_synth.ts       # Blunder refutation + physical playback + audio synth
│   ├── test_c3_kg6_arrow_fsm_eval.ts           # Greek Gift 2...Kg6 + Hint 3 arrow + FSM scoring
│   ├── test_c4_promotion_score_deduction.ts    # Underpromotion + FSM transition + retry penalty
│   └── test_c5_storage_rapid_toggle_resilience.ts# Rapid switching, state reload, multi-study stats
│
├── tier4_real_world/                  # TIER 4: Real-World Application Scenarios
│   ├── test_s1_colle_ohanlon_full_solve.ts     # Edgar Colle vs John O'Hanlon (Nice 1930) 1.Bxh7+
│   ├── test_s2_ed_lasker_thomas_king_hunt.ts   # Ed. Lasker vs Thomas (London 1912) King Hunt
│   ├── test_s3_greek_gift_blunder_recovery.ts  # Blunder 3.Qh5? -> Refutation 3...Bxg5! -> 3.h4! win
│   ├── test_s4_study_mode_tree_walkthrough.ts  # Complete tree walkthrough with Russian callouts
│   └── test_s5_full_session_scoring_persistence.ts# Complete multi-study session with mastery rank
│
└── run_all_e2e.sh                     # Master executable test runner
```

---

## 3. Coverage Thresholds and Quality Gates

| Metric | Minimum Required | Current Plan / Implementation |
|---|---|---|
| **Tier 1 Feature Coverage** | $\ge 25$ tests ($\ge 5$ per F1-F5) | 30 tests (6 per feature) |
| **Tier 2 Boundary Cases** | $\ge 25$ tests ($\ge 5$ per category) | 25 tests |
| **Tier 3 Cross-Feature Combos** | $\ge 10$ tests | 10 tests |
| **Tier 4 Real-World Scenarios** | $\ge 5$ full scenarios | 5 comprehensive scenarios |
| **Total Test Count** | $\ge 65$ tests | **70 tests** |
| **Pass Rate Threshold** | 100% PASS | 100% PASS |
| **Exit Code** | 0 on clean pass | 0 |
| **Zero Dummy Assertions** | 100% compliant | Fully verified |

---

## 4. Test Harness Specifications

### 4.1. `chessEngineHarness.ts`
- Standalone, zero-dependency chess rules validation engine.
- Supports FEN parsing, piece placement, turn tracking, castling rights (`KQkq`), en passant target squares.
- Validates algebraic notation (SAN: `Bxh7+`, `Ng5+`, `O-O-O#`, `exf6 e.p.`, `d8=Q#`) and UCI strings.
- Detects check, checkmate, stalemate, and illegal king exposure.

### 4.2. `fsmHarness.ts`
- Models the 8-state calculation trainer FSM (`IDLE`, `WAITING_USER_MOVE`, `EVALUATING_USER_MOVE`, `STEP_SUCCESS`, `ANIMATING_OPPONENT`, `MISTAKE_EXPLANATION`, `STUDY_COMPLETED`, `ANALYSIS_MODE`).
- Implements the Vukovic Scoring Equation:
  $$S_i = S_{base} \times M_{quality} \times M_{hint} \times M_{attempts} \times M_{time}$$
- Tracks clean calculation depth ($D_{clean}$) and session accuracy percentage.

### 4.3. `storageHarness.ts`
- Full in-memory mock of the W3C Web Storage API (`localStorage`).
- Tests versioning (`version: 1`), payload schema enforcement, JSON corruption recovery, and `QuotaExceededError` fallback logic.

### 4.4. `browserDomHarness.ts`
- Simulates chessboard user interaction events:
  * Click-to-move (first click selects piece, calculates move dots; second click moves).
  * Drag-and-drop piece drop events with legality verification.
  * Keyboard navigation events (`ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, `Home`, `End`).
  * Fog of War visibility masking in Trainer Mode.

### 4.5. `synthHarness.ts`
- Emulates the Web Audio API sound synthesizer:
  * Regular move: 400 Hz short sine wave (60 ms).
  * Capture move: 260 Hz dense tone (100 ms).
  * Check alert: 880 Hz high warning pulse (140 ms).
  * Victory fanfare: C-E-G-C major chord arpeggio.

---

## 5. Execution Instructions

### Running the Full Test Suite
```bash
# Direct execution via bash
bash tests/e2e/run_all_e2e.sh

# Or make executable and run directly
chmod +x tests/e2e/run_all_e2e.sh
./tests/e2e/run_all_e2e.sh
```

### Running Individual Tiers
```bash
# Tier 1 Feature Coverage
node --experimental-strip-types tests/e2e/tier1_features/test_f1_dataset_integrity.ts
node --experimental-strip-types tests/e2e/tier1_features/test_f2_chessboard_contracts.ts
node --experimental-strip-types tests/e2e/tier1_features/test_f3_variation_tree.ts
node --experimental-strip-types tests/e2e/tier1_features/test_f4_calculation_trainer.ts
node --experimental-strip-types tests/e2e/tier1_features/test_f5_build_and_deploy.ts

# Tier 2 Boundary Cases
node --experimental-strip-types tests/e2e/tier2_boundaries/test_b1_empty_and_illegal_moves.ts
node --experimental-strip-types tests/e2e/tier2_boundaries/test_b2_terminal_mate_and_stalemate.ts
node --experimental-strip-types tests/e2e/tier2_boundaries/test_b3_king_checks_and_pins.ts
node --experimental-strip-types tests/e2e/tier2_boundaries/test_b4_double_mate_and_long_sequences.ts
node --experimental-strip-types tests/e2e/tier2_boundaries/test_b5_malformed_storage_recovery.ts

# Tier 3 Cross-Feature Combinations
node --experimental-strip-types tests/e2e/tier3_combinations/test_c1_tree_trainer_mode_switching.ts
node --experimental-strip-types tests/e2e/tier3_combinations/test_c2_blunder_playback_synth.ts
node --experimental-strip-types tests/e2e/tier3_combinations/test_c3_kg6_arrow_fsm_eval.ts
node --experimental-strip-types tests/e2e/tier3_combinations/test_c4_promotion_score_deduction.ts
node --experimental-strip-types tests/e2e/tier3_combinations/test_c5_storage_rapid_toggle_resilience.ts

# Tier 4 Real-World Application Scenarios
node --experimental-strip-types tests/e2e/tier4_real_world/test_s1_colle_ohanlon_full_solve.ts
node --experimental-strip-types tests/e2e/tier4_real_world/test_s2_ed_lasker_thomas_king_hunt.ts
node --experimental-strip-types tests/e2e/tier4_real_world/test_s3_greek_gift_blunder_recovery.ts
node --experimental-strip-types tests/e2e/tier4_real_world/test_s4_study_mode_tree_walkthrough.ts
node --experimental-strip-types tests/e2e/tier4_real_world/test_s5_full_session_scoring_persistence.ts
```

All test outputs provide structured TAP / colored progress reports with total elapsed execution time and granular assertion counts.

---

## 6. Nonchalant HUD Computer Vision & Performance Testing Infrastructure

### 6.1. Architecture & Verification Philosophy
The Nonchalant HUD is an assistive desktop HUD that captures live chess positions from Chess.com and analyzes tactical attacking motifs (especially Greek Gift and Vukovic attacking ideas). The CV recognition engine must operate at high speed (< 25 ms per full 8x8 frame) and 100% accuracy, remaining fully invariant to Chess.com move highlights, edge cropping, in-square coordinates, and visual board themes.

### 6.2. 4-Tier CV Test Suite (`hud/tests/highlights.test.ts`)
The CV test suite follows a 4-tier requirement-driven structure:

1. **Tier 1: Full Piece & Empty Square Coverage (White & Black Orientations)**:
   - Covers all 12 standard chess pieces (`P`, `N`, `B`, `R`, `Q`, `K`, `p`, `n`, `b`, `r`, `q`, `k`).
   - Covers empty light squares and empty dark squares.
   - Exercises both normal White view and flipped Black board orientation.
   - Validates that FEN placement and cell coordinate mapping match ground truth.

2. **Tier 2: Boundary Conditions & Edge Robustness**:
   - Extreme vertical 'h' file edge crop with horizontal translation up to 4px (+1px, +2px, +3px, +4px) simulating imprecise user bounding-box selection.
   - Extreme corner squares (a1, a8, h1, h8) under boundary shifts.
   - In-square coordinates ("Coordinates: Inside" feature of Chess.com): rank digits (1-8) in top-left of col 0 and file letters (a-h) in bottom-right of rank 1, specifically verifying corner square a1 (which contains both coordinates).

3. **Tier 3: Chess.com Highlight Combinations & Theme Invariance**:
   - Move highlight colors: Yellow (`#f7f769`), Green (`#a9bc6c`), Pink/Red (`#eb5757`).
   - Highlight geometry: full square fills (alpha 0.5-0.75) and colored borders (3px, 4px, 5px, 6px).
   - **Empty Square Immunity**: Empty squares (d5, e4, c4) with move highlights/borders MUST NEVER be classified as White King ♔ (`K`) or any other piece (`cell.piece === null`).
   - **Black Piece Accuracy**: Black pawn on e4, black knight on f6, black rook on c8 under colored highlights must remain accurately classified as their true piece type (`p`, `n`, `r`), never White King or Queen.
   - **White Piece Recognition**: White Queen on h5, Knight on f3, Pawn on e4 under highlights.
   - **Multi-Theme Support**: Neo (`[235, 236, 208]` / `[119, 149, 86]`), Classic (`[240, 217, 181]` / `[181, 136, 99]`), and Wood (`[210, 165, 115]` / `[136, 84, 39]` with organic wood grain texture noise $\pm 14$ RGB).

4. **Tier 4: Realistic Vukovic Attack Scenarios**:
   - Colle System Greek Gift 1.Bxh7+! with highlight on origin d3 and target h7.
   - Acceptance 1...Kxh7 with highlight on origin g8 and target h7.
   - Vukovic Rook Lift Attack (Rd3-h3) along extreme files.

### 6.3. Automated Performance Benchmark Suite (`hud/tests/benchmark.ts`)
- Measures execution time of `recognize()` across 50 measured iterations after 10 warmup iterations per resolution.
- Multi-resolution profiling:
  * 384x384 (standard small)
  * 512x512 (desktop native)
  * 1024x1024 (Retina / high-DPI display)
- Metrics captured: Min, Max, Average, P95 execution time.
- Strict SLA Assertion: `avgTime < 25.0 ms` per 8x8 board.

### 6.4. HUD Execution Commands
```bash
# Run CV Performance Benchmark Suite (50 iterations per resolution, <25ms assert)
npx --prefix hud tsx tests/benchmark.ts

# Run 4-Tier Highlight & Theme Tolerance Test Suite
npx --prefix hud tsx tests/highlights.test.ts

# Full HUD Regression Suite
npm --prefix hud run typecheck
npm --prefix hud test
npm --prefix hud run test:raster
npm --prefix hud run smoke
```

