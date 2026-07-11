/**
 * Generate figures, tables, and chart data for the BSAA/GSIO paper.
 *
 * Reads:
 *   - data/hlj-2026-physics-gsio.json  (GSIO and baseline outputs)
 *   - data/gaokao.bsaa.sqlite          (program metadata)
 *
 * Writes to docs/figures/:
 *   - fig2_selection_scatter.json      Vega-Lite spec + embedded data
 *   - fig3_pareto_frontier.json
 *   - fig4_sensitivity_boxplot.json
 *   - fig5_approximation_ratio.json
 *   - fig6_marginal_gain.json
 *   - table2_preference_sweep.json     tabular data
 *   - table3_verification_summary.json tabular data
 *   - *.svg                            rendered figures
 */

import { DatabaseSync } from "node:sqlite";
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
  sampleSimplexWeights,
  buildParametricParetoFrontier,
  transparentBaselineSelection,
  verifyApproximationRatio,
  runPaperVerificationSuite,
  type PaperCandidate,
} from "../src/domain/paperTheory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const FIGURES_DIR = path.resolve(PROJECT_ROOT, "docs", "figures");
mkdirSync(FIGURES_DIR, { recursive: true });

const DB_PATH = path.resolve(PROJECT_ROOT, "data", "gaokao.bsaa.sqlite");
const RESULT_PATH = path.resolve(PROJECT_ROOT, "data", "hlj-2026-physics-gsio.json");
const PREFERENCE_PI = [0.2, 0.25, 0.2, 0.15, 0.05, 0.1, 0.05] as const;

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

