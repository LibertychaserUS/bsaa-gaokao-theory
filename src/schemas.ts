/**
 * Runtime schemas for BSAA/GSIO core types.
 *
 * These schemas are used to validate inputs at API boundaries and in tests,
 * ensuring that mathematical invariants (probabilities in [0,1], non-negative
 * values) are enforced before they reach the optimization core.
 */

import { z } from "zod";

export const bsaaCandidateSchema = z.object({
  id: z.string().min(1),
  value: z.number().finite().nonnegative(),
  probability: z.number().min(0).max(1),
});

export type BsaaCandidateInput = z.input<typeof bsaaCandidateSchema>;

export const bsaaSelectionResultSchema = z.object({
  selectedIds: z.array(z.string()),
  orderedIds: z.array(z.string()),
  utility: z.number().finite(),
});

export const bsaaGreedyTraceStepSchema = z.object({
  step: z.number().int().positive(),
  selectedId: z.string(),
  marginalGain: z.number().finite(),
});

export const bsaaGreedyResultSchema = bsaaSelectionResultSchema.extend({
  trace: z.array(bsaaGreedyTraceStepSchema),
});

export const proofVerificationTrialSchema = z.object({
  theorem: z.enum(["value_index", "submodularity", "approximation_ratio"]),
  candidateCount: z.number().int().nonnegative(),
  capacity: z.number().int().nonnegative().optional(),
  ok: z.boolean(),
  violationCount: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
});

export const proofVerificationReportSchema = z.object({
  seed: z.number().int(),
  trials: z.array(proofVerificationTrialSchema),
  summary: z.object({
    totalTrials: z.number().int().nonnegative(),
    passedTrials: z.number().int().nonnegative(),
    failedTrials: z.number().int().nonnegative(),
  }),
});

export function validateBsaaCandidates(input: unknown): BsaaCandidateInput[] {
  return z.array(bsaaCandidateSchema).parse(input);
}
