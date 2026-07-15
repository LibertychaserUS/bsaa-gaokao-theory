/**
 * Calibrate the admission probability model from historical Gaokao thresholds.
 *
 * Usage:
 *   npx tsx tools/calibrateProbabilityModel.ts \
 *     --config config/paper-sample.json \
 *     --output config/calibrated-probability-model.json
 *
 * The output can be passed back into the pipeline via
 *   --probabilityModel config/calibrated-probability-model.json
 */

import { writeFileSync } from "node:fs";
import {
  buildCalibrationSamples,
  buildProbabilityBuckets,
  buildRankDeltaBuckets,
  buildResiduals,
  evaluateLogistic,
  evaluateRealisticAdmissionMetrics,
  fitLogisticToSurvival,
  splitByYear,
  type LogisticModel,
} from "../src/infrastructure/probabilityCalibration.js";
import { loadConfig } from "../src/infrastructure/candidateProjection.js";

interface CliArgs {
  configPath: string;
  outputPath: string;
  trainYears: number[];
  testYear: number;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const configPath = flagValue(argv, "--config") ?? "config/paper-sample.json";
  const outputPath = flagValue(argv, "--output") ?? "config/calibrated-probability-model.json";
  const yearsArg = flagValue(argv, "--trainYears");
  const testYearArg = flagValue(argv, "--testYear");
  return {
    configPath,
    outputPath,
    trainYears: yearsArg ? yearsArg.split(",").map(Number) : [2022, 2023],
    testYear: testYearArg ? Number(testYearArg) : 2024,
  };
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1 || index + 1 >= argv.length) return undefined;
  return argv[index + 1];
}

interface CalibrationOutput {
  probabilityModel: {
    kind: "logistic";
    beta0: number;
    beta1: number;
    rankDeltaScale: number;
    outputRange: [number, number];
  };
  metrics: {
    train: ReturnType<typeof evaluateLogistic>;
    test: ReturnType<typeof evaluateLogistic>;
    realistic: ReturnType<typeof evaluateRealisticAdmissionMetrics>;
  };
  buckets: {
    byProbability: ReturnType<typeof buildProbabilityBuckets>;
    byRankDelta: ReturnType<typeof buildRankDeltaBuckets>;
  };
  trainingOptions: {
    learningRate: number;
    maxIterations: number;
    l2Lambda: number;
    convergenceEpsilon: number;
    rankDeltaScale: number;
    outputRange: readonly [number, number];
    gridPoints: number;
  };
}

function formatModel(model: LogisticModel): CalibrationOutput["probabilityModel"] {
  return {
    kind: "logistic",
    beta0: Number(model.beta0.toFixed(6)),
    beta1: Number(model.beta1.toFixed(6)),
    rankDeltaScale: model.rankDeltaScale,
    outputRange: [...model.outputRange] as [number, number],
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig(args.configPath);
  const dbPath = config.dataPaths.db;

  const trainResiduals = buildResiduals(dbPath, args.trainYears);
  if (trainResiduals.length === 0) {
    throw new Error("No training residuals could be built. Check historical min_rank data.");
  }

  const options = {
    learningRate: 2.0,
    maxIterations: 2000,
    l2Lambda: 0.0001,
    convergenceEpsilon: 1e-9,
    rankDeltaScale: 10000,
    outputRange: [0.001, 0.999] as const,
    gridPoints: 200,
  };

  console.error(`Fitting survival curve on ${trainResiduals.length.toLocaleString()} residuals...`);
  const model = fitLogisticToSurvival(trainResiduals, options);
  console.error(
    `Converged after ${model.iterations} iterations. Final loss: ${model.finalLoss.toFixed(6)}`,
  );

  const allSamples = buildCalibrationSamples(dbPath, [...args.trainYears, args.testYear]);
  const { train, test } = splitByYear(allSamples, args.testYear);

  const trainMetrics = evaluateLogistic(train, model);
  const testMetrics = evaluateLogistic(test, model);

  console.error("Computing realistic admission metrics from one-point-segment distribution...");
  const realisticMetrics = evaluateRealisticAdmissionMetrics(
    config.dataPaths.onePointSegment,
    dbPath,
    args.testYear,
    model,
    500_000,
    20260711,
  );
  console.error(
    `Realistic metrics: logLoss=${realisticMetrics.logLoss.toFixed(4)}, accuracy=${realisticMetrics.accuracy.toFixed(4)}, auc=${realisticMetrics.auc.toFixed(4)}, calibrationMae=${realisticMetrics.calibrationMae.toFixed(4)}`,
  );

  const output: CalibrationOutput = {
    probabilityModel: formatModel(model),
    metrics: {
      train: trainMetrics,
      test: testMetrics,
      realistic: realisticMetrics,
    },
    buckets: {
      byProbability: buildProbabilityBuckets(test, model, 20),
      byRankDelta: buildRankDeltaBuckets(test, model, 20),
    },
    trainingOptions: options,
  };

  writeFileSync(args.outputPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
}

main();
