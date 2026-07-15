/**
 * Probability-model calibration from historical admission thresholds.
 *
 * We do not observe student-level admission outcomes; we only observe the
 * minimum admitted rank (threshold) for each program-year.  For a student with
 * rank r and a program whose 2025 estimate is e, define
 *   rankDelta = r - e.
 * Admission occurs iff the realized threshold t satisfies t >= r, i.e. iff the
 * residual (t - e) >= rankDelta.  We therefore:
 *   1. Collect historical residuals (minRank - estimatedRank).
 *   2. Approximate the survival function S(rankDelta) = P(residual >= rankDelta).
 *   3. Fit a two-parameter logistic
 *        P(admit | rankDelta) = scale( sigmoid(beta0 + beta1 * rankDelta/scale) )
 *      to the empirical survival curve.
 */

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export interface LogisticModel {
  readonly beta0: number;
  readonly beta1: number;
  readonly rankDeltaScale: number;
  readonly outputRange: readonly [number, number];
}

export interface TrainingOptions {
  readonly learningRate: number;
  readonly maxIterations: number;
  readonly l2Lambda: number;
  readonly convergenceEpsilon: number;
  readonly rankDeltaScale: number;
  readonly outputRange: readonly [number, number];
  readonly gridPoints: number;
}

export interface CalibrationMetrics {
  readonly sampleCount: number;
  readonly logLoss: number;
  readonly accuracy: number;
  readonly auc: number;
  readonly calibrationMae: number;
}

export interface RankDeltaBucket {
  readonly binStart: number;
  readonly binEnd: number;
  readonly count: number;
  readonly actualRate: number;
  readonly predictedRate: number;
}

export interface ProbabilityBucket {
  readonly binStart: number;
  readonly binEnd: number;
  readonly count: number;
  readonly actualRate: number;
  readonly meanPredicted: number;
}

export interface CalibrationSample {
  readonly rankDelta: number;
  readonly admitted: 0 | 1;
  readonly year: number;
  readonly programId: number;
}

const EPSILON = 1e-9;

function clamp01(value: number): number {
  return Math.max(EPSILON, Math.min(1 - EPSILON, value));
}

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function scaleProbability(raw: number, outputRange: readonly [number, number]): number {
  const [minP, maxP] = outputRange;
  return raw * (maxP - minP) + minP;
}

export function predictProbability(
  rankDelta: number,
  model: Pick<LogisticModel, "beta0" | "beta1" | "rankDeltaScale" | "outputRange">,
): number {
  const scaledDelta = rankDelta / model.rankDeltaScale;
  const raw = logistic(model.beta0 + model.beta1 * scaledDelta);
  return scaleProbability(raw, model.outputRange);
}

export function buildResiduals(dbPath: string, years: readonly number[]): number[] {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const sql = `
    SELECT
      estimated_rank_2025 AS estimatedRank,
      min_rank_2024 AS minRank2024,
      min_rank_2023 AS minRank2023,
      min_rank_2022 AS minRank2022
    FROM programs
    WHERE estimated_rank_2025 IS NOT NULL
  `;
  const rows = db.prepare(sql).all() as {
    estimatedRank: number;
    minRank2024: number | null;
    minRank2023: number | null;
    minRank2022: number | null;
  }[];
  db.close();

  const residuals: number[] = [];
  for (const row of rows) {
    for (const year of years) {
      const minRank =
        year === 2024
          ? row.minRank2024
          : year === 2023
            ? row.minRank2023
            : year === 2022
              ? row.minRank2022
              : null;
      if (minRank === null) continue;
      residuals.push(minRank - row.estimatedRank);
    }
  }
  return residuals;
}

export interface RankDistributionRow {
  readonly rank: number;
  readonly weight: number;
}

export interface TestProgram {
  readonly programId: number;
  readonly estimatedRank: number;
  readonly minRank: number;
}

export function loadRankDistribution(onePointSegmentPath: string): RankDistributionRow[] {
  const text = readFileSync(onePointSegmentPath, "utf-8");
  const lines = text.trim().split("\n");
  const rows: RankDistributionRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(",");
    const sameScoreCount = Number(parts[4]);
    const cumulativeCount = Number(parts[5]);
    if (Number.isFinite(sameScoreCount) && sameScoreCount > 0 && Number.isFinite(cumulativeCount)) {
      rows.push({ rank: cumulativeCount, weight: sameScoreCount });
    }
  }
  return rows;
}

