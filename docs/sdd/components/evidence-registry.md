# Component: Evidence Registry & Experiment Log

## 职责
为论文和可审计性提供持久化层：
- 记录定理、文献、官方数据来源（`Evidence`）。
- 记录每次验证/基准运行（`Experiment`）。
- 记录每次优化求解的审计日志（`OptimizationRun`）。

## 技术栈
- **数据库**：SQLite（通过 Prisma + `prisma-adapter-sqlite` + Node.js 内置 `node:sqlite`）。
- **Schema 来源**：Zod（`src/schemas.ts`）是单一真相来源。
- **读写校验**：所有写入前 Zod parse；所有读出后 Zod parse。

## 表结构

| 表 | 关键字段 | 用途 |
|---|---|---|
| `Evidence` | id, sourceType, title, authors, year, doi, url, citedIn, summary | 证据/文献注册表 |
| `Experiment` | seed, candidateCount, capacity, theorem, passed, violationCount, durationMs, evidenceId | 每次验证运行 |
| `OptimizationRun` | inputHash, outputHash, solverVersion, calibrationVersion, strategyVersion, gitCommit | 求解审计日志 |

## 接口
- `createEvidence(input)` / `getEvidence(id)` / `listEvidence()`
- `createExperiment(input)` / `listExperiments()`
- `createOptimizationRun(input)`

## 不变式
- `Evidence.id` 必须由调用方提供且全局唯一。
- `Experiment.evidenceId` 若存在，必须对应一条 `Evidence` 记录。
- 所有字符串字段 nullable 在 DB 中存储为 `NULL`，写入 Prisma 前转为 `undefined`。

## 依赖
- `src/schemas.ts`
- `prisma-adapter-sqlite`
- `@prisma/client`

## 测试
- `tests/db.test.ts`
- `tests/schemas.test.ts`
