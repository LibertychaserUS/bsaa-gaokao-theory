/**
 * Unified schema layer: single source of truth for runtime validation,
 * TypeScript types, API contracts, and database serialization.
 *
 * Design: Zod-first. Prisma schema mirrors these fields. Database reads/writes
 * go through Zod parse/safeParse. Exported TypeScript types are derived from
 * Zod via `z.infer`.
 */

import { z } from "zod";

// -----------------------------------------------------------------------------
// BSAA / GSIO core
// -----------------------------------------------------------------------------

export const bsaaCandidateSchema = z.object({
  id: z.string().min(1),
  value: z.number().finite().nonnegative(),
  probability: z.number().min(0).max(1),
});

export type BsaaCandidate = z.infer<typeof bsaaCandidateSchema>;
export type BsaaCandidateInput = z.input<typeof bsaaCandidateSchema>;

export const bsaaSelectionResultSchema = z.object({
  selectedIds: z.array(z.string()),
  orderedIds: z.array(z.string()),
  utility: z.number().finite(),
});

export type BsaaSelectionResult = z.infer<typeof bsaaSelectionResultSchema>;

export const bsaaGreedyTraceStepSchema = z.object({
  step: z.number().int().positive(),
  selectedId: z.string(),
  marginalGain: z.number().finite(),
});

export type BsaaGreedyTraceStep = z.infer<typeof bsaaGreedyTraceStepSchema>;

export const bsaaGreedyResultSchema = bsaaSelectionResultSchema.extend({
  trace: z.array(bsaaGreedyTraceStepSchema),
});

export type BsaaGreedyResult = z.infer<typeof bsaaGreedyResultSchema>;

// -----------------------------------------------------------------------------
// Proof verification
// -----------------------------------------------------------------------------

export const proofVerificationTrialSchema = z.object({
  theorem: z.enum(["value_index", "submodularity", "approximation_ratio"]),
  candidateCount: z.number().int().nonnegative(),
  capacity: z.number().int().nonnegative().optional(),
  ok: z.boolean(),
  violationCount: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
});

export type ProofVerificationTrial = z.infer<typeof proofVerificationTrialSchema>;

export const proofVerificationReportSchema = z.object({
  seed: z.number().int(),
  trials: z.array(proofVerificationTrialSchema),
  summary: z.object({
    totalTrials: z.number().int().nonnegative(),
    passedTrials: z.number().int().nonnegative(),
    failedTrials: z.number().int().nonnegative(),
  }),
});

export type ProofVerificationReport = z.infer<typeof proofVerificationReportSchema>;

// -----------------------------------------------------------------------------
// Evidence registry (mirrors Prisma Evidence model)
// -----------------------------------------------------------------------------

export const evidenceSourceTypeSchema = z.enum([
  "theorem",
  "paper",
  "official_data",
  "simulation",
  "expert_review",
]);

export type EvidenceSourceType = z.infer<typeof evidenceSourceTypeSchema>;

export const evidenceSchema = z.object({
  id: z.string().min(1),
  sourceType: evidenceSourceTypeSchema,
  title: z.string().min(1),
  authors: z.string().nullish(),
  year: z.number().int().nullish(),
  doi: z.string().nullish(),
  url: z.string().url().nullish(),
  citedIn: z.string().nullish(),
  summary: z.string().nullish(),
});

export type Evidence = z.infer<typeof evidenceSchema>;
export type EvidenceInput = z.input<typeof evidenceSchema>;

// -----------------------------------------------------------------------------
// Experiment log (mirrors Prisma Experiment model)
// -----------------------------------------------------------------------------

export const experimentSchema = z.object({
  id: z.string().nullish(), // assigned by DB
  runAt: z.coerce.date().nullish(),
  seed: z.number().int(),
  candidateCount: z.number().int().nonnegative(),
  capacity: z.number().int().nonnegative().nullish(),
  theorem: z.string().nullish(),
  passed: z.boolean(),
  violationCount: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  metadataJson: z.string().nullish(),
  gitCommit: z.string().nullish(),
  evidenceId: z.string().nullish(),
});

export type Experiment = z.infer<typeof experimentSchema>;
export type ExperimentInput = z.input<typeof experimentSchema>;

// -----------------------------------------------------------------------------
// Optimization run audit log (mirrors Prisma OptimizationRun model)
// -----------------------------------------------------------------------------

export const optimizationRunSchema = z.object({
  id: z.string().nullish(),
  runAt: z.coerce.date().nullish(),
  inputHash: z.string().min(1),
  outputHash: z.string().min(1),
  solverVersion: z.string().min(1),
  calibrationVersion: z.string().nullish(),
  strategyVersion: z.string().nullish(),
  gitCommit: z.string().nullish(),
  logPath: z.string().nullish(),
});

export type OptimizationRun = z.infer<typeof optimizationRunSchema>;
export type OptimizationRunInput = z.input<typeof optimizationRunSchema>;

// -----------------------------------------------------------------------------
// API contracts
// -----------------------------------------------------------------------------

export const optimizeRequestSchema = z.object({
  candidates: z.array(bsaaCandidateSchema).min(1),
  capacity: z.number().int().nonnegative(),
  baseline: z.enum(["value_index", "probability_tier"]).optional(),
});

export type OptimizeRequest = z.infer<typeof optimizeRequestSchema>;

export const optimizeResponseSchema = z.object({
  request: optimizeRequestSchema,
  result: bsaaGreedyResultSchema,
  baselineResult: bsaaSelectionResultSchema.optional(),
  comparison: z
    .object({
      absoluteGain: z.number(),
      relativeGain: z.number(),
    })
    .optional(),
});

export type OptimizeResponse = z.infer<typeof optimizeResponseSchema>;

// -----------------------------------------------------------------------------
// Validation helpers
// -----------------------------------------------------------------------------

export function validateBsaaCandidates(input: unknown): BsaaCandidate[] {
  return z.array(bsaaCandidateSchema).parse(input);
}

export function validateOptimizeRequest(input: unknown): OptimizeRequest {
  return optimizeRequestSchema.parse(input);
}

export function validateEvidence(input: unknown): Evidence {
  return evidenceSchema.parse(input);
}

export function validateExperiment(input: unknown): Experiment {
  return experimentSchema.parse(input);
}