export function loadTestPrograms(dbPath: string, year: number): TestProgram[] {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const minRankColumn =
    year === 2024 ? "min_rank_2024" : year === 2023 ? "min_rank_2023" : "min_rank_2022";
  const sql = `
    SELECT
      id AS programId,
      estimated_rank_2025 AS estimatedRank,
      ${minRankColumn} AS minRank
    FROM programs
    WHERE estimated_rank_2025 IS NOT NULL
      AND ${minRankColumn} IS NOT NULL
  `;
  const rows = db.prepare(sql).all() as unknown as TestProgram[];
  db.close();
  return rows;
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function weightedSample<T>(
  items: readonly T[],
  weights: readonly number[],
  random: () => number,
): T {
  let total = 0;
  for (const w of weights) total += w;
  let target = random() * total;
  for (let i = 0; i < items.length; i += 1) {
    target -= weights[i];
    if (target <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function evaluateRealisticAdmissionMetrics(
  onePointSegmentPath: string,
  dbPath: string,
  testYear: number,
  model: LogisticModel,
  sampleCount = 500_000,
  seed = 20260711,
): CalibrationMetrics {
  const rankDistribution = loadRankDistribution(onePointSegmentPath);
  if (rankDistribution.length === 0) {
    return { sampleCount: 0, logLoss: NaN, accuracy: NaN, auc: NaN, calibrationMae: NaN };
  }
  const testPrograms = loadTestPrograms(dbPath, testYear);
  if (testPrograms.length === 0) {
    return { sampleCount: 0, logLoss: NaN, accuracy: NaN, auc: NaN, calibrationMae: NaN };
  }

  const rankWeights = rankDistribution.map((r) => r.weight);
  const random = lcg(seed);

  let loss = 0;
  let correct = 0;
  const predictions: { admitted: 0 | 1; probability: number }[] = [];

  for (let i = 0; i < sampleCount; i += 1) {
    const rankRow = weightedSample(rankDistribution, rankWeights, random);
    const program = testPrograms[Math.floor(random() * testPrograms.length)];
    const rankDelta = rankRow.rank - program.estimatedRank;
    const p = predictProbability(rankDelta, model);
    const admitted = rankRow.rank <= program.minRank ? (1 as 0 | 1) : (0 as 0 | 1);

    const pSafe = clamp01(p);
    loss -= admitted * Math.log(pSafe) + (1 - admitted) * Math.log(1 - pSafe);
    if ((p >= 0.5 ? 1 : 0) === admitted) {
      correct += 1;
    }
    predictions.push({ admitted, probability: p });
  }

  const logLoss = loss / sampleCount;
  const accuracy = correct / sampleCount;
  const auc = computeAuc(predictions);
  const calibrationMae = computeCalibrationMae(predictions, 20);

  return { sampleCount, logLoss, accuracy, auc, calibrationMae };
}

export function empiricalSurvival(residuals: readonly number[], rankDelta: number): number {
  if (residuals.length === 0) return NaN;
  let count = 0;
  for (const r of residuals) {
    if (r >= rankDelta) count += 1;
  }
  return count / residuals.length;
}

function quantile(sorted: readonly number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const index = Math.max(0, Math.min(n - 1, Math.floor(q * (n - 1))));
  return sorted[index];
}

function buildGrid(sortedResiduals: readonly number[], pointCount: number): number[] {
  const grid: number[] = [];
  for (let i = 0; i < pointCount; i += 1) {
    const q = i / (pointCount - 1);
    grid.push(quantile(sortedResiduals, q));
  }
  return grid;
}

export function fitLogisticToSurvival(
  residuals: readonly number[],
  options: Partial<TrainingOptions> = {},
): LogisticModel & { iterations: number; finalLoss: number; lossHistory: number[] } {
  const {
    learningRate = 2.0,
    maxIterations = 2000,
    l2Lambda = 0.0001,
    convergenceEpsilon = 1e-9,
    rankDeltaScale = 10000,
    outputRange = [0.001, 0.999] as const,
    gridPoints = 200,
  } = options;

  const sorted = [...residuals].sort((a, b) => a - b);
  const grid = buildGrid(sorted, gridPoints);
  const targets = grid.map((d) => empiricalSurvival(residuals, d));

  // Weight grid points by local residual density so dense regions dominate.
  const halfWindow = rankDeltaScale * 0.5;
  const weights = grid.map((d) => {
    let count = 0;
    for (const r of residuals) {
      if (Math.abs(r - d) <= halfWindow) count += 1;
    }
    return Math.max(1, count);
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  let beta0 = 0;
  let beta1 = 0;
  const lossHistory: number[] = [];

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let grad0 = 0;
    let grad1 = 0;
    let loss = 0;

    for (let i = 0; i < grid.length; i += 1) {
      const x = grid[i] / rankDeltaScale;
      const z = beta0 + beta1 * x;
      const pRaw = logistic(z);
      const p = scaleProbability(pRaw, outputRange);
      const y = targets[i];
      const error = p - y;
      const w = weights[i] / totalWeight;

      // dL/dz = 2*(p-y) * (maxP-minP) * pRaw * (1-pRaw)
      const dLdz = 2 * error * (outputRange[1] - outputRange[0]) * pRaw * (1 - pRaw);

      grad0 += w * dLdz;
      grad1 += w * dLdz * x;
      loss += w * error * error;
    }

    grad0 += l2Lambda * beta0;
    grad1 += l2Lambda * beta1;
    loss += 0.5 * l2Lambda * (beta0 * beta0 + beta1 * beta1);

    lossHistory.push(loss);

    if (iteration > 0 && Math.abs(lossHistory[iteration - 1] - loss) < convergenceEpsilon) {
      return {
        beta0,
        beta1,
        rankDeltaScale,
        outputRange,
        iterations: iteration + 1,
        finalLoss: loss,
        lossHistory,
      };
    }

    beta0 -= learningRate * grad0;
    beta1 -= learningRate * grad1;
  }

  return {
    beta0,
    beta1,
    rankDeltaScale,
    outputRange,
    iterations: maxIterations,
    finalLoss: lossHistory.at(-1) ?? 0,
    lossHistory,
  };
}

export function buildCalibrationSamples(
  dbPath: string,
  sourceYears: readonly number[],
): CalibrationSample[] {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const sql = `
    SELECT
      id,
      estimated_rank_2025 AS estimatedRank,
      min_rank_2024 AS minRank2024,
      min_rank_2023 AS minRank2023,
      min_rank_2022 AS minRank2022
    FROM programs
    WHERE estimated_rank_2025 IS NOT NULL
  `;
  const rows = db.prepare(sql).all() as {
    id: number;
    estimatedRank: number;
    minRank2024: number | null;
    minRank2023: number | null;
    minRank2022: number | null;
  }[];
  db.close();

  const samples: CalibrationSample[] = [];
  for (const row of rows) {
    for (const year of sourceYears) {
      const minRank =
        year === 2024
          ? row.minRank2024
          : year === 2023
            ? row.minRank2023
            : year === 2022
              ? row.minRank2022
              : null;
      if (minRank === null) continue;

      const rankDeltaStar = minRank - row.estimatedRank;
      samples.push({
        rankDelta: rankDeltaStar - 1,
        admitted: 1,
        year,
        programId: row.id,
      });
      samples.push({
        rankDelta: rankDeltaStar + 1,
        admitted: 0,
        year,
        programId: row.id,
      });
    }
  }
  return samples;
}

export function splitByYear(
  samples: readonly CalibrationSample[],
  testYear: number,
): { train: CalibrationSample[]; test: CalibrationSample[] } {
  const train: CalibrationSample[] = [];
  const test: CalibrationSample[] = [];
  for (const sample of samples) {
    if (sample.year === testYear) {
      test.push(sample);
    } else {
      train.push(sample);
    }
  }
  return { train, test };
}

export function evaluateLogistic(
  samples: readonly CalibrationSample[],
  model: LogisticModel,
): CalibrationMetrics {
  const n = samples.length;
  if (n === 0) {
    return { sampleCount: 0, logLoss: NaN, accuracy: NaN, auc: NaN, calibrationMae: NaN };
  }

  let loss = 0;
  let correct = 0;
  const predictions: { admitted: 0 | 1; probability: number }[] = [];

  for (const sample of samples) {
    const p = predictProbability(sample.rankDelta, model);
    const pSafe = clamp01(p);
    loss -= sample.admitted * Math.log(pSafe) + (1 - sample.admitted) * Math.log(1 - pSafe);
    if ((p >= 0.5 ? 1 : 0) === sample.admitted) {
      correct += 1;
    }
    predictions.push({ admitted: sample.admitted, probability: p });
  }

  const logLoss = loss / n;
  const accuracy = correct / n;
  const auc = computeAuc(predictions);
  const calibrationMae = computeCalibrationMae(predictions, 20);

  return { sampleCount: n, logLoss, accuracy, auc, calibrationMae };
}

function computeAuc(predictions: readonly { admitted: 0 | 1; probability: number }[]): number {
  // Sort ascending by predicted probability so that the highest-probability
  // (most likely admitted) samples receive the largest ranks.
  const sorted = [...predictions].sort((a, b) => a.probability - b.probability);
  const nPos = sorted.filter((p) => p.admitted === 1).length;
  const nNeg = sorted.length - nPos;
  if (nPos === 0 || nNeg === 0) return NaN;

  let rankSum = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i].admitted === 1) {
      rankSum += i + 1;
    }
  }
  return (rankSum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

function computeCalibrationMae(
  predictions: readonly { admitted: 0 | 1; probability: number }[],
  bucketCount: number,
): number {
  const sorted = [...predictions].sort((a, b) => a.probability - b.probability);
  if (sorted.length === 0) return NaN;

  const bucketSize = Math.max(1, Math.floor(sorted.length / bucketCount));
  let totalError = 0;
  let bucketCountActual = 0;

  for (let i = 0; i < sorted.length; i += bucketSize) {
    const bucket = sorted.slice(i, i + bucketSize);
    if (bucket.length === 0) continue;
    const meanPredicted = bucket.reduce((sum, p) => sum + p.probability, 0) / bucket.length;
    const actualRate = bucket.reduce((sum, p) => sum + p.admitted, 0) / bucket.length;
    totalError += Math.abs(meanPredicted - actualRate);
    bucketCountActual += 1;
  }

  return bucketCountActual === 0 ? NaN : totalError / bucketCountActual;
}

export function buildProbabilityBuckets(
  samples: readonly CalibrationSample[],
  model: LogisticModel,
  bucketCount = 20,
): ProbabilityBucket[] {
  const scored = samples.map((s) => ({
    admitted: s.admitted,
    probability: predictProbability(s.rankDelta, model),
  }));
  scored.sort((a, b) => a.probability - b.probability);
  const bucketSize = Math.max(1, Math.floor(scored.length / bucketCount));
  const buckets: ProbabilityBucket[] = [];

  for (let i = 0; i < scored.length; i += bucketSize) {
    const slice = scored.slice(i, i + bucketSize);
    if (slice.length === 0) continue;
    const actualRate = slice.reduce((sum, s) => sum + s.admitted, 0) / slice.length;
    const meanPredicted = slice.reduce((sum, s) => sum + s.probability, 0) / slice.length;
    buckets.push({
      binStart: slice[0].probability,
      binEnd: slice[slice.length - 1].probability,
      count: slice.length,
      actualRate,
      meanPredicted,
    });
  }
  return buckets;
}

export function buildRankDeltaBuckets(
  samples: readonly CalibrationSample[],
  model: LogisticModel,
  bucketCount = 20,
): RankDeltaBucket[] {
  const sorted = [...samples].sort((a, b) => a.rankDelta - b.rankDelta);
  if (sorted.length === 0) return [];
  const bucketSize = Math.max(1, Math.floor(sorted.length / bucketCount));
  const buckets: RankDeltaBucket[] = [];

  for (let i = 0; i < sorted.length; i += bucketSize) {
    const slice = sorted.slice(i, i + bucketSize);
    if (slice.length === 0) continue;
    const actualRate = slice.reduce((sum, s) => sum + s.admitted, 0) / slice.length;
    const predictedRate =
      slice.reduce((sum, s) => sum + predictProbability(s.rankDelta, model), 0) / slice.length;
    buckets.push({
      binStart: slice[0].rankDelta,
      binEnd: slice[slice.length - 1].rankDelta,
      count: slice.length,
      actualRate,
      predictedRate,
    });
  }
  return buckets;
}
