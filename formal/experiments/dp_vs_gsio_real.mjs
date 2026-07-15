// Compare GSIO greedy vs exact DP on the REAL paper instance (HLJ 2026 physics).
import { loadConfig, buildCandidates } from "/Users/nihao/Documents/bsaa-gaokao-theory/dist/src/infrastructure/candidateProjection.js";
import {
  greedySubmodularOptimization,
  evaluateSequence,
  optimalOrderForSet,
  valueForPreference,
} from "/Users/nihao/Documents/bsaa-gaokao-theory/dist/src/domain/paperTheory.js";

const cfg = loadConfig("/Users/nihao/Documents/bsaa-gaokao-theory/config/paper-sample.json");
cfg.dataPaths.db = "/Users/nihao/Documents/bsaa-gaokao-theory/data/gaokao.bsaa.sqlite";
cfg.dataPaths.onePointSegment = "/Users/nihao/Documents/bsaa-gaokao-theory/data/hlj_2026_physics_one_point_segment.csv";
const candidates = buildCandidates(cfg);
const pi = cfg.optimization.preferencePi;
const n = cfg.optimization.slotCount;
console.log(`candidates=${candidates.length} slots=${n}`);

// GSIO
const t0 = Date.now();
const gsio = greedySubmodularOptimization(candidates, n, pi);
const t1 = Date.now();
console.log(`GSIO utility = ${gsio.utility.toFixed(10)} (${t1 - t0}ms)`);

// Exact DP over v-descending order
const scored = candidates.map((c) => ({ id: c.id, p: c.probability, v: valueForPreference(c, pi) }));
scored.sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
const N = scored.length;
const t2 = Date.now();
// g[i][k]: max utility from suffix i with k slots, survival-normalized; rolling arrays + choice tracking
const cap = Math.min(n, N);
let next = new Float64Array(cap + 1);
const take = Array.from({ length: N }, () => new Uint8Array(cap + 1));
for (let i = N - 1; i >= 0; i--) {
  const cur = new Float64Array(cap + 1);
  const { p, v } = scored[i];
  for (let k = 0; k <= cap; k++) {
    const skip = next[k];
    const tk = k >= 1 ? p * v + (1 - p) * next[k - 1] : -Infinity;
    if (tk > skip + 1e-15) { cur[k] = tk; take[i][k] = 1; } else cur[k] = skip;
  }
  next = cur;
}
const dpUtility = next[cap];
// reconstruct
const chosen = [];
let k = cap;
for (let i = 0; i < N && k > 0; i++) if (take[i][k]) { chosen.push(scored[i].id); k--; }
const t3 = Date.now();
console.log(`DP   utility = ${dpUtility.toFixed(10)} (${t3 - t2}ms)`);
console.log(`DP - GSIO = ${(dpUtility - gsio.utility).toExponential(3)}`);
// cross-check DP utility by evaluating the reconstructed sequence with paperTheory
const order = optimalOrderForSet(chosen, candidates, pi);
console.log(`DP sequence re-evaluated = ${evaluateSequence(order, candidates, pi).toFixed(10)}`);
const sameSet = new Set(gsio.selectedIds);
console.log(`set overlap = ${chosen.filter((id) => sameSet.has(id)).length}/${cap}`);
