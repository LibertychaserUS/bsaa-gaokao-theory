/-
Bsaa/Submodular.lean — Part C 第一增量：C1（桥接恒等式）+ C2（单调性与子模性）。

C1：把 A1 的 Horner 效用 U 与"期望最大录取值"打通：
  对按 v 降序的无重复列表 S（价值非负），
    U (S.map (p, v)) = Σ_ω wt_ω · maxAdm v (admAt S ω) S，
  其中 ω 遍历长度 |S| 的独立 Bernoulli 乘积空间（与 S 逐位对齐），
  admAt S ω 按位置读出 ω 在 S 成员上的录取位，
  maxAdm 取被录取成员的最大 v（无人录取 / 空集 = 0）。
  证明直接组装 A1（expPayoff = U）+ payoffB 对齐引理 + A2(b)（排序后 payoff = maxAdm）。
  无条件方向（不排序）给出 U ≤ expMax。

C2：定义 g S := Σ_ω w ω · maxOver (S ∩ admitted ω) v。
  主形式对**任意**有限加权场景族 scens（权重非负、录取函数任意）成立
  （distribution-free，同 A2_expected 的精神）：
  (a) 单调：A ⊆ B（逐成员包含）⇒ g A ≤ g B；
  (b) 子模：g (A∪{e}) − g A ≥ g (B∪{e}) − g B（A ⊆ B）。
  点态耦合证明：逐 ω 边际 max(m,x)−m = (x−m)⁺ 关于 m 单调递减，
  A ⊆ B ⇒ M_A(ω) ≤ M_B(ω) 逐点 ⇒ 加权和保持。
  加性推论 C2_gExp_*：Ω = 全体候选 Fin N 上的乘积空间、Ω 权重 w ω = wt (fullL p v) ω，
  即用户陈述中的 g。**无需 v ≥ 0、无需 e ∉ B**（比要求的假设更弱）。
-/
import Bsaa.Prelude
import Bsaa.Ordering
import Bsaa.DP
import Bsaa.Expect
import Bsaa.Chance

namespace Bsaa

variable {α : Type _}

/-! ## 0. 序代数小引理（补充 Prelude） -/

theorem zero_le_one_rat : (0 : Rat) ≤ 1 := by decide

/-- 左交换：a + (b + c) = b + (a + c) -/
theorem add_left_comm_rat (a b c : Rat) : a + (b + c) = b + (a + c) := by
  rw [← Rat.add_assoc, Rat.add_comm a b, Rat.add_assoc]

/-- (a−b)+(c−d) = (a+c)−(b+d) -/
theorem add_sub_add_sub_rat (a b c d : Rat) : (a - b) + (c - d) = (a + c) - (b + d) := by
  calc (a - b) + (c - d)
      = a + -b + (c + -d) := by rw [Rat.sub_eq_add_neg, Rat.sub_eq_add_neg]
    _ = a + (-b + (c + -d)) := by rw [Rat.add_assoc]
    _ = a + (c + (-b + -d)) := by rw [add_left_comm_rat (-b) c (-d)]
    _ = (a + c) + (-b + -d) := by rw [Rat.add_assoc]
    _ = a + c + -(b + d) := by rw [Rat.neg_add]
    _ = (a + c) - (b + d) := by rw [Rat.sub_eq_add_neg]

/-- 差的求和 = 和的差 -/
theorem qsum_map_sub {β : Type _} (f g : β → Rat) (l : List β) :
    qsum (l.map (fun b => f b - g b)) = qsum (l.map f) - qsum (l.map g) := by
  induction l with
  | nil => exact (Rat.sub_self (a := (0 : Rat))).symm
  | cons x t ih =>
    simp only [List.map_cons, qsum]
    rw [ih]
    exact add_sub_add_sub_rat (f x) (g x) (qsum (List.map f t)) (qsum (List.map g t))

/-- 左乘分配差：a(b−c) = ab − ac -/
theorem mul_sub_rat (a b c : Rat) : a * (b - c) = a * b - a * c := by
  calc a * (b - c) = a * (b + -c) := by rw [Rat.sub_eq_add_neg]
    _ = a * b + a * -c := by rw [Rat.mul_add]
    _ = a * b + -(a * c) := by rw [Rat.mul_neg]
    _ = a * b - a * c := by rw [Rat.sub_eq_add_neg]

