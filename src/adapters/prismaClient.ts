/**
 * Shared Prisma client configured for SQLite via the `prisma-adapter-sqlite`
 * driver adapter over Node.js built-in `node:sqlite`.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaSqlite } from "prisma-adapter-sqlite";

function createAdapter(): PrismaSqlite {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL environment variable is not set.");
  }
  return new PrismaSqlite({ url });
}

export const prisma = new PrismaClient({ adapter: createAdapter() });
