import assert from "node:assert/strict";
import test from "node:test";
import {
  bruteForceOptimal,
  buildParametricParetoFrontier,
  evaluateSequence,
  greedySubmodularOptimization,
  longTermProxy,
  neutralQuality,
  optimalOrderForSet,
  pathGain,
  runPaperVerificationSuite,
  safetyProbability,
  sampleSimplexWeights,
  setFunctionValue,
  transparentBaselineSelection,
  valueForPreference,
  verifyApproximationRatio,
  verifySubmodularity,
  verifyValueIndexTheorem,
  type PaperCandidate,
} from "../src/domain/paperTheory.js";

const singleObjectiveCandidates = (): PaperCandidate[] => [
  { id: "a", probability: 0.2, prototypeValues: [9] },
  { id: "b", probability: 0.8, prototypeValues: [6] },
  { id: "c", probability: 0.5, prototypeValues: [3] },
  { id: "d", probability: 0.95, prototypeValues: [1] },
];

const piUniform = (): [number] => [1];

test("valueForPreference computes weighted dot product", () => {
  const candidate: PaperCandidate = { id: "x", probability: 0.5, prototypeValues: [2, 5, 1] };
  assert.ok(Math.abs(valueForPreference(candidate, [0.2, 0.5, 0.3]) - 3.2) < 1e-12);
});

test("optimalOrderForSet sorts by value descending (Value-Index theorem)", () => {
  const order = optimalOrderForSet(["a", "b", "c", "d"], singleObjectiveCandidates(), piUniform());
  assert.deepEqual(order, ["a", "b", "c", "d"]);
});

test("evaluateSequence matches sequential absorption formula", () => {
  const candidates = singleObjectiveCandidates();
  const order = ["a", "b", "c"];
  const utility = evaluateSequence(order, candidates, piUniform());
  const expected = 9 * 0.2 + 6 * 0.8 * 0.8 + 3 * 0.5 * 0.8 * 0.2;
  assert.equal(Math.round(utility * 1e6) / 1e6, Math.round(expected * 1e6) / 1e6);
});

test("setFunctionValue returns the best ordering for a subset", () => {
  const candidates = singleObjectiveCandidates();
  const value = setFunctionValue(["b", "c", "d"], candidates, piUniform());
  const optimal = optimalOrderForSet(["b", "c", "d"], candidates, piUniform());
  assert.equal(value, evaluateSequence(optimal, candidates, piUniform()));
});

test("greedySubmodularOptimization respects capacity and sorts by value", () => {
  const candidates = singleObjectiveCandidates();
  const result = greedySubmodularOptimization(candidates, 2, piUniform());
  assert.equal(result.selectedIds.length, 2);
  assert.equal(result.order.length, 2);
  assert.deepEqual(result.order, optimalOrderForSet(result.selectedIds, candidates, piUniform()));
});

test("greedy selects all candidates when capacity exceeds candidate count", () => {
  const candidates = singleObjectiveCandidates();
  const result = greedySubmodularOptimization(candidates, 10, piUniform());
  assert.equal(result.selectedIds.length, candidates.length);
  assert.equal(result.order.length, candidates.length);
});

test("bruteForceOptimal returns no worse utility than greedy", () => {
  const candidates = singleObjectiveCandidates();
  const capacity = 2;
  const greedy = greedySubmodularOptimization(candidates, capacity, piUniform());
  const optimal = bruteForceOptimal(candidates, capacity, piUniform());
  assert.ok(greedy.utility <= optimal.utility + 1e-9);
});

test("verifyValueIndexTheorem passes for all permutations", () => {
  const result = verifyValueIndexTheorem(singleObjectiveCandidates(), piUniform());
  assert.ok(result.ok, result.message);
});

test("verifySubmodularity passes for small candidate set", () => {
  const candidates = singleObjectiveCandidates();
  const result = verifySubmodularity(candidates, piUniform());
  assert.ok(result.ok, result.message);
});

test("verifyApproximationRatio passes for small instance", () => {
  const result = verifyApproximationRatio(singleObjectiveCandidates(), 2, piUniform());
  assert.ok(result.ok, result.message);
});

