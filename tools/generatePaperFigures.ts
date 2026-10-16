/**
 * Generate figures, tables, and chart data for the BSAA/GSIO paper.
 *
 * Reads:
 *   - config/paper-sample.json            (student profile + scoring constants)
 *   - data/gaokao.bsaa.sqlite             (program metadata)
 *   - data/hlj-2026-physics-gsio.json     (GSIO and baseline outputs)
 *
 * Writes to docs/figures/:
 *   - fig2_selection_scatter.{vl.json,svg,data.json}
 *   - fig3_pareto_frontier.{vl.json,svg,data.json}
 *   - fig4_sensitivity.{vl.json,svg,data.json}
 *   - fig5_approximation.{vl.json,svg,data.json}
 *   - fig6_marginal_gain.{vl.json,svg,data.json}
 *   - table2_preference_sweep.json
 *   - table3_verification_summary.json
 *
 * Usage:
 *   npx tsx tools/generatePaperFigures.ts --config config/paper-sample.json
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as vega from "vega";
import * as vegaLite from "vega-lite";
import {
  greedySubmodularOptimization,
  valueForPreference,
  evaluateSequence,
  safetyProbability,
  neutralQuality,
  sampleSimplexWeights,
  buildParametricParetoFrontier,
  transparentBaselineSelection,
  verifyApproximationRatio,
  runPaperVerificationSuite,
} from "../src/domain/paperTheory.js";
import {
  loadConfig,
  loadProbabilityModel,
  buildCandidates,
  selectRankSubset,
  type ProjectedCandidate,
} from "../src/infrastructure/candidateProjection.js";
import {
  loadScoringDefaults,
  type ProbabilityBuckets,
} from "../src/infrastructure/scoringDefaults.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const FIGURES_DIR = path.resolve(PROJECT_ROOT, "docs", "figures");
mkdirSync(FIGURES_DIR, { recursive: true });

const RESULT_PATH = path.resolve(PROJECT_ROOT, "data", "hlj-2026-physics-gsio.json");

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

interface GaokaoResult {
  student: {
    rank: number;
  };
  candidateCount: number;
  slotCount: number;
  preference: readonly number[];
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

async function renderVegaLite(spec: vegaLite.TopLevelSpec, outputPath: string): Promise<void> {
  const vgSpec = vegaLite.compile(spec).spec;
  const view = new vega.View(vega.parse(vgSpec), { renderer: "none" });
  const svg = await view.toSVG();
  writeFileSync(outputPath, svg);
}

function writeJson(filename: string, data: unknown): void {
  writeFileSync(path.resolve(FIGURES_DIR, filename), JSON.stringify(data, null, 2));
}

function buildFigure2Scatter(result: GaokaoResult, candidates: ProjectedCandidate[]): void {
  const pi = result.preference;
  const values: { probability: number; value: number; method: string; selected: boolean }[] = [];

  for (const candidate of candidates) {
    const inGsio = result.gsio.selectedIds.includes(candidate.id);
    const inBaseline = result.baseline.selectedIds.includes(candidate.id);
    const value = valueForPreference(candidate, pi);
    values.push(
      { probability: candidate.probability, value, method: "GSIO", selected: inGsio },
      { probability: candidate.probability, value, method: "Baseline", selected: inBaseline },
    );
  }

  const data = values.filter((v) => v.selected);
  writeJson("fig2_selection_scatter_data.json", data);

  const spec: vegaLite.TopLevelSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    title: "Selected programs by admission probability and path value",
    width: 400,
    height: 300,
    data: { values: data },
    mark: { type: "point", filled: true, opacity: 0.7 },
    encoding: {
      x: { field: "probability", type: "quantitative", title: "Admission probability p_c" },
      y: { field: "value", type: "quantitative", title: "Path value v_c(π)" },
      color: { field: "method", type: "nominal", title: "Method" },
      shape: { field: "method", type: "nominal" },
    },
  };
  writeJson("fig2_selection_scatter.vl.json", spec);
  renderVegaLite(spec, path.resolve(FIGURES_DIR, "fig2_selection_scatter.svg"));
}

async function buildFigure3Pareto(
  candidates: ProjectedCandidate[],
  config: ReturnType<typeof loadConfig>,
): Promise<void> {
  const pareto = config.figures.pareto;
  const headBudget = 1 - pareto.fixedTail.reduce((a, b) => a + b, 0);
  const simplexWeights = sampleSimplexWeights(pareto.dimensions, pareto.gridSteps).filter(
    (w) => w.reduce((a, b) => a + b, 0) > 1e-6,
  );
  const weights7d = simplexWeights.map((w) => {
    const raw = [w[0] * headBudget, w[1] * headBudget, w[2] * headBudget, ...pareto.fixedTail];
    const clamped = raw.map((x) => Math.max(0, x));
    const sum = clamped.reduce((a, b) => a + b, 0);
    return clamped.map((x) => x / sum);
  });

  const { frontier } = buildParametricParetoFrontier(
    candidates.slice(0, pareto.candidateCount),
    pareto.capacity,
    weights7d,
  );

  const values = frontier.map((point, index) => ({
    index,
    objective0: point.objectiveVector[0] ?? 0,
    objective1: point.objectiveVector[1] ?? 0,
    objective2: point.objectiveVector[2] ?? 0,
    selectedCount: point.selectedIds.length,
  }));
  writeJson("fig3_pareto_frontier_data.json", values);

  const spec: vegaLite.TopLevelSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    title: "Parametric Pareto frontier (3 objective projections)",
    width: 250,
    height: 250,
    data: { values },
    repeat: { column: ["objective1", "objective2"], row: ["objective0", "objective1"] },
    spec: {
      mark: { type: "point", filled: true, color: "#2563eb" },
      encoding: {
        x: { field: { repeat: "column" }, type: "quantitative" },
        y: { field: { repeat: "row" }, type: "quantitative" },
      },
    },
  };
  writeJson("fig3_pareto_frontier.vl.json", spec);
  await renderVegaLite(spec, path.resolve(FIGURES_DIR, "fig3_pareto_frontier.svg"));
}

async function buildFigure4Sensitivity(
  candidates: ProjectedCandidate[],
  config: ReturnType<typeof loadConfig>,
): Promise<void> {
  const sensitivity = config.figures.sensitivity;
  const basePi = [...config.optimization.preferencePi];
  const records: { metric: string; value: number }[] = [];
  const random = lcg(sensitivity.seed);

  for (let t = 0; t < sensitivity.trials; t += 1) {
    const perturbed = basePi.map((w) =>
      Math.max(0.01, w + (random() - 0.5) * sensitivity.perturbation),
    );
    const sum = perturbed.reduce((a, b) => a + b, 0);
    const pi = perturbed.map((w) => w / sum);
    const plan = greedySubmodularOptimization(candidates, sensitivity.capacity, pi);
    records.push({ metric: "Utility", value: plan.utility });
    records.push({ metric: "Safety", value: safetyProbability(plan.order, candidates) });
  }

  writeJson("fig4_sensitivity_data.json", records);

  const spec: vegaLite.TopLevelSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    title: "Sensitivity to ±5% preference perturbations",
    width: 400,
    height: 300,
    data: { values: records },
    mark: { type: "boxplot", extent: 1.5 },
    encoding: {
      x: { field: "metric", type: "nominal", title: "Metric" },
      y: { field: "value", type: "quantitative", title: "Value" },
      color: { field: "metric", type: "nominal", legend: null },
    },
  };
  writeJson("fig4_sensitivity.vl.json", spec);
  await renderVegaLite(spec, path.resolve(FIGURES_DIR, "fig4_sensitivity.svg"));
}

async function buildFigure5Approximation(
  _candidates: ProjectedCandidate[],
  config: ReturnType<typeof loadConfig>,
): Promise<void> {
  const approx = config.figures.approximation;
  const records: { N: number; ratio: number; bound: number }[] = [];
  const bound = 1 - 1 / Math.E;
  const random = lcg(approx.seed);

  for (const N of approx.Ns) {
    for (let trial = 0; trial < approx.trialsPerN; trial += 1) {
      const subset = Array.from({ length: N }, (_, i) => ({
        id: `c${trial}_${N}_${i}`,
        probability: random() * 0.9 + 0.05,
        prototypeValues: [random() * 10],
      }));
      const capacity = Math.min(3, N);
      const result = verifyApproximationRatio(subset, Math.min(capacity, N - 1), [1]);
      if (result.ok && result.counterExample) {
        records.push({ N, ratio: result.counterExample.ratio, bound });
      }
    }
  }

  writeJson("fig5_approximation_data.json", records);

  const spec: vegaLite.TopLevelSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    title: "Greedy-to-optimal ratio vs instance size",
    width: 400,
    height: 300,
    data: { values: records },
    layer: [
      {
        mark: { type: "point", opacity: 0.5 },
        encoding: {
          x: { field: "N", type: "ordinal", title: "Candidate count N" },
          y: {
            field: "ratio",
            type: "quantitative",
            title: "Greedy / optimal ratio",
            scale: { domain: [0.5, 1.05] },
          },
          color: { value: "#2563eb" },
        },
      },
      {
        mark: { type: "rule", color: "red", strokeDash: [4, 4] },
        encoding: { y: { field: "bound", type: "quantitative" } },
      },
    ],
  };
  writeJson("fig5_approximation.vl.json", spec);
  await renderVegaLite(spec, path.resolve(FIGURES_DIR, "fig5_approximation.svg"));
}

async function buildFigure6MarginalGain(
  candidates: ProjectedCandidate[],
  config: ReturnType<typeof loadConfig>,
): Promise<void> {
  const mg = config.figures.marginalGain;
  const subset = candidates.slice(0, mg.candidateCount);
  const pi = config.optimization.preferencePi;
  const plan = greedySubmodularOptimization(subset, mg.capacity, pi);
  const gains = plan.trace
    .filter((line) => line.includes(":gain_"))
    .map((line, index) => {
      const match = /gain_([\d.e+-]+)/.exec(line);
      return { step: index + 1, gain: match ? Number(match[1]) : 0 };
    });

  writeJson("fig6_marginal_gain_data.json", gains);

  const spec: vegaLite.TopLevelSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    title: "Greedy marginal gain decay (GSIO)",
    width: 400,
    height: 300,
    data: { values: gains },
    mark: { type: "line", point: true },
    encoding: {
      x: { field: "step", type: "quantitative", title: "Greedy step" },
      y: { field: "gain", type: "quantitative", title: "Marginal gain Δ(e|S)" },
    },
  };
  writeJson("fig6_marginal_gain.vl.json", spec);
  await renderVegaLite(spec, path.resolve(FIGURES_DIR, "fig6_marginal_gain.svg"));
}

function buildTable2PreferenceSweep(
  candidates: ProjectedCandidate[],
  config: ReturnType<typeof loadConfig>,
  probabilityBuckets: ProbabilityBuckets,
): void {
  const capacity = config.figures.preferenceSweep.capacity;
  const profiles = config.figures.preferenceSweepProfiles;

  const rows = profiles.map(({ name, pi }) => {
    const plan = greedySubmodularOptimization(candidates, capacity, pi);
    const baselineIds = transparentBaselineSelection(candidates, capacity, probabilityBuckets);
    const baselineUtility = evaluateSequence(baselineIds, candidates, pi);
    return {
      profile: name,
      utility: Number(plan.utility.toFixed(4)),
      safety: Number(safetyProbability(plan.order, candidates).toFixed(4)),
      neutralQuality: Number(neutralQuality(plan.order, candidates, pi).toFixed(4)),
      gainOverBaseline: Number(
        (((plan.utility - baselineUtility) / baselineUtility) * 100).toFixed(1),
      ),
    };
  });

  writeJson("table2_preference_sweep.json", rows);
}

function buildTable3Verification(config: ReturnType<typeof loadConfig>): void {
  const verification = config.figures.verification;
  const result = runPaperVerificationSuite({
    seed: verification.seed,
    trials: verification.trials,
  });
  const approx = verifyApproximationRatio(
    [
      { id: "a", probability: 0.9, prototypeValues: [10] },
      { id: "b", probability: 0.8, prototypeValues: [9] },
      { id: "c", probability: 0.5, prototypeValues: [7] },
      { id: "d", probability: 0.4, prototypeValues: [6] },
    ],
    2,
    [1],
  );

  const rows = [
    {
      theorem: "Value-Index (Thm 4.1)",
      status: result.valueIndex.ok ? "Pass" : "Fail",
      trials: "exhaustive N≤8 + 100 random",
      note: result.valueIndex.message,
    },
    {
      theorem: "Submodularity (Thm 4.3)",
      status: result.submodularity.ok ? "Pass" : "Fail",
      trials: "exhaustive N≤6 + 100 random",
      note: result.submodularity.message,
    },
    {
      theorem: "Greedy exactness (Thm 4.4)",
      status: result.approximationRatio.ok ? "Pass" : "Fail",
      trials: "100 random + hand-checked N=4,n=2",
      note: `${approx.counterExample?.ratio.toFixed(4)} ≥ ${(1 - 1 / Math.E).toFixed(4)}`,
    },
  ];

  writeJson("table3_verification_summary.json", rows);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const baseConfig = loadConfig(args.configPath);
  const scoringDefaults = loadScoringDefaults();
  const probabilityModel = args.probabilityModelPath
    ? loadProbabilityModel(args.probabilityModelPath)
    : baseConfig.probabilityModel;
  const config = { ...baseConfig, probabilityModel };
  const result = loadResult();
  const candidates = buildCandidates(config);
  console.log(`Loaded ${candidates.length} candidates from DB`);

  buildFigure2Scatter(result, candidates);
  console.log("Figure 2: selection scatter");

  const subset = selectRankSubset(candidates, config);
  await buildFigure3Pareto(subset, config);
  console.log("Figure 3: Pareto frontier");

  await buildFigure4Sensitivity(candidates, config);
  console.log("Figure 4: sensitivity");

  await buildFigure5Approximation(subset, config);
  console.log("Figure 5: approximation ratio");

  await buildFigure6MarginalGain(subset, config);
  console.log("Figure 6: marginal gain");

  buildTable2PreferenceSweep(subset, config, scoringDefaults.probabilityBuckets);
  console.log("Table 2: preference sweep");

  buildTable3Verification(config);
  console.log("Table 3: verification summary");
}

main();