/-- 右减反单调：a ≤ b ⇒ c−b ≤ c−a -/
theorem sub_le_sub_right_rat {a b c : Rat} (h : a ≤ b) : c - b ≤ c - a := by
  rw [Rat.sub_eq_add_neg, Rat.sub_eq_add_neg]
  exact add_le_add (Rat.le_refl) (Rat.neg_le_neg_iff.mpr h)

/-! ## 1. qmax 补充引理 -/

theorem qmax_eq_right {a b : Rat} (h : a ≤ b) : qmax a b = b := by
  unfold qmax
  rw [if_pos h]

/-- 结合律：qmax (qmax a b) c = qmax a (qmax b c) -/
theorem qmax_assoc (a b c : Rat) : qmax (qmax a b) c = qmax a (qmax b c) := by
  apply Rat.le_antisymm
  · apply qmax_le
    · apply qmax_le
      · exact le_qmax_left a (qmax b c)
      · exact Rat.le_trans (le_qmax_left b c) (le_qmax_right a (qmax b c))
    · exact Rat.le_trans (le_qmax_right b c) (le_qmax_right a (qmax b c))
  · apply qmax_le
    · exact Rat.le_trans (le_qmax_left a b) (le_qmax_left (qmax a b) c)
    · apply qmax_le
      · exact Rat.le_trans (le_qmax_right a b) (le_qmax_left (qmax a b) c)
      · exact le_qmax_right (qmax a b) c

/-- 边际恒等式：qmax m x − m = (x − m)⁺ -/
theorem qmax_sub_self (m x : Rat) : qmax m x - m = qmax (x - m) 0 := by
  by_cases h : m ≤ x
  · have h0 : 0 ≤ x - m := by
      rw [Rat.sub_eq_add_neg]
      have hh : m + -m ≤ x + -m := add_le_add h (Rat.le_refl)
      rwa [Rat.add_neg_cancel] at hh
    rw [qmax_eq_right h, qmax_eq_left h0]
  · have hx : x ≤ m := le_of_not_le h
    have h0 : x - m ≤ 0 := by
      rw [Rat.sub_eq_add_neg]
      have hh : x + -m ≤ m + -m := add_le_add hx (Rat.le_refl)
      rwa [Rat.add_neg_cancel] at hh
    rw [qmax_eq_left hx, qmax_eq_right h0, Rat.sub_self]

/-! ## 2. maxAdm 逐点结构引理 -/

/-- maxAdm 恒非负（空表取 0，逐层 qmax 不比尾部小） -/
theorem maxAdm_nonneg (v : α → Rat) (adm : α → Bool) (l : List α) :
    0 ≤ maxAdm v adm l := by
  induction l with
  | nil => exact Rat.le_refl
  | cons c t ih =>
    by_cases h : adm c
    · simp only [maxAdm, if_pos h]
      exact Rat.le_trans ih (le_qmax_right _ _)
    · simp only [maxAdm, if_neg h]
      exact ih

/-- maxAdm 的 cons 分解：maxAdm (c::t) = qmax (录取则 v c 否则 0) (maxAdm t) -/
theorem maxAdm_cons (v : α → Rat) (adm : α → Bool) (c : α) (t : List α) :
    maxAdm v adm (c :: t) = qmax (if adm c then v c else 0) (maxAdm v adm t) := by
  by_cases h : adm c
  · simp only [maxAdm, if_pos h]
  · have h0 := maxAdm_nonneg v adm t
    simp only [maxAdm, if_neg h]
    rw [qmax_comm, qmax_eq_left h0]

/-- 成员界：a ∈ B 且 a 被录取 ⇒ v a ≤ maxAdm B（无需非负性） -/
theorem maxAdm_mem {v : α → Rat} {adm : α → Bool} {a : α} {B : List α}
    (ha : a ∈ B) (hadm : adm a) : v a ≤ maxAdm v adm B := by
  induction B with
  | nil => exact absurd ha (List.not_mem_nil)
  | cons b t ih =>
    rw [maxAdm_cons v adm b t]
    rcases List.mem_cons.mp ha with rfl | hmem
    · rw [if_pos hadm]
      exact le_qmax_left _ _
    · by_cases hb : adm b
      · rw [if_pos hb]
        exact Rat.le_trans (ih hmem) (le_qmax_right _ _)
      · rw [if_neg hb]
        exact Rat.le_trans (ih hmem) (le_qmax_right 0 (maxAdm v adm t))

