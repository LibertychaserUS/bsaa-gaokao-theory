/**
 * BSAA theorem verification and reproducible random instance generation.
 *
 * This module is intentionally self-contained: it depends only on `bsaaCore.ts`
 * so it remains valid even when other experimental/untracked modules change.
 *
 * Verified theorems:
 *   - Theorem 3.1 (Value-Index): sorting a fixed set by value descending is optimal.
 *   - Theorem 4.2 (Submodularity): marginal gains are non-increasing.
 *   - Theorem 4.3 (Greedy approximation): GSIO obtains a (1 - 1/e) approximation.
 */

import {
  type BsaaCandidate,
  bruteForceOptimal,
  expectedUtility,
  greedySubmodularSelection,
  marginalGain,
  probabilityTierBaseline,
  valueIndexOrder,
} from "./bsaaCore.js";

const EPSILON = 1e-9;

export interface ValueIndexTheoremResult {
  ok: boolean;
  valueIndexOrder: string[];
  bestOrder: string[];
  valueIndexUtility: number;
  optimalUtility: number;
}

export interface SubmodularityViolation {
  setA: string[];
  setB: string[];
  elementId: string;
  gainA: number;
  gainB: number;
}

export interface SubmodularityResult {
  ok: boolean;
  violations: SubmodularityViolation[];
}

export interface GreedyApproximationResult {
  ok: boolean;
  greedyUtility: number;
  optimalUtility: number;
  ratio: number;
  lowerBound: number;
}

export interface RandomBsaaInstance {
  candidates: BsaaCandidate[];
  capacity: number;
  seed: number;
}

export interface ProofVerificationTrial {
  theorem: "value_index" | "submodularity" | "approximation_ratio";
  candidateCount: number;
  capacity?: number;
  ok: boolean;
  violationCount: number;
  durationMs: number;
}

export interface ProofVerificationReport {
  seed: number;
  trials: ProofVerificationTrial[];
  summary: {
    totalTrials: number;
    passedTrials: number;
    failedTrials: number;
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

function allSubsets<T>(items: readonly T[]): T[][] {
  const n = items.length;
  const result: T[][] = [];
  for (let mask = 0; mask < 1 << n; mask += 1) {
    const subset: T[] = [];
    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) subset.push(items[i]);
    }
    result.push(subset);
  }
  return result;
}

function makePool(candidates: readonly BsaaCandidate[]): Map<string, BsaaCandidate> {
  const pool = new Map<string, BsaaCandidate>();
  for (const candidate of candidates) {
    if (pool.has(candidate.id)) {
      throw new RangeError(`Duplicate candidate id: ${candidate.id}`);
    }
    pool.set(candidate.id, candidate);
  }
  return pool;
}

function marginalGainForIds(
  pool: Map<string, BsaaCandidate>,
  setIds: readonly string[],
  elementId: string,
): number {
  const set = setIds.map((id) => {
    const candidate = pool.get(id);
    if (candidate === undefined) {
      throw new RangeError(`Candidate ${id} not found in pool.`);
    }
    return candidate;
  });
  const element = pool.get(elementId);
  if (element === undefined) {
    throw new RangeError(`Candidate ${elementId} not found in pool.`);
  }
  return marginalGain(set, element);
}

/**
 * Deterministic 32-bit LCG random generator.
 *
 * Uses the Numerical Recipes constants so results are reproducible across
 * runtimes that respect 32-bit unsigned arithmetic.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 12345;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Generate a deterministic BSAA instance for property-based testing.
 */
export function randomBsaaInstance(
  candidateCount: number,
  capacity: number,
  seed: number,
  options: {
    valueMin?: number;
    valueMax?: number;
    probabilityMin?: number;
    probabilityMax?: number;
  } = {},
): RandomBsaaInstance {
  if (!Number.isInteger(candidateCount) || candidateCount < 1) {
    throw new RangeError("candidateCount must be a positive integer.");
  }
  if (!Number.isInteger(capacity) || capacity < 0) {
    throw new RangeError("capacity must be a non-negative integer.");
  }

  const { valueMin = 0, valueMax = 1, probabilityMin = 0.05, probabilityMax = 0.95 } = options;

  const random = createSeededRandom(seed);
  const candidates: BsaaCandidate[] = [];

  for (let i = 0; i < candidateCount; i += 1) {
    const value = valueMin + random() * (valueMax - valueMin);
    const probability = probabilityMin + random() * (probabilityMax - probabilityMin);
    candidates.push({
      id: `c_${i}`,
      value: Math.round(value * 1_000_000) / 1_000_000,
      probability: Math.round(probability * 1_000_000) / 1_000_000,
    });
  }

  return {
    candidates,
    capacity: Math.min(capacity, candidateCount),
    seed,
  };
}

