/**
 * Layer 2: Bayesian preference inference.
 *
 * Implements the Dirichlet-Categorical model from `docs/theory_framework.md` §3.1:
 *   - Prior: π ~ Dirichlet(α)
 *   - Likelihood: P(I | k) = ∏_q φ_{q, a_q}^{(k)}
 *   - Posterior/MAP: π_k ∝ α_k ∏_q φ_{q, a_q}^{(k)}
 *
 * Also provides a softmax questionnaire scoring fallback.
 */

export interface Questionnaire {
  readonly answers: readonly number[];
}

export interface PreferenceProfile {
  readonly pi: readonly number[];
  readonly entropy: number;
}

export interface DirichletCategoricalModel {
  /** Prior concentration parameters α_k for each prototype. */
  readonly alpha: readonly number[];
  /** Likelihood tables phi[q][answer][k] = P(answer_q = answer | prototype k). */
  readonly phi: readonly (readonly (readonly number[])[])[];
}

export interface SoftmaxPreferenceConfig {
  readonly beta: number;
  readonly prototypeScores: readonly number[];
}

function assertValidProbabilityMass(values: readonly number[], name: string): void {
  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} values must be finite and non-negative.`);
    }
  }
}

function l1Normalize(values: readonly number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return values.map(() => 1 / values.length);
  }
  return values.map((value) => value / total);
}

/**
 * Compute the posterior preference vector π from a questionnaire under the
 * Dirichlet-Categorical model.
 *
 * Formula (§3.1):
 *   π_k = α_k ∏_q φ_{q, a_q}^{(k)} / ∑_j α_j ∏_q φ_{q, a_q}^{(j)}
 */
export function inferPreferenceDirichletCategorical(
  questionnaire: Questionnaire,
  model: DirichletCategoricalModel,
): PreferenceProfile {
  const prototypeCount = model.alpha.length;
  if (prototypeCount === 0) {
    throw new RangeError("alpha must have at least one element.");
  }
  assertValidProbabilityMass(model.alpha, "alpha");

  if (model.phi.length !== questionnaire.answers.length) {
    throw new RangeError("phi must have one table per questionnaire question.");
  }

  const unnormalized = Array.from({ length: prototypeCount }, (_, k) => {
    let product = model.alpha[k];
    for (let q = 0; q < questionnaire.answers.length; q += 1) {
      const answer = questionnaire.answers[q];
      const table = model.phi[q];
      if (answer < 0 || answer >= table.length) {
        throw new RangeError(`Invalid answer ${answer} for question ${q}.`);
      }
      const likelihoods = table[answer];
      if (likelihoods.length !== prototypeCount) {
        throw new RangeError(
          `Likelihood table for question ${q}, answer ${answer} must have ${prototypeCount} entries.`,
        );
      }
      assertValidProbabilityMass(likelihoods, `phi[${q}][${answer}]`);
      product *= likelihoods[k];
    }
    return product;
  });

  const pi = l1Normalize(unnormalized);
  return { pi, entropy: preferenceEntropy(pi) };
}

/**
 * Softmax fallback when the user directly scores each prototype.
 *
 * Formula (§3.1 alternative):
 *   π_k = exp(β s_k) / ∑_j exp(β s_j)
 */
export function inferPreferenceSoftmax(config: SoftmaxPreferenceConfig): PreferenceProfile {
  if (config.beta <= 0) {
    throw new RangeError("beta must be positive.");
  }
  if (config.prototypeScores.length === 0) {
    throw new RangeError("prototypeScores must not be empty.");
  }
  const exps = config.prototypeScores.map((score) => Math.exp(config.beta * score));
  const pi = l1Normalize(exps);
  return { pi, entropy: preferenceEntropy(pi) };
}

/**
 * Shannon entropy of a preference vector in bits.
 *
 * H(π) = -∑_k π_k log_2(π_k)
 *
 * High entropy means an unclear profile (candidate for manual review).
 */
export function preferenceEntropy(pi: readonly number[]): number {
  let entropy = 0;
  for (const weight of pi) {
    if (weight > 0) {
      entropy -= weight * Math.log2(weight);
    }
  }
  return entropy;
}

/**
 * Flag a preference profile for manual review if its entropy exceeds a threshold.
 */
export function isPreferenceUnclear(pi: readonly number[], thresholdBits = 1.5): boolean {
  return preferenceEntropy(pi) > thresholdBits;
}

/**
 * Build a uniform prior α = [1, ..., 1] for a given prototype count.
 */
export function uniformAlpha(prototypeCount: number): number[] {
  if (!Number.isInteger(prototypeCount) || prototypeCount < 1) {
    throw new RangeError("prototypeCount must be a positive integer.");
  }
  return Array.from({ length: prototypeCount }, () => 1);
}
