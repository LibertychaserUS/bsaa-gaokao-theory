-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authors" TEXT,
    "year" INTEGER,
    "doi" TEXT,
    "url" TEXT,
    "citedIn" TEXT,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seed" INTEGER NOT NULL,
    "candidateCount" INTEGER NOT NULL,
    "capacity" INTEGER,
    "theorem" TEXT,
    "passed" BOOLEAN NOT NULL,
    "violationCount" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "metadataJson" TEXT,
    "gitCommit" TEXT,
    "evidenceId" TEXT,
    CONSTRAINT "Experiment_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OptimizationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inputHash" TEXT NOT NULL,
    "outputHash" TEXT NOT NULL,
    "solverVersion" TEXT NOT NULL,
    "calibrationVersion" TEXT,
    "strategyVersion" TEXT,
    "gitCommit" TEXT,
    "logPath" TEXT
);
