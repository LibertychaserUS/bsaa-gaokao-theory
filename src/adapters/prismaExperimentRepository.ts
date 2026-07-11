/**
 * Prisma-backed implementations of ExperimentRepository and OptimizationRunRepository.
 */

import { type Prisma } from "@prisma/client";
import {
  experimentSchema,
  optimizationRunSchema,
  type Experiment,
  type ExperimentInput,
  type OptimizationRun,
  type OptimizationRunInput,
} from "../schemas.js";
import type { ExperimentRepository, OptimizationRunRepository } from "../ports/repository.js";
import { prisma } from "./prismaClient.js";

function nullToUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== null)) as T;
}

export const prismaExperimentRepository: ExperimentRepository = {
  async create(input: ExperimentInput): Promise<Experiment> {
    const parsed = experimentSchema.parse(input);
    const record = await prisma.experiment.create({
      data: nullToUndefined(parsed) as Prisma.ExperimentCreateInput,
    });
    return experimentSchema.parse(record);
  },

  async list(): Promise<Experiment[]> {
    const records = await prisma.experiment.findMany({ orderBy: { runAt: "desc" } });
    return records.map((record) => experimentSchema.parse(record));
  },
};

export const prismaOptimizationRunRepository: OptimizationRunRepository = {
  async create(input: OptimizationRunInput): Promise<OptimizationRun> {
    const parsed = optimizationRunSchema.parse(input);
    const record = await prisma.optimizationRun.create({
      data: nullToUndefined(parsed) as Prisma.OptimizationRunCreateInput,
    });
    return optimizationRunSchema.parse(record);
  },
};
