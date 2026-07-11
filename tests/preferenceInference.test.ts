import assert from "node:assert/strict";
import test from "node:test";
import {
  inferPreferenceDirichletCategorical,
  inferPreferenceSoftmax,
  preferenceEntropy,
  uniformAlpha,
} from "../src/domain/preferenceInference.js";

test("uniformAlpha creates flat prior", () => {
  assert.deepEqual(uniformAlpha(3), [1, 1, 1]);
});

test("preferenceEntropy is maximal for uniform distribution", () => {
  const uniform = [1 / 3, 1 / 3, 1 / 3];
  const deterministic = [1, 0, 0];
  assert.ok(preferenceEntropy(uniform) > preferenceEntropy(deterministic));
  assert.ok(Math.abs(preferenceEntropy(deterministic)) < 1e-9);
});

test("inferPreferenceDirichletCategorical yields normalized posterior", () => {
  const model = {
    alpha: [1, 1, 1],
    phi: [
      [
        [0.9, 0.05, 0.05], // answer 0 strongly indicates prototype 0
        [0.05, 0.9, 0.05], // answer 1 strongly indicates prototype 1
      ],
    ],
  };
  const result = inferPreferenceDirichletCategorical({ answers: [0] }, model);
  const sum = result.pi.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(result.pi[0] > result.pi[1]);
  assert.ok(result.pi[0] > result.pi[2]);
});

test("inferPreferenceDirichletCategorical combines multiple questions", () => {
  const model = {
    alpha: [1, 1],
    phi: [
      [
        [0.9, 0.1],
        [0.1, 0.9],
      ],
      [
        [0.8, 0.2],
        [0.2, 0.8],
      ],
    ],
  };
  const result0 = inferPreferenceDirichletCategorical({ answers: [0, 0] }, model);
  const result1 = inferPreferenceDirichletCategorical({ answers: [1, 1] }, model);
  assert.ok(result0.pi[0] > result0.pi[1]);
  assert.ok(result1.pi[1] > result1.pi[0]);
});

test("inferPreferenceDirichletCategorical validates answer bounds", () => {
  const model = {
    alpha: [1, 1],
    phi: [[[0.5, 0.5]]],
  };
  assert.throws(() => inferPreferenceDirichletCategorical({ answers: [5] }, model));
});

test("inferPreferenceSoftmax produces normalized preference", () => {
  const result = inferPreferenceSoftmax({ beta: 1, prototypeScores: [3, 1, 1] });
  const sum = result.pi.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(result.pi[0] > result.pi[1]);
});

test("inferPreferenceSoftmax rejects non-positive beta", () => {
  assert.throws(() => inferPreferenceSoftmax({ beta: 0, prototypeScores: [1, 2] }));
});
