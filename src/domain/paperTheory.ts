/**
 * 论文核心理论实现（对应 theory_framework.md）
 *
 * 本模块以自包含方式实现：
 * - 序贯吸收期望效用 U(x;π)
 * - Value-Index 最优排序定理（Theorem 3.1）
 * - 子模集合函数 f_π(S) 与边际增益（Theorem 4.2）
 * - GSIO 贪心算法与 (1-1/e) 近似保证（Theorem 4.3 / Algorithm 1）
 * - 参数化帕累托前沿与分段常数性（Theorem 5.3 / 5.5）
 * - 实验指标：Safety、Neutral Quality、Path Gain、Long-term Proxy
 * - 透明冲稳保基准（Section 8.1）
 */

import { defaultProbabilityBuckets, type ProbabilityBuckets } from "./scoring.js";

export interface PaperCandidate {
  id: string;
  /** 历史估计录取概率 p_c ∈ [0,1] */
  probability: number;
  /**
   * 原型价值向量。value[k] 表示候选在第 k 个原型下的路径匹配度。
   * 对单目标优化可设长度为 1。
   */
  prototypeValues: readonly number[];
  /** 可选：用于中性质量指标 q_c */
  qualityScore?: number;
  /** 可选：用于透明冲稳保基准的院校层次分 */
  tierScore?: number;
}

export type PreferenceVector = readonly number[];

export interface GreedyResult {
  selectedIds: string[];
  order: string[];
  utility: number;
  trace: string[];
}

export interface BruteForceResult {
  selectedIds: string[];
  order: string[];
  utility: number;
}

export interface VerificationResult<T = unknown> {
  ok: boolean;
  message: string;
  counterExample?: T;
}

export interface PaperProofLog {
  valueIndex: VerificationResult;
  submodularity: VerificationResult;
  approximationRatio: VerificationResult<{
    ratio: number;
    greedyUtility: number;
    optimalUtility: number;
  }>;
}

export interface ParetoPoint {
  selectedIds: string[];
  order: string[];
  objectiveVector: number[];
  representativeWeight: PreferenceVector;
}

export interface ParametricParetoResult {
  frontier: ParetoPoint[];
  regions: Map<string, PreferenceVector[]>;
  sampledWeights: number;
}

const EPSILON = 1e-9;

function assertValidCandidates(candidates: readonly PaperCandidate[]): void {
  if (candidates.length === 0) {
    throw new RangeError("Candidate set must not be empty.");
  }
  const prototypeCount = candidates[0].prototypeValues.length;
  if (prototypeCount === 0) {
    throw new RangeError("Each candidate must have at least one prototype value.");
  }
  for (const candidate of candidates) {
    if (typeof candidate.id !== "string" || candidate.id.length === 0) {
      throw new RangeError("Candidate id must be a non-empty string.");
    }
    if (
      !Number.isFinite(candidate.probability) ||
      candidate.probability < 0 ||
      candidate.probability > 1
    ) {
      throw new RangeError(`Candidate ${candidate.id} probability must be in [0,1].`);
    }
    if (candidate.prototypeValues.length !== prototypeCount) {
      throw new RangeError(`Candidate ${candidate.id} prototypeValues length inconsistent.`);
    }
    if (candidate.prototypeValues.some((value) => !Number.isFinite(value) || value < 0)) {
      throw new RangeError(
        `Candidate ${candidate.id} prototypeValues must be finite and non-negative.`,
      );
    }
  }
}

function assertValidPreference(pi: PreferenceVector, prototypeCount: number): void {
  if (pi.length !== prototypeCount) {
    throw new RangeError(
      `Preference vector length ${pi.length} does not match prototype count ${prototypeCount}.`,
    );
  }
  if (pi.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new RangeError("Preference weights must be finite and non-negative.");
  }
  const sum = pi.reduce((acc, weight) => acc + weight, 0);
  if (Math.abs(sum - 1) > 1e-6 && sum > 0) {
    throw new RangeError("Preference weights must sum to 1 (or be all zero for a specific probe).");
  }
}

const candidateMapCache = new WeakMap<readonly PaperCandidate[], Map<string, PaperCandidate>>();

