/**
 * Loader for operational scoring defaults stored in config/scoring-defaults.json.
 *
 * Domain modules expose their own compiled-in fallbacks in src/domain/scoring.ts;
 * the operational pipeline (tools, HTTP adapters) should load values from here
 * and pass them explicitly so that policy changes do not require code edits.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");

export const probabilityBucketsSchema = z.object({
  reach: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
  steady: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
  safety: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
});

export type ProbabilityBuckets = z.infer<typeof probabilityBucketsSchema>;

export const tierThresholdsSchema = z.object({
  quantiles: z.array(z.number().min(0).max(1)),
});

export type TierThresholds = z.infer<typeof tierThresholdsSchema>;

export const scoringDefaultsSchema = z.object({
  probabilityBuckets: probabilityBucketsSchema,
  tierThresholds: tierThresholdsSchema,
});

export type ScoringDefaults = z.infer<typeof scoringDefaultsSchema>;

function resolvePath(relativeOrAbsolute: string): string {
  if (path.isAbsolute(relativeOrAbsolute)) return relativeOrAbsolute;
  return path.resolve(PROJECT_ROOT, relativeOrAbsolute);
}

export function loadScoringDefaults(configPath = "config/scoring-defaults.json"): ScoringDefaults {
  const absolutePath = resolvePath(configPath);
  const raw = JSON.parse(readFileSync(absolutePath, "utf-8")) as unknown;
  return scoringDefaultsSchema.parse(raw);
}
