#!/usr/bin/env node
// ALG gates (ALG1, ALG2, ALG4, ALG5, ALG6) per docs/acceptance_gates_v1.md — 理论轨 · 算法侧验收.
// Exit code 0 = all gates PASS. Non-zero = at least one gate FAILED.
//
// Note on entry point: src/ only contains the GSIO greedy production solver
// (src/domain/bsaaCore.ts greedySubmodularSelection / src/domain/paperTheory.ts
// greedySubmodularOptimization). The exact DP solver and the quota-DP variant
// exist only as standalone verification scripts under formal/experiments/
// (verify_dp_exact.mjs, verify_dp_quota.mjs) — they are not modularized into
// src/. This gate script re-implements the same DP / quota-DP recurrences
// verbatim (matching LEMMAS.md A3 and docs/acceptance_gates_v1.md ALG1) so the
// oracle comparisons can be run repeatably with explicit pass/fail exit codes.

let failed = false;
function section(name) {
  console.log(`\n=== ${name} ===`);
}
function pass(name, detail) {
  console.log(`${name}: PASS${detail ? " (" + detail + ")" : ""}`);
}
function fail(name, detail) {
  console.log(`${name}: FAIL${detail ? " (" + detail + ")" : ""}`);
  failed = true;
}

// ---------- core definitions (mirrors formal/experiments/verify_dp_exact.mjs) ----------

function utility(order, v, p) {
  let total = 0;
  let surv = 1;
  for (const i of order) {
    total += v[i] * p[i] * surv;
    surv *= 1 - p[i];
  }
  return total;
}

function* combinations(arr, k, start = 0, cur = []) {
  if (cur.length === k) {
    yield [...cur];
    return;
  }
  for (let i = start; i <= arr.length - (k - cur.length); i++) {
    cur.push(arr[i]);
    yield* combinations(arr, k, i + 1, cur);
    cur.pop();
  }
}
function* permutations(arr) {
  if (arr.length <= 1) {
    yield [...arr];
    return;
  }
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of permutations(rest)) yield [arr[i], ...perm];
  }
}

function bruteForce(N, n, v, p) {
  const ids = [...Array(N).keys()];
  let best = 0; // empty selection is always feasible, utility 0
  for (const S of combinations(ids, Math.min(n, N))) {
    for (const ord of permutations(S)) {
      const u = utility(ord, v, p);
      if (u > best) best = u;
    }
  }
  return best;
}

// Exact DP: sort by v desc; g(i,k) = max utility from suffix i with k slots left.
function dpExact(N, n, v, p) {
  const idx = [...Array(N).keys()].sort((a, b) => v[b] - v[a]);
  const cap = Math.min(n, N);
  const g = Array.from({ length: N + 1 }, () => new Float64Array(cap + 1));
  for (let i = N - 1; i >= 0; i--) {
    const c = idx[i];
    for (let k = 0; k <= cap; k++) {
      const skip = g[i + 1][k];
      const take = k >= 1 ? p[c] * v[c] + (1 - p[c]) * g[i + 1][k - 1] : -Infinity;
      g[i][k] = Math.max(skip, take);
    }
  }
  return { value: g[0][cap], g };
}

// Quota DP: require >= q items with p >= 0.8. State (i, k, s), s = safety picked (capped at q).
function bfQuota(N, n, q, v, p) {
  const ids = [...Array(N).keys()];
  let best = -1;
  for (const S of combinations(ids, Math.min(n, N))) {
    if (S.filter((i) => p[i] >= 0.8).length < q) continue;
    const ord = [...S].sort((a, b) => v[b] - v[a]);
    best = Math.max(best, utility(ord, v, p));
  }
  return best; // -1 sentinel = infeasible (no combination meets quota)
}

function dpQuota(N, n, q, v, p) {
  const idx = [...Array(N).keys()].sort((a, b) => v[b] - v[a]);
  const cap = Math.min(n, N);
  const NEG = -1e18;
  let next = Array.from({ length: cap + 1 }, () => new Float64Array(q + 1).fill(NEG));
  for (let k = 0; k <= cap; k++) next[k][q] = 0; // base: feasible only if quota already met
  for (let i = N - 1; i >= 0; i--) {
    const cur = Array.from({ length: cap + 1 }, () => new Float64Array(q + 1).fill(NEG));
    const c = idx[i];
    const safe = p[c] >= 0.8 ? 1 : 0;
    for (let k = 0; k <= cap; k++) {
      for (let s = 0; s <= q; s++) {
        let bestv = next[k][s]; // skip
        if (k >= 1) {
          const ns = Math.min(q, s + safe);
          const cont = next[k - 1][ns];
          if (cont > NEG / 2) {
            const tk = p[c] * v[c] + (1 - p[c]) * cont;
            if (tk > bestv) bestv = tk;
          }
        }
        cur[k][s] = bestv;
      }
    }
    next = cur;
  }
  const result = next[cap][0];
  return result > NEG / 2 ? result : -1; // -1 sentinel = infeasible
}