/-- 成员包含单调：A ⊆ B ⇒ maxAdm A ≤ maxAdm B（无需非负性） -/
theorem maxAdm_mono_lists {v : α → Rat} {adm : α → Bool} {A B : List α}
    (h : ∀ a ∈ A, a ∈ B) : maxAdm v adm A ≤ maxAdm v adm B := by
  induction A with
  | nil => exact maxAdm_nonneg v adm B
  | cons a t ih =>
    rw [maxAdm_cons v adm a t]
    apply qmax_le
    · by_cases ha : adm a
      · rw [if_pos ha]
        exact maxAdm_mem (h a (List.mem_cons_self ..)) ha
      · rw [if_neg ha]
        exact maxAdm_nonneg v adm B
    · exact ih (fun x hx => h x (List.mem_cons_of_mem _ hx))

/-- 尾部并单点：maxAdm (l ++ [e]) = qmax (maxAdm l) (录取则 v e 否则 0) -/
theorem maxAdm_append_singleton (v : α → Rat) (adm : α → Bool) (l : List α) (e : α) :
    maxAdm v adm (l ++ [e]) = qmax (maxAdm v adm l) (if adm e then v e else 0) := by
  induction l with
  | nil =>
    simp only [List.nil_append, maxAdm]
    by_cases h : adm e
    · simp only [if_pos h]
      exact qmax_comm (v e) 0
    · simp only [if_neg h]
      exact (qmax_eq_left (Rat.le_refl)).symm
  | cons c t ih =>
    rw [List.cons_append]
    simp only [maxAdm]
    rw [ih]
    by_cases h : adm c
    · simp only [if_pos h]
      rw [qmax_assoc]
    · simp only [if_neg h]

/-- 边际反单调：m_A ≤ m_B ⇒ 加 e 的边际增益在 A 处 ≥ 在 B 处（C2 点态核心） -/
theorem maxAdm_marginal_antitone {v : α → Rat} {adm : α → Bool} {A B : List α} {e : α}
    (hm : maxAdm v adm A ≤ maxAdm v adm B) :
    maxAdm v adm (B ++ [e]) - maxAdm v adm B ≤ maxAdm v adm (A ++ [e]) - maxAdm v adm A := by
  rw [maxAdm_append_singleton, maxAdm_append_singleton]
  rw [qmax_sub_self (maxAdm v adm B) (if adm e then v e else 0),
      qmax_sub_self (maxAdm v adm A) (if adm e then v e else 0)]
  exact qmax_le (Rat.le_trans (sub_le_sub_right_rat hm) (le_qmax_left _ _)) (le_qmax_right _ _)

/-- 乘积权重非负：0 ≤ p i ≤ 1 ⇒ 0 ≤ w ω（wt 对任意 (p,v) 列表逐位乘积） -/
theorem wt_nonneg (L : List (Rat × Rat)) :
    ∀ (ω : List Bool), (∀ c ∈ L, 0 ≤ c.1 ∧ c.1 ≤ 1) → 0 ≤ wt L ω := by
  induction L with
  | nil =>
    intro ω _
    exact zero_le_one_rat
  | cons c t ih =>
    intro ω h
    cases ω with
    | nil => exact zero_le_one_rat
    | cons b bs =>
      show 0 ≤ (if b then c.1 else 1 - c.1) * wt t bs
      have hc := h c (List.mem_cons_self ..)
      have ht := ih bs (fun d hd => h d (List.mem_cons_of_mem _ hd))
      by_cases hb : b
      · rw [if_pos hb]
        exact Rat.mul_nonneg hc.1 ht
      · rw [if_neg hb]
        exact Rat.mul_nonneg (one_sub_nonneg hc.2) ht

/-! ## 3. C1：桥接恒等式（Horner 效用 ↔ 期望最大录取值） -/

