/-
Bsaa/Prelude.lean — 自给自足的 ℚ 序代数小引理与 qmax。
不依赖 Mathlib；只用 Lean core 的 Rat.* 引理。
-/

namespace Bsaa

/-- 全序性推论：¬(a ≤ b) → b ≤ a -/
theorem le_of_not_le {a b : Rat} (h : ¬ a ≤ b) : b ≤ a := by
  rcases Rat.le_total (a := a) (b := b) with h1 | h1
  · exact absurd h1 h
  · exact h1

/-- 两边同加 -/
theorem add_le_add {a b c d : Rat} (h1 : a ≤ b) (h2 : c ≤ d) : a + c ≤ b + d := by
  have s1 : a + c ≤ b + c := Rat.add_le_add_right.mpr h1
  have s2 : b + c ≤ b + d := by
    rw [Rat.add_comm b c, Rat.add_comm b d]
    exact Rat.add_le_add_right.mpr h2
  exact Rat.le_trans s1 s2

theorem add_nonneg {a b : Rat} (ha : 0 ≤ a) (hb : 0 ≤ b) : 0 ≤ a + b := by
  have := add_le_add ha hb
  rwa [Rat.add_zero] at this

/-- p ≤ 1 → 0 ≤ 1 - p -/
theorem one_sub_nonneg {p : Rat} (h : p ≤ 1) : 0 ≤ 1 - p := by
  have h1 : p + -p ≤ 1 + -p := Rat.add_le_add_right.mpr h
  rw [Rat.add_neg_cancel] at h1
  rwa [Rat.sub_eq_add_neg]

/-- 自定义 max，避免依赖实例引理 -/
def qmax (a b : Rat) : Rat := if a ≤ b then b else a

theorem le_qmax_left (a b : Rat) : a ≤ qmax a b := by
  unfold qmax
  by_cases h : a ≤ b
  · simp [h]
  · simp [h]

theorem le_qmax_right (a b : Rat) : b ≤ qmax a b := by
  unfold qmax
  by_cases h : a ≤ b
  · simp [h]
  · simpa [h] using le_of_not_le h

theorem qmax_le {a b c : Rat} (h1 : a ≤ c) (h2 : b ≤ c) : qmax a b ≤ c := by
  unfold qmax
  by_cases h : a ≤ b
  · simpa [h]
  · simpa [h]

theorem qmax_eq_or (a b : Rat) : qmax a b = a ∨ qmax a b = b := by
  unfold qmax
  by_cases h : a ≤ b
  · right; simp [h]
  · left; simp [h]

/-- b ≤ a 时 qmax a b = a -/
theorem qmax_eq_left {a b : Rat} (h : b ≤ a) : qmax a b = a := by
  unfold qmax
  by_cases h' : a ≤ b
  · simp [Rat.le_antisymm h' h]
  · simp [h']

theorem qmax_comm (a b : Rat) : qmax a b = qmax b a := by
  unfold qmax
  by_cases h1 : a ≤ b <;> by_cases h2 : b ≤ a <;> simp [h1, h2]
  · exact Rat.le_antisymm h2 h1
  · exact absurd (le_of_not_le h1) h2

/-- 左交换：qmax a (qmax b c) = qmax b (qmax a c)；用于置换不变性 -/
theorem qmax_left_comm (a b c : Rat) : qmax a (qmax b c) = qmax b (qmax a c) := by
  have le1 : qmax a (qmax b c) ≤ qmax b (qmax a c) := by
    apply qmax_le
    · exact Rat.le_trans (le_qmax_left a c) (le_qmax_right b (qmax a c))
    · apply qmax_le
      · exact le_qmax_left b (qmax a c)
      · exact Rat.le_trans (le_qmax_right a c) (le_qmax_right b (qmax a c))
  have le2 : qmax b (qmax a c) ≤ qmax a (qmax b c) := by
    apply qmax_le
    · exact Rat.le_trans (le_qmax_left b c) (le_qmax_right a (qmax b c))
    · apply qmax_le
      · exact le_qmax_left a (qmax b c)
      · exact Rat.le_trans (le_qmax_right b c) (le_qmax_right a (qmax b c))
  exact Rat.le_antisymm le1 le2

/-- 列表求和（自定义，避免依赖 List.sum 的实例差异） -/
def qsum : List Rat → Rat
  | [] => 0
  | x :: t => x + qsum t

theorem qsum_append (l1 l2 : List Rat) : qsum (l1 ++ l2) = qsum l1 + qsum l2 := by
  induction l1 with
  | nil => simp [qsum, Rat.zero_add]
  | cons x t ih => simp [qsum, ih, Rat.add_assoc]

theorem qsum_nonneg {l : List Rat} (h : ∀ x ∈ l, 0 ≤ x) : 0 ≤ qsum l := by
  induction l with
  | nil => exact Rat.le_refl
  | cons x t ih =>
    have hx : 0 ≤ x := h x (List.mem_cons_self ..)
    have ht : 0 ≤ qsum t := ih (fun y hy => h y (List.mem_cons_of_mem _ hy))
    exact add_nonneg hx ht

/-- Σ c·f = c·Σ f -/
theorem qsum_map_mul_left {α : Type _} (c : Rat) (f : α → Rat) (l : List α) :
    qsum (l.map (fun x => c * f x)) = c * qsum (l.map f) := by
  induction l with
  | nil => simp [qsum, Rat.mul_zero]
  | cons x t ih => simp [qsum, ih, Rat.mul_add]

/-- 逐点相加的和 = 和的相加 -/
theorem qsum_map_add {α : Type _} (f g : α → Rat) (l : List α) :
    qsum (l.map (fun x => f x + g x)) = qsum (l.map f) + qsum (l.map g) := by
  induction l with
  | nil => simp [qsum, Rat.add_zero]
  | cons x t ih =>
    simp only [List.map_cons, qsum, ih]
    rw [Rat.add_assoc, Rat.add_assoc]
    congr 1
    rw [← Rat.add_assoc, ← Rat.add_assoc, Rat.add_comm (g x)]

end Bsaa