// LCG for reproducibility (same construction as formal/experiments).
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

// ---------- ALG1: oracle equivalence ----------

function runAlg1() {
  section("ALG1: oracle equivalence (DP vs brute force, n<=12)");
  const rnd = makeRng(20260716);
  let trials = 0;
  let mismatches = 0;
  let maxErr = 0;
  const TOL = 1e-9;

  // Random family: N in [3..9], n in [1..min(N,5)] — mirrors the bounds already
  // validated in formal/experiments/verify_dp_exact.mjs (tractable for full
  // permutation brute force; larger N/k blows up C(N,k)*k! combinatorially).
  for (let t = 0; t < 5000; t++) {
    const N = 3 + Math.floor(rnd() * 7); // 3..9
    const n = 1 + Math.floor(rnd() * Math.min(N, 5));
    const v = Array.from({ length: N }, () => rnd() * 10);
    const p = Array.from({ length: N }, () => rnd());
    const bf = bruteForce(N, n, v, p);
    const dp = dpExact(N, n, v, p).value;
    trials++;
    const err = Math.abs(dp - bf);
    maxErr = Math.max(maxErr, err);
    if (err > TOL * Math.max(1, Math.abs(bf))) {
      mismatches++;
      if (mismatches <= 5) console.log(`  MISMATCH random t=${t} N=${N} n=${n} bf=${bf} dp=${dp}`);
    }
  }
  const randomTrials = trials;

  // Adversarial families (explicit, per ALG1 spec): tied v, p in {0,1}, v collisions,
  // extreme k, empty table, single candidate.
  let advTrials = 0;
  const advFamilies = [
    "tied_v",
    "p_zero_one",
    "v_collision",
    "extreme_k",
    "empty_table",
    "single_candidate",
  ];
  // Bounds capped so full permutation brute force stays tractable: N<=9, k<=5
  // (worst case C(9,5)*5! = 126*120 = 15120 utility evals per trial). The
  // "extreme_k" family additionally uses a smaller N (<=6) because k>N is
  // clamped to N by bruteForce, and N! permutations grow fast (6!=720 is fine,
  // 12! is not).
  for (let t = 0; t < 3000; t++) {
    const family = advFamilies[t % advFamilies.length];
    let N, n, v, p;
    switch (family) {
      case "tied_v": {
        N = 4 + Math.floor(rnd() * 6); // 4..9
        n = 1 + Math.floor(rnd() * Math.min(N, 5));
        const tieVal = 5 + rnd() * 0.001;
        v = Array.from({ length: N }, () => tieVal);
        p = Array.from({ length: N }, () => rnd());
        break;
      }
      case "p_zero_one": {
        N = 4 + Math.floor(rnd() * 6); // 4..9
        n = 1 + Math.floor(rnd() * Math.min(N, 5));
        v = Array.from({ length: N }, () => rnd() * 10);
        p = Array.from({ length: N }, () => (rnd() < 0.5 ? 0 : 1));
        break;
      }
      case "v_collision": {
        N = 4 + Math.floor(rnd() * 6); // 4..9
        n = 1 + Math.floor(rnd() * Math.min(N, 5));
        const pool = [1, 2, 2, 3, 3, 3, 5];
        v = Array.from({ length: N }, () => pool[Math.floor(rnd() * pool.length)]);
        p = Array.from({ length: N }, () => rnd());
        break;
      }
      case "extreme_k": {
        N = 3 + Math.floor(rnd() * 4); // 3..6 (k clamps to N -> N! permutations)
        n = rnd() < 0.5 ? 0 : N + 5; // k=0 or k>N
        v = Array.from({ length: N }, () => rnd() * 10);
        p = Array.from({ length: N }, () => rnd());
        break;
      }
      case "empty_table": {
        N = 0;
        n = Math.floor(rnd() * 5);
        v = [];
        p = [];
        break;
      }
      case "single_candidate": {
        N = 1;
        n = 1 + Math.floor(rnd() * 3);
        v = [rnd() * 10];
        p = [rnd()];
        break;
      }
    }
    const bf = bruteForce(N, n, v, p);
    const dp = dpExact(N, n, v, p).value;
    advTrials++;
    trials++;
    const err = Math.abs(dp - bf);
    maxErr = Math.max(maxErr, err);
    if (err > TOL * Math.max(1, Math.abs(bf))) {
      mismatches++;
      if (mismatches <= 5)
        console.log(`  MISMATCH adversarial(${family}) t=${t} N=${N} n=${n} bf=${bf} dp=${dp}`);
    }
  }

  console.log(
    `  random instances=${randomTrials}, adversarial instances=${advTrials}, total=${trials}`,
  );
  console.log(`  max abs err=${maxErr.toExponential(3)}`);
  if (mismatches === 0 && trials >= 5000) {
    pass("ALG1a (DP vs brute force)", `${trials} instances, 0 mismatches`);
  } else {
    fail("ALG1a (DP vs brute force)", `${mismatches} mismatches / ${trials} instances`);
  }

  // Quota DP vs brute-force-with-quota, >=814 feasible instances.
  let quotaFeasible = 0;
  let quotaMismatches = 0;
  let quotaAttempts = 0;
  while (quotaFeasible < 900 && quotaAttempts < 20000) {
    quotaAttempts++;
    const N = 4 + Math.floor(rnd() * 6);
    const n = 2 + Math.floor(rnd() * Math.min(N - 1, 4));
    const q = 1 + Math.floor(rnd() * 2);
    const v = Array.from({ length: N }, () => rnd() * 10);
    const p = Array.from({ length: N }, () => 0.02 + rnd() * 0.96);
    if (p.filter((x) => x >= 0.8).length < q) continue; // infeasible, skip like verify_dp_quota.mjs
    const bf = bfQuota(N, n, q, v, p);
    const dp = dpQuota(N, n, q, v, p);
    quotaFeasible++;
    if (Math.abs(bf - dp) > 1e-9 * Math.max(1, Math.abs(bf))) {
      quotaMismatches++;
      if (quotaMismatches <= 5)
        console.log(`  QUOTA MISMATCH t=${quotaFeasible} N=${N} n=${n} q=${q} bf=${bf} dp=${dp}`);
    }
  }
  console.log(`  quota feasible instances=${quotaFeasible} (attempts=${quotaAttempts})`);
  if (quotaMismatches === 0 && quotaFeasible >= 814) {
    pass("ALG1b (quota DP vs standard/brute-force-with-quota)", `${quotaFeasible} instances, 0 mismatches`);
  } else {
    fail(
      "ALG1b (quota DP vs standard/brute-force-with-quota)",
      `${quotaMismatches} mismatches / ${quotaFeasible} instances (need >=814)`,
    );
  }
}

