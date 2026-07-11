/**
 * Database client with Zod validation.
 *
 * Uses Prisma with the `prisma-adapter-sqlite` driver adapter over Node.js
 * built-in `node:sqlite`. All reads are parsed through Zod schemas before
 * returning to callers.
 */

import "dotenv/config";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaSqlite } from "prisma-adapter-sqlite";
import {
  evidenceSchema,
  experimentSchema,
  optimizationRunSchema,
  type Evidence,
  type EvidenceInput,
  type Experiment,
  type ExperimentInput,
  type OptimizationRun,
  type OptimizationRunInput,
} from "./schemas.js";

function createAdapter(): PrismaSqlite {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL environment variable is not set.");
  }
  return new PrismaSqlite({ url });
}

export const prisma = new PrismaClient({ adapter: createAdapter() });

// Prisma create inputs do not accept `null` for some optional fields; they
// expect `undefined`. We normalize after Zod validation.
function nullToUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== null)) as T;
}

export async function createEvidence(input: EvidenceInput): Promise<Evidence> {
  const parsed = evidenceSchema.parse(input);
  const record = await prisma.evidence.create({ data: nullToUndefined(parsed) });
  return evidenceSchema.parse(record);
}

export async function getEvidence(id: string): Promise<Evidence | null> {
  const record = await prisma.evidence.findUnique({ where: { id } });
  if (record === null) return null;
  return evidenceSchema.parse(record);
}

export async function listEvidence(): Promise<Evidence[]> {
  const records = await prisma.evidence.findMany({ orderBy: { createdAt: "desc" } });
  return records.map((r) => evidenceSchema.parse(r));
}

export async function createExperiment(input: ExperimentInput): Promise<Experiment> {
  const parsed = experimentSchema.parse(input);
  const record = await prisma.experiment.create({
    data: nullToUndefined(parsed) as Prisma.ExperimentCreateInput,
  });
  return experimentSchema.parse(record);
}

export async function listExperiments(): Promise<Experiment[]> {
  const records = await prisma.experiment.findMany({ orderBy: { runAt: "desc" } });
  return records.map((r) => experimentSchema.parse(r));
}

export async function createOptimizationRun(input: OptimizationRunInput): Promise<OptimizationRun> {
  const parsed = optimizationRunSchema.parse(input);
  const record = await prisma.optimizationRun.create({
    data: nullToUndefined(parsed) as Prisma.OptimizationRunCreateInput,
  });
  return optimizationRunSchema.parse(record);
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
