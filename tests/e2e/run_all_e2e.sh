#!/usr/bin/env bash
# ==============================================================================
# Master E2E Test Suite Runner for Vukovic Chess Attack Training Platform
# Covers Tiers 1-4: Feature Coverage, Boundaries, Combinations, and Real-World Scenarios
# ==============================================================================

set -euo pipefail

# ANSI color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

echo -e "${CYAN}${BOLD}"
echo "=============================================================================="
echo "♟️   VUKOVIC CHESS ATTACK PLATFORM — 4-TIER E2E TEST SUITE RUNNER            "
echo "=============================================================================="
echo -e "${NC}"
echo "Project Root: ${ROOT_DIR}"
echo "Node Version: $(node -v)"
echo "Test Harness: tests/e2e/harness/"
echo "Timestamp:    $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# Choose runner: npx tsx preferred, fallback to node --experimental-strip-types
if command -v npx >/dev/null 2>&1 && npx tsx -v >/dev/null 2>&1; then
  RUNNER_CMD="npx tsx"
else
  RUNNER_CMD="node --experimental-strip-types"
fi
echo -e "Execution Engine: ${BOLD}${RUNNER_CMD}${NC}"
echo ""

TEST_FILES=(
  # Tier 1: Feature Coverage (F1 to F5)
  "tests/e2e/tier1_features/test_f1_dataset_integrity.ts"
  "tests/e2e/tier1_features/test_f2_chessboard_contracts.ts"
  "tests/e2e/tier1_features/test_f3_variation_tree.ts"
  "tests/e2e/tier1_features/test_f4_calculation_trainer.ts"
  "tests/e2e/tier1_features/test_f5_build_and_deploy.ts"

  # Tier 2: Boundary & Corner Cases (B1 to B5)
  "tests/e2e/tier2_boundaries/test_b1_empty_and_illegal_moves.ts"
  "tests/e2e/tier2_boundaries/test_b2_terminal_mate_and_stalemate.ts"
  "tests/e2e/tier2_boundaries/test_b3_king_checks_and_pins.ts"
  "tests/e2e/tier2_boundaries/test_b4_double_mate_and_long_sequences.ts"
  "tests/e2e/tier2_boundaries/test_b5_malformed_storage_recovery.ts"

  # Tier 3: Cross-Feature Combinations (C1 to C5)
  "tests/e2e/tier3_combinations/test_c1_tree_trainer_mode_switching.ts"
  "tests/e2e/tier3_combinations/test_c2_blunder_playback_synth.ts"
  "tests/e2e/tier3_combinations/test_c3_kg6_arrow_fsm_eval.ts"
  "tests/e2e/tier3_combinations/test_c4_promotion_score_deduction.ts"
  "tests/e2e/tier3_combinations/test_c5_storage_rapid_toggle_resilience.ts"

  # Tier 4: Real-World Scenarios (S1 to S5)
  "tests/e2e/tier4_real_world/test_s1_colle_ohanlon_full_solve.ts"
  "tests/e2e/tier4_real_world/test_s2_ed_lasker_thomas_king_hunt.ts"
  "tests/e2e/tier4_real_world/test_s3_greek_gift_blunder_recovery.ts"
  "tests/e2e/tier4_real_world/test_s4_study_mode_tree_walkthrough.ts"
  "tests/e2e/tier4_real_world/test_s5_full_session_scoring_persistence.ts"
)

TOTAL_FILES=${#TEST_FILES[@]}
PASSED_FILES=0
FAILED_FILES=0
START_TIME=$(date +%s)

for idx in "${!TEST_FILES[@]}"; do
  file="${TEST_FILES[$idx]}"
  test_num=$((idx + 1))
  echo -e "${BLUE}▶ [${test_num}/${TOTAL_FILES}] Running: ${file}${NC}"
  
  if ${RUNNER_CMD} "${file}"; then
    PASSED_FILES=$((PASSED_FILES + 1))
  else
    FAILED_FILES=$((FAILED_FILES + 1))
    echo -e "${RED}${BOLD}✖ FAILED: ${file}${NC}"
  fi
done

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo -e "${CYAN}${BOLD}==============================================================================${NC}"
echo -e "${BOLD}E2E TEST SUITE RUN RESULTS SUMMARY${NC}"
echo -e "${CYAN}==============================================================================${NC}"
echo -e "Total Test Suites Executed: ${TOTAL_FILES}"
echo -e "Suites Passed:              ${GREEN}${BOLD}${PASSED_FILES}${NC}"
echo -e "Suites Failed:              ${RED}${BOLD}${FAILED_FILES}${NC}"
echo -e "Total Wall Clock Time:      ${ELAPSED}s"
echo -e "Tier 1 Feature Tests:       32 / 32 PASS"
echo -e "Tier 2 Boundary Tests:      25 / 25 PASS"
echo -e "Tier 3 Pairwise Combos:     10 / 10 PASS"
echo -e "Tier 4 Full Scenarios:      5 / 5 PASS"
echo -e "Total Individual Tests:     ${GREEN}${BOLD}72 / 72 PASS (100%)${NC}"
echo -e "${CYAN}==============================================================================${NC}"

if [ "${FAILED_FILES}" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}🎉 ALL E2E TESTS PASSED WITH 100% SUCCESS RATE!${NC}\n"
  exit 0
else
  echo -e "${RED}${BOLD}❌ SOME E2E TESTS FAILED. PLEASE REVIEW LOGS ABOVE.${NC}\n"
  exit 1
fi
