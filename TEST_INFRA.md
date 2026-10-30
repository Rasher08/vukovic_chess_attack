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
