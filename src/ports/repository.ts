/**
 * Repository ports (interfaces) for the application layer.
 *
 * These interfaces abstract persistence so the domain and application layers
 * do not depend on Prisma, SQLite, or any concrete storage technology.
 */

import type {
  Evidence,
  EvidenceInput,
  Experiment,
  ExperimentInput,
  OptimizationRun,
  OptimizationRunInput,
} from "../schemas.js";

export interface EvidenceRepository {
  create(input: EvidenceInput): Promise<Evidence>;
  findById(id: string): Promise<Evidence | null>;
  list(): Promise<Evidence[]>;
}

export interface ExperimentRepository {
  create(input: ExperimentInput): Promise<Experiment>;
  list(): Promise<Experiment[]>;
}

export interface OptimizationRunRepository {
  create(input: OptimizationRunInput): Promise<OptimizationRun>;
}
