# Traceability Matrix

| 需求/目标 | 设计决策 | 代码文件 | 测试文件 | 文档 |
|---|---|---|---|---|
| Value-Index 最优排序定理 | Zod 定义 `BsaaCandidate`；`valueIndexOrder` 按 `value` 降序 | `src/bsaaCore.ts` | `tests/bsaaCore.test.ts` | `docs/sdd/components/bsaa-core.md` |
| 子模集函数 | `evaluateSetFunction` 排序后算期望效用 | `src/bsaaCore.ts` | `tests/bsaaCore.test.ts` | `docs/sdd/components/bsaa-core.md` |
| GSIO `(1-1/e)` 近似 | `greedySubmodularSelection` 保持 `selected` 有序 | `src/bsaaCore.ts` | `tests/bsaaCore.test.ts`, `tests/proofVerification.test.ts` | `docs/sdd/components/bsaa-core.md` |
| 定理可复现验证 | seeded 随机 + 暴力 oracle | `src/proofVerification.ts` | `tests/proofVerification.test.ts` | `docs/sdd/components/proof-verification.md` |
| 运行时输入校验 | Zod-first schemas | `src/schemas.ts` | `tests/schemas.test.ts` | `docs/sdd/decisions/001-zod-source-of-truth.md` |
| 后端分层架构 | Layered / Hexagonal | `src/domain/`, `src/application/`, `src/ports/`, `src/adapters/` | `tests/integration.test.ts` | `docs/sdd/decisions/003-backend-architecture.md` |
| 优化计划用例 | Application layer orchestration | `src/application/optimizePlan.ts` | `tests/integration.test.ts` | `docs/sdd/components/backend-layers.md` |
| 记录实验用例 | Application layer orchestration | `src/application/recordExperiment.ts` | `tests/integration.test.ts` | `docs/sdd/components/backend-layers.md` |
| 证据/实验可审计 | SQLite + Prisma + Zod | `src/db.ts`, `prisma/schema.prisma` | `tests/db.test.ts` | `docs/sdd/components/evidence-registry.md` |
| 防止跨层依赖 | AST architecture guard | `tools/architecture-guard.mjs` | 间接：`npm run verify:architecture` | `docs/sdd/README.md` |
| 代码风格一致 | ESLint + Prettier | `eslint.config.mjs`, `.prettierrc.json` | 间接：`npm run lint`, `npm run format:check` | 本文件 |
| 提交前质量门 | Husky + lint-staged | `.husky/pre-commit` | 手动触发 | 本文件 |
| CI 质量门 | GitHub Actions | `.github/workflows/ci.yml` | CI 自动跑 | 本文件 |
