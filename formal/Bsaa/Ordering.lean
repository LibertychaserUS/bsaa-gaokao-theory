/-
Bsaa/Ordering.lean — 引理 A2（逐点排序定理，distribution-free Value-Index）。

数学陈述：固定录取实现 adm : α → Bool。
(a) 任何顺序的支付（首个被录取者的价值）≤ 该列表被录取成员的最大价值；
(b) 按 v 降序排列时取等；
(c) 被录取最大价值对列表置换不变；
(⇒) 对任意与 x 同底集的排列 y：payoff y ≤ payoff x（x 为 v 降序）。
对录取实现的**任意**有限加权分布（无独立性假设）取加权和即得期望版本。
-/
import Bsaa.Prelude

namespace Bsaa

variable {α : Type _}

/-- 首个被录取者的价值；无人录取 = 0 -/
def payoff (v : α → Rat) (adm : α → Bool) : List α → Rat
  | [] => 0
  | c :: t => if adm c then v c else payoff v adm t

/-- 列表中被录取成员的最大价值（空/无录取 = 0） -/
def maxAdm (v : α → Rat) (adm : α → Bool) : List α → Rat
  | [] => 0
  | c :: t => if adm c then qmax (v c) (maxAdm v adm t) else maxAdm v adm t

/-- A2(a)：任何列表的支付 ≤ 其被录取最大价值 -/
theorem payoff_le_maxAdm (v : α → Rat) (adm : α → Bool) (l : List α) :
    payoff v adm l ≤ maxAdm v adm l := by
  induction l with
  | nil => exact Rat.le_refl
  | cons c t ih =>
    by_cases h : adm c
    · simp [payoff, maxAdm, h]
      exact le_qmax_left _ _
    · simp [payoff, maxAdm, h]
      exact ih

/-- 界引理：成员价值全 ≤ M 且 0 ≤ M ⇒ maxAdm ≤ M -/
theorem maxAdm_le {v : α → Rat} {adm : α → Bool} {l : List α} {M : Rat}
    (hM : 0 ≤ M) (h : ∀ a ∈ l, v a ≤ M) : maxAdm v adm l ≤ M := by
  induction l with
  | nil => exact hM
  | cons c t ih =>
    have hc : v c ≤ M := h c (List.mem_cons_self ..)
    have ht : maxAdm v adm t ≤ M := ih (fun a ha => h a (List.mem_cons_of_mem _ ha))
    by_cases hadm : adm c
    · simp [maxAdm, hadm]
      exact qmax_le hc ht
    · simpa [maxAdm, hadm] using ht

/-- A2(b)：v 降序（Pairwise ≥）且价值非负时，支付恰取到被录取最大价值 -/
theorem payoff_eq_maxAdm_of_sorted {v : α → Rat} {adm : α → Bool} {l : List α}
    (hs : List.Pairwise (fun x y => v y ≤ v x) l)
    (hv : ∀ a ∈ l, 0 ≤ v a) :
    payoff v adm l = maxAdm v adm l := by
  induction l with
  | nil => rfl
  | cons c t ih =>
    cases hs with
    | cons hrel htail =>
      by_cases h : adm c
      · have hb : maxAdm v adm t ≤ v c :=
          maxAdm_le (hv c (List.mem_cons_self ..)) hrel
        simp [payoff, maxAdm, h, qmax_eq_left hb]
      · have := ih htail (fun a ha => hv a (List.mem_cons_of_mem _ ha))
        simp [payoff, maxAdm, h, this]

/-- A2(c)：maxAdm 对置换不变 -/
theorem maxAdm_perm (v : α → Rat) (adm : α → Bool) {l₁ l₂ : List α}
    (h : l₁.Perm l₂) : maxAdm v adm l₁ = maxAdm v adm l₂ := by
  induction h with
  | nil => rfl
  | cons a _ ih => by_cases h : adm a <;> simp [maxAdm, h, ih]
  | swap a b l =>
    by_cases ha : adm a <;> by_cases hb : adm b <;>
      simp [maxAdm, ha, hb, qmax_left_comm]
  | trans _ _ ih1 ih2 => exact ih1.trans ih2

/-- **A2 主定理（逐点排序 / distribution-free Value-Index）**：
x 按 v 降序、价值非负，则 x 的任何重排 y 的支付 ≤ x 的支付——
对每一个录取实现 adm 逐点成立，不需要任何分布假设。 -/
theorem A2_pointwise_ordering {v : α → Rat} {adm : α → Bool} {x y : List α}
    (hperm : x.Perm y)
    (hsorted : List.Pairwise (fun a b => v b ≤ v a) x)
    (hv : ∀ a ∈ x, 0 ≤ v a) :
    payoff v adm y ≤ payoff v adm x := by
  calc payoff v adm y ≤ maxAdm v adm y := payoff_le_maxAdm v adm y
    _ = maxAdm v adm x := (maxAdm_perm v adm hperm).symm
    _ = payoff v adm x := (payoff_eq_maxAdm_of_sorted hsorted hv).symm

/-- 加权和单调 -/
theorem qsum_map_le {β : Type _} {l : List β} {f g : β → Rat}
    (h : ∀ b ∈ l, f b ≤ g b) : qsum (l.map f) ≤ qsum (l.map g) := by
  induction l with
  | nil => exact Rat.le_refl
  | cons c t ih =>
    simp only [List.map_cons, qsum]
    exact add_le_add (h c (List.mem_cons_self ..))
      (ih (fun b hb => h b (List.mem_cons_of_mem _ hb)))

/-- **A2 期望推论**：对录取实现的任意有限加权族（权重非负，
可为任意相关联合分布的支撑枚举），v 降序排列最大化加权期望支付。 -/
theorem A2_expected {v : α → Rat} {x y : List α}
    (scens : List (Rat × (α → Bool)))
    (hw : ∀ s ∈ scens, 0 ≤ s.1)
    (hperm : x.Perm y)
    (hsorted : List.Pairwise (fun a b => v b ≤ v a) x)
    (hv : ∀ a ∈ x, 0 ≤ v a) :
    qsum (scens.map (fun s => s.1 * payoff v s.2 y)) ≤
      qsum (scens.map (fun s => s.1 * payoff v s.2 x)) := by
  apply qsum_map_le
  intro s hs
  exact Rat.mul_le_mul_of_nonneg_left
    (A2_pointwise_ordering hperm hsorted hv) (hw s hs)

end Bsaa
