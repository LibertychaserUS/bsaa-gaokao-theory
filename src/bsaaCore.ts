/**
 * BSAA (Bayesian Sequential Assignment with Absorption) core math.
 *
 * This module implements the abstract optimization problem from the theory
 * framework in closed form:
 *
 *   U(x; π) = Σ_k v_{x_k}(π) · p_{x_k} · Π_{j<k}(1 - p_{x_j})
 *   f_π(S)  = max_{σ ∈ Π(S)} U(σ; π)
 *
 * It provides the Value-Index ordering, the submodular set function, the
 * GSIO greedy algorithm, and a brute-force oracle for small instances.
 */

export interface BsaaCandidate {
  id: string;
  value: number;
  probability: number;
}

export interface BsaaSelectionResult {
  selectedIds: string[];
  orderedIds: string[];
  utility: number;
}

export interface BsaaGreedyTraceStep {
  step: number;
  selectedId: string;
  marginalGain: number;
}

export type BsaaGreedyResult = BsaaSelectionResult & {
  trace: BsaaGreedyTraceStep[];
};

const EPSILON = 1e-12;

function assertProbability(p: number): void {
  if (!(p >= 0 && p <= 1)) {
    throw new RangeError(`Admission probability must be in [0, 1], got ${p}.`);
  }
}

function assertNonNegativeValue(v: number): void {
  if (!(v >= 0)) {
    throw new RangeError(`Candidate value must be non-negative, got ${v}.`);
  }
}

function byValueDesc(left: BsaaCandidate, right: BsaaCandidate): number {
  if (right.value !== left.value) return right.value - left.value;
  return left.id.localeCompare(right.id);
}

/**
 * Compute the expected utility of an ordered volunteer list.
 *
 * Formula (§4.2):
 *   U(x; π) = Σ_{k=1}^{|x|} v_{x_k} · p_{x_k} · Π_{j=1}^{k-1}(1 - p_{x_j})
 */
export function expectedUtility(order: readonly BsaaCandidate[]): number {
  let total = 0;
  let survival = 1;
  for (const candidate of order) {
    assertProbability(candidate.probability);
    assertNonNegativeValue(candidate.value);
    total += candidate.value * candidate.probability * survival;
    survival *= 1 - candidate.probability;
    if (survival < EPSILON) survival = 0;
  }
  return total;
}

/**
 * Return the Value-Index optimal ordering for a fixed set S.
 *
 * Theorem 3.1 (Value-Index Optimality): sorting by v descending is optimal,
 * independent of p.
 */
export function valueIndexOrder(candidates: readonly BsaaCandidate[]): BsaaCandidate[] {
  return [...candidates].sort(byValueDesc);
}

/**
 * Evaluate the set function f_π(S) = max ordering utility over S.
 *
 * By Lemma 4.1 / Theorem 3.1 the maximum is attained by the v-descending
 * order, so this is just expectedUtility(valueIndexOrder(S)).
 */
export function evaluateSetFunction(candidates: readonly BsaaCandidate[]): number {
  if (candidates.length === 0) return 0;
  return expectedUtility(valueIndexOrder(candidates));
}

/**
 * Marginal gain of adding candidate e to set S.
 *
 * Δ(e | S) = f_π(S ∪ {e}) - f_π(S)
 */
export function marginalGain(set: readonly BsaaCandidate[], element: BsaaCandidate): number {
  const augmented = [...set, element];
  return evaluateSetFunction(augmented) - evaluateSetFunction(set);
}

function findInsertIndex(sorted: BsaaCandidate[], candidate: BsaaCandidate): number {
  let index = sorted.length;
  for (let i = 0; i < sorted.length; i += 1) {
    if (candidate.value > sorted[i].value) {
      index = i;
      break;
    }
    if (candidate.value === sorted[i].value && candidate.id.localeCompare(sorted[i].id) < 0) {
      index = i;
      break;
    }
  }
  return index;
}

/**
 * Incrementally evaluate f(S ∪ {e}) when S is already stored in v-descending
 * order. Complexity O(|S|) instead of O(|S| log |S|).
 */
export function incrementalSetUtility(
  sortedSet: readonly BsaaCandidate[],
  element: BsaaCandidate,
): number {
  assertProbability(element.probability);
  assertNonNegativeValue(element.value);
  const insertIndex = findInsertIndex([...sortedSet], element);
  const merged: BsaaCandidate[] = [];
  for (let i = 0; i < insertIndex; i += 1) {
    merged.push(sortedSet[i]);
  }
  merged.push(element);
  for (let i = insertIndex; i < sortedSet.length; i += 1) {
    merged.push(sortedSet[i]);
  }
  return expectedUtility(merged);
}

/**
 * GSIO greedy submodular selection (Algorithm 1).
 *
 *   S ← ∅
 *   for i = 1 .. n:
 *     c* ← argmax_{c ∉ S} [f(S ∪ {c}) - f(S)]
 *     S ← S ∪ {c*}
 *   return SortDescending(S, key = v_c(π))
 */