function candidateById(candidates: readonly PaperCandidate[], id: string): PaperCandidate {
  let map = candidateMapCache.get(candidates);
  if (!map) {
    map = new Map(candidates.map((c) => [c.id, c]));
    candidateMapCache.set(candidates, map);
  }
  const candidate = map.get(id);
  if (!candidate) {
    throw new RangeError(`Candidate ${id} not found.`);
  }
  return candidate;
}

/** v_c(π) = Σ_k π_k · value_{c,k} */
export function valueForPreference(candidate: PaperCandidate, pi: PreferenceVector): number {
  assertValidPreference(pi, candidate.prototypeValues.length);
  return candidate.prototypeValues.reduce((sum, value, index) => sum + value * (pi[index] ?? 0), 0);
}

/** U(x;π) = Σ_k v_{x_k}(π) p_{x_k} Π_{j<k}(1-p_{x_j}) */
export function evaluateSequence(
  orderIds: readonly string[],
  candidates: readonly PaperCandidate[],
  pi: PreferenceVector,
): number {
  assertValidCandidates(candidates);
  if (candidates.length > 0) {
    assertValidPreference(pi, candidates[0].prototypeValues.length);
  }
  let total = 0;
  let survival = 1;
  for (const id of orderIds) {
    const candidate = candidateById(candidates, id);
    const value = valueForPreference(candidate, pi);
    total += value * candidate.probability * survival;
    survival *= 1 - candidate.probability;
  }
  return total;
}

/** Value-Index 定理：对固定集合 S，按 v_c(π) 降序排列。 */
export function optimalOrderForSet(
  setIds: readonly string[],
  candidates: readonly PaperCandidate[],
  pi: PreferenceVector,
): string[] {
  return [...setIds].sort((leftId, rightId) => {
    const left = candidateById(candidates, leftId);
    const right = candidateById(candidates, rightId);
    const leftValue = valueForPreference(left, pi);
    const rightValue = valueForPreference(right, pi);
    if (Math.abs(leftValue - rightValue) <= EPSILON) {
      return leftId.localeCompare(rightId);
    }
    return rightValue - leftValue;
  });
}

/** f_π(S)：S 经最优排序后的最大期望效用。 */
export function setFunctionValue(
  setIds: readonly string[],
  candidates: readonly PaperCandidate[],
  pi: PreferenceVector,
): number {
  if (setIds.length === 0) return 0;
  const order = optimalOrderForSet(setIds, candidates, pi);
  return evaluateSequence(order, candidates, pi);
}

/** 边际增益 Δ(e | S) = f_π(S∪{e}) - f_π(S) */
export function marginalGain(
  setIds: readonly string[],
  candidateId: string,
  candidates: readonly PaperCandidate[],
  pi: PreferenceVector,
): number {
  if (setIds.includes(candidateId)) return 0;
  return (
    setFunctionValue([...setIds, candidateId], candidates, pi) -
    setFunctionValue(setIds, candidates, pi)
  );
}

/** GSIO 贪心算法（Algorithm 1）。时间复杂度 O(n²·N)。 */
export function greedySubmodularOptimization(
  candidates: readonly PaperCandidate[],
  capacity: number,
  pi: PreferenceVector,
): GreedyResult {
  assertValidCandidates(candidates);
  assertValidPreference(pi, candidates[0].prototypeValues.length);
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError("Capacity must be a positive integer.");
  }

  const trace: string[] = [];
  const N = candidates.length;
  if (capacity >= N) {
    const selectedIds = candidates.map((c) => c.id);
    const order = optimalOrderForSet(selectedIds, candidates, pi);
    const utility = evaluateSequence(order, candidates, pi);
    trace.push(`capacity_${capacity}>=candidate_count_${N}:selected_all`);
    return { selectedIds, order, utility, trace };
  }

  const selected: string[] = [];
  for (let step = 0; step < capacity; step += 1) {
    let bestId: string | null = null;
    let bestGain = -Infinity;
    for (const candidate of candidates) {
      if (selected.includes(candidate.id)) continue;
      const gain = marginalGain(selected, candidate.id, candidates, pi);
      if (
        gain > bestGain + EPSILON ||
        (Math.abs(gain - bestGain) <= EPSILON && candidate.id.localeCompare(bestId ?? "") < 0)
      ) {
        bestGain = gain;
        bestId = candidate.id;
      }
    }
    if (bestId === null) {
      throw new RangeError("Ran out of candidates before reaching capacity.");
    }
    selected.push(bestId);
    trace.push(`step_${step + 1}:selected_${bestId}:gain_${bestGain.toFixed(6)}`);
  }

  const order = optimalOrderForSet(selected, candidates, pi);
  const utility = evaluateSequence(order, candidates, pi);
  return { selectedIds: selected, order, utility, trace };
}

