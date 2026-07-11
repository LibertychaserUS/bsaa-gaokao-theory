import assert from "node:assert/strict";
import test from "node:test";
import {
  computeTier,
  computeTierFromRank,
  defaultTierThresholds,
  filterReachableCandidates,
  normalizeRank,
  requireReachableCandidates,
  verifyTierCompleteness,
  type TieredCandidate,
} from "../src/domain/tier.js";

test("default tier thresholds match theory framework", () => {
  const thresholds = defaultTierThresholds();
  assert.deepEqual(thresholds.quantiles, [0, 0.05, 0.2, 0.5, 0.8, 1.0]);
});

test("computeTier maps normalized rank to correct tier", () => {
  assert.equal(computeTier(0.0), 1);
  assert.equal(computeTier(0.04), 1);
  assert.equal(computeTier(0.05), 2);
  assert.equal(computeTier(0.19), 2);
  assert.equal(computeTier(0.2), 3);
  assert.equal(computeTier(0.49), 3);
  assert.equal(computeTier(0.5), 4);
  assert.equal(computeTier(0.79), 4);
  assert.equal(computeTier(0.8), 5);
  assert.equal(computeTier(1.0), 5);
});

test("computeTier rejects out-of-range ranks", () => {
  assert.throws(() => computeTier(-0.1));
  assert.throws(() => computeTier(1.1));
});

test("normalizeRank converts absolute rank", () => {
  assert.equal(normalizeRank(1, 100), 0);
  assert.equal(normalizeRank(100, 100), 0.99);
});

test("computeTierFromRank combines normalization and tier mapping", () => {
  // Top 1% -> tier 1
  assert.equal(computeTierFromRank(500, 100_000), 1);
  // 30th percentile -> tier 3
  assert.equal(computeTierFromRank(30_000, 100_000), 3);
  // Last rank -> tier 5
  assert.equal(computeTierFromRank(100_000, 100_000), 5);
});

test("filterReachableCandidates keeps only candidates reachable for the tier", () => {
  const candidates: TieredCandidate[] = [
    { id: "a", reachableTiers: [1, 2] },
    { id: "b", reachableTiers: [2, 3] },
    { id: "c", reachableTiers: [3] },
  ];
  const result = filterReachableCandidates(candidates, 2);
  assert.deepEqual(
    result.map((c) => c.id),
    ["a", "b"],
  );
});

test("requireReachableCandidates throws when tier has no candidates", () => {
  const candidates: TieredCandidate[] = [{ id: "a", reachableTiers: [1] }];
  assert.throws(() => requireReachableCandidates(candidates, 2));
});

test("verifyTierCompleteness detects uncovered tiers", () => {
  const candidates: TieredCandidate[] = [
    { id: "a", reachableTiers: [1, 2] },
    { id: "b", reachableTiers: [2] },
  ];
  const result = verifyTierCompleteness(candidates);
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingTiers, [3, 4, 5]);
});

test("verifyTierCompleteness passes when all tiers covered", () => {
  const candidates: TieredCandidate[] = [
    { id: "a", reachableTiers: [1] },
    { id: "b", reachableTiers: [2] },
    { id: "c", reachableTiers: [3] },
    { id: "d", reachableTiers: [4] },
    { id: "e", reachableTiers: [5] },
  ];
  const result = verifyTierCompleteness(candidates);
  assert.equal(result.ok, true);
  assert.deepEqual(result.missingTiers, []);
});
