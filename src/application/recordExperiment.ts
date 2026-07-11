/**
 * Use case: record a proof-verification experiment and link it to evidence.
 */

import type { EvidenceRepository, ExperimentRepository } from "../ports/repository.js";
import { experimentSchema, type ExperimentInput } from "../schemas.js";

export interface RecordExperimentDeps {
  evidenceRepository: EvidenceRepository;
  experimentRepository: ExperimentRepository;
}

export async function recordExperiment(
  input: ExperimentInput,
  deps: RecordExperimentDeps,
): Promise<void> {
  const parsed = experimentSchema.parse(input);

  if (parsed.evidenceId !== null && parsed.evidenceId !== undefined) {
    const evidence = await deps.evidenceRepository.findById(parsed.evidenceId);
    if (evidence === null) {
      throw new Error(`Evidence ${parsed.evidenceId} not found.`);
    }
  }

  await deps.experimentRepository.create(parsed);
}
