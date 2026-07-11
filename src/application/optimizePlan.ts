/**
 * Use case: optimize a volunteer plan and persist the run.
 */

import { greedySubmodularSelection } from "../domain/bsaaCore.js";
import type { OptimizationRunRepository } from "../ports/repository.js";
import {
  optimizeRequestSchema,
  optimizeResponseSchema,
  type OptimizeRequest,
  type OptimizeResponse,
} from "../schemas.js";

export interface OptimizePlanDeps {
  optimizationRunRepository: OptimizationRunRepository;
}

export async function optimizePlan(
  request: OptimizeRequest,
  deps: OptimizePlanDeps,
): Promise<OptimizeResponse> {
  const parsedRequest = optimizeRequestSchema.parse(request);
  const { candidates, capacity } = parsedRequest;

  const result = greedySubmodularSelection(candidates, capacity);

  await deps.optimizationRunRepository.create({
    inputHash: hashInput({ candidates, capacity }),
    outputHash: hashOutput(result),
    solverVersion: "bsaa-core/0.1.0",
  });

  return optimizeResponseSchema.parse({ request: parsedRequest, result });
}

function hashInput(input: { candidates: unknown[]; capacity: number }): string {
  return `${input.candidates.length}:${input.capacity}`;
}

function hashOutput(result: { selectedIds: string[]; utility: number }): string {
  return `${result.selectedIds.join(",")}:${result.utility.toFixed(6)}`;
}
