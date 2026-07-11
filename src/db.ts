/**
 * Backward-compatible database facade.
 *
 * New code should prefer repository implementations under `src/adapters/` and
 * interfaces under `src/ports/repository.ts`.
 */

import { prismaEvidenceRepository } from "./adapters/prismaEvidenceRepository.js";
import {
  prismaExperimentRepository,
  prismaOptimizationRunRepository,
} from "./adapters/prismaExperimentRepository.js";
import { prisma } from "./adapters/prismaClient.js";

export const createEvidence = prismaEvidenceRepository.create.bind(prismaEvidenceRepository);
export const getEvidence = prismaEvidenceRepository.findById.bind(prismaEvidenceRepository);
export const listEvidence = prismaEvidenceRepository.list.bind(prismaEvidenceRepository);
export const createExperiment = prismaExperimentRepository.create.bind(prismaExperimentRepository);
export const listExperiments = prismaExperimentRepository.list.bind(prismaExperimentRepository);
export const createOptimizationRun = prismaOptimizationRunRepository.create.bind(
  prismaOptimizationRunRepository,
);
export { prisma };

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
