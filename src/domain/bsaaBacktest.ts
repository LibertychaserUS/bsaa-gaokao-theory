/**
 * BSAA (Bayesian Sequential Assignment with Absorption) backtesting engine.
 *
 * Implements the theoretical objects defined in `theory_framework.md`:
 *   - expected utility U(x; π) under sequential absorption
 *   - Value-Index optimal ordering (Theorem 3.1)
 *   - monotone submodular set function f_π(S) (Theorem 4.2)
 *   - GSIO greedy submodular optimizer (Algorithm 1)
 *   - transparent 冲/稳/保 baseline (Section 8.1)
 *   - Monte Carlo virtual-student evaluation (Section 8.3)
 *   - brute-force verification helpers (proof_check_manual.md)
 */

export interface BsaaCandidate {
  readonly id: string;
  /** Historical admission probability p_c ∈ (0, 1). */
  readonly p: number;
  /** Neutral quality q_c ∈ [0, 1] (school tier / major heat / city tier composite). */
  readonly q: number;
  /** Long-term proxy y_c ≥ 0 (salary / postgraduate / public-sector rate composite). */
  readonly longTerm: number;
  /** School tier; larger values represent higher-tier schools. */
  readonly schoolTier: number;
  /** Attribute vector μ(c) used to compute the path value v_c(π). */
  readonly attribute: readonly number[];
}

export interface BsaaPreferenceProfile {
  /** π ∈ Δ_{m_t}: distribution over prototypes. */
  readonly pi: readonly number[];
}

export interface BsaaStudent {
  readonly rank: number;
  readonly totalRanked: number;
  readonly preference: BsaaPreferenceProfile;
}

export type BsaaScoredCandidate = BsaaCandidate & {
  /** v_c(π) = Σ_k π_k ⟨μ(c), μ_k⟩ for this student. */
  readonly v: number;
};

export interface BsaaPlan {
  readonly order: readonly string[];
  readonly expectedUtility: number;
  readonly safety: number;
  readonly neutralQuality: number;
  readonly longTermProxy: number;
}

export interface BsaaBacktestConfig {
  readonly scenarioCount: number;
  readonly seed: number;
  readonly candidateCount: number;
  readonly slotCount: number;
  readonly prototypeCount: number;
  readonly attributeDim: number;
  /** Dirichlet prior α for prototype distribution sampling. */
  readonly alpha: readonly number[];
}

export interface BsaaBacktestSummary {
  readonly config: BsaaBacktestConfig;
  readonly scenarioCount: number;
  readonly greedy: BsaaMetricAverages;
  readonly baseline: BsaaMetricAverages;
  readonly relative: BsaaRelativeAverages;
  readonly theoremVerification: {
    readonly valueIndexPassed: boolean;
    readonly submodularityPassed: boolean;
    readonly bruteOptimalScenarios: number;
    readonly minApproximationRatio: number | null;
    readonly meanApproximationRatio: number | null;
  };
}

export interface BsaaMetricAverages {
  readonly safety: number;
  readonly neutralQuality: number;
  readonly longTermProxy: number;
  readonly pathUtility: number;
}

export interface BsaaRelativeAverages {
  readonly pathGain: number;
  readonly safetyGain: number;
  readonly qualityGain: number;
  readonly longTermGain: number;
}

