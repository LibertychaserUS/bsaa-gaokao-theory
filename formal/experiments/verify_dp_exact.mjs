// Verify: P_pi (select n of N + order to maximize sequential-absorption utility)
// is EXACTLY solved by DP over v-descending order, vs brute force oracle.
// Also compare greedy (GSIO) to show it can be strictly suboptimal while DP is not.

function utility(order, v, p) {
  let total = 0, surv = 1;
  for (const i of order) { total += v[i] * p[i] * surv; surv *= 1 - p[i]; }
  return total;
}

function* combinations(arr, k, start = 0, cur = []) {
  if (cur.length === k) { yield [...cur]; return; }
  for (let i = start; i <= arr.length - (k - cur.length); i++) {
    cur.push(arr[i]); yield* combinations(arr, k, i + 1, cur); cur.pop();
  }
}
function* permutations(arr) {
  if (arr.length <= 1) { yield [...arr]; return; }
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of permutations(rest)) yield [arr[i], ...perm];
  }
}

function bruteForce(N, n, v, p) {
  const ids = [...Array(N).keys()];
  let best = -1;
  for (const S of combinations(ids, Math.min(n, N))) {
    for (const ord of permutations(S)) {
      const u = utility(ord, v, p);
      if (u > best) best = u;
    }
  }
  return best;
}

// Exact DP: sort by v desc; g(i,k) = max utility from suffix i with k slots left,
// normalized to survival=1. Choose i: p_i*v_i + (1-p_i)*g(i+1,k-1); skip: g(i+1,k).
function dpExact(N, n, v, p) {
  const idx = [...Array(N).keys()].sort((a, b) => v[b] - v[a]);
  const cap = Math.min(n, N);
  // g[k] over suffix, iterate i from N-1 down
  const g = Array.from({ length: N + 1 }, () => new Float64Array(cap + 1));
  for (let i = N - 1; i >= 0; i--) {
    const c = idx[i];
    for (let k = 0; k <= cap; k++) {
      const skip = g[i + 1][k];
      const take = k >= 1 ? p[c] * v[c] + (1 - p[c]) * g[i + 1][k - 1] : -Infinity;
      g[i][k] = Math.max(skip, take);
    }
  }
  return g[0][cap];
}

// GSIO greedy for comparison
function fOfSet(S, v, p) {
  const ord = [...S].sort((a, b) => v[b] - v[a]);
  return utility(ord, v, p);
}
function greedy(N, n, v, p) {
  const S = [];
  const cap = Math.min(n, N);
  for (let step = 0; step < cap; step++) {
    let bestC = -1, bestGain = -Infinity;
    const cur = fOfSet(S, v, p);
    for (let c = 0; c < N; c++) {
      if (S.includes(c)) continue;
      const gain = fOfSet([...S, c], v, p) - cur;
      if (gain > bestGain + 1e-12) { bestGain = gain; bestC = c; }
    }
    S.push(bestC);
  }
  return fOfSet(S, v, p);
}

// LCG for reproducibility
let state = 20260715 >>> 0;
const rnd = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0x100000000; };

let trials = 0, dpMismatch = 0, greedySubopt = 0, maxDpErr = 0, minGreedyRatio = 1;
for (let t = 0; t < 3000; t++) {
  const N = 3 + Math.floor(rnd() * 7);       // 3..9
  const n = 1 + Math.floor(rnd() * Math.min(N, 5)); // 1..min(N,5)
  const v = Array.from({ length: N }, () => rnd() * 10);
  const p = Array.from({ length: N }, () => 0.02 + rnd() * 0.96);
  const bf = bruteForce(N, n, v, p);
  const dp = dpExact(N, n, v, p);
  const gr = greedy(N, n, v, p);
  trials++;
  const err = Math.abs(dp - bf);
  if (err > 1e-9) { dpMismatch++; if (dpMismatch <= 3) console.log(`DP MISMATCH t=${t} N=${N} n=${n} bf=${bf} dp=${dp}`); }
  maxDpErr = Math.max(maxDpErr, err);
  if (gr < bf - 1e-9) { greedySubopt++; minGreedyRatio = Math.min(minGreedyRatio, gr / bf); }
}
console.log(`trials=${trials}`);
console.log(`DP mismatches vs brute force: ${dpMismatch} (max abs err ${maxDpErr.toExponential(2)})`);
console.log(`Greedy strictly suboptimal in ${greedySubopt} trials; worst greedy/opt ratio = ${minGreedyRatio.toFixed(6)}`);

// Adversarial hunt: clustered values, extreme probabilities, near-ties
let advTrials = 0, advGreedyBad = 0, advWorst = 1;
for (let t = 0; t < 5000; t++) {
  const N = 4 + Math.floor(rnd() * 7); // 4..10
  const n = 2 + Math.floor(rnd() * Math.min(N - 1, 5));
  const mode = t % 4;
  const v = [], p = [];
  for (let i = 0; i < N; i++) {
    if (mode === 0) { v.push(5 + rnd() * 0.01); p.push(rnd()); }                    // near-tied v
    else if (mode === 1) { v.push(rnd() * 10); p.push(rnd() < 0.5 ? 0.001 + rnd() * 0.01 : 0.98 + rnd() * 0.019); } // extreme p
    else if (mode === 2) { v.push(Math.pow(10, rnd() * 3)); p.push(rnd()); }        // wide-range v
    else { v.push(rnd() < 0.3 ? 100 : rnd()); p.push(rnd() < 0.3 ? 0.01 : 0.5 + rnd() * 0.5); } // lottery vs safe
  }
  const bf = bruteForce(N, n, v, p);
  const gr = greedy(N, n, v, p);
  const dp = dpExact(N, n, v, p);
  advTrials++;
  if (Math.abs(dp - bf) > 1e-9 * Math.max(1, bf)) console.log(`DP MISMATCH adv t=${t}`);
  if (gr < bf - 1e-9 * Math.max(1, bf)) { advGreedyBad++; advWorst = Math.min(advWorst, gr / bf); if (advGreedyBad <= 3) console.log(`GREEDY SUBOPT t=${t} N=${N} n=${n} ratio=${(gr/bf).toFixed(9)} v=${v.map(x=>x.toFixed(3))} p=${p.map(x=>x.toFixed(3))}`); }
}
console.log(`adversarial trials=${advTrials}, greedy suboptimal=${advGreedyBad}, worst ratio=${advWorst}`);
