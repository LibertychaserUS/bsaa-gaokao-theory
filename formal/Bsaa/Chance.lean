/-
Bsaa/Chance.lean — 引理 B2（混合归约★）与 B3（优化转移）。

B2：有限概率空间 (Ω, w)，选择子 sel : Ω → Option C，候选价值的不确定期望
抽象为标量 EV c（Liu 链式：概率在外层）。混合支付 Y(ω) = EV(sel ω)（none 记 0）。
  E_ch[Y] = Σ_ω w(ω)·EV(sel ω) = Σ_c Pr[sel = c]·EV(c)。
**不需要候选价值之间的独立性**——吸收结构下每个 ω 只有单个候选兑付，
证明是按 sel 取值划分 Ω 的有限重排。

B3：以 v̂_c := EV c 打包 (p, v̂) 后，chance 期望支付 = Horner 效用 U（经 A1），
且 DP g 精确刻画其子序列最优（经 A3）。
-/
import Bsaa.Prelude
import Bsaa.DP
import Bsaa.Expect

namespace Bsaa

variable {Ω C : Type _}

/-- 混合支付的 chance 期望（概率外层、不确定期望内层已抽象为 EV） -/
def mixEV (P : List (Rat × Ω)) (sel : Ω → Option C) (EV : C → Rat) : Rat :=
  qsum (P.map (fun s => s.1 * (match sel s.2 with | some c => EV c | none => 0)))

/-- 事件 {sel = c} 的总权重（概率） -/
def prSel [DecidableEq C] (P : List (Rat × Ω)) (sel : Ω → Option C) (c : C) : Rat :=
  qsum (P.map (fun s => if sel s.2 = some c then s.1 else 0))

theorem qsum_map_congr {β : Type _} {l : List β} {f h : β → Rat}
    (hfh : ∀ b ∈ l, f b = h b) : qsum (l.map f) = qsum (l.map h) := by
  induction l with
  | nil => rfl
  | cons x t ih =>
    simp only [List.map_cons, qsum]
    rw [hfh x (List.mem_cons_self ..), ih (fun b hb => hfh b (List.mem_cons_of_mem _ hb))]

theorem qsum_map_zero {β : Type _} (l : List β) :
    qsum (l.map (fun _ => (0 : Rat))) = 0 := by
  induction l with
  | nil => rfl
  | cons x t ih => simp only [List.map_cons, qsum, ih, Rat.add_zero]

