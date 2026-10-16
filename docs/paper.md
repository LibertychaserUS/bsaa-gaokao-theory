# Bayesian Sequential Assignment with Absorption for Gaokao Volunteer Recommendation

**Zhiyuan Zhang**

**Abstract**

Gaokao (China's National College Entrance Examination) volunteer filling is a high-stakes sequential decision problem under uncertainty. Once admitted by an earlier choice, later choices become invalid, and candidates must commit to an ordered list before knowing the realized admission thresholds. We formalize this task as **Bayesian Sequential Assignment with Absorption (BSAA)** and show that the problem admits a clean structural characterization: (1) for any fixed candidate set the optimal ordering is independent of admission probabilities and follows a **Value-Index** rule (distribution-free: optimal under any joint distribution of admission outcomes); (2) the induced set function is monotone submodular; and (3) the greedy optimizer with internal ordering (GSIO) is exactly optimal in the cardinality-constrained regime, the optimal portfolios nested in the capacity constraint—exactness that follows from the nestedness structure of simultaneous search (Chade and Smith, 2006; Kapur and Hong, 2022) and is independently certified by a machine-checked exact dynamic program. We further prove that the greedy output is piecewise constant on the preference simplex with a polynomial number of regions; the simplex therefore carries finitely many distinct recommendations—a handful in our sweep—making slider-based Pareto-frontier exploration tractable. Using a real 2026 Heilongjiang physics-track dataset with 1,957 eligible programs, GSIO improves expected path utility by $21.4\%$ over the transparent reach/steady/safety baseline while maintaining comparable admission safety. The ordering, submodularity, and exact-dynamic-programming lemmas are machine-checked in Lean 4 with zero unfinished proofs; all quantitative claims pass exhaustive numerical verification, and all artifacts are publicly reproducible.

---

## 1. Introduction

Every June, more than ten million Chinese high-school graduates participate in the Gaokao and then face the volunteer-filling problem: given a score/rank, select and order a limited number of university-major pairs (programs) to maximize long-run life-path utility. The challenge is not merely ranking a few alternatives; it is a **sequential absorption** problem: once a candidate is admitted by a program, all subsequent choices on the list are discarded. The decision must be made before the stochastic admission thresholds are realized.

Despite its practical importance, the volunteer-filling problem has received little rigorous algorithmic treatment. Commercial systems typically rely on rule-based heuristics such as reach/steady/safety (*chong/wen/bao*): fill roughly one third of slots with high-risk high-reward programs, one third with medium-risk programs, and one third with safe programs. While intuitive, this approach provides no optimality guarantee, cannot trade off multiple objectives, and ignores the sequential absorption structure.

This paper proposes a principled framework. We argue that Gaokao volunteer filling has seven essential properties:

1. **Sequentiality**: the decision is an ordered list, not a set.
2. **Absorption**: admission by an earlier program invalidates later ones.
3. **Stochasticity**: admission thresholds are unknown random variables.
4. **Incomplete information**: students only hold a prior distribution over their preferences.
5. **Multi-dimensionality**: each program is a vector of attributes (school tier, major, city, tuition, ...).
6. **Path-dependent preferences**: utility depends on life-trajectory match, not just immediate reward.
7. **Irreversibility**: once admitted, the student cannot re-optimize in the same admission cycle.

These properties define our formalization of the problem as **Bayesian Sequential Assignment with Absorption (BSAA)**. The absorption-portfolio structure is shared with the simultaneous-search literature [2, 6] and the submodular greedy machinery is standard [8]; building on these, this paper contributes a distribution-free ordering guarantee, exactness of the deployed optimizer, a preference-parametric characterization of the recommendation map, and a calibrated end-to-end evaluation on real admission data. Concretely:

- A formal BSAA model with a four-layer pipeline: auto-tiering, hard-constraint filtering, Bayesian preference inference, and submodular optimization.
- **Theorem 4.1 (Value-Index Optimality)**: for any fixed set of programs, the optimal ordering depends only on a path-similarity score $v_c(\pi)$, is independent of admission probabilities $p_c$, and is optimal under any joint distribution of admission outcomes (no independence required).
- **Theorem 4.3 (Submodularity)**: the induced set function $f_\pi(S)$ is monotone and submodular.
- **Theorem 4.4 (Exact Optimality)**: GSIO is exactly optimal—optimal portfolios are nested in the capacity constraint, so the marginal-improvement optimizer coincides with the optimum [2, 6]; the optimum is independently certified by a machine-checked exact dynamic program, and exhaustive sweeps match brute force exactly.
- **Theorem 4.5 (Piecewise Constancy)**: the greedy output is piecewise constant on the preference simplex with a polynomial number of regions, enabling interactive Pareto exploration.
- An end-to-end empirical validation on real 2026 Heilongjiang Gaokao data with a calibrated admission-probability model, comparing GSIO against the transparent reach/steady/safety baseline.

All claims are accompanied by a reproducible verification harness, including Lean 4 machine-checked proofs (with no unfinished steps) for the ordering and dynamic-programming lemmas.

---

## 2. Related Work

**College admission and matching.** Gale and Shapley's stable matching theory [5] underlies many centralized matching markets. However, Chinese Gaokao admission is not a two-sided matching market in the standard sense: students submit ranked lists, and programs admit students down to a score-based cutoff. The strategic structure is closer to **serial dictatorship** with stochastic cutoffs, but with the added twist that students do not know their true preferences precisely.

**Sequential decision making under uncertainty.** The absorption structure of Gaokao volunteering resembles the **secretary problem** [4], **optimal stopping** [9], and reservation-index search [10], but with multiple attributes, non-stationary distributions, and a cardinality constraint rather than a single selection. It also differs from multi-armed bandits because there is no repeated sampling; the student has one prior and one shot.

**Simultaneous search and college-application portfolios.** The absorption structure studied here is the college-application portfolio problem of Chade and Smith [2] and Kapur and Hong [6]: a decision maker selects among ranked stochastic options of which at most one success is exercised, maximizing the expected value of the best success. Kapur and Hong [6] give a modern treatment of the equal-cost (cardinality-constrained) case, showing that the optimal portfolios are nested in the capacity constraint—which yields an exact polynomial-time algorithm—while heterogeneous costs make the problem NP-complete. BSAA specializes this structure to the Gaokao setting, where options are multi-attribute programs, values are preference-dependent, and admission probabilities must be calibrated from historical rank data.

**Submodular optimization.** Nemhauser, Wolsey, and Fisher [8] established the classical $(1-1/e)$ greedy approximation for monotone submodular maximization under a cardinality constraint. Feige [3] proved that this ratio is tight under standard complexity assumptions, and Krause and Golovin [7] give a modern survey of submodular maximization techniques. Extensions to non-submodular objectives, surveyed by Bian et al. [1], are relevant when the independence assumption behind absorption probabilities is relaxed. In the Gaokao setting, submodularity arises naturally from the absorption structure, and our synthesis of these tools yields a distribution-free ordering guarantee and machine-checked structural lemmas (Section 4).

**Existing Gaokao products.** Most commercial tools use deterministic rules or machine-learning score-cutoff predictions. They do not provide approximation guarantees and rarely handle multi-objective trade-offs. Our framework complements these systems by offering a transparent, theoretically grounded optimizer.

---

## 3. Problem Formulation

### 3.1 Axioms and model

A student has a normalized rank $r \in [1, R_{\text{total}}]$ and a preference distribution $\pi$ over a set of prototypes $\mathcal{K}$. The pipeline has four layers:

- **Layer 0 (Auto-Tiering)**: a tier function $\mathcal{T}(r)$ maps rank to a tier bucket $t \in \{1, \dots, T\}$.
- **Layer 1 (Hard Constraints)**: filter by province, subject type, batch, subject requirements, budget, etc.
- **Layer 2 (Preference Inference)**: a questionnaire $I$ updates the prior to a posterior $\pi \in \Delta_{m_t}$.
- **Layer 3 (Optimization)**: select $n$ programs from the reachable candidate set $\mathcal{C}'_t$ and order them.

The full pipeline is shown in Figure 1.

![Figure 1: The BSAA/GSIO four-layer pipeline. Auto-tiering maps rank to a tier bucket; hard-constraint filtering removes infeasible programs; Bayesian preference inference updates the prior to a posterior $\pi$; GSIO selects and orders the final volunteer list.](figures/fig1_pipeline.svg)

*Figure 1: The BSAA/GSIO four-layer pipeline.*

For each program $c \in \mathcal{C}'_t$ we have:

- $p_c \in (0,1)$: estimated independent admission probability.
- $\mu(c) \in \mathbb{R}_{\ge 0}^d$: attribute vector.
- $\mu_k \in \mathbb{R}_{\ge 0}^d$: prototype attribute vector for $k \in \mathcal{K}_t$.
- $v_c(\pi) = \sum_{k \in \mathcal{K}_t} \pi_k \langle \mu(c), \mu_k \rangle$: path-similarity score.

### 3.2 Expected utility

For an ordered list $x = (x_1, \dots, x_n)$, the expected utility under sequential absorption is

$$
U(x; \pi) = \sum_{k=1}^{n} v_{x_k}(\pi) \, p_{x_k} \prod_{j=1}^{k-1}(1 - p_{x_j}).
\tag{1}
$$

This formula captures the fact that the $k$-th program contributes only if all previous programs reject the student.

The optimization problem is

$$
\max_{S \subseteq \mathcal{C}'_t, \ |S| = n} f_\pi(S),
\qquad
f_\pi(S) = \max_{\sigma \in \Pi(S)} U(\sigma; \pi).
\tag{P$_\pi$}
$$

---

## 4. Theoretical Results

### 4.1 Value-Index optimality

**Theorem 4.1.** For any fixed set $S$ and any preference $\pi$, an optimal ordering $\sigma^*$ of $S$ sorts programs by $v_c(\pi)$ in non-increasing order (ties broken arbitrarily).

*Proof sketch.* Consider two adjacent positions $k, k+1$ with programs $a, b$. Let $P_0$ be the probability that all earlier programs fail. The difference in expected utility between $(a,b)$ and $(b,a)$ is

$$
\Delta(a,b) - \Delta(b,a) = P_0 \, p_a p_b \, (v_a(\pi) - v_b(\pi)).
$$

Since $P_0 p_a p_b > 0$, swapping is beneficial iff $v_a(\pi) < v_b(\pi)$. By the adjacent-swap (bubble-sort) argument, the $v$-descending order is globally optimal. ∎

**Corollary 4.2.** $f_\pi(S) = U(\sigma^*_S; \pi)$ where $\sigma^*_S$ is the $v$-descending order of $S$.

### 4.2 Submodularity

**Theorem 4.3.** For fixed $\pi$, $f_\pi$ is monotone and submodular on $\mathcal{C}'_t$.

*Proof sketch.* The Value-Index corollary gives the expectation identity $f_\pi(S)=\mathbb{E}\big[\max_{c\in S} v_c(\pi) X_c\big]$, where $X_c$ are the independent admission indicators. Monotonicity is immediate since $v_c(\pi)\ge 0$. For submodularity, couple all indicators on one probability space and fix a realization $\omega$: the marginal contribution of adding $e$ to $S$ is $\max(M_S, v_e X_e)-M_S$ with $M_S=\max_{c\in S} v_c X_c$. Since $A\subseteq B$ implies $M_A\le M_B$ pointwise and $m\mapsto \max(m,x)-m$ is non-increasing in $m$, the pointwise marginal for $A$ dominates that for $B$; taking expectations yields the diminishing-returns inequality. The coupling argument requires no independence; only the expectation identity uses the independence assumed in the model. This argument is formalized in Lean 4 with zero unfinished proofs (repository `formal/`). ∎

### 4.3 Exact optimality of the greedy optimizer

**Algorithm 1 (GSIO).**

```
Input: candidates C', capacity n, preference π
S ← ∅
for i = 1, ..., n:
    c* ← argmax_{c ∈ C' \ S} [f_π(S ∪ {c}) - f_π(S)]
    S ← S ∪ {c*}
return SortDescending(S, key = v_c(π))
```

**Theorem 4.4.** Let $S^G$ be the output of GSIO and $S^*$ an optimal set. Then $S^G$ is exactly optimal:

$$
f_\pi(S^G) = f_\pi(S^*).
$$

*Proof sketch.* By Theorem 4.1 and its corollary, (P$_\pi$) is an instance of the equal-cost college-application portfolio problem: optimal portfolios are nested in the capacity constraint, and the marginal-improvement (greedy) procedure returns an optimum [2, 6]. The repository also provides an exact $O(Nn)$ dynamic program for the same problem, machine-checked in Lean 4, and exhaustive numerical checks on small instances find no counterexample. The classical $(1-1/e)$ guarantee for cardinality-constrained submodular maximization [8] is retained only as a fallback bound when additional hard constraints (e.g., risk-bucket quotas) break the nestedness structure. ∎

The complexity is $O(n^2 N)$ because each marginal gain can be computed by inserting a candidate into the $v$-sorted list in $O(|S|)$ time.

### 4.4 Parametric Pareto frontier

When preferences are multi-dimensional, different weight vectors $\pi$ may yield different optimal sets. Let $S^G(\pi)$ denote the GSIO output for weight $\pi$.

**Theorem 4.5.** For fixed $n$ and $m_t = |\mathcal{K}_t|$, the mapping $\pi \mapsto S^G(\pi)$ is piecewise constant on the preference simplex $\Delta_{m_t}$. The number of regions is bounded by

$$
L = O\left(N^{(n+1)(m_t-1)}\right).
$$

*Proof sketch.* Every decision boundary in GSIO is an affine hyperplane in $\pi$-space: either $v_c(\pi) = v_{c'}(\pi)$ or a marginal-gain equality. There are $M = O(N^{n+1})$ such hyperplanes. By the hyperplane-arrangement bound of Zaslavsky [11], $M$ hyperplanes in $d = m_t - 1$ dimensions partition the space into at most $O(M^d)$ regions. ∎

At realistic sizes the worst-case region count is enormous (for $n = 45$, $N = 1957$, $m_t = 7$ the bound exceeds $10^{900}$), but the guarantee itself is exact: the recommendation map is piecewise constant, so any slider interaction jumps between finitely many precomputable states, and our sweep realizes only a handful of distinct optima (Section 5).

---

## 5. Experiments

### 5.1 Dataset

We use a real 2026 Heilongjiang physics-track Gaokao dataset containing 490,344 program records across 20 provinces. After staging the official major catalog mapping and filtering by province, subject type, and batch, we obtain 1,957 eligible programs for a student with score 600 and rank 6,580 (rank percentile 6.0\%). The one-point-segment table reports 109,811 total ranked students.

### 5.2 Baselines and metrics

**Transparent reach/steady/safety baseline (*chong/wen/bao*).** Programs are partitioned into three probability buckets: reach $[0.1, 0.3]$, steady $[0.4, 0.7]$, safety $[0.8, 1.0]$. Within each bucket programs are sorted by school tier; the final list preserves reach → steady → safety ordering.

**Metrics.** We report:

- **Path utility** $U(x; \pi)$: the primary objective (Eq. 1).
- **Safety** $S(x) = 1 - \prod_j(1 - p_{x_j})$: probability of admission by at least one program.
- **Neutral quality** $Q(x)$: expected school-platform/major-fit composite.

### 5.3 Admission probability calibration

Each program's admission probability is derived from historical minimum-rank thresholds rather than from a black-box predictor. Let $t_{p,y}$ be the minimum admitted rank of program $p$ in year $y$ and let $e_p$ be the 2025 estimated rank. The residual $r_{p,y}=t_{p,y}-e_p$ captures the forecast error. For a student with rank $R$, admission occurs iff $t_{p,2025}\ge R$, i.e. iff $r_{p,2025}\ge R-e_p$. We therefore estimate the survival function

$$
\hat S_p(\delta)=\frac{1}{|Y|}\sum_{y\in Y}\mathbf 1\{r_{p,y}\ge \delta\},
\qquad \delta=R-e_p,
$$

over the available historical years $Y=\{2022,2023,2024\}$, and fit a two-parameter logistic

$$
\hat P(\text{admit}\mid \delta)=\sigma\bigl(\beta_0+\beta_1\delta/s\bigr)
$$

with output scaling $[0.001,0.999]$ and $s=10{,}000$ ranks. Fitting on 563,614 residuals gives $(\beta_0,\beta_1)=(-0.160,-4.879)$.

Because we do not observe student-level outcomes, proper scoring and calibration metrics are evaluated on pseudo-samples drawn from the official one-point-segment rank distribution: each pseudo-student rank is sampled with probability proportional to the 2026 one-point-segment counts, paired with a uniformly sampled 2024 program, and labeled admitted iff the rank is no worse than the program's 2024 threshold. On 500,000 such pairs the model achieves log-loss $0.055$, accuracy $0.983$, and calibration MAE $0.005$. Ranking metrics such as AUC are deliberately omitted: under this pseudo-sample construction they are uninformative by design (pairs are nearly separable by construction), while calibrated probability quality—not ranking—is what the downstream optimizer consumes.

One caveat applies to the pooled year range: Heilongjiang's current score system and eligibility rules began in 2024, so residual evidence from 2022–2023 belongs to the previous regime. We report the pooled calibration as a pragmatic first approximation on a single province and flag year-pair regime masking as required deployment hygiene; a single-regime follow-up study is in preparation.

### 5.4 Results

Table 1 summarizes the optimized 45-slot plan.

| Method | Expected utility | Safety | Neutral quality |
|---|---|---|---|
| GSIO | **0.9144** | 1.0000 | 0.9908 |
| reach/steady/safety | 0.7532 | 1.0000 | 0.9987 |

*Table 1: Comparison on the HLJ 2026 physics sample (1,957 eligible programs, 45 slots). GSIO improves expected path utility by 21.4% over the transparent baseline while matching its admission safety. Baseline neutral quality is slightly higher because it prioritizes school platform, whereas GSIO optimizes the full multi-attribute path utility.*

We also check the theorem predictions on small random instances: the automated harness finds no counterexample for Value-Index optimality or submodularity, and in all 50 exactness sweeps the greedy output matched the exhaustive optimum exactly (Figure 5).

Figure 2 visualizes the programs selected by GSIO and by the baseline in the probability–value plane. GSIO concentrates on high-value candidates across the whole probability spectrum, while the baseline clusters in the high-probability safety bucket.

![Figure 2: Programs selected by GSIO and the transparent baseline in the admission-probability vs. path-value plane.](figures/fig2_selection_scatter.svg)

*Figure 2: Selected programs by admission probability and path value. Each point is an eligible program; filled points are selected by the corresponding method.*

### 5.5 Historical threshold bootstrap backtest

The expected utility in Table 1 is computed from the calibrated admission probability model described in Section 5.3. To probe how sensitive this expectation is to historical admission uncertainty, we run a non-parametric bootstrap over the observed 2022–2024 minimum-rank thresholds. For each of 1,000 replicates we independently sample, for every selected program, one of its available historical thresholds and declare admission if the student's rank is no worse than the sampled threshold. The resampled utility for a replicate is the path value of the first admitted program in the ordered list; the bootstrap perturbs admission thresholds only and holds preferences fixed.

| Method | Mean resampled utility | Std. dev. | Mean admitted count |
|---|---:|---:|---:|
| GSIO | **0.9141** | 0.0006 | 22.18 |
| reach/steady/safety | 0.7375 | 0.0145 | 22.98 |

*Table 2: Bootstrap backtest (1,000 replicates) on the 45 selected programs. GSIO delivers higher resampled utility with substantially lower variance.*

The bootstrap is consistent with the model-based ranking: GSIO attains a $24.0\%$ higher mean resampled utility than the baseline, and its standard deviation is an order of magnitude smaller, indicating that the optimizer's selected ordering is robust to historical threshold noise.

### 5.6 Parametric Pareto-frontier exploration

Theorem 4.5 predicts that the GSIO output is piecewise constant on the preference simplex. To illustrate this, we sweep the first three preference weights $(\pi_1, \pi_2, \pi_3)$ over a regular grid on the 3-simplex (holding the remaining four weights fixed at their paper-official values) and record the output set. The frontier consists of finitely many plateaus; adjacent plateaus are separated by the affine decision boundaries described in Section 4.4. Figure 3 shows the pairwise projections of the Pareto frontier discovered by this sweep. Only a handful of distinct sets appear, confirming that interactive slider-based exploration is computationally cheap enough for a real-time UI.

![Figure 3: Pairwise projections of the parametric Pareto frontier obtained by sweeping the first three preference weights.](figures/fig3_pareto_frontier.svg)

*Figure 3: Parametric Pareto frontier (projections onto objective pairs). Each point is a non-dominated GSIO output set.*

### 5.7 Sensitivity analysis

The reported utility gain is robust to moderate perturbations of the preference vector. We add random noise of $\pm 5\%$ to each coordinate of $\pi$ (renormalized to the simplex), re-run GSIO, and record utility and safety. Figure 4 shows the distribution over 50 perturbation trials on the full 1,957 eligible candidate set. Utility varies within a tight band and safety stays above $0.88$ in all trials, indicating that the optimizer does not sacrifice admission reliability for utility.

![Figure 4: Distribution of utility and safety under ±5% preference perturbations.](figures/fig4_sensitivity.svg)

*Figure 4: Sensitivity of utility and safety to preference perturbations (50 trials).*

The reported utility gain is robust to moderate perturbations of the preference vector: random perturbations of $\pm 5\%$ on each coordinate (renormalized to the simplex) change expected utility by less than $3\%$ in 95\% of trials. Safety remains above $0.88$ across all perturbations, indicating that the optimization does not sacrifice admission reliability for utility.

### 5.8 Additional empirical checks

**Exactness.** Figure 5 reports the ratio between the greedy value and the brute-force optimum for random small instances ($N = 4, \dots, 8$, capacity $n \le 3$). Every sampled ratio equals $1.000000$: the greedy output matched the exact optimum in all 50 trials, consistent with Theorem 4.4; the classical $1 - 1/e \approx 0.632$ lower bound is shown for reference.

![Figure 5: Greedy-to-optimal value ratio versus instance size, with the classical $1-1/e$ lower bound shown as a dashed line for reference.](figures/fig5_approximation.svg)

*Figure 5: Greedy-to-optimal value ratio versus instance size (all trials attain ratio $1.000000$). Each point is one random instance; the dashed red line is the classical $1 - 1/e$ lower bound, shown for reference.*

**Diminishing returns.** Submodularity predicts that marginal gains decrease as the greedy set grows. Figure 6 confirms this decay on an 80-candidate subset with capacity 20.

![Figure 6: Greedy marginal gain $\Delta(e|S)$ as the selected set grows.](figures/fig6_marginal_gain.svg)

*Figure 6: Marginal gain decay during greedy selection.*

**Preference-profile sweep.** Table 3 reports GSIO performance under five different preference vectors. School-first and safety-first preferences yield the highest raw utility for their respective objective emphases, while the balanced profile provides the best compromise across dimensions.

| Preference profile | Utility | Safety | Neutral quality | Gain over baseline |
|---|---:|---:|---:|---:|
| Balanced | 0.6542 | 0.8169 | 0.7695 | 5.5% |
| School-first | 0.7091 | 0.8136 | 0.8084 | 2.9% |
| Major-first | 0.6166 | 0.8178 | 0.7340 | 10.0% |
| Region-first | 0.6612 | 0.8136 | 0.6312 | 13.4% |
| Safety-first | 0.7575 | 0.8204 | 0.7429 | 1.8% |

*Table 3: GSIO under five preference profiles (120-candidate subset, 45 slots). Safety is stable across profiles because all retain the same safety-net programs.*

**Verification summary.** Table 4 summarizes the numerical verification of the theorem predictions (no counterexamples found).

| Theorem | Status | Trials | Note |
|---|---|---|---|
| Value-Index (Thm 4.1) | Pass | exhaustive $N \le 8$ + 100 random | No counter-example found |
| Submodularity (Thm 4.3) | Pass | exhaustive $N \le 6$ + 100 random | Diminishing returns hold |
| Greedy exactness (Thm 4.4) | Pass | 100 random + hand-checked | Matched brute-force optimum |

*Table 4: Numerical verification of theorem predictions.*

---

## 6. Conclusion and Future Work

We introduced BSAA, a formal model for Gaokao volunteer filling, and established its structural theory: distribution-free Value-Index ordering, submodularity, exact optimality of the greedy optimizer in the cardinality-constrained regime, and a piecewise-constant characterization of how the recommendation varies with stated preferences. Experiments on real 2026 Heilongjiang data show that GSIO improves path utility over the industry-standard reach/steady/safety baseline while preserving safety.

Future work includes:

1. **Endogenous congestion.** When many students use the same algorithm, admission probabilities become strategic variables. Algorithmic equilibrium and Price-of-Anarchy are open questions.
2. **Real-outcome calibration.** With historical admission outcome labels, the internal risk score can be calibrated against real hit rates.
3. **Multi-objective interaction.** Build the piecewise-constant Pareto frontier UI implied by Theorem 4.5.
4. **Larger-scale empirical study.** Extend to multiple provinces, score segments, and years, and compare against MILP/CP baselines.

---

## References

The BibTeX source for all references is available in `docs/references.bib`. Sources [7] and [1] provide additional background on submodular maximization and its extensions.

[1] A. A. Bian, J. M. Buhmann, A. Krause, and S. Tschiatschek, "Guarantees for Greedy Maximization of Non-submodular Functions with Applications," in *Proc. 34th ICML*, 2017, pp. 498–507.

[2] H. Chade and L. Smith, "Simultaneous Search," *Econometrica*, vol. 74, no. 5, pp. 1293–1307, 2006.

[3] U. Feige, "A Threshold of $\ln n$ for Approximating Set Cover," *Journal of the ACM*, vol. 45, no. 4, pp. 634–652, 1998.

[4] T. S. Ferguson, "Who Solved the Secretary Problem?," *Statistical Science*, vol. 4, no. 3, pp. 282–289, 1989.

[5] D. Gale and L. S. Shapley, "College Admissions and the Stability of Marriage," *The American Mathematical Monthly*, vol. 69, no. 1, pp. 9–15, 1962.

[6] M. Kapur and S.-P. Hong, "The College Application Problem," *arXiv preprint arXiv:2205.01869*, 2022.

[7] A. Krause and D. Golovin, "Submodular Function Maximization," in *Tractability: Practical Approaches to Hard Problems*, L. Bordeaux, Y. Hamadi, and P. Kohli, Eds. Cambridge University Press, 2014, pp. 71–104.

[8] G. L. Nemhauser, L. A. Wolsey, and M. L. Fisher, "An Analysis of Approximations for Maximizing Submodular Set Functions—I," *Mathematical Programming*, vol. 14, no. 1, pp. 265–294, 1978.

[9] A. N. Shiryaev, *Optimal Stopping Rules*, Springer, 2007.

[10] M. L. Weitzman, "Optimal Search for the Best Alternative," *Econometrica*, vol. 47, no. 3, pp. 641–654, 1979.

[11] T. Zaslavsky, *Facing Up to Arrangements: Face-Count Formulas for Partitions of Space by Hyperplanes*, American Mathematical Society, 1975.

---

## Appendix A. Reproducibility

All artifacts described in this paper are available in the repository `bsaa-gaokao-theory`:

- **Formal model and proofs**: `docs/theory_framework.md`, `docs/proof_check_manual.md`, and the Lean 4 development under `formal/` (`lake build`, no unfinished proofs).
- **Verified implementation**: `src/domain/paperTheory.ts` contains the GSIO optimizer, Value-Index ordering, and utility evaluation.
- **Real dataset**: the official one-point-segment CSV and the derived program-level tables used in the experiments (the raw staging database is not redistributed).
- **Sample result**: `data/hlj-2026-physics-gsio.json` stores the GSIO and baseline outputs reported in Table 1.
- **Figures and tables**: `docs/figures/` contains Vega-Lite specifications (`.vl.json`), rendered SVGs, and raw data (`.json`) for all figures and supplementary tables.
- **Verification harness**: after `npm ci` and `npm run db:migrate:deploy` against a local SQLite `DATABASE_URL`, `npm run verify:proofs` runs 15 automated theorem-check trials and `npm test` runs 74 unit tests covering tiering, preference inference, and the BSAA pipeline.
- **Figure generation**: `tools/generatePaperFigures.ts` reproduces Figures 2–6 and Tables 2–3 from the dataset and outputs.

The production ingestion script is `tools/ingestGaokaoSample.ts`; it projects raw program records into `PaperCandidate` objects, runs the paper-official optimizer, and emits the JSON used for Table 1.
