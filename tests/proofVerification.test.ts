import assert from "node:assert/strict";
import test from "node:test";
import { type BsaaCandidate } from "../src/bsaaCore.js";
import {
  buildChongWenBaoBaseline,
  compareWithBaseline,
  formatProofVerificationReport,
  randomBsaaInstance,
  runProofVerificationBattery,
  runProofVerificationTrials,
  sampleParetoWeights,
  verifyGreedyApproximation,
  verifySubmodularity,
  verifyValueIndexTheorem,
} from "../src/proofVerification.js";

const EPSILON = 1e-9;

function candidate(id: string, value: number, probability: number): BsaaCandidate {
  return { id, value, probability };
}

test("verifyValueIndexTheorem confirms descending value order is optimal", () => {
  const pool = [candidate("b", 5, 0.5), candidate("a", 10, 0.2), candidate("c", 3, 0.9)];
  const result = verifyValueIndexTheorem(pool);
  assert.ok(result.ok);
  assert.deepEqual(result.valueIndexOrder, ["a", "b", "c"]);
});

test("verifySubmodularity confirms diminishing marginal gains", () => {
  const pool = [
    candidate("a", 9, 0.2),
    candidate("b", 7, 0.5),
    candidate("c", 5, 0.9),
    candidate("d", 1, 0.1),
  ];
  const result = verifySubmodularity(pool);
  assert.ok(result.ok);
  assert.equal(result.violations.length, 0);
});

test("verifyGreedyApproximation satisfies the (1 - 1/e) bound", () => {
  const instance = randomBsaaInstance(8, 4, 20260713);
  const result = verifyGreedyApproximation(instance.candidates, instance.capacity);
  assert.ok(result.ok);
  assert.ok(result.greedyUtility >= result.optimalUtility * (1 - 1 / Math.E) - 1e-6);
});

test("runProofVerificationTrials passes on the default battery", () => {
  const report = runProofVerificationTrials({ seed: 20260711 });
  assert.equal(report.summary.failedTrials, 0);
  assert.ok(report.summary.passedTrials > 0);
  const formatted = formatProofVerificationReport(report);
  assert.ok(formatted.includes("BSAA Proof Verification Report"));
});

test("buildChongWenBaoBaseline delegates to probabilityTierBaseline", () => {
  const reach = candidate("reach", 5, 0.2);
  const steady = candidate("steady", 6, 0.5);
  const safety = candidate("safety", 7, 0.9);
  const baseline = buildChongWenBaoBaseline([safety, reach, steady], 2);
  assert.equal(baseline.length, 2);
  assert.deepEqual(
    baseline.map((c) => c.id),
    ["reach", "steady"],
  );
});

test("compareWithBaseline shows GSIO is at least as good as 冲稳保 baseline", () => {
  const instance = randomBsaaInstance(12, 6, 20260714);
  const comparison = compareWithBaseline(instance.candidates, instance.capacity);
  assert.ok(comparison.gsioUtility >= comparison.baselineUtility - EPSILON);
});

test("sampleParetoWeights produces valid 3-simplex samples", () => {
  const weights = sampleParetoWeights(3, 4);
  assert.ok(weights.length > 0);
  for (const w of weights) {
    assert.equal(w.length, 3);
    const sum = w.reduce((a: number, b: number) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-2, `weights do not sum to 1: ${sum}`);
    assert.ok(
      w.every((x: number) => x >= 0),
      "weights contain negative values",
    );
  }
});

test("runProofVerificationBattery includes baseline and Pareto checks", () => {
  const report = runProofVerificationBattery({ seed: 20260711 });
  assert.ok(report.batteryChecks.length > 0);
  assert.ok(report.paretoSampleCount > 0);
  assert.ok(report.batteryChecks.every((c) => c.ok));
});
