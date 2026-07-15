/-
Bsaa/Expect.lean — 引理 A1（首次成功期望恒等式）。

数学陈述：候选列表 L = [(p₁,v₁),…]，录取事件独立 Bernoulli(pᵢ)。
对全部 2^n 个结果 ω 求加权和：
  E[payoff] = Σ_ω w(ω)·payoffB(L,ω) = U(L)
其中 payoffB = 首个成功位置的价值，U 为 Horner 效用。
同时证明权重归一：Σ_ω w(ω) = 1。
-/
import Bsaa.Prelude
import Bsaa.DP

namespace Bsaa

/-- 长度 n 的全部布尔结果 -/
def outcomes : Nat → List (List Bool)
  | 0 => [[]]
  | n + 1 => ((outcomes n).map (true :: ·)) ++ ((outcomes n).map (false :: ·))

/-- 结果权重：独立 Bernoulli 乘积 -/
def wt : List (Rat × Rat) → List Bool → Rat
  | c :: t, b :: bs => (if b then c.1 else 1 - c.1) * wt t bs
  | _, _ => 1

/-- 结果下的支付：首个成功位置的价值 -/
def payoffB : List (Rat × Rat) → List Bool → Rat
  | c :: t, b :: bs => if b then c.2 else payoffB t bs
  | _, _ => 0

/-- 期望支付 -/
def expPayoff (L : List (Rat × Rat)) : Rat :=
  qsum ((outcomes L.length).map (fun ω => wt L ω * payoffB L ω))

theorem add_one_sub (p : Rat) : p + (1 - p) = 1 := by
  rw [Rat.sub_eq_add_neg, Rat.add_comm 1 (-p), ← Rat.add_assoc,
    Rat.add_neg_cancel, Rat.zero_add]

theorem qsum_map_comp {α β : Type _} (g : α → β) (f : β → Rat) (l : List α) :
    qsum ((l.map g).map f) = qsum (l.map (fun x => f (g x))) := by
  rw [List.map_map]; rfl

/-- 权重归一：Σ_ω w(ω) = 1 -/
theorem wt_sum (L : List (Rat × Rat)) :
    qsum ((outcomes L.length).map (fun ω => wt L ω)) = 1 := by
  induction L with
  | nil => simp [outcomes, qsum, wt, Rat.add_zero]
  | cons c t ih =>
    show qsum ((outcomes (t.length + 1)).map (fun ω => wt (c :: t) ω)) = 1
    rw [outcomes, List.map_append, qsum_append, qsum_map_comp, qsum_map_comp]
    have e1 : ∀ ω, wt (c :: t) (true :: ω) = c.1 * wt t ω := fun ω => by simp [wt]
    have e2 : ∀ ω, wt (c :: t) (false :: ω) = (1 - c.1) * wt t ω := fun ω => by simp [wt]
    simp only [e1, e2]
    rw [qsum_map_mul_left, qsum_map_mul_left, ih, Rat.mul_one, Rat.mul_one, add_one_sub]

/-- **A1 主定理（首次成功期望恒等）**：独立 Bernoulli 下期望支付 = Horner 效用 -/
theorem A1_first_success_dist (L : List (Rat × Rat)) : expPayoff L = U L := by
  induction L with
  | nil => simp [expPayoff, outcomes, qsum, wt, payoffB, U, Rat.mul_zero, Rat.add_zero]
  | cons c t ih =>
    show qsum ((outcomes (t.length + 1)).map
        (fun ω => wt (c :: t) ω * payoffB (c :: t) ω)) = U (c :: t)
    rw [outcomes, List.map_append, qsum_append, qsum_map_comp, qsum_map_comp]
    have e1 : ∀ ω, wt (c :: t) (true :: ω) * payoffB (c :: t) (true :: ω)
        = (c.1 * c.2) * wt t ω := fun ω => by
      simp only [wt, payoffB, if_pos]
      rw [Rat.mul_comm (c.1 * wt t ω) c.2, ← Rat.mul_assoc, Rat.mul_comm c.2 c.1]
    have e2 : ∀ ω, wt (c :: t) (false :: ω) * payoffB (c :: t) (false :: ω)
        = (1 - c.1) * (wt t ω * payoffB t ω) := fun ω => by
      simp [wt, payoffB, Rat.mul_assoc]
    simp only [e1, e2]
    rw [qsum_map_mul_left, qsum_map_mul_left, wt_sum, Rat.mul_one]
    show c.1 * c.2 + (1 - c.1) * expPayoff t = U (c :: t)
    rw [ih]
    rfl

end Bsaa
