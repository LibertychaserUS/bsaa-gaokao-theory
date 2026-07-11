## Summary
<!-- What does this PR change and why? -->

## Files read before editing
<!-- List the source/test/spec files you read before making changes. -->
- [ ] `src/bsaaCore.ts`
- [ ] `src/proofVerification.ts`
- [ ] `src/paperTheory.ts`
- [ ] `src/bsaaBacktest.ts`
- [ ] `docs/theory_framework.md`
- [ ] `docs/proof_check_manual.md`

## Interfaces changed
<!-- If any exported type or function signature changed, list them here. -->

## Theorem/proof impact
<!-- If this touches any theorem, proof, or invariant, describe the impact. -->

## Verification
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run format:check` passes
- [ ] `npm run test` passes
- [ ] `npm run verify:architecture` passes
- [ ] `npm run verify:proofs` passes

## Checklist
- [ ] I did not add any code-level constants that should live in configuration.
- [ ] I did not change behavior that has an existing regression test without updating the test.
- [ ] I did not introduce cross-layer imports.