/** 暴力枚举精确求解，仅用于小规模验证。 */
export function bruteForceOptimal(
  candidates: readonly PaperCandidate[],
  capacity: number,
  pi: PreferenceVector,
): BruteForceResult {
  assertValidCandidates(candidates);
  assertValidPreference(pi, candidates[0].prototypeValues.length);
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError("Capacity must be a positive integer.");
  }

  const N = candidates.length;
  const effectiveCapacity = Math.min(capacity, N);
  const ids = candidates.map((c) => c.id);

  let bestUtility = -Infinity;
  let bestSet: string[] = [];
  let bestOrder: string[] = [];

  function* combinations(start: number, depth: number, current: string[]): Generator<string[]> {
    if (depth === 0) {
      yield [...current];
      return;
    }
    for (let i = start; i <= ids.length - depth; i += 1) {
      current.push(ids[i]);
      yield* combinations(i + 1, depth - 1, current);
      current.pop();
    }
  }

  function* permutations(arr: string[]): Generator<string[]> {
    if (arr.length <= 1) {
      yield [...arr];
      return;
    }
    for (let i = 0; i < arr.length; i += 1) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      for (const perm of permutations(rest)) {
        yield [arr[i], ...perm];
      }
    }
  }

  for (const subset of combinations(0, effectiveCapacity, [])) {
    for (const order of permutations(subset)) {
      const utility = evaluateSequence(order, candidates, pi);
      if (
        utility > bestUtility + EPSILON ||
        (Math.abs(utility - bestUtility) <= EPSILON &&
          order.join(",").localeCompare(bestOrder.join(",")) < 0)
      ) {
        bestUtility = utility;
        bestSet = subset;
        bestOrder = order;
      }
    }
  }

  return { selectedIds: bestSet, order: bestOrder, utility: bestUtility };
}

/** 验证 Value-Index 定理 3.1（N ≤ 8）。 */
export function verifyValueIndexTheorem(
  candidates: readonly PaperCandidate[],
  pi: PreferenceVector,
  tolerance = 1e-9,
): VerificationResult<{
  bestOrder: string[];
  violatingOrder: string[];
  bestUtility: number;
  violatingUtility: number;
}> {
  assertValidCandidates(candidates);
  assertValidPreference(pi, candidates[0].prototypeValues.length);
  if (candidates.length > 8) {
    return {
      ok: false,
      message: "Too many candidates for exhaustive permutation verification (max 8).",
    };
  }

  const allIds = candidates.map((c) => c.id);
  const sortedOrder = optimalOrderForSet(allIds, candidates, pi);
  const sortedUtility = evaluateSequence(sortedOrder, candidates, pi);

  function* permutations(arr: string[]): Generator<string[]> {
    if (arr.length <= 1) {
      yield [...arr];
      return;
    }
    for (let i = 0; i < arr.length; i += 1) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      for (const perm of permutations(rest)) {
        yield [arr[i], ...perm];
      }
    }
  }

  for (const order of permutations(allIds)) {
    const utility = evaluateSequence(order, candidates, pi);
    if (utility > sortedUtility + tolerance) {
      return {
        ok: false,
        message: `Found permutation with higher utility than v-descending order.`,
        counterExample: {
          bestOrder: sortedOrder,
          violatingOrder: order,
          bestUtility: sortedUtility,
          violatingUtility: utility,
        },
      };
    }
  }

  return { ok: true, message: `Value-Index theorem holds for ${candidates.length} candidates.` };
}

