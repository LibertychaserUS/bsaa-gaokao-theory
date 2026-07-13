/**
 * Shared projection pipeline: turn raw Gaokao program records into BSAA
 * PaperCandidate objects using an external configuration file.
 *
 * This keeps the computation code (optimizers, figure generators) separate
 * from the input data (student profile, preference vector, scoring constants).
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { PaperCandidate } from "../domain/paperTheory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

export const studentProfileSchema = z.object({
  province: z.string().min(1),
  subjectType: z.string().min(1),
  score: z.number().int(),
  rank: z.number().int().positive(),
  subjects: z.array(z.string().min(1)).min(1),
  preferredRegions: z.array(z.string().min(1)).min(1),
  preferredMajorKeywords: z.array(z.string().min(1)).min(1),
});

export type StudentProfile = z.infer<typeof studentProfileSchema>;

export const dataPathsSchema = z.object({
  db: z.string().min(1),
  onePointSegment: z.string().min(1),
});

export type DataPaths = z.infer<typeof dataPathsSchema>;

export const optimizationSchema = z.object({
  batch: z.string().min(1),
  slotCount: z.number().int().positive(),
  preferencePi: z.array(z.number().finite().nonnegative()),
});

export type OptimizationConfig = z.infer<typeof optimizationSchema>;

export const probabilityModelSchema = z.object({
  offset: z.number().finite(),
  scale: z.number().finite().positive(),
  outputRange: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
});

export type ProbabilityModelConfig = z.infer<typeof probabilityModelSchema>;

export const attributeScoringSchema = z.object({
  regionMatchScore: z.number().finite().nonnegative(),
  regionMismatchScore: z.number().finite().nonnegative(),
  majorMatchScore: z.number().finite().nonnegative(),
  majorCategoryScore: z.number().finite().nonnegative(),
  majorMismatchScore: z.number().finite().nonnegative(),
  defaultSchoolPlatform: z.number().finite().nonnegative(),
  schoolPlatformMaxRank: z.number().finite().nonnegative(),
  schoolPlatformDivisor: z.number().finite().positive(),
  dataConfidence: z.number().finite().nonnegative(),
  costFitThreshold: z.number().finite().nonnegative(),
  costFitMatch: z.number().finite().nonnegative(),
  costFitMismatch: z.number().finite().nonnegative(),
  majorTrunkByNodeLevel: z.object({
    major: z.number().finite().nonnegative(),
    category: z.number().finite().nonnegative(),
    default: z.number().finite().nonnegative(),
  }),
  majorSupplySafetyDivisor: z.number().finite().positive(),
});

export type AttributeScoringConfig = z.infer<typeof attributeScoringSchema>;

export const subsetSchema = z.object({
  rankWindow: z.number().int().nonnegative(),
  size: z.number().int().positive(),
});

export type SubsetConfig = z.infer<typeof subsetSchema>;

export const figuresSchema = z.object({
  pareto: z.object({
    dimensions: z.number().int().positive(),
    gridSteps: z.number().int().positive(),
    fixedTail: z.array(z.number().finite().nonnegative()),
    capacity: z.number().int().positive(),
    candidateCount: z.number().int().positive(),
  }),
  sensitivity: z.object({
    trials: z.number().int().positive(),
    perturbation: z.number().finite().nonnegative(),
    capacity: z.number().int().positive(),
    seed: z.number().int(),
  }),
  approximation: z.object({
    Ns: z.array(z.number().int().positive()),
    trialsPerN: z.number().int().positive(),
    seed: z.number().int(),
  }),
  marginalGain: z.object({
    candidateCount: z.number().int().positive(),
    capacity: z.number().int().positive(),
  }),
  preferenceSweep: z.object({
    capacity: z.number().int().positive(),
  }),
  preferenceSweepProfiles: z.array(
    z.object({
      name: z.string().min(1),
      pi: z.array(z.number().finite().nonnegative()),
    }),
  ),
  verification: z.object({
    seed: z.number().int(),
    trials: z.number().int().positive(),
  }),
});

export type FiguresConfig = z.infer<typeof figuresSchema>;

export const paperSampleConfigSchema = z.object({
  student: studentProfileSchema,
  dataPaths: dataPathsSchema,
  optimization: optimizationSchema,
  probabilityModel: probabilityModelSchema,
  attributeScoring: attributeScoringSchema,
  subset: subsetSchema,
  figures: figuresSchema,
});

export type PaperSampleConfig = z.infer<typeof paperSampleConfigSchema>;

export interface ProjectedCandidate extends PaperCandidate {
  /** Estimated admission rank used for probability calibration and subset selection. */
  estimatedRank: number;
}