test("runPaperVerificationSuite passes random theorem checks", () => {
  const log = runPaperVerificationSuite({ seed: 20260711, trials: 50 });
  assert.ok(log.valueIndex.ok, log.valueIndex.message);
  assert.ok(log.submodularity.ok, log.submodularity.message);
  assert.ok(log.approximationRatio.ok, log.approximationRatio.message);
});

test("safetyProbability computes at-least-one-admission probability", () => {
  const candidates = singleObjectiveCandidates();
  const safety = safetyProbability(["a", "b"], candidates);
  const expected = 1 - (1 - 0.2) * (1 - 0.8);
  assert.equal(Math.round(safety * 1e6) / 1e6, Math.round(expected * 1e6) / 1e6);
});

test("neutralQuality uses qualityScore when provided", () => {
  const candidates: PaperCandidate[] = [
    { id: "a", probability: 0.5, prototypeValues: [1], qualityScore: 10 },
    { id: "b", probability: 0.5, prototypeValues: [2], qualityScore: 4 },
  ];
  const quality = neutralQuality(["a", "b"], candidates, [1]);
  const expected = 10 * 0.5 + 4 * 0.5 * 0.5;
  assert.equal(Math.round(quality * 1e6) / 1e6, Math.round(expected * 1e6) / 1e6);
});

test("pathGain computes relative improvement", () => {
  assert.equal(pathGain(11, 10), 0.1);
  assert.equal(pathGain(9, 10), -0.1);
});

test("longTermProxy computes per-dimension weighted expectation", () => {
  const candidates: PaperCandidate[] = [
    { id: "a", probability: 0.5, prototypeValues: [1] },
    { id: "b", probability: 0.5, prototypeValues: [1] },
  ];
  const proxies = {
    a: [10, 2],
    b: [4, 8],
  };
  const result = longTermProxy(["a", "b"], candidates, proxies);
  assert.equal(
    Math.round(result[0] * 1e6) / 1e6,
    Math.round((10 * 0.5 + 4 * 0.5 * 0.5) * 1e6) / 1e6,
  );
  assert.equal(
    Math.round(result[1] * 1e6) / 1e6,
    Math.round((2 * 0.5 + 8 * 0.5 * 0.5) * 1e6) / 1e6,
  );
});

test("transparentBaselineSelection fills reach/steady/safety buckets", () => {
  const candidates: PaperCandidate[] = [
    { id: "r1", probability: 0.2, prototypeValues: [1], tierScore: 9 },
    { id: "r2", probability: 0.25, prototypeValues: [1], tierScore: 7 },
    { id: "s1", probability: 0.5, prototypeValues: [1], tierScore: 8 },
    { id: "sf1", probability: 0.9, prototypeValues: [1], tierScore: 6 },
    { id: "sf2", probability: 0.95, prototypeValues: [1], tierScore: 5 },
  ];
  const selected = transparentBaselineSelection(candidates, 6);
  assert.equal(selected.length, candidates.length);
  assert.ok(selected.includes("r1"));
  assert.ok(selected.includes("sf1"));
});

test("sampleSimplexWeights covers 2-simplex uniformly", () => {
  const weights = sampleSimplexWeights(2, 5);
  assert.equal(weights.length, 6);
  weights.forEach((w) => {
    assert.ok(Math.abs(w[0] + w[1] - 1) < 1e-9);
  });
});

test("buildParametricParetoFrontier returns non-dominated points", () => {
  const candidates: PaperCandidate[] = [
    { id: "a", probability: 0.5, prototypeValues: [9, 1] },
    { id: "b", probability: 0.5, prototypeValues: [5, 5] },
    { id: "c", probability: 0.5, prototypeValues: [1, 9] },
  ];
  const weights = sampleSimplexWeights(2, 8);
  const result = buildParametricParetoFrontier(candidates, 2, weights);

  assert.ok(result.frontier.length > 0);
  assert.ok(result.frontier.length <= result.regions.size);

  for (const point of result.frontier) {
    const dominated = result.frontier.some(
      (other) =>
        other !== point &&
        other.objectiveVector.every((v, i) => v >= point.objectiveVector[i]) &&
        other.objectiveVector.some((v, i) => v > point.objectiveVector[i]),
    );
    assert.ok(!dominated);
  }
});