/** 验证子模性定理 4.2（N ≤ 6）。 */
export function verifySubmodularity(
  candidates: readonly PaperCandidate[],
  pi: PreferenceVector,
  tolerance = 1e-9,
): VerificationResult<{ A: string[]; B: string[]; e: string; gainA: number; gainB: number }> {
  assertValidCandidates(candidates);
  assertValidPreference(pi, candidates[0].prototypeValues.length);
  if (candidates.length > 8) {
    return {
      ok: false,
      message: "Too many candidates for exhaustive submodularity verification (max 8).",
    };
  }

  const ids = candidates.map((c) => c.id);

  function* subsets(
    of: string[],
    start: number,
    depth: number,
    current: string[],
  ): Generator<string[]> {
    if (depth === 0) {
      yield [...current];
      return;
    }
    for (let i = start; i <= of.length - depth; i += 1) {
      current.push(of[i]);
      yield* subsets(of, i + 1, depth - 1, current);
      current.pop();
    }
  }

  const allSubsets: string[][] = [];
  for (let size = 0; size <= ids.length; size += 1) {
    for (const subset of subsets(ids, 0, size, [])) {
      allSubsets.push(subset);
    }
  }

  for (const B of allSubsets) {
    for (const A of allSubsets) {
      if (!A.every((id) => B.includes(id))) continue;
      for (const e of ids) {
        if (B.includes(e)) continue;
        const gainA = marginalGain(A, e, candidates, pi);
        const gainB = marginalGain(B, e, candidates, pi);
        if (gainA < gainB - tolerance) {
          return {
            ok: false,
            message: `Submodularity violated: gain(A,e) < gain(B,e).`,
            counterExample: { A, B, e, gainA, gainB },
          };
        }
      }
    }
  }

  return { ok: true, message: `Submodularity holds for ${candidates.length} candidates.` };
}

/** 验证 GSIO 的 (1-1/e) 近似比对给定实例成立。 */
export function verifyApproximationRatio(
  candidates: readonly PaperCandidate[],
  capacity: number,
  pi: PreferenceVector,
  tolerance = 1e-9,
): VerificationResult<{ ratio: number; greedyUtility: number; optimalUtility: number }> {
  assertValidCandidates(candidates);
  assertValidPreference(pi, candidates[0].prototypeValues.length);
  const greedy = greedySubmodularOptimization(candidates, capacity, pi);
  const optimal = bruteForceOptimal(candidates, capacity, pi);
  const ratio = greedy.utility / Math.max(optimal.utility, EPSILON);
  const bound = 1 - 1 / Math.E;

  if (ratio + tolerance < bound) {
    return {
      ok: false,
      message: `Greedy utility ${greedy.utility.toFixed(6)} below (1-1/e)·optimal = ${(bound * optimal.utility).toFixed(6)}.`,
      counterExample: { ratio, greedyUtility: greedy.utility, optimalUtility: optimal.utility },
    };
  }

  return {
    ok: true,
    message: `Approximation ratio ${ratio.toFixed(6)} >= ${bound.toFixed(6)}.`,
    counterExample: { ratio, greedyUtility: greedy.utility, optimalUtility: optimal.utility },
  };
}

