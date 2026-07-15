/**
 * Ingest a real Gaokao sample from the staging SQLite database and run the
 * paper-official GSIO optimizer.
 *
 * All input data (student profile, preference vector, scoring constants) is read
 * from an external config file. Run with:
 *   npx tsx tools/ingestGaokaoSample.ts --config config/paper-sample.json
 */

import {
  greedySubmodularOptimization,
  transparentBaselineSelection,
  evaluateSequence,
  safetyProbability,
  neutralQuality,
} from "../src/domain/paperTheory.js";
import {
  loadConfig,
  loadProbabilityModel,
  buildCandidates,
  loadOnePointSegment,
  totalRankedFromOnePoint,
  type ProjectedCandidate,
  type PaperSampleConfig,
} from "../src/infrastructure/candidateProjection.js";
import { loadScoringDefaults } from "../src/infrastructure/scoringDefaults.js";

function parseArgs(argv: readonly string[]): { configPath: string; probabilityModelPath?: string } {
  const configFlag = argv.indexOf("--config");
  const modelFlag = argv.indexOf("--probabilityModel");
  return {
    configPath:
      configFlag === -1 || configFlag + 1 >= argv.length
        ? "config/paper-sample.json"
        : argv[configFlag + 1],
    probabilityModelPath:
      modelFlag === -1 || modelFlag + 1 >= argv.length ? undefined : argv[modelFlag + 1],
  };
}

interface IngestResult {
  student: PaperSampleConfig["student"] & { totalRanked: number };
  preference: readonly number[];
  slotCount: number;
  candidateCount: number;
  gsio: {
    selectedIds: string[];
    order: string[];
    utility: number;
    safety: number;
    neutralQuality: number;
  };
  baseline: {
    selectedIds: string[];
    order: string[];
    utility: number;
    safety: number;
    neutralQuality: number;
  };
}

function runOptimization(
  candidates: ProjectedCandidate[],
  config: PaperSampleConfig,
  probabilityBuckets: ReturnType<typeof loadScoringDefaults>["probabilityBuckets"],
): IngestResult {
  const { slotCount, preferencePi } = config.optimization;

  const gsio = greedySubmodularOptimization(candidates, slotCount, preferencePi);
  const baselineIds = transparentBaselineSelection(candidates, slotCount, probabilityBuckets);

  const onePoint = loadOnePointSegment(config);
  const totalRanked = totalRankedFromOnePoint(onePoint) || 109_811;

  return {
    student: { ...config.student, totalRanked },
    preference: preferencePi,
    slotCount,
    candidateCount: candidates.length,
    gsio: {
      selectedIds: gsio.selectedIds,
      order: gsio.order,
      utility: gsio.utility,
      safety: safetyProbability(gsio.order, candidates),
      neutralQuality: neutralQuality(gsio.order, candidates, preferencePi),
    },
    baseline: {
      selectedIds: baselineIds,
      order: baselineIds,
      utility: evaluateSequence(baselineIds, candidates, preferencePi),
      safety: safetyProbability(baselineIds, candidates),
      neutralQuality: neutralQuality(baselineIds, candidates, preferencePi),
    },
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const baseConfig = loadConfig(args.configPath);
  const scoringDefaults = loadScoringDefaults();
  const probabilityModel = args.probabilityModelPath
    ? loadProbabilityModel(args.probabilityModelPath)
    : baseConfig.probabilityModel;
  const config = { ...baseConfig, probabilityModel };
  const candidates = buildCandidates(config);

  if (candidates.length === 0) {
    throw new Error("No eligible candidates found for the student profile.");
  }

  const result = runOptimization(candidates, config, scoringDefaults.probabilityBuckets);
  console.log(JSON.stringify(result, null, 2));
}

main();