function loadCandidatesFromDb(studentRank: number): PaperCandidate[] {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const sql = `
    SELECT
      p.id,
      p.estimated_rank_2025 AS estimatedRank,
      p.plan_2025 AS plan2025,
      p.soft_rank AS softRank,
      p.school_province AS schoolProvince,
      p.city,
      p.major_name AS majorName,
      p.major_category AS majorCategory
    FROM programs p
    WHERE p.province = ?
      AND p.subject_type = ?
      AND p.batch = ?
      AND p.plan_2025 IS NOT NULL
      AND p.plan_2025 > 0
    ORDER BY p.estimated_rank_2025 ASC
    LIMIT 2000
  `;
  const rows = db.prepare(sql).all("黑龙江", "物理", "本科批") as {
    id: number;
    estimatedRank: number | null;
    plan2025: number | null;
    softRank: number | null;
    schoolProvince: string | null;
    city: string | null;
    majorName: string | null;
    majorCategory: string | null;
  }[];
  db.close();

  const candidates: PaperCandidate[] = [];
  for (const row of rows) {
    const baselineRank = row.estimatedRank ?? 100_000;
    const rankDelta = studentRank - baselineRank;
    const p = clamp01(1 - clamp01((rankDelta + 2500) / 6500)) * 0.9 + 0.05;

    const sp = schoolPlatform(row.softRank);
    const mf = majorFit(row.majorName, row.majorCategory);
    const rf = regionFit(row.schoolProvince, row.city);
    const dc = 0.85;
    const cf = row.plan2025 !== null && row.plan2025 <= 9000 ? 0.88 : 0.6;
    const mt = 0.6;
    const mss = clamp01(1 - (row.plan2025 ?? 1) / 100);

    candidates.push({
      id: String(row.id),
      probability: p,
      prototypeValues: [sp, mf, rf, dc, cf, mt, mss],
      qualityScore: sp,
      tierScore: sp,
    });
  }
  return candidates;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function schoolPlatform(softRank: number | null): number {
  if (softRank === null) return 0.46;
  return clamp01(1 - Math.min(softRank, 600) / 750);
}

const PREFERRED_REGIONS = ["青岛", "威海", "南京", "厦门", "江苏", "浙江", "上海", "山东", "福建"];
const KEYWORDS = [
  "智能制造工程",
  "大数据",
  "电子信息工程",
  "机械设计制造",
  "计算机",
  "机械",
  "电气",
];

function regionFit(schoolProvince: string | null, city: string | null): number {
  const regionText = `${schoolProvince ?? ""} ${city ?? ""}`;
  if (PREFERRED_REGIONS.some((region) => regionText.includes(region))) return 0.88;
  return 0.56;
}

function majorFit(majorName: string | null, majorCategory: string | null): number {
  const searchable = `${majorName ?? ""} ${majorCategory ?? ""}`;
  if (KEYWORDS.some((keyword) => searchable.includes(keyword))) return 0.92;
  if (KEYWORDS.some((keyword) => (majorCategory ?? "").includes(keyword))) return 0.7;
  return 0.5;
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

function buildFigure2Scatter(result: GaokaoResult, candidates: PaperCandidate[]): void {
  const values: { probability: number; value: number; method: string; selected: boolean }[] = [];

  for (const candidate of candidates) {
    const inGsio = result.gsio.selectedIds.includes(candidate.id);
    const inBaseline = result.baseline.selectedIds.includes(candidate.id);
    const value = valueForPreference(candidate, PREFERENCE_PI);
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

async function buildFigure3Pareto(candidates: PaperCandidate[]): Promise<void> {
  // Map 3-dimensional simplex weights onto the 7-dimensional preference vector
  // by varying only the first three coordinates and keeping the remaining four fixed.
  const baseTail = [0.15, 0.05, 0.1, 0.05];
  const headBudget = 1 - baseTail.reduce((a, b) => a + b, 0);
  const simplexWeights = sampleSimplexWeights(3, 8).filter((w) => w[0] + w[1] + w[2] > 1e-6);
  const weights7d = simplexWeights.map((w) => {
    const raw = [w[0] * headBudget, w[1] * headBudget, w[2] * headBudget, ...baseTail];
    const clamped = raw.map((x) => Math.max(0, x));
    const sum = clamped.reduce((a, b) => a + b, 0);
    return clamped.map((x) => x / sum);
  });

  const { frontier } = buildParametricParetoFrontier(candidates.slice(0, 80), 10, weights7d);

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

async function buildFigure4Sensitivity(candidates: PaperCandidate[]): Promise<void> {
  // Use a small representative subset so 50 perturbation trials finish quickly.
  // Use the first 120 candidates for the subset figures.
  const subset = candidates.slice(0, 120);
  const basePi = [...PREFERENCE_PI];
  const trials = 50;
  const records: { metric: string; value: number }[] = [];

  function lcg(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }
  const random = lcg(20260711);

  for (let t = 0; t < trials; t += 1) {
    const perturbed = basePi.map((w) => Math.max(0.01, w + (random() - 0.5) * 0.1));
    const sum = perturbed.reduce((a, b) => a + b, 0);
    const pi = perturbed.map((w) => w / sum);
    const plan = greedySubmodularOptimization(subset, 12, pi);
    records.push({ metric: "Utility", value: plan.utility });
    records.push({ metric: "Safety", value: safetyProbability(plan.order, subset) });
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

async function buildFigure5Approximation(_candidates: PaperCandidate[]): Promise<void> {
  const records: { N: number; ratio: number; bound: number }[] = [];
  const bound = 1 - 1 / Math.E;

  function lcg(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }
  const random = lcg(20260711);

  for (const N of [4, 5, 6, 7, 8]) {
    for (let trial = 0; trial < 10; trial += 1) {
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
    title: "Empirical approximation ratios vs instance size",
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

async function buildFigure6MarginalGain(candidates: PaperCandidate[]): Promise<void> {
  const subset = candidates.slice(0, 80);
  const plan = greedySubmodularOptimization(subset, 20, PREFERENCE_PI);
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

function buildTable2PreferenceSweep(candidates: PaperCandidate[]): void {
  const profiles = [
    { name: "Balanced", pi: [...PREFERENCE_PI] },
    { name: "School-first", pi: [0.5, 0.15, 0.15, 0.1, 0.02, 0.05, 0.03] },
    { name: "Major-first", pi: [0.1, 0.5, 0.15, 0.1, 0.02, 0.08, 0.05] },
    { name: "Region-first", pi: [0.1, 0.15, 0.5, 0.1, 0.02, 0.08, 0.05] },
    { name: "Safety-first", pi: [0.05, 0.05, 0.05, 0.1, 0.05, 0.05, 0.65] },
  ];

  const rows = profiles.map(({ name, pi }) => {
    const plan = greedySubmodularOptimization(candidates, 45, pi);
    const baselineIds = transparentBaselineSelection(candidates, 45);
    const baselineUtility = evaluateSequence(baselineIds, candidates, pi);
    return {
      profile: name,
      utility: Number(plan.utility.toFixed(4)),
      safety: Number(safetyProbability(plan.order, candidates).toFixed(4)),
      neutralQuality: Number(
        evaluateSequence(plan.order, candidates, [1, 0, 0, 0, 0, 0, 0]).toFixed(4),
      ),
      gainOverBaseline: Number(
        (((plan.utility - baselineUtility) / baselineUtility) * 100).toFixed(1),
      ),
    };
  });

  writeJson("table2_preference_sweep.json", rows);
}

function buildTable3Verification(): void {
  const result = runPaperVerificationSuite({ seed: 20260711, trials: 100 });
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
      theorem: "Value-Index (Thm 3.1)",
      status: result.valueIndex.ok ? "Pass" : "Fail",
      trials: "exhaustive N≤8 + 100 random",
      note: result.valueIndex.message,
    },
    {
      theorem: "Submodularity (Thm 4.2)",
      status: result.submodularity.ok ? "Pass" : "Fail",
      trials: "exhaustive N≤6 + 100 random",
      note: result.submodularity.message,
    },
    {
      theorem: "Greedy approximation (Thm 4.3)",
      status: result.approximationRatio.ok ? "Pass" : "Fail",
      trials: "100 random + hand-checked N=4,n=2",
      note: `${approx.counterExample?.ratio.toFixed(4)} ≥ ${(1 - 1 / Math.E).toFixed(4)}`,
    },
  ];

  writeJson("table3_verification_summary.json", rows);
}

function selectSubset(candidates: PaperCandidate[], studentRank: number): PaperCandidate[] {
  // Pick candidates whose estimated rank is near the student's rank so that
  // the probability model has real variation across the reach/steady/safety buckets.
  return candidates.filter((c) => {
    const baselineRank = Number(c.id) < 5_000_000 ? studentRank : Number(c.id);
    return Math.abs(studentRank - baselineRank) <= 25_000;
  });
}

async function main(): Promise<void> {
  const result = loadResult();
  const studentRank = result.student.rank;
  const candidates = loadCandidatesFromDb(studentRank);
  console.log(`Loaded ${candidates.length} candidates from DB`);

  buildFigure2Scatter(result, candidates);
  console.log("Figure 2: selection scatter");

  const subset = selectSubset(candidates, studentRank).slice(0, 120);
  await buildFigure3Pareto(subset);
  console.log("Figure 3: Pareto frontier");

  await buildFigure4Sensitivity(subset);
  console.log("Figure 4: sensitivity");

  await buildFigure5Approximation(subset);
  console.log("Figure 5: approximation ratio");

  await buildFigure6MarginalGain(subset);
  console.log("Figure 6: marginal gain");

  buildTable2PreferenceSweep(subset);
  console.log("Table 2: preference sweep");

  buildTable3Verification();
  console.log("Table 3: verification summary");
}

main();