/-- 按位置读出录取位：ω 与 S 逐位对齐时，x 在 S 中位置上的布尔位。
    （S 无重复且长度匹配时良定；长度不匹配或未出现取 false。） -/
def admAt [DecidableEq α] : List α → List Bool → α → Bool
  | c :: t, b :: bs, x => if x = c then b else admAt t bs x
  | _, _, _ => false

theorem admAt_cons [DecidableEq α] (c : α) (t : List α) (b : Bool) (bs : List Bool) (x : α) :
    admAt (c :: t) (b :: bs) x = if x = c then b else admAt t bs x := rfl

theorem admAt_cons_self [DecidableEq α] (c : α) (t : List α) (b : Bool) (bs : List Bool) :
    admAt (c :: t) (b :: bs) c = b := by
  rw [admAt_cons, if_pos rfl]

/-- 全拒绝录取函数下 payoff 恒为 0 -/
theorem payoff_const_false (v : α → Rat) (l : List α) : payoff v (fun _ => false) l = 0 := by
  induction l with
  | nil => rfl
  | cons c t ih => simp [payoff, ih]

/-- 录取函数逐点相等 ⇒ payoff 相等 -/
theorem payoff_congr {v : α → Rat} {adm₁ adm₂ : α → Bool} :
    ∀ {l : List α}, (∀ a ∈ l, adm₁ a = adm₂ a) → payoff v adm₁ l = payoff v adm₂ l
  | [], _ => rfl
  | c :: t, h => by
    have hc := h c (List.mem_cons_self ..)
    have ht : payoff v adm₁ t = payoff v adm₂ t :=
      payoff_congr (fun a ha => h a (List.mem_cons_of_mem _ ha))
    by_cases hadm : adm₂ c
    · simp [payoff, hadm, hc]
    · simpa [payoff, hadm, hc] using ht

/-- 录取函数逐点相等 ⇒ maxAdm 相等 -/
theorem maxAdm_congr {v : α → Rat} {adm₁ adm₂ : α → Bool} :
    ∀ {l : List α}, (∀ a ∈ l, adm₁ a = adm₂ a) → maxAdm v adm₁ l = maxAdm v adm₂ l
  | [], _ => rfl
  | c :: t, h => by
    have hc := h c (List.mem_cons_self ..)
    have ht : maxAdm v adm₁ t = maxAdm v adm₂ t :=
      maxAdm_congr (fun a ha => h a (List.mem_cons_of_mem _ ha))
    by_cases hadm : adm₂ c
    · simp [maxAdm, hadm, hc, ht]
    · simpa [maxAdm, hadm, hc] using ht

/-- admAt 在无重复头部下的尾部一致性 -/
theorem admAt_cons_tail [DecidableEq α] {c : α} {t : List α} (hct : c ∉ t)
    (b : Bool) (bs : List Bool) {x : α} (hx : x ∈ t) :
    admAt (c :: t) (b :: bs) x = admAt t bs x := by
  rw [admAt_cons]
  by_cases h : x = c
  · subst h
    exact absurd hx hct
  · rw [if_neg h]

/-- outcomes 中元素的长度恰为 n -/
theorem outcomes_length : ∀ (n : Nat) (ω : List Bool), ω ∈ outcomes n → ω.length = n
  | 0, ω, h =>
    have h' : ω ∈ ([[]] : List (List Bool)) := h
    have : ω = [] := List.mem_singleton.mp h'
    this ▸ rfl
  | n + 1, ω, h => by
    rw [outcomes, List.mem_append] at h
    rcases h with h | h
    · rcases List.mem_map.mp h with ⟨σ, hσ, rfl⟩
      simp [outcomes_length n σ hσ]
    · rcases List.mem_map.mp h with ⟨σ, hσ, rfl⟩
      simp [outcomes_length n σ hσ]

/-- payoffB 与 payoff∘admAt 的对齐引理（C1 的逐点桥）：
    ω（长度 |S|）与 S 逐位对齐时，payoffB 取 "首个被录取者的价值"，
    与 payoff v (admAt S ω) S 一致。 -/
