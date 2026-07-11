/**
 * Layer 0: Auto-Tiering and reachable candidate filtering.
 *
 * Implements the theory from `docs/theory_framework.md` §2:
 *   - Tier mapping T(r) from normalized rank to tier bucket.
 *   - Tier conditional completeness: candidates outside the candidate's tier
 *     have negligible admission probability and can be filtered without loss.
 */

export interface TierThresholds {
  readonly quantiles: readonly number[];
}

export interface TieredCandidate {
  readonly id: string;
  readonly reachableTiers: readonly number[];
  readonly admissionProbabilityByTier?: Readonly<Record<number, number>>;
}

/**
 * Default five-tier quantiles used in the theory framework.
 * Tier 1: [0%, 5%), Tier 2: [5%, 20%), Tier 3: [20%, 50%),
 * Tier 4: [50%, 80%), Tier 5: [80%, 100%].
 */
export function defaultTierThresholds(): TierThresholds {
  return { quantiles: [0, 0.05, 0.2, 0.5, 0.8, 1.0] };
}

/**
 * Compute the tier t = T(r) for a normalized rank in [0, 1).
 * Lower normalized rank means better placement (tier 1 is top 5%).
 */
export function computeTier(normalizedRank: number, thresholds?: TierThresholds): number {
  const qs = thresholds?.quantiles ?? defaultTierThresholds().quantiles;
  if (!(normalizedRank >= 0 && normalizedRank <= 1)) {
    throw new RangeError(`normalizedRank must be in [0, 1], got ${normalizedRank}.`);
  }
  for (let tier = 0; tier < qs.length - 1; tier += 1) {
    if (normalizedRank >= qs[tier] && normalizedRank < qs[tier + 1]) {
      return tier + 1;
    }
  }
  // Boundary case: normalizedRank === 1 falls into the last tier.
  return qs.length - 1;
}

/**
 * Convert absolute rank and total number of ranked examinees to normalized rank.
 */
export function normalizeRank(rank: number, totalRanked: number): number {
  if (totalRanked <= 0) {
    throw new RangeError("totalRanked must be positive.");
  }
  if (!(rank >= 1 && rank <= totalRanked)) {
    throw new RangeError(`rank must be in [1, totalRanked], got ${rank}.`);
  }
  return (rank - 1) / totalRanked;
}

/**
 * Compute tier from absolute rank.
 */
export function computeTierFromRank(
  rank: number,
  totalRanked: number,
  thresholds?: TierThresholds,
): number {
  return computeTier(normalizeRank(rank, totalRanked), thresholds);
}

/**
 * Filter candidates to those reachable for a given tier.
 *
 * A candidate is reachable for tier t if t is in its `reachableTiers` list.
 * This is the operationalization of Theorem 2.2: candidates outside the
 * candidate's reachable tier set have negligible admission probability and
 * can be excluded from the optimization without loss.
 */
export function filterReachableCandidates<T extends TieredCandidate>(
  candidates: readonly T[],
  tier: number,
): T[] {
  return candidates.filter((candidate) => candidate.reachableTiers.includes(tier));
}

/**
 * Verify that the reachable candidate set for a tier is non-empty.
 * Returns the filtered set or throws if it is empty.
 */
export function requireReachableCandidates<T extends TieredCandidate>(
  candidates: readonly T[],
  tier: number,
): T[] {
  const reachable = filterReachableCandidates(candidates, tier);
  if (reachable.length === 0) {
    throw new Error(`No reachable candidates for tier ${tier}.`);
  }
  return reachable;
}

/**
 * Tier completeness sanity check: for every tier appearing in the thresholds,
 * there is at least one candidate that lists it as reachable.
 */
export function verifyTierCompleteness(
  candidates: readonly TieredCandidate[],
  thresholds?: TierThresholds,
): { ok: boolean; missingTiers: number[] } {
  const qs = thresholds?.quantiles ?? defaultTierThresholds().quantiles;
  const tierCount = qs.length - 1;
  const covered = new Set<number>();
  for (const candidate of candidates) {
    for (const tier of candidate.reachableTiers) {
      covered.add(tier);
    }
  }
  const missingTiers: number[] = [];
  for (let tier = 1; tier <= tierCount; tier += 1) {
    if (!covered.has(tier)) {
      missingTiers.push(tier);
    }
  }
  return { ok: missingTiers.length === 0, missingTiers };
}
