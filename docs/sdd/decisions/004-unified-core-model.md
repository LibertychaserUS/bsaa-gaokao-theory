# ADR 004: Unified Core Model and Layered Pipeline

## Status

Accepted — implementation in progress.

## Context

The repository currently contains three overlapping BSAA/GSIO implementations:

- `src/domain/bsaaCore.ts`: simplified `{ value, probability }` API for fast use-cases.
- `src/domain/bsaaBacktest.ts`: Monte-Carlo backtest engine with its own copy of greedy/brute-force/verification logic.
- `src/domain/paperTheory.ts`: paper-official prototype-based model (`prototypeValues` + `π`).

This duplication creates maintenance risk and makes it unclear which model the paper is based on. In addition, the theory framework describes a four-layer pipeline:

1. Layer 0 — Auto-Tiering: `T(r)` maps rank to tier.
2. Layer 1 — Hard constraints: region, rank interval, subject requirements.
3. Layer 2 — Preference inference: questionnaire → posterior `π`.
4. Layer 3 — Submodular optimization: select `n` candidates and order them.

Only Layer 3 is implemented.

## Decision

1. **Single source of truth for the paper model**: `src/domain/paperTheory.ts`.
   - Candidate shape: `{ id, probability, prototypeValues[], qualityScore?, tierScore? }`.
   - Preference shape: `π ∈ Δ_{m_t}`.
   - `valueForPreference(c, π)` computes `v_c(π)`.
   - All theorems (Value-Index, submodularity, GSIO, Pareto) live here.

2. **`bsaaCore.ts` becomes a thin compatibility layer** for callers that only need `{ value, probability }`.
   - It keeps the same public API so `optimizePlan.ts` and `proofVerification.ts` continue to work.
   - Internally it may delegate to `paperTheory.ts` or keep its optimized implementation; either way the semantics must match.

3. **`bsaaBacktest.ts` is refactored into a pure backtest engine**.
   - Remove duplicated greedy, brute-force, and verification logic.
   - Import core algorithms from `paperTheory.ts`.
   - Keep candidate/scenario generation and metric aggregation.

4. **Layer 0/1/2 are implemented as new domain modules**.
   - `src/domain/tier.ts`: `computeTier(rank, totalRanked, thresholds)` and `filterReachableCandidates(candidates, tier)`.
   - `src/domain/preferenceInference.ts`: Dirichlet-Categorical posterior and softmax questionnaire inference.
   - Application orchestrators wire them together.

5. **No MILP/CP baseline for now**.
   - The paper is Bayesian/sequential; comparison baselines are the transparent 冲/稳/保 heuristic and random ordering.
   - MILP/CP may be added later only if a reviewer explicitly asks for it.

## Consequences

- `paperTheory.ts` is the authoritative reference for all paper claims.
- `bsaaBacktest.ts` shrinks significantly and becomes easier to maintain.
- New modules have clear, testable boundaries.
- Schema layer is extended to support the prototype model.

## Implementation Order

1. Extend `src/schemas.ts` with `candidatePrototypeSchema` and `preferenceVectorSchema`.
2. Refactor `bsaaBacktest.ts` to depend on `paperTheory.ts`.
3. Add `src/domain/tier.ts` + tests.
4. Add `src/domain/preferenceInference.ts` + tests.
5. Add application orchestrator for the full Layer 0→3 pipeline.
6. Fix engineering debt identified by code-review (Husky, CI, test isolation, unused deps).
7. Run all gates and push.
