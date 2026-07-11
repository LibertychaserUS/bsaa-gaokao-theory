#!/usr/bin/env node
/**
 * CLI entry point for the BSAA/GSIO proof verification battery.
 *
 * Run with: npm run verify:proofs
 */

import { runProofVerificationBattery } from "../src/proofVerification.js";

const battery = runProofVerificationBattery();

console.log("BSAA/GSIO Proof Verification Report");
console.log(`Seed: ${battery.seed}`);
console.log(`Trials: ${battery.summary.totalTrials}`);
console.log(`Passed: ${battery.summary.passedTrials}`);
console.log(`Failed: ${battery.summary.failedTrials}`);
console.log();

for (const trial of battery.trials) {
  const status = trial.ok ? "PASS" : "FAIL";
  const capacity = trial.capacity !== undefined ? ` n=${trial.capacity}` : "";
  console.log(`${status} ${trial.theorem} N=${trial.candidateCount}${capacity}`);
}

console.log();
for (const check of battery.batteryChecks) {
  const status = check.ok ? "PASS" : "FAIL";
  console.log(`${status} ${check.name}: ${check.detail}`);
}

if (battery.summary.failedTrials > 0 || battery.batteryChecks.some((c) => !c.ok)) {
  process.exit(1);
}