theorem payoffB_eq_payoff_admAt [DecidableEq α] (p v : α → Rat) (S : List α)
    (hnd : S.Nodup) :
    ∀ (ω : List Bool), ω.length = S.length →
      payoffB (S.map (fun c => (p c, v c))) ω = payoff v (admAt S ω) S := by
  induction S with
  | nil =>
    intro ω _
    cases ω <;> simp [payoffB, payoff]
  | cons c t ih =>
    intro ω hlen
    obtain ⟨hct, hnd'⟩ := List.nodup_cons.mp hnd
    cases ω with
    | nil => simp [payoffB, admAt, payoff_const_false]
    | cons b bs =>
      have hlen' : bs.length = t.length :=
        Nat.succ.inj (by simpa only [List.length_cons] using hlen)
      cases b with
      | true => simp [payoffB, payoff, admAt]
      | false =>
        calc payoffB (List.map (fun c => (p c, v c)) (c :: t)) (false :: bs)
            = payoffB (List.map (fun c => (p c, v c)) t) bs := by
              simp [List.map_cons, payoffB]
          _ = payoff v (admAt t bs) t := ih hnd' bs hlen'
          _ = payoff v (admAt (c :: t) (false :: bs)) t :=
              (payoff_congr (fun x hx => admAt_cons_tail hct false bs hx)).symm
          _ = payoff v (admAt (c :: t) (false :: bs)) (c :: t) := by
              simp [payoff, admAt_cons_self]

/-- 期望最大录取值（乘积空间；ω 遍历长度 |S| 的独立 Bernoulli 结果，
    与 S 逐位对齐；不在 S 中的候选无坐标，其对 max 无贡献，
    完整候选空间的乘积测度下其余坐标自然积掉）。 -/
def expMax [DecidableEq α] (p v : α → Rat) (S : List α) : Rat :=
  qsum ((outcomes S.length).map
    (fun ω => wt (S.map (fun c => (p c, v c))) ω * maxAdm v (admAt S ω) S))

/-- **C1 主定理（桥接恒等式，排序版）**：S 无重复且按 v 降序、价值非负时，
    U (S.map (p, v)) = Σ_ω wt_ω · maxAdm v (admAt S ω) S。
    组装链：A1（expPayoff = U）→ payoffB 对齐 → A2(b)（排序后 payoff = maxAdm）。 -/
theorem C1_sorted_payoff_eq_max [DecidableEq α] (p v : α → Rat) (S : List α)
    (hnd : S.Nodup)
    (hs : List.Pairwise (fun a b => v b ≤ v a) S)
    (hv : ∀ a ∈ S, 0 ≤ v a) :
    U (S.map (fun c => (p c, v c))) = expMax p v S := by
  unfold expMax
  rw [← A1_first_success_dist (S.map (fun c => (p c, v c)))]
  unfold expPayoff
  rw [List.length_map]
  apply qsum_map_congr
  intro ω hω
  rw [payoffB_eq_payoff_admAt p v S hnd ω (outcomes_length S.length ω hω)]
  rw [payoff_eq_maxAdm_of_sorted hs hv]

/-- **C1（无条件方向）**：任意无重复 S（不要求排序）时 U ≤ 期望最大录取值
    （由 A2(a) 逐点 payoff ≤ maxAdm 与权重非负）。 -/
theorem C1_utility_le_expMax [DecidableEq α] (p v : α → Rat) (S : List α)
    (hnd : S.Nodup) (hpv : ∀ c ∈ S, 0 ≤ p c ∧ p c ≤ 1) :
    U (S.map (fun c => (p c, v c))) ≤ expMax p v S := by
  have hwv : ∀ c ∈ S.map (fun c => (p c, v c)), 0 ≤ c.1 ∧ c.1 ≤ 1 := by
    intro c hc
    rcases List.mem_map.mp hc with ⟨d, hd, rfl⟩
    exact hpv d hd
  unfold expMax
  rw [← A1_first_success_dist (S.map (fun c => (p c, v c)))]
  unfold expPayoff
  rw [List.length_map]
  apply qsum_map_le
  intro ω hω
  rw [payoffB_eq_payoff_admAt p v S hnd ω (outcomes_length S.length ω hω)]
  exact Rat.mul_le_mul_of_nonneg_left (payoff_le_maxAdm v (admAt S ω) S)
    (wt_nonneg (S.map (fun c => (p c, v c))) ω hwv)

