/**
 * Prisma-backed implementation of EvidenceRepository.
 */

import { evidenceSchema, type Evidence, type EvidenceInput } from "../schemas.js";
import type { EvidenceRepository } from "../ports/repository.js";
import { prisma } from "./prismaClient.js";

function nullToUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== null)) as T;
}

export const prismaEvidenceRepository: EvidenceRepository = {
  async create(input: EvidenceInput): Promise<Evidence> {
    const parsed = evidenceSchema.parse(input);
    const record = await prisma.evidence.create({
      data: nullToUndefined(parsed),
    });
    return evidenceSchema.parse(record);
  },

  async findById(id: string): Promise<Evidence | null> {
    const record = await prisma.evidence.findUnique({ where: { id } });
    if (record === null) return null;
    return evidenceSchema.parse(record);
  },

  async list(): Promise<Evidence[]> {
    const records = await prisma.evidence.findMany({ orderBy: { createdAt: "desc" } });
    return records.map((record) => evidenceSchema.parse(record));
  },
};
