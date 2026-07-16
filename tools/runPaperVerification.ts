#!/usr/bin/env node
/**
 * CLI entry point for the paper-official verification suite (paperTheory.ts).
 *
 * This verifies the SAME implementation that `docs/paper.md` cites as the
 * "Verified implementation" (src/domain/paperTheory.ts), closing the gap where
 * CI previously only exercised src/domain/proofVerification.ts (a separate
 * third implementation over bsaaCore).
 *
 * Run with: npm run verify:paper
 */

import { runPaperVerificationSuite } from "../src/domain/paperTheory.js";

const log = runPaperVerificationSuite();

console.log("BSAA/GSIO Paper-Official Verification Report (paperTheory.ts)");
console.log();

const checks = [
  { name: "Value-Index ordering", result: log.valueIndex },
  { name: "Submodularity", result: log.submodularity },
  { name: "Greedy (1-1/e) approximation", result: log.approximationRatio },
] as const;

let failed = false;
for (const check of checks) {
  const status = check.result.ok ? "PASS" : "FAIL";
  console.log(`${status} ${check.name}: ${check.result.message}`);
  if (!check.result.ok) failed = true;
}

if (failed) {
  process.exit(1);
}