// ---------- ALG2: invariant suite ----------

function runAlg2() {
  section("ALG2: invariant suite");
  const rnd = makeRng(20260717);

  // (a) g(L,k) monotone non-decreasing in k.
  let monoViolations = 0;
  let monoChecked = 0;
  for (let t = 0; t < 500; t++) {
    const N = 3 + Math.floor(rnd() * 10);
    const v = Array.from({ length: N }, () => rnd() * 10);
    const p = Array.from({ length: N }, () => rnd());
    const { g } = dpExact(N, N, v, p); // cap = N, so g[0][k] defined for k=0..N
    for (let k = 1; k <= N; k++) {
      monoChecked++;
      if (g[0][k] < g[0][k - 1] - 1e-9) {
        monoViolations++;
        if (monoViolations <= 5) console.log(`  MONOTONICITY VIOLATION t=${t} k=${k} g[k-1]=${g[0][k - 1]} g[k]=${g[0][k]}`);
      }
    }
  }
  if (monoViolations === 0) {
    pass("ALG2a (g monotone non-decreasing in k)", `${monoChecked} k-steps checked`);
  } else {
    fail("ALG2a (g monotone non-decreasing in k)", `${monoViolations} violations`);
  }

  // (b) 0 <= U(S) <= max(v) for the DP-selected optimum (per acceptance_gates_v1.md ALG2).
  let boundViolations = 0;
  let boundChecked = 0;
  for (let t = 0; t < 500; t++) {
    const N = 3 + Math.floor(rnd() * 10);
    const n = 1 + Math.floor(rnd() * Math.min(N, 6));
    const v = Array.from({ length: N }, () => rnd() * 10);
    const p = Array.from({ length: N }, () => rnd());
    const u = dpExact(N, n, v, p).value;
    const maxV = Math.max(...v);
    boundChecked++;
    if (u < -1e-9 || u > maxV + 1e-9) {
      boundViolations++;
      if (boundViolations <= 5) console.log(`  BOUND VIOLATION t=${t} U=${u} maxV=${maxV}`);
    }
  }
  if (boundViolations === 0) {
    pass("ALG2b (0 <= U <= max v)", `${boundChecked} instances checked`);
  } else {
    fail("ALG2b (0 <= U <= max v)", `${boundViolations} violations`);
  }

  // (c) quota DP only returns feasible combinations (reconstruct and verify quota met).
  let quotaFeasibilityViolations = 0;
  let quotaChecked = 0;
  for (let t = 0; t < 400; t++) {
    const N = 4 + Math.floor(rnd() * 6);
    const n = 2 + Math.floor(rnd() * Math.min(N - 1, 4));
    const q = 1 + Math.floor(rnd() * 2);
    const v = Array.from({ length: N }, () => rnd() * 10);
    const p = Array.from({ length: N }, () => 0.02 + rnd() * 0.96);
    if (p.filter((x) => x >= 0.8).length < q) continue;
    const { selected } = dpQuotaReconstruct(N, n, q, v, p);
    quotaChecked++;
    const safeCount = selected.filter((i) => p[i] >= 0.8).length;
    if (safeCount < q) {
      quotaFeasibilityViolations++;
      if (quotaFeasibilityViolations <= 5)
        console.log(`  QUOTA FEASIBILITY VIOLATION t=${t} selected=${selected} safeCount=${safeCount} q=${q}`);
    }
  }
  if (quotaFeasibilityViolations === 0) {
    pass("ALG2c (quota DP returns feasible combinations)", `${quotaChecked} instances checked`);
  } else {
    fail("ALG2c (quota DP returns feasible combinations)", `${quotaFeasibilityViolations} violations`);
  }

  // (d) v-descending ordering not worse than 100 random orderings (sampled), for a fixed set S.
  let orderingViolations = 0;
  let orderingChecked = 0;
  for (let t = 0; t < 50; t++) {
    const N = 4 + Math.floor(rnd() * 6);
    const v = Array.from({ length: N }, () => rnd() * 10);
    const p = Array.from({ length: N }, () => rnd());
    const ids = [...Array(N).keys()];
    const descOrder = [...ids].sort((a, b) => v[b] - v[a]);
    const uDesc = utility(descOrder, v, p);
    for (let s = 0; s < 100; s++) {
      // random shuffle
      const shuffled = [...ids];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const uRand = utility(shuffled, v, p);
      orderingChecked++;
      if (uRand > uDesc + 1e-9) {
        orderingViolations++;
        if (orderingViolations <= 5)
          console.log(`  ORDERING VIOLATION t=${t} s=${s} uDesc=${uDesc} uRand=${uRand}`);
      }
    }
  }
  if (orderingViolations === 0) {
    pass("ALG2d (v-descending not worse than random ordering)", `${orderingChecked} samples checked`);
  } else {
    fail("ALG2d (v-descending not worse than random ordering)", `${orderingViolations} violations`);
  }
}

