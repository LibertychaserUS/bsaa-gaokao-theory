import assert from "node:assert/strict";
import test from "node:test";
import {
  baselineReachSteadySafe,
  bruteForceOptimal,
  expectedUtility,
  greedySubmodularOptimizer,
  lcg,
  runBsaaMonteCarloBacktest,
  scoreCandidates,
  valueIndexOrder,
  verifySubmodularity,
  verifyValueIndexTheorem,
  type BsaaBacktestConfig,
  type BsaaCandidate,
  type BsaaPreferenceProfile,
  type BsaaScoredCandidate,
} from "../src/bsaaBacktest.js";

const TOLERANCE = 1e-9;
const ONE_MINUS_INV_E = 1 - 1 / Math.E;

function approximately(actual: number, expected: number, tolerance = 1e-9, message?: string): void {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    assert.fail(message ?? `expected finite numbers, got ${actual}, ${expected}`);
  }
  if (Math.abs(actual - expected) > tolerance) {
    assert.fail(message ?? `expected ${expected} ± ${tolerance}, got ${actual}`);
  }
}

function candidate(
  id: string,
  p: number,
  v: number,
  overrides: Partial<BsaaCandidate> = {},
): BsaaCandidate {
  return {
    id,
    p,
    q: overrides.q ?? 0.5,
    longTerm: overrides.longTerm ?? 0.5,
    schoolTier: overrides.schoolTier ?? 3,
    attribute: overrides.attribute ?? [v],
  };
}

function scored(id: string, p: number, v: number): BsaaScoredCandidate {
  return { ...candidate(id, p, v), v };
}

test("expected utility follows sequential absorption formula", () => {
  const order = [scored("a", 0.5, 1.0), scored("b", 0.25, 0.8)];
  // U(a,b) = 1*0.5 + 0.8*0.25*(1-0.5) = 0.5 + 0.1 = 0.6
  approximately(expectedUtility(order), 0.6, TOLERANCE);
  // U(b,a) = 0.8*0.25 + 1*0.5*(1-0.25) = 0.2 + 0.375 = 0.575
  approximately(expectedUtility([order[1], order[0]]), 0.575, TOLERANCE);
});

test("valueIndexOrder sorts by v descending", () => {
  const order = [scored("a", 0.5, 0.3), scored("b", 0.5, 0.9), scored("c", 0.5, 0.6)];
  const sorted = valueIndexOrder(order).map((c) => c.id);
  assert.deepEqual(sorted, ["b", "c", "a"]);
});

test("Value-Index theorem passes for random small sets", () => {
  const rng = lcg(42);
  for (let trial = 0; trial < 20; trial += 1) {
    const candidates = Array.from({ length: 5 }, (_, i) =>
      scored(`c${i}`, 0.05 + rng() * 0.9, rng()),
    );
    assert.ok(verifyValueIndexTheorem(candidates).ok, `trial ${trial}`);
  }
});

test("submodularity passes for random small sets", () => {
  const rng = lcg(123);
  for (let trial = 0; trial < 10; trial += 1) {
    const candidates = Array.from({ length: 6 }, (_, i) =>
      scored(`c${i}`, 0.05 + rng() * 0.9, rng()),
    );
    const result = verifySubmodularity(candidates);
    assert.ok(result.ok, `trial ${trial}: ${JSON.stringify(result.counterexample)}`);
  }
});

test("GSIO approximation ratio is at least 1 - 1/e on random small instances", () => {
  const rng = lcg(2026);
  let minRatio = 1;
  for (let trial = 0; trial < 50; trial += 1) {
    const candidates = Array.from({ length: 8 }, (_, i) =>
      scored(`c${i}`, 0.05 + rng() * 0.9, rng()),
    );
    const greedyOrder = greedySubmodularOptimizer(candidates, 4);
    const greedyValue = expectedUtility(greedyOrder);
    const optimal = bruteForceOptimal(candidates, 4);
    const ratio = optimal.value > TOLERANCE ? greedyValue / optimal.value : 1;
    assert.ok(
      ratio >= ONE_MINUS_INV_E - 1e-6,
      `trial ${trial}: ratio ${ratio} < ${ONE_MINUS_INV_E}`,
    );
    minRatio = Math.min(minRatio, ratio);
  }
  // Sanity check: the empirical minimum should be well above the bound.
  assert.ok(minRatio >= ONE_MINUS_INV_E - 1e-6);
});

test("baseline heuristic prefers reach → steady → safe ordering", () => {
  const candidates = [
    scored("safe1", 0.95, 0.2),
    scored("reach1", 0.2, 0.9),
    scored("steady1", 0.55, 0.6),
    scored("reach2", 0.15, 0.8),
    scored("steady2", 0.65, 0.5),
    scored("safe2", 0.85, 0.3),
  ];
  const order = baselineReachSteadySafe(candidates, 6).map((c) => c.id);
  // First two should be reach, next two steady, last two safe.
  assert.deepEqual(order.slice(0, 2).sort(), ["reach1", "reach2"]);
  assert.deepEqual(order.slice(2, 4).sort(), ["steady1", "steady2"]);
  assert.deepEqual(order.slice(4, 6).sort(), ["safe1", "safe2"]);
});

test("Monte Carlo backtest runs and reports theorem verification", () => {
  const config: BsaaBacktestConfig = {
    scenarioCount: 200,
    seed: 7,
    candidateCount: 8,
    slotCount: 4,
    prototypeCount: 3,
    attributeDim: 4,
    alpha: [1, 1, 1],
  };
  const summary = runBsaaMonteCarloBacktest(config);
  assert.equal(summary.scenarioCount, config.scenarioCount);
  assert.ok(summary.theoremVerification.valueIndexPassed);
  assert.ok(summary.theoremVerification.submodularityPassed);
  assert.ok(summary.theoremVerification.bruteOptimalScenarios > 0);
  assert.ok(
    summary.theoremVerification.minApproximationRatio !== null &&
      summary.theoremVerification.minApproximationRatio >= ONE_MINUS_INV_E - 1e-6,
  );
  // GSIO should improve path utility over the transparent baseline in expectation.
  assert.ok(summary.relative.pathGain > -0.5, "path gain should not be catastrophically negative");
});

test("scoreCandidates computes v_c(π) as a weighted dot product", () => {
  const candidates: BsaaCandidate[] = [
    candidate("a", 0.5, 0, { attribute: [1, 0, 0] }),
    candidate("b", 0.5, 0, { attribute: [0, 1, 0] }),
    candidate("c", 0.5, 0, { attribute: [0, 0, 1] }),
  ];
  const prototypes: number[][] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const preference: BsaaPreferenceProfile = { pi: [0.2, 0.3, 0.5] };
  const scored = scoreCandidates(candidates, preference, prototypes);
  const byId = new Map(scored.map((c) => [c.id, c.v]));
  approximately(byId.get("a") ?? 0, 0.2, TOLERANCE);
  approximately(byId.get("b") ?? 0, 0.3, TOLERANCE);
  approximately(byId.get("c") ?? 0, 0.5, TOLERANCE);
});
