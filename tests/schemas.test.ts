import assert from "node:assert/strict";
import test from "node:test";
import {
  bsaaCandidateSchema,
  evidenceSchema,
  optimizationRunSchema,
  validateBsaaCandidates,
  validateEvidence,
  validateExperiment,
  validateOptimizeRequest,
} from "../src/schemas.js";

test("bsaaCandidateSchema rejects probability outside [0,1]", () => {
  assert.throws(() => bsaaCandidateSchema.parse({ id: "a", value: 1, probability: 1.1 }));
  assert.throws(() => bsaaCandidateSchema.parse({ id: "a", value: 1, probability: -0.1 }));
});

test("bsaaCandidateSchema rejects negative value", () => {
  assert.throws(() => bsaaCandidateSchema.parse({ id: "a", value: -1, probability: 0.5 }));
});

test("validateBsaaCandidates parses valid input", () => {
  const candidates = validateBsaaCandidates([
    { id: "a", value: 10, probability: 0.5 },
    { id: "b", value: 20, probability: 0.3 },
  ]);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].id, "a");
});

test("validateOptimizeRequest parses valid request", () => {
  const request = validateOptimizeRequest({
    candidates: [{ id: "a", value: 10, probability: 0.5 }],
    capacity: 1,
  });
  assert.equal(request.capacity, 1);
  assert.equal(request.candidates.length, 1);
});

test("evidenceSchema accepts minimal evidence", () => {
  const evidence = validateEvidence({
    id: "thm-3.1",
    sourceType: "theorem",
    title: "Value-Index Optimality",
  });
  assert.equal(evidence.id, "thm-3.1");
});

test("evidenceSchema rejects invalid URL", () => {
  assert.throws(() =>
    evidenceSchema.parse({
      id: "bad",
      sourceType: "paper",
      title: "Bad paper",
      url: "not-a-url",
    }),
  );
});

test("experimentSchema accepts minimal experiment", () => {
  const experiment = validateExperiment({
    seed: 42,
    candidateCount: 8,
    passed: true,
    violationCount: 0,
    durationMs: 12,
  });
  assert.equal(experiment.seed, 42);
});

test("optimizationRunSchema requires inputHash, outputHash, solverVersion", () => {
  assert.throws(() =>
    optimizationRunSchema.parse({
      inputHash: "abc",
      outputHash: "def",
    }),
  );

  const run = optimizationRunSchema.parse({
    inputHash: "abc",
    outputHash: "def",
    solverVersion: "1.0.0",
  });
  assert.equal(run.solverVersion, "1.0.0");
});