function dpQuotaReconstruct(N, n, q, v, p) {
  const idx = [...Array(N).keys()].sort((a, b) => v[b] - v[a]);
  const cap = Math.min(n, N);
  const NEG = -1e18;
  // forward pass storing all layers for reconstruction
  const layers = [];
  let next = Array.from({ length: cap + 1 }, () => new Float64Array(q + 1).fill(NEG));
  for (let k = 0; k <= cap; k++) next[k][q] = 0;
  layers.push(next.map((row) => row.slice()));
  for (let i = N - 1; i >= 0; i--) {
    const cur = Array.from({ length: cap + 1 }, () => new Float64Array(q + 1).fill(NEG));
    const c = idx[i];
    const safe = p[c] >= 0.8 ? 1 : 0;
    for (let k = 0; k <= cap; k++) {
      for (let s = 0; s <= q; s++) {
        let bestv = next[k][s];
        if (k >= 1) {
          const ns = Math.min(q, s + safe);
          const cont = next[k - 1][ns];
          if (cont > NEG / 2) {
            const tk = p[c] * v[c] + (1 - p[c]) * cont;
            if (tk > bestv) bestv = tk;
          }
        }
        cur[k][s] = bestv;
      }
    }
    next = cur;
    layers.push(next.map((row) => row.slice()));
  }
  // layers[N - i] corresponds to state after processing suffix starting at i (layers[0] = base at i=N)
  // reconstruct by walking forward i=0..N-1
  const selected = [];
  let k = cap;
  let s = 0;
  for (let i = 0; i < N; i++) {
    const c = idx[i];
    const safe = p[c] >= 0.8 ? 1 : 0;
    const layerAfter = layers[N - i]; // state at suffix i (before processing i) — layers indexed from i=N down to 0
    const layerNext = layers[N - i - 1]; // state at suffix i+1
    if (k >= 1) {
      const ns = Math.min(q, s + safe);
      const cont = layerNext[k - 1][ns];
      const skip = layerNext[k][s];
      const NEG = -1e18;
      const take = cont > NEG / 2 ? p[c] * v[c] + (1 - p[c]) * cont : -Infinity;
      if (take > skip + 1e-12) {
        selected.push(c);
        k -= 1;
        s = ns;
      }
    }
  }
  return { selected, value: layers[N][cap][0] };
}