const TOLERANCE = 1e-9;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sum(values: readonly number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function dotProduct(left: readonly number[], right: readonly number[]): number {
  let result = 0;
  for (let i = 0; i < left.length; i += 1) {
    result += left[i] * right[i];
  }
  return result;
}

function l1Normalize(values: readonly number[]): number[] {
  const total = sum(values);
  if (total === 0) {
    return values.map(() => 1 / values.length);
  }
  return values.map((value) => value / total);
}

/** Park-Miller LCG, deterministic across runs. */
export function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function sampleStandardNormal(rng: () => number): number {
  // Box-Muller transform
  const u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function sampleGamma(rng: () => number, shape: number): number {
  if (shape <= 0) {
    throw new RangeError("Gamma shape must be positive.");
  }
  if (shape >= 1) {
    // Marsaglia-Tsang
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      const z = sampleStandardNormal(rng);
      let v = 1 + c * z;
      if (v <= 0) continue;
      v = v * v * v;
      const u = rng();
      if (u < 1 - 0.0331 * z * z * z * z) {
        return d * v;
      }
      if (Math.log(u) < 0.5 * z * z + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }
  }
  // Ahrens-Dieter for shape < 1
  const b = (Math.E + shape) / Math.E;
  for (;;) {
    const u = rng();
    const w = rng();
    const p = b * u;
    if (p <= 1) {
      const x = Math.pow(p, 1 / shape);
      if (w <= Math.exp(-x)) return x;
    } else {
      const x = -Math.log((b - p) / shape);
      if (w <= Math.pow(x, shape - 1)) return x;
    }
  }
}

function sampleDirichlet(rng: () => number, alpha: readonly number[]): number[] {
  const samples = alpha.map((a) => sampleGamma(rng, a));
  return l1Normalize(samples);
}

function randomUnitVector(rng: () => number, dim: number): number[] {
  return l1Normalize(Array.from({ length: dim }, () => rng()));
}

export function scoreCandidates(
  candidates: readonly BsaaCandidate[],
  preference: BsaaPreferenceProfile,
  prototypes: readonly (readonly number[])[],
): BsaaScoredCandidate[] {
  if (preference.pi.length !== prototypes.length) {
    throw new RangeError("Preference vector length must match prototype count.");
  }
  const dim = prototypes[0]?.length ?? 0;
  const composite = Array.from({ length: dim }, (_, j) =>
    sum(prototypes.map((proto, k) => proto[j] * preference.pi[k])),
  );
  return candidates.map((candidate) => ({
    ...candidate,
    v: dotProduct(candidate.attribute, composite),
  }));
}

/** Expected utility U(x; π) for an already ordered list of scored candidates. */
export function expectedUtility(order: readonly BsaaScoredCandidate[]): number {
  let total = 0;
  let survival = 1;
  for (const candidate of order) {
    total += candidate.v * candidate.p * survival;
    survival *= 1 - candidate.p;
  }
  return total;
}

/** Value-Index theorem (Theorem 3.1): sort by v_c(π) descending. */
export function valueIndexOrder(candidates: readonly BsaaScoredCandidate[]): BsaaScoredCandidate[] {
  return [...candidates].sort((left, right) => right.v - left.v || left.id.localeCompare(right.id));
}

/** f_π(S): best ordering of S, which is the v-descending order. */
export function fPi(candidates: readonly BsaaScoredCandidate[]): number {
  return expectedUtility(valueIndexOrder(candidates));
}

function insertByValue(
  sorted: readonly BsaaScoredCandidate[],
  candidate: BsaaScoredCandidate,
): BsaaScoredCandidate[] {
  const copy = [...sorted];
  let index = 0;
  while (index < copy.length && copy[index].v >= candidate.v) {
    index += 1;
  }
  copy.splice(index, 0, candidate);
  return copy;
}

export function marginalGain(
  sortedSet: readonly BsaaScoredCandidate[],
  candidate: BsaaScoredCandidate,
): number {
  return fPi(insertByValue(sortedSet, candidate)) - fPi(sortedSet);
}

/**
 * GSIO (Greedy Submodular with Internal Ordering) from Algorithm 1.
 * Complexity O(n^2 N) because each marginal gain is computed by inserting into the
 * v-sorted list in O(|S|) time.
 */
export function greedySubmodularOptimizer(
  candidates: readonly BsaaScoredCandidate[],
  slotCount: number,
): BsaaScoredCandidate[] {
  const n = Math.min(slotCount, candidates.length);
  const selected: BsaaScoredCandidate[] = [];
  const selectedIds = new Set<string>();

  for (let i = 0; i < n; i += 1) {
    let best: BsaaScoredCandidate | null = null;
    let bestGain = -Infinity;
    for (const candidate of candidates) {
      if (selectedIds.has(candidate.id)) continue;
      const gain = marginalGain(selected, candidate);
      if (
        gain > bestGain + TOLERANCE ||
        (Math.abs(gain - bestGain) <= TOLERANCE &&
          (best === null || candidate.id.localeCompare(best.id) < 0))
      ) {
        bestGain = gain;
        best = candidate;
      }
    }
    if (best === null) break;
    selected.push(best);
    selectedIds.add(best.id);
  }

  return valueIndexOrder(selected);
}

/** Transparent 冲/稳/保 baseline from Section 8.1.
 *
 * Probability buckets are closed intervals:
 *   reach [0.1, 0.3], steady [0.4, 0.7], safety [0.8, 1.0].
 * Within each bucket candidates are sorted by school tier descending, then by
 * admission probability descending. The final output preserves reach → steady
 * → safety ordering.
 */
export function baselineReachSteadySafe(
  candidates: readonly BsaaScoredCandidate[],
  slotCount: number,
): BsaaScoredCandidate[] {
  const reach = candidates
    .filter((c) => c.p >= 0.1 && c.p <= 0.3)
    .sort((a, b) => b.schoolTier - a.schoolTier || b.p - a.p || a.id.localeCompare(b.id))
    .slice(0, Math.floor(slotCount / 3));
  const steady = candidates
    .filter((c) => c.p >= 0.4 && c.p <= 0.7)
    .sort((a, b) => b.schoolTier - a.schoolTier || b.p - a.p || a.id.localeCompare(b.id))
    .slice(0, Math.floor(slotCount / 3));
  const safe = candidates
    .filter((c) => c.p >= 0.8 && c.p <= 1.0)
    .sort((a, b) => b.schoolTier - a.schoolTier || b.p - a.p || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, slotCount - reach.length - steady.length));

  const ordered = [...reach, ...steady, ...safe];
  return ordered.slice(0, slotCount);
}

function buildPlan(order: readonly BsaaScoredCandidate[]): BsaaPlan {
  let survival = 1;
  let safety = 0;
  let neutralQuality = 0;
  let longTermProxy = 0;
  let pathUtility = 0;

  for (const c of order) {
    const contribution = c.p * survival;
    pathUtility += c.v * contribution;
    neutralQuality += c.q * contribution;
    longTermProxy += c.longTerm * contribution;
    survival *= 1 - c.p;
  }
  safety = 1 - survival;

  return {
    order: order.map((c) => c.id),
    expectedUtility: pathUtility,
    safety,
    neutralQuality,
    longTermProxy,
  };
}

function relativeGain(algorithm: number, baseline: number): number {
  if (Math.abs(baseline) < TOLERANCE) {
    return algorithm > TOLERANCE ? Infinity : 0;
  }
  return (algorithm - baseline) / Math.abs(baseline);
}

/** Brute-force optimal for small N; verifies Theorem 4.3 empirically. */
export function bruteForceOptimal(
  candidates: readonly BsaaScoredCandidate[],
  slotCount: number,
): { readonly order: readonly BsaaScoredCandidate[]; readonly value: number } {
  const n = Math.min(slotCount, candidates.length);
  const N = candidates.length;
  let bestValue = -Infinity;
  let bestOrder: BsaaScoredCandidate[] = [];

  function permute(current: BsaaScoredCandidate[], remaining: BsaaScoredCandidate[]): void {
    if (current.length === n) {
      const value = expectedUtility(current);
      if (value > bestValue + TOLERANCE) {
        bestValue = value;
        bestOrder = [...current];
      }
      return;
    }
    for (let i = 0; i < remaining.length; i += 1) {
      current.push(remaining[i]);
      permute(current, remaining.slice(0, i).concat(remaining.slice(i + 1)));
      current.pop();
    }
  }

  function choose(start: number, current: BsaaScoredCandidate[]): void {
    if (current.length === n) {
      permute([], current);
      return;
    }
    for (let i = start; i <= N - (n - current.length); i += 1) {
      current.push(candidates[i]);
      choose(i + 1, current);
      current.pop();
    }
  }

  choose(0, []);
  return { order: bestOrder, value: bestValue };
}

/** Verifies Theorem 3.1: for the full candidate set, v-descending order is optimal. */
export function verifyValueIndexTheorem(candidates: readonly BsaaScoredCandidate[]): {
  readonly ok: boolean;
} {
  const bestOrder = valueIndexOrder(candidates);
  const bestValue = expectedUtility(bestOrder);

  function permute(current: BsaaScoredCandidate[], remaining: BsaaScoredCandidate[]): boolean {
    if (remaining.length === 0) {
      return expectedUtility(current) <= bestValue + TOLERANCE;
    }
    for (let i = 0; i < remaining.length; i += 1) {
      current.push(remaining[i]);
      const ok = permute(current, remaining.slice(0, i).concat(remaining.slice(i + 1)));
      current.pop();
      if (!ok) return false;
    }
    return true;
  }

  return { ok: permute([], [...candidates]) };
}

/** Verifies Theorem 4.2: f_π is monotone submodular on all A ⊆ B. */
export function verifySubmodularity(candidates: readonly BsaaScoredCandidate[]): {
  readonly ok: boolean;
  readonly counterexample?: unknown;
} {
  const N = candidates.length;
  if (N > 8) {
    throw new RangeError(
      "Submodularity verification is limited to N ≤ 8 to avoid exponential blowup.",
    );
  }

  function f(mask: number): number {
    const set: BsaaScoredCandidate[] = [];
    for (let i = 0; i < N; i += 1) {
      if (mask & (1 << i)) set.push(candidates[i]);
    }
    return fPi(set);
  }

  for (let b = 0; b < 1 << N; b += 1) {
    for (let a = b & (b - 1); ; a = (a - 1) & b) {
      // a iterates over all subsets of b including 0
      for (let e = 0; e < N; e += 1) {
        if (b & (1 << e)) continue;
        const gainA = f(a | (1 << e)) - f(a);
        const gainB = f(b | (1 << e)) - f(b);
        if (gainA < gainB - TOLERANCE) {
          return {
            ok: false,
            counterexample: {
              A: candidates.filter((_, i) => a & (1 << i)).map((c) => c.id),
              B: candidates.filter((_, i) => b & (1 << i)).map((c) => c.id),
              e: candidates[e].id,
              gainA,
              gainB,
            },
          };
        }
      }
      if (a === 0) break;
    }
  }
  return { ok: true };
}

function generatePrototypes(
  rng: () => number,
  prototypeCount: number,
  attributeDim: number,
): readonly (readonly number[])[] {
  return Array.from({ length: prototypeCount }, () => randomUnitVector(rng, attributeDim));
}

function generateCandidates(
  rng: () => number,
  count: number,
  attributeDim: number,
): readonly BsaaCandidate[] {
  return Array.from({ length: count }, (_, index) => {
    const p = 0.05 + rng() * 0.9;
    return {
      id: `c_${index}`,
      p: clamp01(p),
      q: rng(),
      longTerm: rng(),
      schoolTier: 1 + Math.floor(rng() * 5),
      attribute: randomUnitVector(rng, attributeDim),
    };
  });
}

function generateStudent(
  rng: () => number,
  alpha: readonly number[],
  totalRanked: number,
): BsaaStudent {
  return {
    rank: 1 + Math.floor(rng() * totalRanked),
    totalRanked,
    preference: { pi: sampleDirichlet(rng, alpha) },
  };
}

function emptyAverages(): BsaaMetricAverages {
  return { safety: 0, neutralQuality: 0, longTermProxy: 0, pathUtility: 0 };
}

function emptyRelativeAverages(): BsaaRelativeAverages {
  return { pathGain: 0, safetyGain: 0, qualityGain: 0, longTermGain: 0 };
}

function addToAverages(acc: BsaaMetricAverages, plan: BsaaPlan): BsaaMetricAverages {
  return {
    safety: acc.safety + plan.safety,
    neutralQuality: acc.neutralQuality + plan.neutralQuality,
    longTermProxy: acc.longTermProxy + plan.longTermProxy,
    pathUtility: acc.pathUtility + plan.expectedUtility,
  };
}

function addToRelative(
  acc: BsaaRelativeAverages,
  greedy: BsaaPlan,
  baseline: BsaaPlan,
): BsaaRelativeAverages {
  return {
    pathGain: acc.pathGain + relativeGain(greedy.expectedUtility, baseline.expectedUtility),
    safetyGain: acc.safetyGain + relativeGain(greedy.safety, baseline.safety),
    qualityGain: acc.qualityGain + relativeGain(greedy.neutralQuality, baseline.neutralQuality),
    longTermGain: acc.longTermGain + relativeGain(greedy.longTermProxy, baseline.longTermProxy),
  };
}

function divideAverages(acc: BsaaMetricAverages, count: number): BsaaMetricAverages {
  return {
    safety: acc.safety / count,
    neutralQuality: acc.neutralQuality / count,
    longTermProxy: acc.longTermProxy / count,
    pathUtility: acc.pathUtility / count,
  };
}

function divideRelative(acc: BsaaRelativeAverages, count: number): BsaaRelativeAverages {
  return {
    pathGain: acc.pathGain / count,
    safetyGain: acc.safetyGain / count,
    qualityGain: acc.qualityGain / count,
    longTermGain: acc.longTermGain / count,
  };
}

export function defaultBacktestConfig(overrides?: Partial<BsaaBacktestConfig>): BsaaBacktestConfig {
  return {
    scenarioCount: 2000,
    seed: 20260711,
    candidateCount: 20,
    slotCount: 10,
    prototypeCount: 3,
    attributeDim: 5,
    alpha: [1, 1, 1],
    ...overrides,
  };
}

/**
 * End-to-end Monte Carlo backtest (Section 8.3).
 * Each scenario draws fresh prototypes, candidates, and a virtual examinee,
 * then compares GSIO against the transparent baseline on the four metrics
 * defined in Section 8.2.
 */
export function runBsaaMonteCarloBacktest(config: BsaaBacktestConfig): BsaaBacktestSummary {
  const rng = lcg(config.seed);
  const totalRanked = 100_000;

  let greedyAcc = emptyAverages();
  let baselineAcc = emptyAverages();
  let relativeAcc = emptyRelativeAverages();

  let valueIndexPassed = true;
  let submodularityPassed = true;
  let bruteOptimalScenarios = 0;
  let minRatio: number | null = null;
  let ratioSum = 0;

  for (let scenario = 0; scenario < config.scenarioCount; scenario += 1) {
    const prototypes = generatePrototypes(rng, config.prototypeCount, config.attributeDim);
    const candidates = generateCandidates(rng, config.candidateCount, config.attributeDim);
    const student = generateStudent(rng, config.alpha, totalRanked);
    const scored = scoreCandidates(candidates, student.preference, prototypes);

    const greedyOrder = greedySubmodularOptimizer(scored, config.slotCount);
    const baselineOrder = baselineReachSteadySafe(scored, config.slotCount);
    const greedyPlan = buildPlan(greedyOrder);
    const baselinePlan = buildPlan(baselineOrder);

    greedyAcc = addToAverages(greedyAcc, greedyPlan);
    baselineAcc = addToAverages(baselineAcc, baselinePlan);
    relativeAcc = addToRelative(relativeAcc, greedyPlan, baselinePlan);

    // Theorem verification is performed on a single random small scenario to keep runtime sane.
    if (scenario === 0 && config.candidateCount <= 8) {
      valueIndexPassed = verifyValueIndexTheorem(scored).ok;
      submodularityPassed = verifySubmodularity(scored).ok;
    }

    if (config.candidateCount <= 8 && config.slotCount <= config.candidateCount) {
      bruteOptimalScenarios += 1;
      const optimal = bruteForceOptimal(scored, config.slotCount);
      const ratio = optimal.value > TOLERANCE ? greedyPlan.expectedUtility / optimal.value : 1;
      minRatio = minRatio === null ? ratio : Math.min(minRatio, ratio);
      ratioSum += ratio;
    }
  }

  return {
    config,
    scenarioCount: config.scenarioCount,
    greedy: divideAverages(greedyAcc, config.scenarioCount),
    baseline: divideAverages(baselineAcc, config.scenarioCount),
    relative: divideRelative(relativeAcc, config.scenarioCount),
    theoremVerification: {
      valueIndexPassed,
      submodularityPassed,
      bruteOptimalScenarios,
      minApproximationRatio: minRatio,
      meanApproximationRatio: bruteOptimalScenarios > 0 ? ratioSum / bruteOptimalScenarios : null,
    },
  };
}
