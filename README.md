# BSAA/GSIO Theory for Gaokao Volunteer Recommendation

This repository contains the OR-paper-grade implementation of the **Bayesian Sequential Assignment with Absorption (BSAA)** and **Greedy Submodular Index Ordering (GSIO)** theory for the Gaokao university-admission recommendation problem.

It is intentionally split from the full product codebase so the mathematical artifacts can be reviewed, cited, and released independently.

## Scope

- `src/bsaaCore.ts` — core submodular set function, value-index ordering, greedy selection, brute-force oracle.
- `src/proofVerification.ts` — reproducible verification of Theorem 3.1, Theorem 4.2, Theorem 4.3.
- `src/paperTheory.ts` — Pareto frontier and parametric weight sampling helpers for the paper.
- `src/bsaaBacktest.ts` — backtesting utilities for calibrated risk models.
- `src/schemas.ts` — Zod runtime schemas; single source of truth for TS types, API contracts, and DB serialization.
- `src/db.ts` — SQLite persistence for evidence registry and experiment log.
- `tests/` — unit and property tests.
- `docs/` — `theory_framework.md` and `proof_check_manual.md` from prior theory work.
- `docs/sdd/` — SDD Box: architecture decisions, component specs, traceability matrix.

## What this repo is NOT

- It is not the product frontend or report generator.
- It does not contain province-specific policy adapters.
- It does not claim to have a trained admission-probability model.

## Getting started

```bash
npm install
# Copy the example env file or set DATABASE_URL yourself:
# DATABASE_URL="file:./bsaa-gaokao-theory.db"
npm run db:migrate:deploy
npm test
npm run verify:proofs
```

## Quality gates

All commits are guarded by:

- TypeScript strict mode
- ESLint with `@typescript-eslint/strict-type-checked`
- Prettier formatting
- Husky pre-commit: lint-staged + typecheck + test
- GitHub Actions: typecheck, lint, format, architecture guard, tests, proof verification
- Architecture guard (AST): forbids cross-layer imports and cycles

## Database

SQLite is used for local evidence registry and experiment log. Schema is defined in `prisma/schema.prisma`; runtime types and validation are defined in `src/schemas.ts`. Prisma v7 uses `prisma-adapter-sqlite` over Node.js built-in `node:sqlite`.

Common commands:

```bash
npm run db:migrate          # create a new migration during development
npm run db:migrate:deploy   # apply existing migrations
npm run db:generate         # regenerate Prisma client
npm run db:studio           # open Prisma Studio
```

## Citation

If you use this code in academic work, please cite the relevant theorems and the paper (TBD).