export interface OnePointRow {
  score: number;
  sameScoreCount: number;
  cumulativeCount: number;
}

function resolvePath(relativeOrAbsolute: string): string {
  if (path.isAbsolute(relativeOrAbsolute)) return relativeOrAbsolute;
  return path.resolve(PROJECT_ROOT, relativeOrAbsolute);
}

export function loadConfig(configPath: string): PaperSampleConfig {
  const absolutePath = resolvePath(configPath);
  const raw = JSON.parse(readFileSync(absolutePath, "utf-8")) as unknown;
  return paperSampleConfigSchema.parse(raw);
}

export function loadOnePointSegment(config: PaperSampleConfig): OnePointRow[] {
  const text = readFileSync(resolvePath(config.dataPaths.onePointSegment), "utf-8");
  const lines = text.trim().split("\n");
  const rows: OnePointRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const [, , , scoreStr, sameStr, cumulativeStr] = lines[i].split(",");
    rows.push({
      score: Number(scoreStr),
      sameScoreCount: Number(sameStr),
      cumulativeCount: Number(cumulativeStr),
    });
  }
  return rows;
}

export function totalRankedFromOnePoint(rows: OnePointRow[]): number {
  return rows.length > 0 ? rows[rows.length - 1].cumulativeCount : 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function subjectEligible(requirement: string | null, subjects: readonly string[]): boolean {
  if (!requirement || requirement.includes("不限")) return true;
  const normalizedSubjects = new Set(subjects.map((s) => s.trim()).filter(Boolean));
  const requirementText = requirement.replace(/\s/g, "");
  const gaokaoSubjects = ["物理", "化学", "生物", "政治", "历史", "地理", "技术"];
  const requiredSubjects = gaokaoSubjects.filter((subject) => requirementText.includes(subject));
  if (requiredSubjects.length === 0) return false;
  if (/或|任选|其中/.test(requirementText)) {
    return requiredSubjects.some((subject) => normalizedSubjects.has(subject));
  }
  return requiredSubjects.every((subject) => normalizedSubjects.has(subject));
}

export function admissionProbability(rankDelta: number, model: ProbabilityModelConfig): number {
  const normalized = clamp01((rankDelta + model.offset) / model.scale);
  const [minP, maxP] = model.outputRange;
  return clamp01(1 - normalized) * (maxP - minP) + minP;
}

export function schoolPlatform(softRank: number | null, scoring: AttributeScoringConfig): number {
  if (softRank === null) return scoring.defaultSchoolPlatform;
  return clamp01(
    1 - Math.min(softRank, scoring.schoolPlatformMaxRank) / scoring.schoolPlatformDivisor,
  );
}

export function regionFit(
  schoolProvince: string | null,
  city: string | null,
  preferredRegions: readonly string[],
  scoring: AttributeScoringConfig,
): number {
  const regionText = `${schoolProvince ?? ""} ${city ?? ""}`;
  if (preferredRegions.some((region) => regionText.includes(region)))
    return scoring.regionMatchScore;
  return scoring.regionMismatchScore;
}

export function majorFit(
  majorName: string | null,
  majorCategory: string | null,
  keywords: readonly string[],
  scoring: AttributeScoringConfig,
): number {
  const searchable = `${majorName ?? ""} ${majorCategory ?? ""}`;
  if (keywords.some((keyword) => searchable.includes(keyword))) return scoring.majorMatchScore;
  if (keywords.some((keyword) => (majorCategory ?? "").includes(keyword)))
    return scoring.majorCategoryScore;
  return scoring.majorMismatchScore;
}

export function majorTrunkFromNodeLevel(
  nodeLevel: string | null,
  scoring: AttributeScoringConfig,
): number {
  if (nodeLevel === "major") return scoring.majorTrunkByNodeLevel.major;
  if (nodeLevel === "category") return scoring.majorTrunkByNodeLevel.category;
  return scoring.majorTrunkByNodeLevel.default;
}

export function costFit(plan2025: number | null, scoring: AttributeScoringConfig): number {
  return plan2025 !== null && plan2025 <= scoring.costFitThreshold
    ? scoring.costFitMatch
    : scoring.costFitMismatch;
}

export function majorSupplySafety(
  plan2025: number | null,
  scoring: AttributeScoringConfig,
): number {
  return clamp01(1 - (plan2025 ?? 1) / scoring.majorSupplySafetyDivisor);
}

interface RawProgram {
  id: number;
  schoolProvince: string | null;
  city: string | null;
  majorName: string | null;
  majorCategory: string | null;
  subjectRequirement: string | null;
  plan2025: number | null;
  minRank2024: number | null;
  minRank2023: number | null;
  minRank2022: number | null;
  estimatedRank2025: number | null;
  softRank: number | null;
  nodeLevel: string | null;
}

export function loadPrograms(config: PaperSampleConfig): RawProgram[] {
  const db = new DatabaseSync(resolvePath(config.dataPaths.db), { readOnly: true });
  const sql = `
    SELECT
      p.id,
      p.school_province AS schoolProvince,
      p.city,
      p.major_name AS majorName,
      p.major_category AS majorCategory,
      p.subject_requirement AS subjectRequirement,
      p.plan_2025 AS plan2025,
      p.min_rank_2024 AS minRank2024,
      p.min_rank_2023 AS minRank2023,
      p.min_rank_2022 AS minRank2022,
      p.estimated_rank_2025 AS estimatedRank2025,
      p.soft_rank AS softRank,
      n.node_type AS nodeLevel
    FROM programs p
    LEFT JOIN program_official_major_map_staging m ON p.id = m.program_id
    LEFT JOIN official_major_nodes_staging n ON m.major_node_id = n.node_id
    WHERE p.province = ?
      AND p.subject_type = ?
      AND p.batch = ?
      AND p.plan_2025 IS NOT NULL
      AND p.plan_2025 > 0
    ORDER BY p.estimated_rank_2025 ASC
    LIMIT 2000
  `;
  const rows = db
    .prepare(sql)
    .all(
      config.student.province,
      config.student.subjectType,
      config.optimization.batch,
    ) as unknown as RawProgram[];
  db.close();
  return rows;
}

export function projectToCandidate(
  program: RawProgram,
  config: PaperSampleConfig,
): ProjectedCandidate | null {
  const baselineRank =
    program.estimatedRank2025 ?? program.minRank2024 ?? program.minRank2023 ?? program.minRank2022;
  if (baselineRank === null) return null;

  if (!subjectEligible(program.subjectRequirement, config.student.subjects)) return null;

  const rankDelta = config.student.rank - baselineRank;
  const p = admissionProbability(rankDelta, config.probabilityModel);

  const scoring = config.attributeScoring;
  const sp = schoolPlatform(program.softRank, scoring);
  const mf = majorFit(
    program.majorName,
    program.majorCategory,
    config.student.preferredMajorKeywords,
    scoring,
  );
  const rf = regionFit(
    program.schoolProvince,
    program.city,
    config.student.preferredRegions,
    scoring,
  );
  const dc = scoring.dataConfidence;
  const cf = costFit(program.plan2025, scoring);
  const mt = majorTrunkFromNodeLevel(program.nodeLevel, scoring);
  const mss = majorSupplySafety(program.plan2025, scoring);

  const prototypeValues = [sp, mf, rf, dc, cf, mt, mss];

  return {
    id: String(program.id),
    probability: p,
    prototypeValues,
    qualityScore: sp,
    tierScore: sp,
    estimatedRank: baselineRank,
  };
}

export function buildCandidates(config: PaperSampleConfig): ProjectedCandidate[] {
  const programs = loadPrograms(config);
  const candidates: ProjectedCandidate[] = [];
  for (const program of programs) {
    const candidate = projectToCandidate(program, config);
    if (candidate !== null) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

export function selectRankSubset(
  candidates: readonly ProjectedCandidate[],
  config: PaperSampleConfig,
): ProjectedCandidate[] {
  const { rankWindow, size } = config.subset;
  const studentRank = config.student.rank;
  const near = candidates.filter((c) => Math.abs(studentRank - c.estimatedRank) <= rankWindow);
  return near.slice(0, size);
}
