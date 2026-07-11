import assert from "node:assert/strict";
import test from "node:test";
import {
  admissionSafety,
  bruteForceOptimal,
  evaluateSetFunction,
  expectedUtility,
  greedySubmodularSelection,
  marginalGain,
  neutralQuality,
  pathGain,
  probabilityTierBaseline,
  valueIndexOrder,
  type BsaaCandidate,
} from "../src/domain/bsaaCore.js";

const EPSILON = 1e-9;

function candidate(id: string, value: number, probability: number): BsaaCandidate {
  return { id, value, probability };
}

test("expectedUtility matches closed-form manual calculation", () => {
  const a = candidate("a", 10, 0.2);
  const b = candidate("b", 5, 0.5);
  // [a, b]: 10*0.2 + 5*0.5*(1-0.2) = 2 + 2 = 4
  assert.ok(Math.abs(expectedUtility([a, b]) - 4) < EPSILON);
  // [b, a]: 5*0.5 + 10*0.2*(1-0.5) = 2.5 + 1 = 3.5
  assert.ok(Math.abs(expectedUtility([b, a]) - 3.5) < EPSILON);
});

test("valueIndexOrder sorts by value descending and breaks ties by id", () => {
  const pool = [candidate("b", 5, 0.5), candidate("a", 10, 0.2), candidate("c", 5, 0.1)];
  const order = valueIndexOrder(pool);
  assert.deepEqual(
    order.map((c) => c.id),
    ["a", "b", "c"],
  );
});

test("evaluateSetFunction returns expectedUtility of the optimal order", () => {
  const pool = [candidate("b", 5, 0.5), candidate("a", 10, 0.2)];
  assert.ok(Math.abs(evaluateSetFunction(pool) - 4) < EPSILON);
});

test("marginalGain is non-negative for monotone BSAA set function", () => {
  const base = [candidate("a", 5, 0.5)];
  const element = candidate("b", 4, 0.4);
  const gain = marginalGain(base, element);
  assert.ok(gain >= -EPSILON);
});

test("greedySubmodularSelection returns a feasible plan sorted by value index", () => {
  const pool = [
    candidate("a", 9, 0.2),
    candidate("b", 7, 0.5),
    candidate("c", 5, 0.9),
    candidate("d", 1, 0.1),
  ];
  const result = greedySubmodularSelection(pool, 2);
  assert.equal(result.selectedIds.length, 2);
  assert.equal(result.orderedIds.length, 2);
  assert.ok(result.utility >= -EPSILON);

  const byId = new Map(pool.map((c) => [c.id, c]));
  const orderedValues = result.orderedIds
    .map((id: string) => byId.get(id))
    .filter((c: BsaaCandidate | undefined): c is BsaaCandidate => c !== undefined)
    .map((c: BsaaCandidate) => c.value);
  assert.ok(orderedValues.length >= 2);
  assert.ok(orderedValues[0] >= orderedValues[1]);
});

test("greedySubmodularSelection matches brute-force optimum on small instances", () => {
  const pool = [candidate("a", 9, 0.2), candidate("b", 7, 0.5), candidate("c", 5, 0.9)];
  for (let capacity = 1; capacity <= 3; capacity += 1) {
    const greedy = greedySubmodularSelection(pool, capacity);
    const optimal = bruteForceOptimal(pool, capacity);
    assert.ok(
      greedy.utility >= optimal.utility - 1e-6,
      `capacity=${capacity} greedy=${greedy.utility} optimal=${optimal.utility}`,
    );
  }
});

test("bruteForceOptimal finds the true optimum", () => {
  const pool = [candidate("a", 10, 0.2), candidate("b", 5, 0.5)];
  const result = bruteForceOptimal(pool, 2);
  assert.deepEqual(result.orderedIds, ["a", "b"]);
  assert.ok(Math.abs(result.utility - 4) < EPSILON);
});

test("admissionSafety computes 1 - product of survival probabilities", () => {
  const pool = [candidate("a", 1, 0.2), candidate("b", 1, 0.3)];
  const safety = admissionSafety(pool);
  assert.ok(Math.abs(safety - (1 - 0.8 * 0.7)) < EPSILON);
});

test("neutralQuality weights by a quality accessor", () => {
  const a = candidate("a", 10, 0.2);
  const b = candidate("b", 5, 0.5);
  const quality = neutralQuality([a, b], (c) => (c.id === "a" ? 1 : 2));
  // 1*0.2 + 2*0.5*(1-0.2) = 0.2 + 0.8 = 1.0
  assert.ok(Math.abs(quality - 1.0) < EPSILON);
});

test("pathGain handles positive, negative and zero baselines", () => {
  assert.ok(Math.abs(pathGain(11, 10) - 0.1) < EPSILON);
  assert.equal(pathGain(5, 0), Number.POSITIVE_INFINITY);
  assert.equal(pathGain(-5, 0), Number.NEGATIVE_INFINITY);
});

test("probabilityTierBaseline selects up to capacity from tier buckets", () => {
  const reach = candidate("reach", 5, 0.2);
  const steady = candidate("steady", 6, 0.5);
  const safety = candidate("safety", 7, 0.9);
  const base = probabilityTierBaseline([safety, reach, steady], 2);
  assert.equal(base.length, 2);
  // Bucket priority is reach → steady → safety, with value-descending order inside each bucket.
  assert.deepEqual(
    base.map((c) => c.id),
    ["reach", "steady"],
  );
});