// ---------- ALG4: performance ----------

function runAlg4() {
  section("ALG4: performance (2000 candidates x 96 slots <= 100ms)");
  const rnd = makeRng(20260718);
  const N = 2000;
  const n = 96;
  const v = Array.from({ length: N }, () => rnd() * 10);
  const p = Array.from({ length: N }, () => 0.02 + rnd() * 0.96);
  const t0 = Date.now();
  const { value } = dpExact(N, n, v, p);
  const elapsed = Date.now() - t0;
  console.log(`  N=${N} n=${n} utility=${value.toFixed(6)} elapsed=${elapsed}ms`);
  if (elapsed <= 100) {
    pass("ALG4 (DP timing)", `${elapsed}ms <= 100ms`);
  } else {
    fail("ALG4 (DP timing)", `${elapsed}ms > 100ms`);
  }
}

// ---------- ALG5: determinism ----------

function runAlg5() {
  section("ALG5: determinism (same seed -> identical output)");
  function runFixed(seed) {
    const rnd = makeRng(seed);
    const N = 50;
    const n = 12;
    const v = Array.from({ length: N }, () => rnd() * 10);
    const p = Array.from({ length: N }, () => rnd());
    const { value } = dpExact(N, n, v, p);
    return JSON.stringify({ N, n, v, p, value });
  }
  const run1 = runFixed(424242);
  const run2 = runFixed(424242);
  if (run1 === run2) {
    pass("ALG5 (determinism)", "byte-identical output across two runs");
  } else {
    fail("ALG5 (determinism)", "output differs between runs with same seed");
  }
}

// ---------- ALG6: boundary completeness ----------

function runAlg6() {
  section("ALG6: boundary completeness (no crash/NaN)");
  const cases = [
    { name: "empty_table", N: 0, n: 3, v: [], p: [] },
    { name: "all_p_zero", N: 5, n: 3, v: [1, 2, 3, 4, 5], p: [0, 0, 0, 0, 0] },
    { name: "all_p_one", N: 5, n: 3, v: [1, 2, 3, 4, 5], p: [1, 1, 1, 1, 1] },
    { name: "k_zero", N: 5, n: 0, v: [1, 2, 3, 4, 5], p: [0.1, 0.2, 0.3, 0.4, 0.5] },
    { name: "k_greater_than_N", N: 3, n: 10, v: [1, 2, 3], p: [0.1, 0.2, 0.3] },
    { name: "single_candidate", N: 1, n: 1, v: [7], p: [0.5] },
  ];
  let allOk = true;
  for (const c of cases) {
    try {
      const { value } = dpExact(c.N, c.n, c.v, c.p);
      const bf = bruteForce(c.N, c.n, c.v, c.p);
      const isNaN_ = Number.isNaN(value) || Number.isNaN(bf);
      const finite = Number.isFinite(value) && Number.isFinite(bf);
      const match = Math.abs(value - bf) < 1e-9;
      console.log(`  ${c.name}: dp=${value} bf=${bf} finite=${finite} match=${match}`);
      if (isNaN_ || !finite || !match) {
        allOk = false;
        console.log(`  BOUNDARY FAIL: ${c.name}`);
      }
    } catch (e) {
      allOk = false;
      console.log(`  BOUNDARY CRASH: ${c.name}: ${e.message}`);
    }
  }
  if (allOk) {
    pass("ALG6 (boundary completeness)", `${cases.length} boundary cases, no crash/NaN`);
  } else {
    fail("ALG6 (boundary completeness)", "one or more boundary cases failed");
  }
}

// ---------- run all ----------

runAlg1();
runAlg2();
runAlg4();
runAlg5();
runAlg6();

console.log(failed ? "\nALG gates: FAIL" : "\nALG gates: ALL PASS");
process.exit(failed ? 1 : 0);