export function greedySubmodularSelection(
  candidates: readonly BsaaCandidate[],
  capacity: number,
): BsaaGreedyResult {
  if (capacity < 0) {
    throw new RangeError("capacity must be non-negative.");
  }
  if (capacity === 0) {
    return { selectedIds: [], orderedIds: [], utility: 0, trace: [] };
  }

  const selected: BsaaCandidate[] = [];
  const remaining = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const trace: BsaaGreedyTraceStep[] = [];
  const effectiveCapacity = Math.min(capacity, candidates.length);

  for (let step = 1; step <= effectiveCapacity; step += 1) {
    let bestCandidate: BsaaCandidate | null = null;
    let bestGain = -Number.POSITIVE_INFINITY;
    const currentUtility = evaluateSetFunction(selected);

    for (const candidate of remaining.values()) {
      const gain = incrementalSetUtility(selected, candidate) - currentUtility;
      if (gain > bestGain + EPSILON) {
        bestGain = gain;
        bestCandidate = candidate;
      }
    }

    if (bestCandidate === null) {
      break;
    }

    // Keep selected in value-descending order so incrementalSetUtility works.
    const insertIndex = findInsertIndex(selected, bestCandidate);
    selected.splice(insertIndex, 0, bestCandidate);
    remaining.delete(bestCandidate.id);
    trace.push({ step, selectedId: bestCandidate.id, marginalGain: bestGain });
  }

  const ordered = valueIndexOrder(selected);
  return {
    selectedIds: selected.map((candidate) => candidate.id),
    orderedIds: ordered.map((candidate) => candidate.id),
    utility: expectedUtility(ordered),
    trace,
  };
}

function* permutations<T>(items: readonly T[]): Generator<readonly T[]> {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let i = 0; i < items.length; i += 1) {
    const head = items[i];
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const perm of permutations(rest)) {
      yield [head, ...perm];
    }
  }
}

function* combinations<T>(items: readonly T[], k: number): Generator<readonly T[]> {
  if (k === 0) {
    yield [];
    return;
  }
  if (items.length < k) return;
  if (items.length === k) {
    yield items;
    return;
  }
  const [head, ...tail] = items;
  for (const combo of combinations(tail, k - 1)) {
    yield [head, ...combo];
  }
  for (const combo of combinations(tail, k)) {
    yield combo;
  }
}

/**
 * Brute-force solver for the BSAA problem (P_π).
 *
 * Enumerates all subsets of size n and all permutations. Only practical for
 * N ≤ 8 in automated tests; used as an oracle to verify Theorem 4.3.
 */
export function bruteForceOptimal(
  candidates: readonly BsaaCandidate[],
  capacity: number,
): BsaaSelectionResult {
  if (capacity < 0) {
    throw new RangeError("capacity must be non-negative.");
  }
  if (capacity === 0) {
    return { selectedIds: [], orderedIds: [], utility: 0 };
  }
  if (candidates.length < capacity) {
    const ordered = valueIndexOrder(candidates);
    return {
      selectedIds: candidates.map((c) => c.id),
      orderedIds: ordered.map((c) => c.id),
      utility: expectedUtility(ordered),
    };
  }

  let bestUtility = -Number.POSITIVE_INFINITY;
  let bestSet: BsaaCandidate[] = [];
  let bestOrder: BsaaCandidate[] = [];

  for (const subset of combinations(candidates, capacity)) {
    for (const order of permutations(subset)) {
      const utility = expectedUtility(order);
      if (utility > bestUtility + EPSILON) {
        bestUtility = utility;
        bestSet = [...subset];
        bestOrder = [...order];
      }
    }
  }

  return {
    selectedIds: bestSet.map((c) => c.id),
    orderedIds: bestOrder.map((c) => c.id),
    utility: bestUtility,
  };
}

/**
 * Admission safety: probability of being admitted by at least one candidate.
 *
 * Formula (§8.2):
 *   S(x) = 1 - Π_j(1 - p_{x_j})
 */
export function admissionSafety(order: readonly BsaaCandidate[]): number {
  let survival = 1;
  for (const candidate of order) {
    survival *= 1 - candidate.probability;
    if (survival < EPSILON) survival = 0;
  }
  return 1 - survival;
}

/**
 * Neutral quality: weighted expectation using quality scores q_c.
 *
 * Formula (§8.2):
 *   Q(x) = Σ q_{x_k} p_{x_k} Π_{j<k}(1 - p_{x_j})
 */
export function neutralQuality(
  order: readonly BsaaCandidate[],
  qualityOf: (candidate: BsaaCandidate) => number,
): number {
  let total = 0;
  let survival = 1;
  for (const candidate of order) {
    total += qualityOf(candidate) * candidate.probability * survival;
    survival *= 1 - candidate.probability;
    if (survival < EPSILON) survival = 0;
  }
  return total;
}

/**
 * Path gain relative to a baseline.
 *
 * Formula (§8.2):
 *   Gain_V = (V(x^{alg}) - V(x^{base})) / |V(x^{base})|
 */
export function pathGain(algorithmUtility: number, baselineUtility: number): number {
  if (Math.abs(baselineUtility) < EPSILON) {
    return algorithmUtility >= 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  }
  return (algorithmUtility - baselineUtility) / Math.abs(baselineUtility);
}

/**
 * Transparent 冲/稳/保 probability-tier baseline from Section 8.1.
 *
 * Partitions candidates by admission probability and returns at most
 * `capacity` candidates, preferring reach → steady → safety buckets.
 */
export function probabilityTierBaseline(
  candidates: readonly BsaaCandidate[],
  capacity: number,
): BsaaCandidate[] {
  if (capacity <= 0) return [];
  const reach = candidates.filter((c) => c.probability >= 0.1 && c.probability < 0.3);
  const steady = candidates.filter((c) => c.probability >= 0.4 && c.probability < 0.7);
  const safety = candidates.filter((c) => c.probability >= 0.8 && c.probability <= 1.0);
  // Preserve bucket priority (reach → steady → safety) while sorting inside each bucket.
  const ordered = [
    ...valueIndexOrder(reach),
    ...valueIndexOrder(steady),
    ...valueIndexOrder(safety),
  ];
  return ordered.slice(0, capacity);
}
