#!/usr/bin/env bash
# MATH gates (MATH1-MATH3) per docs/acceptance_gates_v1.md — 理论轨 · 数学侧验收.
# Exit code 0 = all gates PASS. Non-zero = at least one gate FAILED.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FORMAL_DIR="$REPO_ROOT/formal"
LAKE_BIN="${LAKE_BIN:-$HOME/.elan/bin/lake}"

overall_status=0

echo "=== MATH1: lake build (zero errors) ==="
if ( cd "$FORMAL_DIR" && "$LAKE_BIN" build ); then
  echo "MATH1: PASS"
else
  echo "MATH1: FAIL (lake build did not complete cleanly)"
  overall_status=1
fi
echo

echo "=== MATH2: zero sorry in formal/ source ==="
SORRY_MATCHES=$(grep -rn '\bsorry\b' "$FORMAL_DIR/Bsaa" "$FORMAL_DIR/Bsaa.lean" 2>/dev/null || true)
SORRY_COUNT=$(printf '%s\n' "$SORRY_MATCHES" | grep -c . || true)
if [ -z "$SORRY_MATCHES" ]; then
  SORRY_COUNT=0
fi
if [ "$SORRY_COUNT" -eq 0 ]; then
  echo "MATH2: PASS (sorry count = 0)"
else
  echo "MATH2: FAIL (sorry count = $SORRY_COUNT)"
  printf '%s\n' "$SORRY_MATCHES"
  overall_status=1
fi
echo

echo "=== MATH3: axiom audit (load-bearing theorems) ==="
# Main theorems currently registered as machine-verified (lean) per formal/PROGRESS.md
# and formal/LEMMAS.md numbering: A1, A2 (+A2_expected), A3, B2, B3 (+B3_optimization_transfer).
THEOREMS=(
  Bsaa.A1_first_success_dist
  Bsaa.A2_pointwise_ordering
  Bsaa.A2_expected
  Bsaa.A3_dp_exact
  Bsaa.B2_mixture_reduction
  Bsaa.B3_chance_eq_U
  Bsaa.B3_optimization_transfer
)
ALLOWED_AXIOM_RE="^(propext|Classical\.choice|Quot\.sound)$"

TMP_FILE="$FORMAL_DIR/.axiom_check_tmp.lean"
{
  echo "import Bsaa"
  for t in "${THEOREMS[@]}"; do
    echo "#print axioms $t"
  done
} > "$TMP_FILE"

AXIOM_OUTPUT=$(cd "$FORMAL_DIR" && "$LAKE_BIN" env lean .axiom_check_tmp.lean 2>&1)
AXIOM_EXIT=$?
rm -f "$TMP_FILE"

echo "$AXIOM_OUTPUT"

if [ "$AXIOM_EXIT" -ne 0 ]; then
  echo "MATH3: FAIL (lake env lean exited $AXIOM_EXIT while printing axioms)"
  overall_status=1
else
  AXIOM_LINES=$(printf '%s\n' "$AXIOM_OUTPUT" | grep "depends on axioms:" || true)
  FOUND_COUNT=$(printf '%s\n' "$AXIOM_LINES" | grep -c . || true)
  if [ -z "$AXIOM_LINES" ]; then
    FOUND_COUNT=0
  fi
  if [ "$FOUND_COUNT" -ne "${#THEOREMS[@]}" ]; then
    echo "MATH3: FAIL (expected ${#THEOREMS[@]} axiom-report lines, found $FOUND_COUNT)"
    overall_status=1
  else
    bad=0
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      axioms_list=$(printf '%s' "$line" | sed -n 's/.*depends on axioms: \[\(.*\)\]/\1/p')
      IFS=',' read -ra ax_arr <<< "$axioms_list"
      for ax in "${ax_arr[@]}"; do
        ax_trimmed=$(printf '%s' "$ax" | tr -d '[:space:]')
        [ -z "$ax_trimmed" ] && continue
        if ! printf '%s' "$ax_trimmed" | grep -Eq "$ALLOWED_AXIOM_RE"; then
          echo "MATH3: FAIL — disallowed axiom '$ax_trimmed' in: $line"
          bad=1
        fi
      done
    done <<< "$AXIOM_LINES"
    if [ "$bad" -eq 0 ]; then
      echo "MATH3: PASS (all ${#THEOREMS[@]} load-bearing theorems ⊆ {propext, Classical.choice, Quot.sound})"
    else
      overall_status=1
    fi
  fi
fi
echo

if [ "$overall_status" -eq 0 ]; then
  echo "MATH gates: ALL PASS"
else
  echo "MATH gates: FAILED"
fi
exit $overall_status
