/**
 * Real historical Monte Carlo backtest for GSIO vs baseline.
 *
 * Reads the GSIO/baseline outputs in data/hlj-2026-physics-gsio.json, then for
 * each selected program resamples its observed historical thresholds
 * (2022/2023/2024) with replacement to simulate 2025 admission outcomes.
 *
 * Usage:
 *   npx tsx tools/runRealMonteCarloBacktest.ts \
 *     --config config/paper-sample.json \
 *     --probabilityModel config/calibrated-probability-model.json \
 *     --replicates 1000 \
 *     --output data/monte-carlo-backtest.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadConfig,
  loadProbabilityModel,
  buildCandidates,
  type ProjectedCandidate,
} from "../src/infrastructure/candidateProjection.js";
import { valueForPreference } from "../src/domain/paperTheory.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const RESULT_PATH = path.resolve(PROJECT_ROOT, "data", "hlj-2026-physics-gsio.json");

interface CliArgs {
  configPath: string;
  probabilityModelPath?: string;
  replicates: number;
  outputPath: string;
  seed: number;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const configFlag = argv.indexOf("--config");
  const modelFlag = argv.indexOf("--probabilityModel");
  const replicatesFlag = argv.indexOf("--replicates");
  const outputFlag = argv.indexOf("--output");
  const seedFlag = argv.indexOf("--seed");
  return {
    configPath:
      configFlag === -1 || configFlag + 1 >= argv.length
        ? "config/paper-sample.json"
        : argv[configFlag + 1],
    probabilityModelPath:
      modelFlag === -1 || modelFlag + 1 >= argv.length ? undefined : argv[modelFlag + 1],
    replicates:
      replicatesFlag === -1 || replicatesFlag + 1 >= argv.length
        ? 1000
        : Number(argv[replicatesFlag + 1]),
    outputPath:
      outputFlag === -1 || outputFlag + 1 >= argv.length
        ? "data/monte-carlo-backtest.json"
        : argv[outputFlag + 1],
    seed: seedFlag === -1 || seedFlag + 1 >= argv.length ? 20260711 : Number(argv[seedFlag + 1]),
  };
}

interface GaokaoResult {
  preference: readonly number[];
  slotCount: number;
  gsio: { selectedIds: string[]; order: string[]; utility: number };
  baseline: { selectedIds: string[]; order: string[]; utility: number };
}

function loadResult(): GaokaoResult {
  return JSON.parse(readFileSync(RESULT_PATH, "utf-8")) as GaokaoResult;
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

interface HistoricalThresholds {
  programId: number;
  thresholds: number[];
}

function loadHistoricalThresholds(
  dbPath: string,
  programIds: readonly string[],
): Map<string, HistoricalThresholds> {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const sql = `
    SELECT
      id,
      min_rank_2022 AS minRank2022,
      min_rank_2023 AS minRank2023,
      min_rank_2024 AS minRank2024
    FROM programs
    WHERE id IN (${programIds.map(() => "?").join(",")})
  `;
  const rows = db.prepare(sql).all(...programIds.map(Number)) as {
    id: number;
    minRank2022: number | null;
    minRank2023: number | null;
    minRank2024: number | null;
  }[];
  db.close();

  const map = new Map<string, HistoricalThresholds>();
  for (const row of rows) {
    const thresholds = [row.minRank2022, row.minRank2023, row.minRank2024].filter(
      (x): x is number => x !== null,
    );
    map.set(String(row.id), { programId: row.id, thresholds });
  }
  return map;
}

function runReplicate(
  methodIds: readonly string[],
  candidateMap: Map<string, ProjectedCandidate>,
  thresholdsByProgram: Map<string, HistoricalThresholds>,
  studentRank: number,
  preference: readonly number[],
  random: () => number,
): { admittedIds: string[]; utility: number } {
  const admittedIds: string[] = [];
  for (const id of methodIds) {
    const thresholds = thresholdsByProgram.get(id)?.thresholds ?? [];
    if (thresholds.length === 0) continue;
    const sampled = thresholds[Math.floor(random() * thresholds.length)];
    if (studentRank <= sampled) {
      admittedIds.push(id);
    }
  }

  for (const id of methodIds) {
    if (admittedIds.includes(id)) {
      const candidate = candidateMap.get(id);
      if (candidate) {
        return { admittedIds, utility: valueForPreference(candidate, preference) };
      }
    }
  }
  return { admittedIds, utility: 0 };
}

interface MethodBacktest {
  method: string;
  selectedCount: number;
  meanAdmittedCount: number;
  stdAdmittedCount: number;
  meanUtility: number;
  stdUtility: number;
  admissionRateByProgram: { programId: string; rate: number }[];
}

function backtestMethod(
  methodName: string,
  methodIds: readonly string[],
  candidateMap: Map<string, ProjectedCandidate>,
  thresholdsByProgram: Map<string, HistoricalThresholds>,
  studentRank: number,
  preference: readonly number[],
  replicates: number,
  random: () => number,
): MethodBacktest {
  const admittedCounts: number[] = [];
  const utilities: number[] = [];
  const admitCountsByProgram = new Map<string, number>();
  for (const id of methodIds) {
    admitCountsByProgram.set(id, 0);
  }

  for (let i = 0; i < replicates; i += 1) {
    const { admittedIds, utility } = runReplicate(
      methodIds,
      candidateMap,
      thresholdsByProgram,
      studentRank,
      preference,
      random,
    );
    admittedCounts.push(admittedIds.length);
    utilities.push(utility);
    for (const id of admittedIds) {
      admitCountsByProgram.set(id, (admitCountsByProgram.get(id) ?? 0) + 1);
    }
  }

  const mean = (arr: number[]): number => arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = (arr: number[]): number => {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / arr.length);
  };

  return {
    method: methodName,
    selectedCount: methodIds.length,
    meanAdmittedCount: mean(admittedCounts),
    stdAdmittedCount: std(admittedCounts),
    meanUtility: mean(utilities),
    stdUtility: std(utilities),
    admissionRateByProgram: methodIds.map((id) => ({
      programId: id,
      rate: (admitCountsByProgram.get(id) ?? 0) / replicates,
    })),
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const baseConfig = loadConfig(args.configPath);
  const probabilityModel = args.probabilityModelPath
    ? loadProbabilityModel(args.probabilityModelPath)
    : baseConfig.probabilityModel;
  const config = { ...baseConfig, probabilityModel };

  const candidates = buildCandidates(config);
  if (candidates.length === 0) {
    throw new Error("No eligible candidates found.");
  }
  const candidateMap = new Map(candidates.map((c) => [c.id, c]));

  const result = loadResult();
  const allIds = Array.from(new Set([...result.gsio.selectedIds, ...result.baseline.selectedIds]));
  const thresholdsByProgram = loadHistoricalThresholds(config.dataPaths.db, allIds);

  const random = lcg(args.seed);

  const gsio = backtestMethod(
    "GSIO",
    result.gsio.order,
    candidateMap,
    thresholdsByProgram,
    config.student.rank,
    result.preference,
    args.replicates,
    random,
  );
  const baseline = backtestMethod(
    "Baseline",
    result.baseline.order,
    candidateMap,
    thresholdsByProgram,
    config.student.rank,
    result.preference,
    args.replicates,
    random,
  );

  const output = {
    studentRank: config.student.rank,
    replicates: args.replicates,
    seed: args.seed,
    gsio,
    baseline,
  };

  writeFileSync(args.outputPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
}

main();