/**
 * Verify Theorem 3.1 (Value-Index Optimality) by brute force.
 *
 * For small candidate sets this enumerates every permutation and checks that
 * the value-descending order attains the maximum expected utility.
 */
export function verifyValueIndexTheorem(
  candidates: readonly BsaaCandidate[],
): ValueIndexTheoremResult {
  if (candidates.length === 0) {
    return {
      ok: true,
      valueIndexOrder: [],
      bestOrder: [],
      valueIndexUtility: 0,
      optimalUtility: 0,
    };
  }

  const ordered = valueIndexOrder(candidates);
  const valueIndexUtility = expectedUtility(ordered);

  let optimalUtility = -Number.POSITIVE_INFINITY;
  let bestOrder: BsaaCandidate[] = [];
  for (const perm of permutations(candidates)) {
    const utility = expectedUtility(perm);
    if (utility > optimalUtility + EPSILON) {
      optimalUtility = utility;
      bestOrder = [...perm];
    }
  }

  const ok = valueIndexUtility >= optimalUtility - EPSILON;
  return {
    ok,
    valueIndexOrder: ordered.map((c) => c.id),
    bestOrder: bestOrder.map((c) => c.id),
    valueIndexUtility,
    optimalUtility,
  };
}

/**
 * Verify Theorem 4.2 (Diminishing Marginal Gains / Submodularity).
 *
 * Checks all A ⊆ B and e ∉ B:
 *   f(A ∪ {e}) - f(A) ≥ f(B ∪ {e}) - f(B)
 *
 * Only practical for N ≤ 7 in automated tests.
 */