/-! ## 4. C2：单调性与子模性（任意加权场景族，distribution-free） -/

/-- g（场景族形式）：Σ_s w_s · maxOver (S ∩ admitted_s) v。
    scens 为任意有限加权录取场景族，权重非负即适用。 -/
def gScen (v : α → Rat) (scens : List (Rat × (α → Bool))) (S : List α) : Rat :=
  qsum (scens.map (fun s => s.1 * maxAdm v s.2 S))

/-- 边际差分解：g (S++[e]) − g S = Σ_s w_s · (M_s(S++[e]) − M_s(S)) -/
theorem gScen_diff_eq (v : α → Rat) (scens : List (Rat × (α → Bool))) (S : List α) (e : α) :
    gScen v scens (S ++ [e]) - gScen v scens S
      = qsum (scens.map (fun s =>
          s.1 * (maxAdm v s.2 (S ++ [e]) - maxAdm v s.2 S))) := by
  unfold gScen
  rw [← qsum_map_sub]
  exact qsum_map_congr (fun s _ => (mul_sub_rat s.1 _ _).symm)

/-- **C2(a) 单调性**：A ⊆ B（逐成员包含）⇒ g A ≤ g B。
    （无需 v ≥ 0；由 maxAdm 成员包含单调 + 权重非负逐点推出。） -/
theorem C2_monotone {v : α → Rat} {scens : List (Rat × (α → Bool))}
    (hw : ∀ s ∈ scens, 0 ≤ s.1) {A B : List α} (h : ∀ a ∈ A, a ∈ B) :
    gScen v scens A ≤ gScen v scens B := by
  unfold gScen
  apply qsum_map_le
  intro s hs
  exact Rat.mul_le_mul_of_nonneg_left (maxAdm_mono_lists (adm := s.2) h) (hw s hs)

/-- **C2(b) 子模性**：A ⊆ B ⇒ g (A∪{e}) − g A ≥ g (B∪{e}) − g B。
    点态耦合证明：边际 = (x − M)⁺ 关于 M 反单调；
    A ⊆ B ⇒ M_A(ω) ≤ M_B(ω) 逐点；权重非负保持加权和。
    （无需 v ≥ 0、无需 e ∉ B——均未用到。） -/
theorem C2_submodular {v : α → Rat} {scens : List (Rat × (α → Bool))}
    (hw : ∀ s ∈ scens, 0 ≤ s.1) {A B : List α} (h : ∀ a ∈ A, a ∈ B) (e : α) :
    gScen v scens (B ++ [e]) - gScen v scens B ≤
      gScen v scens (A ++ [e]) - gScen v scens A := by
  rw [gScen_diff_eq, gScen_diff_eq]
  apply qsum_map_le
  intro s hs
  exact Rat.mul_le_mul_of_nonneg_left
    (maxAdm_marginal_antitone (v := v) (adm := s.2) (maxAdm_mono_lists (adm := s.2) h))
    (hw s hs)

/-! ## 5. 乘积空间形态：用户陈述中的 g（Ω = Fin N → Bool） -/

section Product

variable {N : Nat}

/-- 全体候选人按编号的 (p, v) 列表 -/
def fullL (p v : Fin N → Rat) : List (Rat × Rat) :=
  (List.finRange N).map (fun i => (p i, v i))

/-- 长度对齐的按位置布尔查找（越界取 false） -/
def bAt : List Bool → Nat → Bool
  | [], _ => false
  | b :: _, 0 => b
  | _ :: t, n + 1 => bAt t n

/-- ω（长度 N 的布尔向量）对应的全校录取函数 -/
def admOfB (ω : List Bool) : Fin N → Bool := fun i => bAt ω i.val

/-- 乘积空间的加权场景族：(w(ω), 录取函数) -/
def scensOf (p v : Fin N → Rat) : List (Rat × (Fin N → Bool)) :=
  (outcomes N).map (fun ω => (wt (fullL p v) ω, admOfB ω))

