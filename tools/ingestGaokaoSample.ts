/**
 * Ingest a real Gaokao sample from the senior-high gaokao.sqlite database
 * and run the paper-official GSIO optimizer.
 *
 * This is an intentionally self-contained MVP script. It reads the staging
 * SQLite (already processed by the senior-high Python tools), performs a
 * simplified projection of programs into BSAA candidates, and outputs the
 * optimized volunteer plan as JSON.
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  greedySubmodularOptimization,
  transparentBaselineSelection,
  evaluateSequence,
  safetyProbability,
  neutralQuality,
  type PaperCandidate,
} from "../src/domain/paperTheory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DB_PATH = path.resolve(PROJECT_ROOT, "data/gaokao.bsaa.sqlite");
const ONE_POINT_PATH = path.resolve(PROJECT_ROOT, "data/hlj_2026_physics_one_point_segment.csv");

// Student profile for the HLJ 2026 physics sample used in senior-high outputs.
const STUDENT: {
  province: string;
  subjectType: string;
  score: number;
  rank: number;
  totalRanked?: number;
  subjects: readonly string[];
  preferredRegions: readonly string[];
  preferredMajorKeywords: readonly string[];
} = {
  province: "黑龙江",
  subjectType: "物理",
  score: 498,
  rank: 29942,
  subjects: ["物理", "化学"],
  preferredRegions: ["青岛", "威海", "南京", "厦门", "江苏", "浙江", "上海", "山东", "福建"],
  preferredMajorKeywords: [
    "智能制造工程",
    "大数据",
    "电子信息工程",
    "机械设计制造",
    "计算机",
    "机械",
    "电气",
  ],
};

// Paper-official preference vector π over the attribute dimensions.
// Order: [schoolPlatform, majorFit, regionFit, dataConfidence, costFit, majorTrunk, majorSupplySafety]
const PREFERENCE_PI: readonly number[] = [0.2, 0.25, 0.2, 0.15, 0.05, 0.1, 0.05];

const SLOT_COUNT = 45;

interface OnePointRow {
  score: number;
  sameScoreCount: number;
  cumulativeCount: number;
}

function loadOnePointSegment(): OnePointRow[] {
  const text = readFileSync(ONE_POINT_PATH, "utf-8");
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function subjectEligible(requirement: string | null, subjects: readonly string[]): boolean {
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

function schoolPlatform(softRank: number | null): number {
  if (softRank === null) return 0.46;
  return clamp01(1 - Math.min(softRank, 600) / 750);
}

function regionFit(
  schoolProvince: string | null,
  city: string | null,
  preferredRegions: readonly string[],
): number {
  const regionText = `${schoolProvince ?? ""} ${city ?? ""}`;
  if (preferredRegions.some((region) => regionText.includes(region))) return 0.88;
  return 0.56;
}

function majorFit(
  majorName: string | null,
  majorCategory: string | null,
  keywords: readonly string[],
): number {
  const searchable = `${majorName ?? ""} ${majorCategory ?? ""}`;
  if (keywords.some((keyword) => searchable.includes(keyword))) return 0.92;
  if (keywords.some((keyword) => (majorCategory ?? "").includes(keyword))) return 0.7;
  return 0.5;
}

function majorTrunkFromNodeLevel(nodeLevel: string | null): number {
  if (nodeLevel === "major") return 0.9;
  if (nodeLevel === "category") return 0.75;
  return 0.6;
}

function admissionProbability(rankDelta: number): number {
  // Higher rankDelta (candidate's rank worse than baseline) -> lower probability.
  const normalized = clamp01((rankDelta + 2500) / 6500);
  return clamp01(1 - normalized) * 0.9 + 0.05;
}

interface RawProgram {
  id: number;
  schoolCode: string;
  schoolName: string;
  schoolProvince: string | null;
  city: string | null;
  majorCode: string | null;
  majorName: string | null;
  majorCategory: string | null;
  subjectRequirement: string | null;
  plan2025: number | null;
  minRank2024: number | null;
  minRank2023: number | null;
  minRank2022: number | null;
  estimatedRank2025: number | null;
  softRank: number | null;
  nodeId: string | null;
  nodeLevel: string | null;
}

function loadPrograms(db: DatabaseSync): RawProgram[] {
  const sql = `
    SELECT
      p.id,
      p.school_code AS schoolCode,
      p.school_name AS schoolName,
      p.school_province AS schoolProvince,
      p.city,
      p.major_code AS majorCode,
      p.major_name AS majorName,
      p.major_category AS majorCategory,
      p.subject_requirement AS subjectRequirement,
      p.plan_2025 AS plan2025,
      p.min_rank_2024 AS minRank2024,
      p.min_rank_2023 AS minRank2023,
      p.min_rank_2022 AS minRank2022,
      p.estimated_rank_2025 AS estimatedRank2025,
      p.soft_rank AS softRank,
      n.node_id AS nodeId,
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
  return db
    .prepare(sql)
    .all(STUDENT.province, STUDENT.subjectType, "本科批") as unknown as RawProgram[];
}

function projectToCandidate(program: RawProgram): PaperCandidate | null {
  const baselineRank =
    program.estimatedRank2025 ?? program.minRank2024 ?? program.minRank2023 ?? program.minRank2022;
  if (baselineRank === null) return null;

  if (!subjectEligible(program.subjectRequirement, STUDENT.subjects)) return null;

  const rankDelta = STUDENT.rank - baselineRank;
  const p = admissionProbability(rankDelta);

  const sp = schoolPlatform(program.softRank);
  const mf = majorFit(program.majorName, program.majorCategory, STUDENT.preferredMajorKeywords);
  const rf = regionFit(program.schoolProvince, program.city, STUDENT.preferredRegions);
  const dc = 0.85;
  const cf = program.plan2025 !== null && program.plan2025 <= 9000 ? 0.88 : 0.6;
  const mt = majorTrunkFromNodeLevel(program.nodeLevel);
  const mss = clamp01(1 - (program.plan2025 ?? 1) / 100);

  const prototypeValues = [sp, mf, rf, dc, cf, mt, mss];

  return {
    id: String(program.id),
    probability: p,
    prototypeValues,
    qualityScore: sp,
    tierScore: sp,
  };
}

interface IngestResult {
  student: typeof STUDENT;
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

function main(): void {
  const onePoint = loadOnePointSegment();
  const totalRanked = onePoint.length > 0 ? onePoint[onePoint.length - 1].cumulativeCount : 109811;

  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const programs = loadPrograms(db);
  db.close();

  const candidates: PaperCandidate[] = [];
  for (const program of programs) {
    const candidate = projectToCandidate(program);
    if (candidate !== null) {
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) {
    throw new Error("No eligible candidates found for the student profile.");
  }

  const gsio = greedySubmodularOptimization(candidates, SLOT_COUNT, PREFERENCE_PI);
  const baselineIds = transparentBaselineSelection(candidates, SLOT_COUNT);

  const result: IngestResult = {
    student: { ...STUDENT, totalRanked },
    preference: PREFERENCE_PI,
    slotCount: SLOT_COUNT,
    candidateCount: candidates.length,
    gsio: {
      selectedIds: gsio.selectedIds,
      order: gsio.order,
      utility: gsio.utility,
      safety: safetyProbability(gsio.order, candidates),
      neutralQuality: neutralQuality(gsio.order, candidates, PREFERENCE_PI),
    },
    baseline: {
      selectedIds: baselineIds,
      order: baselineIds,
      utility: evaluateSequence(baselineIds, candidates, PREFERENCE_PI),
      safety: safetyProbability(baselineIds, candidates),
      neutralQuality: neutralQuality(baselineIds, candidates, PREFERENCE_PI),
    },
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