/** 随机实例证明日志。 */
export function runPaperVerificationSuite(
  options: { seed?: number; trials?: number } = {},
): PaperProofLog {
  const seed = options.seed ?? 20260711;
  const trials = options.trials ?? 100;

  function lcg(): () => number {
    let state = seed >>> 0;
    return () => {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  const random = lcg();

  function randomCandidates(N: number): PaperCandidate[] {
    return Array.from({ length: N }, (_, index) => ({
      id: `c${index}`,
      probability: random() * 0.9 + 0.05,
      prototypeValues: [random() * 10],
    }));
  }

  let valueIndexOk = true;
  let submodularityOk = true;
  let approximationOk = true;
  let failureMessage = "";

  for (let trial = 0; trial < trials; trial += 1) {
    const N = Math.floor(random() * 6) + 3;
    const n = Math.floor(random() * Math.min(N, 4)) + 1;
    const candidates = randomCandidates(N);
    const pi: PreferenceVector = [1];

    const valueIndex = verifyValueIndexTheorem(candidates, pi);
    if (!valueIndex.ok) {
      valueIndexOk = false;
      failureMessage = valueIndex.message;
      break;
    }

    if (N <= 6) {
      const submod = verifySubmodularity(candidates, pi);
      if (!submod.ok) {
        submodularityOk = false;
        failureMessage = submod.message;
        break;
      }
    }

    const approx = verifyApproximationRatio(candidates, n, pi);
    if (!approx.ok) {
      approximationOk = false;
      failureMessage = approx.message;
      break;
    }
  }

  return {
    valueIndex: {
      ok: valueIndexOk,
      message: valueIndexOk
        ? `Value-Index theorem passed ${trials} random trials.`
        : `Value-Index theorem failed: ${failureMessage}`,
    },
    submodularity: {
      ok: submodularityOk,
      message: submodularityOk
        ? `Submodularity passed all random trials (N≤6 exhaustive).`
        : `Submodularity failed: ${failureMessage}`,
    },
    approximationRatio: {
      ok: approximationOk,
      message: approximationOk
        ? `Greedy (1-1/e) approximation passed ${trials} random trials.`
        : `Greedy approximation failed: ${failureMessage}`,
    },
  };
}

/** Safety 指标：至少被一个志愿录取的概率。 */
export function safetyProbability(
  orderIds: readonly string[],
  candidates: readonly PaperCandidate[],
): number {
  const survival = orderIds.reduce((prod, id) => {
    const candidate = candidateById(candidates, id);
    return prod * (1 - candidate.probability);
  }, 1);
  return 1 - survival;
}

/** Neutral Quality 指标 Q(x)。若未提供 qualityScore，退化为 v_c(π)。 */
export function neutralQuality(
  orderIds: readonly string[],
  candidates: readonly PaperCandidate[],
  pi: PreferenceVector,
): number {
  let total = 0;
  let survival = 1;
  for (const id of orderIds) {
    const candidate = candidateById(candidates, id);
    const q = candidate.qualityScore ?? valueForPreference(candidate, pi);
    total += q * candidate.probability * survival;
    survival *= 1 - candidate.probability;
  }
  return total;
}

/** Path Gain = (V(x^alg) - V(x^base)) / |V(x^base)|。 */
export function pathGain(algorithmUtility: number, baselineUtility: number): number {
  if (Math.abs(baselineUtility) < EPSILON) {
    return algorithmUtility >= 0 ? Infinity : -Infinity;
  }
  return (algorithmUtility - baselineUtility) / Math.abs(baselineUtility);
}

/** 长期代理指标 H(x;k)。 */
export function longTermProxy(
  orderIds: readonly string[],
  candidates: readonly PaperCandidate[],
  proxyValues: Readonly<Record<string, readonly number[] | undefined>>,
): number[] {
  if (orderIds.length === 0) return [];
  const firstProxies = proxyValues[orderIds[0]];
  const dimensionCount = firstProxies?.length ?? 0;
  if (dimensionCount === 0) return [];

  const totals = Array.from({ length: dimensionCount }, () => 0);
  let survival = 1;
  for (const id of orderIds) {
    const candidate = candidateById(candidates, id);
    const proxies = proxyValues[id];
    if (proxies?.length !== dimensionCount) {
      throw new RangeError(`Proxy values missing or inconsistent for candidate ${id}.`);
    }
    for (let k = 0; k < dimensionCount; k += 1) {
      totals[k] += proxies[k] * candidate.probability * survival;
    }
    survival *= 1 - candidate.probability;
  }
  return totals;
}

/** 透明冲稳保启发式基准（Section 8.1）。
 *
 * 概率桶使用闭区间：reach [0.1, 0.3], steady [0.4, 0.7], safety [0.8, 1.0]。
 * 桶内按 tierScore 降序、probability 降序、id 字典序选择，最终保持
 * reach → steady → safety 的优先级。
 */
export function transparentBaselineSelection(
  candidates: readonly PaperCandidate[],
  capacity: number,
  buckets: ProbabilityBuckets = defaultProbabilityBuckets(),
): string[] {
  assertValidCandidates(candidates);
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError("Capacity must be a positive integer.");
  }

  const sortedByTier = [...candidates].sort(
    (a, b) =>
      (b.tierScore ?? 0) - (a.tierScore ?? 0) ||
      b.probability - a.probability ||
      a.id.localeCompare(b.id),
  );
  const reach = sortedByTier.filter(
    (c) => c.probability >= buckets.reach[0] && c.probability <= buckets.reach[1],
  );
  const steady = sortedByTier.filter(
    (c) => c.probability >= buckets.steady[0] && c.probability <= buckets.steady[1],
  );
  const safe = sortedByTier.filter(
    (c) => c.probability >= buckets.safety[0] && c.probability <= buckets.safety[1],
  );

  const selected = new Set<string>();
  const ordered: string[] = [];

  function pickFrom(bucket: PaperCandidate[], count: number): void {
    for (const candidate of bucket) {
      if (count <= 0) break;
      if (!selected.has(candidate.id)) {
        selected.add(candidate.id);
        ordered.push(candidate.id);
        count -= 1;
      }
    }
  }

  const bucketSize = Math.max(1, Math.floor(capacity / 3));
  pickFrom(reach, bucketSize);
  pickFrom(steady, bucketSize);
  pickFrom(safe, bucketSize);

  const remaining = sortedByTier.filter((c) => !selected.has(c.id));
  pickFrom(remaining, capacity - ordered.length);

  return ordered.slice(0, capacity);
}

/** 单纯形网格采样（用于 Theorem 5.3 的参数化前沿）。 */
export function sampleSimplexWeights(dimension: number, gridSteps = 10): PreferenceVector[] {
  if (!Number.isInteger(dimension) || dimension < 1) {
    throw new RangeError("dimension must be a positive integer.");
  }
  if (!Number.isInteger(gridSteps) || gridSteps < 2) {
    throw new RangeError("gridSteps must be an integer >= 2.");
  }

  if (dimension === 1) return [[1]];
  if (dimension === 2) {
    const weights: PreferenceVector[] = [];
    for (let i = 0; i <= gridSteps; i += 1) {
      const w = i / gridSteps;
      weights.push([w, 1 - w]);
    }
    return weights;
  }
  if (dimension === 3) {
    const weights: PreferenceVector[] = [];
    for (let i = 0; i <= gridSteps; i += 1) {
      for (let j = 0; j <= gridSteps - i; j += 1) {
        const w1 = i / gridSteps;
        const w2 = j / gridSteps;
        const w3 = 1 - w1 - w2;
        weights.push([w1, w2, w3]);
      }
    }
    return weights;
  }

  const samples = gridSteps * gridSteps;
  const weights: PreferenceVector[] = [];
  // Seeded deterministic fallback for dimensions > 3 to preserve reproducibility.
  let state = 20260711 >>> 0;
  const rng = (): number => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let s = 0; s < samples; s += 1) {
    const raw = Array.from({ length: dimension }, () => rng());
    const sum = raw.reduce((a, b) => a + b, 0);
    weights.push(raw.map((value) => value / sum));
  }
  return weights;
}

