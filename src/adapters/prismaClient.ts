/**
 * Shared Prisma client configured for SQLite via the `prisma-adapter-sqlite`
 * driver adapter over Node.js built-in `node:sqlite`.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaSqlite } from "prisma-adapter-sqlite";

function createAdapter(urlOverride?: string): PrismaSqlite {
  const url = urlOverride ?? process.env.DATABASE_URL;
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL environment variable is not set.");
  }
  return new PrismaSqlite({ url });
}

function createPrismaClient(urlOverride?: string): PrismaClient {
  return new PrismaClient({ adapter: createAdapter(urlOverride) });
}

export const prisma = createPrismaClient();

/**
 * Create a Prisma client bound to an explicit SQLite URL.
 * Useful for tests that need an isolated database file.
 */
export function createPrismaClientForUrl(url: string): PrismaClient {
  return createPrismaClient(url);
}
