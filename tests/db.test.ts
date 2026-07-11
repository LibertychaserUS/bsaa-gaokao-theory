import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const tmpDir = mkdtempSync(join(tmpdir(), "bsaa-db-test-"));
const dbPath = join(tmpDir, "test.db");
process.env.DATABASE_URL = `file:${dbPath}`;

execSync("npx prisma migrate deploy", {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
  stdio: "ignore",
});

const { createEvidence, createExperiment, createOptimizationRun, disconnect } =
  await import("../src/db.js");

test("database CRUD with Zod validation", async () => {
  const evidence = await createEvidence({
    id: "thm-3.1",
    sourceType: "theorem",
    title: "Value-Index Optimality",
    summary: "Sorting by value descending is optimal.",
  });
  assert.equal(evidence.id, "thm-3.1");

  const experiment = await createExperiment({
    seed: 42,
    candidateCount: 8,
    capacity: 3,
    theorem: "value_index",
    passed: true,
    violationCount: 0,
    durationMs: 12,
    evidenceId: evidence.id,
  });
  assert.equal(experiment.seed, 42);

  const run = await createOptimizationRun({
    inputHash: "abc",
    outputHash: "def",
    solverVersion: "1.0.0",
  });
  assert.equal(run.inputHash, "abc");

  await disconnect();
  unlinkSync(dbPath);
});
