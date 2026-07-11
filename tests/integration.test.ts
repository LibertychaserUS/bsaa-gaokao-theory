import assert from "node:assert/strict";
import test from "node:test";

// Integration tests use the project's default SQLite database.
// `npm test` runs `npm run db:migrate:deploy` first.

const testSuffix = `-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

const { prismaEvidenceRepository } = await import("../src/adapters/prismaEvidenceRepository.js");
const { prismaExperimentRepository, prismaOptimizationRunRepository } =
  await import("../src/adapters/prismaExperimentRepository.js");
const { optimizePlan } = await import("../src/application/optimizePlan.js");
const { recordExperiment } = await import("../src/application/recordExperiment.js");

test("database CRUD with Zod validation", async () => {
  const evidenceId = `thm-3.1${testSuffix}`;
  const evidence = await prismaEvidenceRepository.create({
    id: evidenceId,
    sourceType: "theorem",
    title: "Value-Index Optimality",
    summary: "Sorting by value descending is optimal.",
  });
  assert.equal(evidence.id, evidenceId);

  const experiment = await prismaExperimentRepository.create({
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

  const run = await prismaOptimizationRunRepository.create({
    inputHash: "abc",
    outputHash: "def",
    solverVersion: "1.0.0",
  });
  assert.equal(run.inputHash, "abc");
});

test("optimizePlan returns a valid greedy result and records the run", async () => {
  const response = await optimizePlan(
    {
      candidates: [
        { id: "a", value: 10, probability: 0.5 },
        { id: "b", value: 20, probability: 0.3 },
        { id: "c", value: 5, probability: 0.9 },
      ],
      capacity: 2,
    },
    { optimizationRunRepository: prismaOptimizationRunRepository },
  );

  assert.equal(response.result.selectedIds.length, 2);
  assert.ok(response.result.utility > 0);
});

test("recordExperiment links an experiment to evidence", async () => {
  const evidenceId = `thm-test${testSuffix}`;
  const evidence = await prismaEvidenceRepository.create({
    id: evidenceId,
    sourceType: "theorem",
    title: "Test theorem",
  });

  await recordExperiment(
    {
      seed: 123,
      candidateCount: 6,
      passed: true,
      violationCount: 0,
      durationMs: 5,
      evidenceId: evidence.id,
    },
    {
      evidenceRepository: prismaEvidenceRepository,
      experimentRepository: prismaExperimentRepository,
    },
  );

  const experiments = await prismaExperimentRepository.list();
  assert.ok(experiments.some((e) => e.evidenceId === evidence.id));
});

test("recordExperiment rejects unknown evidenceId", async () => {
  await assert.rejects(
    recordExperiment(
      {
        seed: 124,
        candidateCount: 6,
        passed: true,
        violationCount: 0,
        durationMs: 5,
        evidenceId: "does-not-exist",
      },
      {
        evidenceRepository: prismaEvidenceRepository,
        experimentRepository: prismaExperimentRepository,
      },
    ),
    /does-not-exist not found/,
  );
});