export function verifySubmodularity(candidates: readonly BsaaCandidate[]): SubmodularityResult {
  const pool = makePool(candidates);
  const ids = candidates.map((c) => c.id);
  const violations: SubmodularityViolation[] = [];

  const subsets = allSubsets(ids);
  for (const B of subsets) {
    const bSet = new Set(B);
    const bSubsets = allSubsets(B);
    for (const A of bSubsets) {
      for (const e of ids) {
        if (bSet.has(e)) continue;
        const gainA = marginalGainForIds(pool, A, e);
        const gainB = marginalGainForIds(pool, B, e);
        if (gainA < gainB - EPSILON) {
          violations.push({
            setA: [...A],
            setB: [...B],
            elementId: e,
            gainA,
            gainB,
          });
        }
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Verify Theorem 4.3 (Greedy (1 - 1/e) approximation).
 *
 * Compares the GSIO greedy utility against the brute-force optimum for a small
 * instance and checks the approximation ratio.
 */
export function verifyGreedyApproximation(
  candidates: readonly BsaaCandidate[],
  capacity: number,
): GreedyApproximationResult {
  const greedyResult = greedySubmodularSelection(candidates, capacity);
  const optimalResult = bruteForceOptimal(candidates, capacity);
  const lowerBound = 1 - 1 / Math.E;

  const greedyUtility = greedyResult.utility;
  const optimalUtility = optimalResult.utility;

  let ratio: number;
  if (optimalUtility > EPSILON) {
    ratio = greedyUtility / optimalUtility;
  } else {
    ratio = greedyUtility <= EPSILON ? 1 : Number.POSITIVE_INFINITY;
  }

  const ok =
    optimalUtility <= EPSILON
      ? greedyUtility <= EPSILON
      : greedyUtility >= optimalUtility * lowerBound - EPSILON;

  return {
    ok,
    greedyUtility,
    optimalUtility,
    ratio,
    lowerBound,
  };
}

/**
 * Run a reproducible battery of theorem checks on randomly generated instances.
 */
export function runProofVerificationTrials(
  options: { seed?: number } = {},
): ProofVerificationReport {
  const seed = options.seed ?? 20260711;
  const trials: ProofVerificationTrial[] = [];
  const random = createSeededRandom(seed);

  for (let candidateCount = 2; candidateCount <= 7; candidateCount += 1) {
    const start = performance.now();
    const instance = randomBsaaInstance(
      candidateCount,
      candidateCount,
      Math.floor(random() * 0x100000000),
    );
    const result = verifyValueIndexTheorem(instance.candidates);
    trials.push({
      theorem: "value_index",
      candidateCount,
      ok: result.ok,
      violationCount: 0,
      durationMs: performance.now() - start,
    });
  }

  for (let candidateCount = 2; candidateCount <= 6; candidateCount += 1) {
    const start = performance.now();
    const instance = randomBsaaInstance(
      candidateCount,
      candidateCount,
      Math.floor(random() * 0x100000000),
    );
    const result = verifySubmodularity(instance.candidates);
    trials.push({
      theorem: "submodularity",
      candidateCount,
      ok: result.ok,
      violationCount: result.violations.length,
      durationMs: performance.now() - start,
    });
  }

  const approximationConfigs = [
    { candidateCount: 6, capacity: 3 },
    { candidateCount: 7, capacity: 3 },
    { candidateCount: 8, capacity: 4 },
    { candidateCount: 8, capacity: 3 },
  ];
  for (const config of approximationConfigs) {
    const start = performance.now();
    const instance = randomBsaaInstance(
      config.candidateCount,
      config.capacity,
      Math.floor(random() * 0x100000000),
    );
    const result = verifyGreedyApproximation(instance.candidates, instance.capacity);
    trials.push({
      theorem: "approximation_ratio",
      candidateCount: config.candidateCount,
      capacity: config.capacity,
      ok: result.ok,
      violationCount: result.ok ? 0 : 1,
      durationMs: performance.now() - start,
    });
  }

  const passedTrials = trials.filter((t) => t.ok).length;
  return {
    seed,
    trials,
    summary: {
      totalTrials: trials.length,
      passedTrials,
      failedTrials: trials.length - passedTrials,
    },
  };
}

/**
 * Pretty-print a proof-verification report for CLI output.
 */
export function formatProofVerificationReport(report: ProofVerificationReport): string {
  const lines: string[] = [];
  lines.push("=== BSAA Proof Verification Report ===");
  lines.push(`Seed: ${report.seed}`);
  lines.push(`Total trials: ${report.summary.totalTrials}`);
  lines.push(`Passed: ${report.summary.passedTrials}`);
  lines.push(`Failed: ${report.summary.failedTrials}`);
  lines.push("");
  for (const trial of report.trials) {
    const status = trial.ok ? "PASS" : "FAIL";
    const detail =
      trial.capacity !== undefined
        ? `N=${trial.candidateCount} n=${trial.capacity}`
        : `N=${trial.candidateCount}`;
    lines.push(
      `[${status}] ${trial.theorem.padEnd(22)} ${detail} violations=${trial.violationCount} ${trial.durationMs.toFixed(2)}ms`,
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Reusable verification harness extensions
// ---------------------------------------------------------------------------

export interface BatteryCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface BatteryConfig {
  seed?: number;
  valueIndexSizes?: number[];
  submodularitySizes?: number[];
  approximationConfigs?: { candidateCount: number; capacity: number }[];
  paretoGridSteps?: number;
  paretoDimensionCount?: number;
}

export interface BaselineComparison {
  baselineUtility: number;
  gsioUtility: number;
  improvement: number;
}

/**
 * Build a 冲稳保-style baseline ordering: low-probability (reach) candidates
 * first, then medium (steady), then high-probability (safety). This is a thin
 * wrapper around the tiered probability baseline in `bsaaCore.ts`.
 */
export function buildChongWenBaoBaseline(
  candidates: readonly BsaaCandidate[],
  capacity: number,
): BsaaCandidate[] {
  return probabilityTierBaseline(candidates, capacity);
}

/**
 * Compare GSIO against the 冲稳保 baseline on the same candidate pool.
 */
export function compareWithBaseline(
  candidates: readonly BsaaCandidate[],
  capacity: number,
): BaselineComparison {
  const gsio = greedySubmodularSelection(candidates, capacity);
  const baselineOrder = buildChongWenBaoBaseline(candidates, capacity);
  const baselineUtility = expectedUtility(baselineOrder);
  const improvement = baselineUtility > 0 ? (gsio.utility - baselineUtility) / baselineUtility : 0;
  return {
    baselineUtility,
    gsioUtility: gsio.utility,
    improvement,
  };
}

/**
 * Sample weights from a (dimensionCount)-dimensional simplex using a grid.
 * Useful for parameterized Pareto-frontier experiments on multi-objective
 * utility. For dimensionCount == 3 the returned triples sum to 1.
 */
export function sampleParetoWeights(
  dimensionCount: number,
  gridSteps: number,
  seed = 20260711,
): number[][] {
  if (dimensionCount < 2) throw new RangeError("dimensionCount must be at least 2");
  if (gridSteps < 1) throw new RangeError("gridSteps must be at least 1");

  const random = createSeededRandom(seed);
  const weights: number[][] = [];

  if (dimensionCount === 3) {
    for (let i = 0; i <= gridSteps; i += 1) {
      for (let j = 0; j <= gridSteps - i; j += 1) {
        const w1 = i / gridSteps;
        const w2 = j / gridSteps;
        const w3 = 1 - w1 - w2;
        const jitter = (): number => (random() - 0.5) * 0.001;
        weights.push([
          Math.max(0, w1 + jitter()),
          Math.max(0, w2 + jitter()),
          Math.max(0, w3 + jitter()),
        ]);
      }
    }
    return weights;
  }

  // General case: random samples on the simplex.
  for (let s = 0; s <= gridSteps; s += 1) {
    const raw = Array.from({ length: dimensionCount }, () => random());
    const sum = raw.reduce((a, b) => a + b, 0);
    weights.push(raw.map((x) => x / sum));
  }
  return weights;
}

function makeBatteryCheck(name: string, ok: boolean, detail: string): BatteryCheck {
  return { name, ok, detail };
}

/**
 * Run an extended proof-verification battery that includes the brute-force
 * theorem checks from `runProofVerificationTrials`, a GSIO-vs-baseline check,
 * and a Pareto simplex sampling sanity check.
 *
 * This is the entry point intended for CI and for other modules that want a
 * single reusable verification harness.
 */
export function runProofVerificationBattery(
  config: BatteryConfig = {},
): ProofVerificationReport & { batteryChecks: BatteryCheck[]; paretoSampleCount: number } {
  const seed = config.seed ?? 20260711;
  const report = runProofVerificationTrials({ seed });
  const batteryChecks: BatteryCheck[] = [];

  for (const trial of report.trials) {
    const detail =
      trial.capacity !== undefined
        ? `N=${trial.candidateCount} n=${trial.capacity} violations=${trial.violationCount}`
        : `N=${trial.candidateCount} violations=${trial.violationCount}`;
    batteryChecks.push(
      makeBatteryCheck(`${trial.theorem} N=${trial.candidateCount}`, trial.ok, detail),
    );
  }

  // GSIO vs 冲稳保 baseline on a moderately sized instance.
  const baselineRandom = createSeededRandom(seed + 1);
  const baselineInstance = randomBsaaInstance(12, 6, Math.floor(baselineRandom() * 0x100000000));
  const baselineComparison = compareWithBaseline(
    baselineInstance.candidates,
    baselineInstance.capacity,
  );
  const baselineOk = baselineComparison.gsioUtility >= baselineComparison.baselineUtility - EPSILON;
  batteryChecks.push(
    makeBatteryCheck(
      "GSIO vs 冲稳保 baseline",
      baselineOk,
      `gsio=${baselineComparison.gsioUtility.toExponential(
        3,
      )} baseline=${baselineComparison.baselineUtility.toExponential(
        3,
      )} improvement=${(baselineComparison.improvement * 100).toFixed(1)}%`,
    ),
  );

  // Pareto simplex sampling sanity check.
  const paretoRandom = createSeededRandom(seed + 2);
  const paretoDimensionCount = config.paretoDimensionCount ?? 3;
  const paretoGridSteps = config.paretoGridSteps ?? 4;
  const paretoWeights = sampleParetoWeights(
    paretoDimensionCount,
    paretoGridSteps,
    Math.floor(paretoRandom() * 0x100000000),
  );
  const allSumToOne = paretoWeights.every((w) => {
    const sum = w.reduce((a, b) => a + b, 0);
    return Math.abs(sum - 1) < 1e-2;
  });
  batteryChecks.push(
    makeBatteryCheck(
      "Pareto simplex sampling",
      allSumToOne,
      `dimension=${paretoDimensionCount} gridSteps=${paretoGridSteps} samples=${paretoWeights.length}`,
    ),
  );

  return {
    ...report,
    batteryChecks,
    paretoSampleCount: paretoWeights.length,
  };
}