/-- Nodup 列表上恰好一项非零的和 -/
theorem qsum_map_ite_single [DecidableEq C] {cands : List C} (hnd : cands.Nodup)
    {c₀ : C} (hc₀ : c₀ ∈ cands) (w : C → Rat) :
    qsum (cands.map (fun c => if c = c₀ then w c else 0)) = w c₀ := by
  induction cands with
  | nil => cases hc₀
  | cons a t ih =>
    have hnd' := List.nodup_cons.mp hnd
    simp only [List.map_cons, qsum]
    by_cases hac : a = c₀
    · have hnt : ∀ c ∈ t, ¬ (c = c₀) := by
        intro c hc hcc
        apply hnd'.1
        rw [hac, ← hcc]
        exact hc
      have hz : qsum (t.map (fun c => if c = c₀ then w c else 0))
          = qsum (t.map (fun _ => (0 : Rat))) :=
        qsum_map_congr (fun c hc => by simp [hnt c hc])
      rw [hz, qsum_map_zero, Rat.add_zero, if_pos hac, hac]
    · have hct : c₀ ∈ t := by
        rcases List.mem_cons.mp hc₀ with h | h
        · exact absurd h.symm hac
        · exact h
      rw [if_neg hac, ih hnd'.2 hct, Rat.zero_add]

/-- **B2 主定理（混合归约）**：chance 期望 = Σ_c Pr[sel=c]·EV(c)。
不需要候选价值之间的独立性。 -/
theorem B2_mixture_reduction [DecidableEq C]
    (P : List (Rat × Ω)) (sel : Ω → Option C) (EV : C → Rat)
    (cands : List C) (hnd : cands.Nodup)
    (hcover : ∀ s ∈ P, ∀ c, sel s.2 = some c → c ∈ cands) :
    mixEV P sel EV = qsum (cands.map (fun c => prSel P sel c * EV c)) := by
  induction P with
  | nil =>
    have hz : ∀ c ∈ cands, prSel ([] : List (Rat × Ω)) sel c * EV c = (0 : Rat) := by
      intro c _
      show (0 : Rat) * EV c = 0
      exact Rat.zero_mul _
    rw [qsum_map_congr hz, qsum_map_zero]
    rfl
  | cons s P' ih =>
    have ih' := ih (fun x hx => hcover x (List.mem_cons_of_mem _ hx))
    have expand : ∀ c ∈ cands,
        prSel (s :: P') sel c * EV c
          = (if sel s.2 = some c then s.1 else 0) * EV c + prSel P' sel c * EV c := by
      intro c _
      have hun : prSel (s :: P') sel c
          = (if sel s.2 = some c then s.1 else 0) + prSel P' sel c := rfl
      rw [hun, Rat.add_mul]
    rw [qsum_map_congr expand, qsum_map_add, ← ih']
    simp only [mixEV, List.map_cons, qsum]
    congr 1
    cases hsel : sel s.2 with
    | none =>
      show s.1 * 0 = _
      have hz : ∀ c ∈ cands,
          (if (none : Option C) = some c then s.1 else 0) * EV c = (0 : Rat) := by
        intro c _
        simp [Rat.zero_mul]
      rw [qsum_map_congr hz, qsum_map_zero, Rat.mul_zero]
    | some c₀ =>
      show s.1 * EV c₀ = _
      have hc₀ : c₀ ∈ cands := hcover s (List.mem_cons_self ..) c₀ hsel
      have ptwise : ∀ c ∈ cands,
          (if some c₀ = some c then s.1 else 0) * EV c
            = (if c = c₀ then s.1 * EV c₀ else 0) := by
        intro c _
        by_cases hc : c = c₀
        · subst hc
          simp
        · have hne : ¬ (c₀ = c) := fun h => hc h.symm
          simp [hne, hc, Rat.zero_mul]
      rw [qsum_map_congr ptwise, qsum_map_ite_single hnd hc₀ (fun _ => s.1 * EV c₀)]

/-- 首个成功位置的候选（选择子） -/
def selFS : List C → List Bool → Option C
  | c :: t, b :: bs => if b then some c else selFS t bs
  | _, _ => none

/-- 桥接：payoffB 在 (pr, EV) 打包列表上的值 = EV(selFS)（none 记 0） -/
theorem payoffB_selFS (pr EV : C → Rat) :
    ∀ (cand : List C) (ω : List Bool),
      payoffB (cand.map (fun c => (pr c, EV c))) ω
        = (match selFS cand ω with | some c => EV c | none => 0) := by
  intro cand
  induction cand with
  | nil => intro ω; cases ω <;> rfl
  | cons c t ih =>
    intro ω
    cases ω with
    | nil => rfl
    | cons b bs =>
      cases b with
      | true => simp [payoffB, selFS]
      | false => simpa [payoffB, selFS] using ih bs

/-- **B3（chance 目标 = Horner 效用）** -/
theorem B3_chance_eq_U (pr EV : C → Rat) (cand : List C) :
    mixEV ((outcomes (cand.map (fun c => (pr c, EV c))).length).map
        (fun ω => (wt (cand.map (fun c => (pr c, EV c))) ω, ω)))
      (selFS cand) EV
      = U (cand.map (fun c => (pr c, EV c))) := by
  simp only [mixEV]
  rw [qsum_map_comp]
  rw [qsum_map_congr (fun ω _ => by rw [← payoffB_selFS pr EV cand ω])]
  exact A1_first_success_dist _

/-- **B3（优化转移）**：DP g 精确刻画 chance 期望支付的子序列最优。 -/
theorem B3_optimization_transfer (L : List (Rat × Rat)) (hL : Valid L) (k : Nat) :
    (∀ s : List (Rat × Rat), s.Sublist L → s.length ≤ k → expPayoff s ≤ g L k) ∧
    (∃ s : List (Rat × Rat), s.Sublist L ∧ s.length ≤ k ∧ expPayoff s = g L k) := by
  constructor
  · intro s hs hlen
    rw [A1_first_success_dist]
    exact A3_upper hL hs hlen
  · rcases A3_achieve (L := L) k with ⟨s, h1, h2, h3⟩
    exact ⟨s, h1, h2, by rw [A1_first_success_dist, h3]⟩

end Bsaa
