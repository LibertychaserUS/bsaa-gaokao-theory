/**
 * Default scoring constants shared across the BSAA/GSIO domain.
 *
 * These are the compiled-in defaults used by tests and by callers that do not
 * supply their own configuration. The operational pipeline should load values
 * from `config/scoring-defaults.json` instead of relying on these constants.
 */

export interface ProbabilityBuckets {
  readonly reach: readonly [number, number];
  readonly steady: readonly [number, number];
  readonly safety: readonly [number, number];
}

export interface TierThresholds {
  readonly quantiles: readonly number[];
}

export function defaultProbabilityBuckets(): ProbabilityBuckets {
  return {
    reach: [0.1, 0.3],
    steady: [0.4, 0.7],
    safety: [0.8, 1.0],
  };
}

export function defaultTierThresholds(): TierThresholds {
  return {
    quantiles: [0, 0.05, 0.2, 0.5, 0.8, 1.0],
  };
}