/-- **g（乘积空间形态，即用户陈述中的 g）**：
    g S = Σ_ω w ω · maxOver (S ∩ admitted ω) v，
    Ω 为 N 个坐标的独立 Bernoulli 乘积空间、w ω = Π_i (ω_i ? p_i : 1−p_i)。 -/
def gExp (p v : Fin N → Rat) (S : List (Fin N)) : Rat :=
  gScen v (scensOf p v) S

/-- gExp 的展开对应式 -/
theorem gExp_unfold (p v : Fin N → Rat) (S : List (Fin N)) :
    gExp p v S
      = qsum ((outcomes N).map (fun ω => wt (fullL p v) ω * maxAdm v (admOfB ω) S)) := by
  unfold gExp gScen scensOf
  rw [List.map_map]
  apply qsum_map_congr
  intro s _
  rfl

/-- gExp 是集合函数：对列表顺序不变（由 maxAdm_perm；C3 贪婪按集合论述所需） -/
theorem gExp_perm (p v : Fin N → Rat) {A B : List (Fin N)} (h : A.Perm B) :
    gExp p v A = gExp p v B := by
  unfold gExp gScen
  apply qsum_map_congr
  intro s _
  rw [maxAdm_perm v s.2 h]

theorem fullL_valid (p v : Fin N → Rat) (hp : ∀ i, 0 ≤ p i ∧ p i ≤ 1) :
    ∀ c ∈ fullL p v, 0 ≤ c.1 ∧ c.1 ≤ 1 := by
  intro c hc
  rcases List.mem_map.mp hc with ⟨i, _, rfl⟩
  exact hp i

theorem scensOf_wt_nonneg (p v : Fin N → Rat) (hp : ∀ i, 0 ≤ p i ∧ p i ≤ 1) :
    ∀ s ∈ scensOf p v, 0 ≤ s.1 := by
  intro s hs
  rcases List.mem_map.mp hs with ⟨ω, _, rfl⟩
  exact wt_nonneg (fullL p v) ω (fullL_valid p v hp)

/-- **C2(a)（g 形态）**：A ⊆ B ⇒ g A ≤ g B。 -/
theorem C2_gExp_monotone (p v : Fin N → Rat) (hp : ∀ i, 0 ≤ p i ∧ p i ≤ 1)
    {A B : List (Fin N)} (h : ∀ a ∈ A, a ∈ B) :
    gExp p v A ≤ gExp p v B :=
  C2_monotone (v := v) (scens := scensOf p v) (scensOf_wt_nonneg p v hp) h

/-- **C2(b)（g 形态）**：g (A∪{e}) − g A ≥ g (B∪{e}) − g B。 -/
theorem C2_gExp_submodular (p v : Fin N → Rat) (hp : ∀ i, 0 ≤ p i ∧ p i ≤ 1)
    {A B : List (Fin N)} (h : ∀ a ∈ A, a ∈ B) (e : Fin N) :
    gExp p v (B ++ [e]) - gExp p v B ≤ gExp p v (A ++ [e]) - gExp p v A :=
  C2_submodular (v := v) (scens := scensOf p v) (scensOf_wt_nonneg p v hp) h e

/-- g(∅) = 0（C3 贪婪分析所需的基础值） -/
theorem gExp_empty (p v : Fin N → Rat) : gExp p v [] = 0 := by
  rw [gExp_unfold]
  have h : ∀ ω ∈ outcomes N, wt (fullL p v) ω * maxAdm v (admOfB ω) [] = (0 : Rat) := by
    intro ω _
    simp [maxAdm, Rat.mul_zero]
  rw [qsum_map_congr h, qsum_map_zero]

/-- g ≥ 0（乘积权重非负 + maxAdm 非负；C3 贪婪分析所需） -/
theorem gExp_nonneg (p v : Fin N → Rat) (hp : ∀ i, 0 ≤ p i ∧ p i ≤ 1)
    (S : List (Fin N)) : 0 ≤ gExp p v S := by
  rw [gExp_unfold]
  apply qsum_nonneg
  intro x hx
  rcases List.mem_map.mp hx with ⟨ω, _, rfl⟩
  exact Rat.mul_nonneg (wt_nonneg (fullL p v) ω (fullL_valid p v hp))
    (maxAdm_nonneg v (admOfB ω) S)