function unitVector(dimension: number, index: number): PreferenceVector {
  return Array.from({ length: dimension }, (_, i) => (i === index ? 1 : 0));
}

/** 参数化帕累托前沿（Theorem 5.3 / 5.5）。 */
export function buildParametricParetoFrontier(
  candidates: readonly PaperCandidate[],
  capacity: number,
  weightsList: readonly PreferenceVector[],
): ParametricParetoResult {
  if (candidates.length === 0) {
    throw new RangeError("Candidate set must not be empty.");
  }
  const dimension = candidates[0].prototypeValues.length;
  const regions = new Map<string, PreferenceVector[]>();
  const pointsByKey = new Map<string, ParetoPoint>();

  for (const pi of weightsList) {
    const result = greedySubmodularOptimization(candidates, capacity, pi);
    const key = result.selectedIds.slice().sort().join(",");
    const existing = regions.get(key);
    if (existing) {
      existing.push([...pi]);
    } else {
      regions.set(key, [[...pi]]);
    }

    if (!pointsByKey.has(key)) {
      const objectiveVector = Array.from({ length: dimension }, (_, k) =>
        setFunctionValue(result.selectedIds, candidates, unitVector(dimension, k)),
      );
      pointsByKey.set(key, {
        selectedIds: result.selectedIds,
        order: result.order,
        objectiveVector,
        representativeWeight: [...pi],
      });
    }
  }

  const allPoints = [...pointsByKey.values()];
  const frontier = allPoints.filter((point) => {
    return !allPoints.some(
      (other) =>
        other !== point &&
        other.objectiveVector.every((value, index) => value >= point.objectiveVector[index]) &&
        other.objectiveVector.some((value, index) => value > point.objectiveVector[index]),
    );
  });

  return { frontier, regions, sampledWeights: weightsList.length };
}
