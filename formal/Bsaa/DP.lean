/-
Bsaa/DP.lean — 引理 A3（DP 精确性）。

数学陈述：候选 (p, v) 列表 L（0 ≤ p ≤ 1, 0 ≤ v），Horner 效用
  U [] = 0,  U ((p,v)::t) = p·v + (1-p)·U t。
DP：g L 0 = 0, g [] k = 0,
  g (c::t) (k+1) = max( g t (k+1), p·v + (1-p)·g t k )。
则 g L n = max{ U s : s 是 L 的子序列, |s| ≤ n }——
两方向：上界（所有子序列 U ≤ g）与可达（存在子序列取等）。
-/
import Bsaa.Prelude

namespace Bsaa

/-- 序贯吸收效用（Horner 形式），按列表顺序 -/
def U : List (Rat × Rat) → Rat
  | [] => 0
  | c :: t => c.1 * c.2 + (1 - c.1) * U t

/-- 选择 DP -/
def g : List (Rat × Rat) → Nat → Rat
  | _, 0 => 0
  | [], _ + 1 => 0
  | c :: t, k + 1 => qmax (g t (k + 1)) (c.1 * c.2 + (1 - c.1) * g t k)

/-- 参数合法性：概率入 [0,1]，价值非负 -/
def Valid (L : List (Rat × Rat)) : Prop := ∀ c ∈ L, 0 ≤ c.1 ∧ c.1 ≤ 1 ∧ 0 ≤ c.2

theorem Valid.tail {c : Rat × Rat} {t : List (Rat × Rat)} (h : Valid (c :: t)) : Valid t :=
  fun d hd => h d (List.mem_cons_of_mem _ hd)

theorem Valid.head {c : Rat × Rat} {t : List (Rat × Rat)} (h : Valid (c :: t)) :
    0 ≤ c.1 ∧ c.1 ≤ 1 ∧ 0 ≤ c.2 := h c (List.mem_cons_self ..)

theorem g_nonneg {L : List (Rat × Rat)} (hL : Valid L) : ∀ k, 0 ≤ g L k := by
  induction L with
  | nil => intro k; cases k <;> exact Rat.le_refl
  | cons c t ih =>
    intro k
    cases k with
    | zero => exact Rat.le_refl
    | succ k =>
      have h0 : 0 ≤ g t (k + 1) := ih hL.tail (k + 1)
      exact Rat.le_trans h0 (le_qmax_left _ _)

/-- **A3 上界方向**：每个长度 ≤ k 的子序列效用 ≤ g L k -/
theorem A3_upper {L : List (Rat × Rat)} (hL : Valid L) :
    ∀ {s : List (Rat × Rat)} {k : Nat}, s.Sublist L → s.length ≤ k → U s ≤ g L k := by
  induction L with
  | nil =>
    intro s k hs _
    rw [List.sublist_nil.mp hs]
    cases k <;> exact Rat.le_refl
  | cons c t ih =>
    intro s k hs hlen
    cases k with
    | zero =>
      have : s = [] := List.eq_nil_of_length_eq_zero (Nat.le_zero.mp hlen)
      rw [this]
      exact Rat.le_refl
    | succ k =>
      cases hs with
      | cons _ hs' =>
        exact Rat.le_trans (ih hL.tail hs' hlen) (le_qmax_left _ _)
      | cons_cons _ hs' =>
        rename_i s'
        have hlen' : s'.length ≤ k := Nat.le_of_succ_le_succ hlen
        have hU : U s' ≤ g t k := ih hL.tail hs' hlen'
        have hp1 : c.1 ≤ 1 := hL.head.2.1
        have step : (1 - c.1) * U s' ≤ (1 - c.1) * g t k :=
          Rat.mul_le_mul_of_nonneg_left hU (one_sub_nonneg hp1)
        have : U (c :: s') ≤ c.1 * c.2 + (1 - c.1) * g t k := by
          show c.1 * c.2 + (1 - c.1) * U s' ≤ _
          exact add_le_add Rat.le_refl step
        exact Rat.le_trans this (le_qmax_right _ _)

/-- **A3 可达方向**：g L k 被某个长度 ≤ k 的子序列取到 -/
theorem A3_achieve {L : List (Rat × Rat)} :
    ∀ k, ∃ s : List (Rat × Rat), s.Sublist L ∧ s.length ≤ k ∧ U s = g L k := by
  induction L with
  | nil =>
    intro k
    refine ⟨[], List.Sublist.refl [], Nat.zero_le _, ?_⟩
    cases k <;> rfl
  | cons c t ih =>
    intro k
    cases k with
    | zero => exact ⟨[], List.nil_sublist _, Nat.le_refl 0, rfl⟩
    | succ k =>
      rcases qmax_eq_or (g t (k + 1)) (c.1 * c.2 + (1 - c.1) * g t k) with hq | hq
      · rcases ih (k + 1) with ⟨s, hsub, hlen, hUs⟩
        refine ⟨s, hsub.cons c, hlen, ?_⟩
        show U s = g (c :: t) (k + 1)
        rw [hUs, g, hq]
      · rcases ih k with ⟨s', hsub, hlen, hUs⟩
        refine ⟨c :: s', hsub.cons_cons c, Nat.succ_le_succ hlen, ?_⟩
        show c.1 * c.2 + (1 - c.1) * U s' = g (c :: t) (k + 1)
        rw [hUs, g, hq]

/-- **A3 主定理（DP 精确性）**：g L k 恰为长度 ≤ k 子序列的最大效用 -/
theorem A3_dp_exact {L : List (Rat × Rat)} (hL : Valid L) (k : Nat) :
    (∀ s : List (Rat × Rat), s.Sublist L → s.length ≤ k → U s ≤ g L k) ∧
    (∃ s : List (Rat × Rat), s.Sublist L ∧ s.length ≤ k ∧ U s = g L k) :=
  ⟨fun _ hs hlen => A3_upper hL hs hlen, A3_achieve k⟩

end Bsaa