end Product

/-! ## 6. 具体排序函数 sortDescByV（插入排序）与 C1 的字面形态 -/

section Sorting

/-- 把 x 按 v 降序插入已降序列表 -/
def insDesc (v : α → Rat) (x : α) : List α → List α
  | [] => [x]
  | b :: t => if v x ≤ v b then b :: insDesc v x t else x :: b :: t

/-- 插入排序（按 v 降序） -/
def sortDescByV (v : α → Rat) : List α → List α
  | [] => []
  | x :: t => insDesc v x (sortDescByV v t)

theorem insDesc_cons (v : α → Rat) (x b : α) (t : List α) :
    insDesc v x (b :: t) = if v x ≤ v b then b :: insDesc v x t else x :: b :: t := rfl

/-- ins 是 {x} ∪ 原列表 的重排 -/
theorem insDesc_perm (v : α → Rat) (x : α) (l : List α) :
    (insDesc v x l).Perm (x :: l) := by
  induction l with
  | nil => exact List.Perm.refl _
  | cons b t ih =>
    rw [insDesc_cons]
    by_cases h : v x ≤ v b
    · rw [if_pos h]
      exact (List.Perm.cons b ih).trans (List.Perm.swap b x t).symm
    · rw [if_neg h]

/-- ins 保持降序性 -/
theorem insDesc_pairwise (v : α → Rat) (x : α) {l : List α}
    (hs : List.Pairwise (fun a b => v b ≤ v a) l) :
    List.Pairwise (fun a b => v b ≤ v a) (insDesc v x l) := by
  induction l with
  | nil => exact List.Pairwise.cons (fun y hy => absurd hy (List.not_mem_nil)) List.Pairwise.nil
  | cons b t ih =>
    rw [insDesc_cons]
    by_cases h : v x ≤ v b
    · rw [if_pos h]
      apply List.Pairwise.cons
      · intro y hy
        rw [List.Perm.mem_iff (insDesc_perm v x t)] at hy
        rcases List.mem_cons.mp hy with hyx | hyt
        · rw [hyx]
          exact h
        · exact (List.pairwise_cons.mp hs).1 y hyt
      · exact ih (List.pairwise_cons.mp hs).2
    · rw [if_neg h]
      apply List.Pairwise.cons
      · intro y hy
        rcases List.mem_cons.mp hy with hyb | hyt
        · rw [hyb]
          exact le_of_not_le h
        · exact Rat.le_trans ((List.pairwise_cons.mp hs).1 y hyt) (le_of_not_le h)
      · exact hs

theorem sortDescByV_perm (v : α → Rat) (l : List α) : (sortDescByV v l).Perm l := by
  induction l with
  | nil => exact List.Perm.refl _
  | cons x t ih =>
    exact (insDesc_perm v x (sortDescByV v t)).trans (List.Perm.cons x ih)

theorem sortDescByV_pairwise (v : α → Rat) (l : List α) :
    List.Pairwise (fun a b => v b ≤ v a) (sortDescByV v l) := by
  induction l with
  | nil => exact List.Pairwise.nil
  | cons x t ih => exact insDesc_pairwise v x ih

theorem sortDescByV_nodup (v : α → Rat) {l : List α} (h : l.Nodup) :
    (sortDescByV v l).Nodup :=
  (sortDescByV_perm v l).nodup_iff.mpr h

/-- **C1 的字面形态**：对任意无重复列表 S 与插入排序 sortDescByV，
    U (sortDescByV S 的 (p,v) 列表) = 期望最大录取值。 -/
theorem C1_sortDescByV [DecidableEq α] (p v : α → Rat) (S : List α) (hnd : S.Nodup)
    (hv : ∀ a ∈ S, 0 ≤ v a) :
    U ((sortDescByV v S).map (fun c => (p c, v c))) = expMax p v (sortDescByV v S) :=
  C1_sorted_payoff_eq_max p v (sortDescByV v S)
    (sortDescByV_nodup v hnd)
    (sortDescByV_pairwise v S)
    (fun a ha => hv a ((sortDescByV_perm v S).mem_iff.mp ha))

end Sorting

end Bsaa
