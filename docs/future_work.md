# Future Work and Planned Extensions

This file tracks planned research and engineering extensions beyond the current paper. Items are grouped by theme and should be addressed before a top-tier submission.

## 1. Empirical Rigor

- [ ] **Multi-student samples**: Run GSIO for a stratified sample of synthetic students across multiple score/rank percentiles (e.g., top 5%, 25%, 50%, 75%, 90%) and report aggregate statistics.
- [ ] **Cross-province validation**: Apply the pipeline to at least two additional provinces and compare utility gains and safety profiles.
- [ ] **Real-outcome calibration**: Use historical admission outcome labels to calibrate the rank-delta probability model against actual hit rates and report calibration error.
- [ ] **Ablation study**: Quantify the contribution of Value-Index ordering versus the greedy set selection by comparing GSIO against (a) random order + greedy set, and (b) optimal order + random set.

## 2. Baseline and Method Comparisons

- [ ] **MILP/CP formulation**: Implement a mixed-integer linear programming or constraint programming baseline that solves (P$_\pi$) exactly on small instances and a tractable relaxation on large instances.
- [ ] **Reinforcement-learning baseline**: Compare GSIO against a policy-gradient or Monte-Carlo tree search baseline that learns an ordering policy.
- [ ] **Commercial heuristic audit**: Document the rule-based logic of at least one public/commercial Gaokao product and compare it transparently.

## 3. Modeling Extensions

- [ ] **Correlated admission probabilities**: Relax the independence assumption and model within-school correlation or year-to-year correlation of cutoffs.
- [ ] **Endogenous congestion**: Formulate the multi-agent game where many students use GSIO and admission probabilities become strategic variables; study equilibrium and Price-of-Anarchy.
- [ ] **Dynamic re-optimization**: Explore whether partial re-ordering is possible under provincial rules and quantify the value of perfect information.
- [ ] **Risk-averse utility**: Replace expected utility with a mean-variance or CVaR objective and derive corresponding optimality/approximation results.

## 4. Interactive Systems

- [ ] **Pareto frontier UI**: Build the slider-based interactive tool implied by Theorem 5.3 and user-test it with students/counselors.
- [ ] **Preference elicitation questionnaire**: Design and validate a short questionnaire whose posterior $\pi$ predicts revealed preferences from historical choices.

## 5. Engineering and Reproducibility

- [ ] **LaTeX CI**: Add a GitHub Actions workflow that compiles `docs/paper.tex` on every push and uploads the PDF artifact.
- [ ] **Figure regeneration CI**: Ensure `tools/generatePaperFigures.ts` runs in CI with the real dataset.
- [ ] **Data release documentation**: Add a `DATA.md` describing the provenance, license, and privacy handling of `gaokao.bsaa.sqlite`.

## 6. Writing and Presentation

- [ ] **Chinese translation polish**: Review `docs/paper.zh.md` for academic tone and terminology consistency.
- [ ] **LaTeX camera-ready style**: Adapt `docs/paper.tex` to the target venue's style file (e.g., LNCS, ACM, or IEEEtran).
- [ ] **Supplementary material**: Prepare an arXiv-style appendix with all proofs, code pointers, and additional figures.
