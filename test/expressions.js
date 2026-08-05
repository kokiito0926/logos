import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LogosCompiler } from '../src/index.js';

// Compile a Logos snippet. With shouldPass=false, compilation must throw;
// otherwise the generated JS must match `pattern` (when given).
function compile(code) {
  return new LogosCompiler().compile(code);
}

function check(code, pattern, shouldPass = true) {
  if (!shouldPass) {
    assert.throws(() => compile(code));
    return;
  }
  const result = compile(code);
  if (pattern) assert.match(result, pattern);
}

// ===== Test Group: 暗黙引数 (Implicit Arguments) =====
test("1.1: 単一暗黙引数", () => {
  check("square ≔ α²", new RegExp("const square = α => \\(α \\*\\* 2\\);"));
});
test("1.2: 複数暗黙引数 (2つ)", () => {
  check("add ≔ α + β", new RegExp("const add = \\(α, β\\) => \\(\\(α \\+ β\\)\\)|const add = \\(α, β\\) => \\(α \\+ β\\)"));
});
test("1.3: 複数暗黙引数 (3つ)", () => {
  check("sum3 ≔ α + β + γ", new RegExp("const sum3 = \\(α, β, γ\\) => "));
});
test("1.4: 複数暗黙引数 (4つ)", () => {
  check("sum4 ≔ α + β + γ + δ", new RegExp("const sum4 = \\(α, β, γ, δ\\) => "));
});

// ===== Test Group: 暗黙戻り値 (Implicit Return) =====
test("2.1: 常数は戻り値なし", () => {
  check("pi_value ≔ π", new RegExp("const pi_value = Math\\.PI;"));
});
test("2.2: 数値リテラルは戻り値なし", () => {
  check("forty_two ≔ 42", new RegExp("const forty_two = 42;"));
});

// ===== Test Group: メンバーアクセス (Member Access) =====
test("3.1: 単一メンバーアクセス", () => {
  check("getX ≔ α.x", new RegExp("const getX = α => α\\.x;"));
});
test("3.2: 複数メンバーアクセス (距離計算)", () => {
  check("distance ≔ √((α.x - β.x)² + (α.y - β.y)²)", new RegExp("const distance = \\(α, β\\) => Math\\.sqrt"));
});
test("3.3: ネストされたメンバーアクセス", () => {
  check("getNestedX ≔ α.point.x", new RegExp("const getNestedX = α => α\\.point\\.x;"));
});

// ===== Test Group: 比較演算子 (Comparison Operators) =====
test("3.4: 等価比較", () => {
  check("same ≔ α = β", new RegExp("const same = \\(α, β\\) => \\(α === β\\);"));
});
test("3.5: 非等価比較", () => {
  check("different ≔ α ≠ β", new RegExp("const different = \\(α, β\\) => \\(α !== β\\);"));
});
test("3.6: 大小比較", () => {
  check("withinLimit ≔ α ≤ 10", new RegExp("const withinLimit = α => \\(α <= 10\\);"));
});
test("3.7: 優先順位", () => {
  check("adult ≔ α.age + 1 ≥ β * 2", new RegExp("const adult = \\(α, β\\) => \\(\\(α.age \\+ 1\\) >= \\(β \\* 2\\)\\);"));
});

// ===== Test Group: 論理演算子 (Logical Operators) =====
test("3.8: 否定", () => {
  check("allowed ≔ ¬α.banned", new RegExp("const allowed = α => \\(!α\\.banned\\);"));
});
test("3.9: 論理積", () => {
  check("allowed ≔ α.active ∧ β.verified", new RegExp("const allowed = \\(α, β\\) => \\(α\\.active && β\\.verified\\);"));
});
test("3.10: 論理和", () => {
  check("visible ≔ α.public ∨ α.owner = β", new RegExp("const visible = \\(α, β\\) => \\(α\\.public \\|\\| \\(α\\.owner === β\\)\\);"));
});
test("3.11: 論理演算子の優先順位", () => {
  check("allowed ≔ ¬α.banned ∧ β.admin ∨ γ.override", new RegExp("const allowed = \\(α, β, γ\\) => \\(\\(\\(!α\\.banned\\) && β\\.admin\\) \\|\\| γ\\.override\\);"));
});

// ===== Test Group: 数学関数 (Math Functions) =====
test("4.1: 平方根関数", () => {
  check("sqrt2 ≔ √(2)", new RegExp("const sqrt2 = Math\\.sqrt\\(2\\);"));
});
test("4.2: π定数", () => {
  check("tau ≔ 2 * π", new RegExp("const tau = .*Math\\.PI"));
});
test("4.3: ∞定数", () => {
  check("unbounded ≔ ∞", new RegExp("const unbounded = Infinity;"));
});

// ===== Test Group: べき乗表記 (Power Notation) =====
test("5.1: 二乗記号 (²)", () => {
  check("sq ≔ α²", new RegExp("const sq = α => \\(α \\*\\* 2\\);"));
});
test("5.2: 三乗記号 (³)", () => {
  check("cb ≔ α³", new RegExp("const cb = α => \\(α \\*\\* 3\\);"));
});
test("5.3: 複数べき乗", () => {
  check("powers ≔ α² + β³", new RegExp("const powers = \\(α, β\\) => "));
});

// ===== Test Group: 複合操作 (Complex Operations) =====
test("6.1: 四則演算の組み合わせ", () => {
  check("calc ≔ (α + β) * γ", new RegExp("const calc = \\(α, β, γ\\) => .*α.*\\+.*β.*\\*.*γ"));
});
test("6.2: 複雑な数式", () => {
  check("quadratic ≔ α * α + β * α + γ", new RegExp("const quadratic = \\(α, β, γ\\) => "));
});
test("6.3: ユークリッド距離 (Euclidean distance)", () => {
  check("euclidean ≔ √(α² + β²)", new RegExp("const euclidean = \\(α, β\\) => Math\\.sqrt\\(\\(\\(α \\*\\* 2\\) \\+ \\(β \\*\\* 2\\)\\)\\);"));
});

// ===== Test Group: 配列アクセス (Array Access) =====
test("7.1: 配列インデックスアクセス", () => {
  check("first ≔ α[0]", new RegExp("const first = α => α\\[0\\];"));
});
test("7.2: 変数インデックス", () => {
  check("getAt ≔ α[β]", new RegExp("const getAt = \\(α, β\\) => α\\[β\\];"));
});

// ===== Test Group: 新規演算子・リテラル (Star-1 Features) =====
test("9.1: 真偽値リテラル (⊤, ⊥)", () => {
  check("t_val ≔ ⊤", new RegExp("const t_val = true;"));
});
test("9.2: 偽リテラル (⊥)", () => {
  check("f_val ≔ ⊥", new RegExp("const f_val = false;"));
});
test("9.3: 空集合 (∅)", () => {
  check("empty_set ≔ ∅", new RegExp("const empty_set = new Set\\(\\);"));
});
test("9.4: 含意演算子 (⇒)", () => {
  check("implies ≔ α ⇒ β", new RegExp("const implies = \\(α, β\\) => \\(!α \\|\\| β\\);"));
});
test("9.5: 同値演算子 (⇔)", () => {
  check("equiv ≔ α ⇔ β", new RegExp("const equiv = \\(α, β\\) => \\(α === β\\);"));
});
test("9.6: 排他的論理和 (⊕)", () => {
  check("xor_val ≔ α ⊕ β", new RegExp("const xor_val = \\(α, β\\) => \\(α !== β\\);"));
});
test("9.7: 合同演算子 (≡)", () => {
  check("congruent ≔ α ≡ β", new RegExp("const congruent = \\(α, β\\) => \\(α === β\\);"));
});
test("9.8: 近似演算子 (≈)", () => {
  check("approx ≔ α ≈ β", new RegExp("const approx = \\(α, β\\) => almostEqual\\(α, β\\);"));
});

// ===== Test Group: 星2機能 (Star-2 Features) =====
test("10.1: 代入演算子 (←)", () => {
  check("assign_test ≔ α ← β", new RegExp("const assign_test = \\(α, β\\) => \\(α = β\\);"));
});
test("10.2: 単一引数マッピング (↦)", () => {
  check("square_explicit ≔ x ↦ x²", new RegExp("const square_explicit = x => \\(x \\*\\* 2\\);"));
});
test("10.3: 複数引数マッピング ((a,b) ↦)", () => {
  check("add_explicit ≔ (x, y) ↦ x + y", new RegExp("const add_explicit = \\(x, y\\) => \\(x \\+ y\\);"));
});
test("10.4: 関数合成 (∘)", () => {
  check("composed ≔ f ∘ g", new RegExp("const composed = \\(\\(\\.\\.\\.args\\) => f\\(g\\(\\.\\.\\.args\\)\\)\\);"));
});

// ===== Test Group: 下付き・上付き文字 (Subscripts & Superscripts) =====
test("11.1: 下付き添字の添字アクセス (x₀, x₁)", () => {
  check("point ≔ x₀ + x₁", new RegExp("const point = \\(x\\[0\\] \\+ x\\[1\\]\\);"));
});
test("11.2: 暗黙引数付き下付き文字 (α₁, β₂)", () => {
  check("dist_sub ≔ α₁ + β₂", new RegExp("const dist_sub = \\(α, β\\) => \\(α\\[1\\] \\+ β\\[2\\]\\);"));
});
test("11.3: 負の指数 (x⁻¹)", () => {
  check("inverse ≔ α⁻¹", new RegExp("const inverse = α => \\(α \\*\\* -1\\);"));
});
test("11.4: 4乗・複数桁の指数 (α⁴, x¹⁰)", () => {
  check("poly ≔ α⁴ + β¹⁰", new RegExp("const poly = \\(α, β\\) => \\(\\(α \\*\\* 4\\) \\+ \\(β \\*\\* 10\\)\\);"));
});

// ===== Test Group: チェーン比較 (Chain Comparison) =====
test("12.1: 二重比較 (0 ≤ α ≤ 10)", () => {
  check("in_range ≔ 0 ≤ α ≤ 10", new RegExp("const in_range = α => \\(0 <= α\\) && \\(α <= 10\\);"));
});
test("12.2: 異なる演算子の混在 (0 ≤ α < 10)", () => {
  check("between ≔ 0 ≤ α < 10", new RegExp("const between = α => \\(0 <= α\\) && \\(α < 10\\);"));
});
test("12.3: 三項チェーン (a = b ≠ c ≤ d)", () => {
  check("chain3 ≔ a = b ≠ c ≤ d", new RegExp("const chain3 = \\(a === b\\) && \\(b !== c\\) && \\(c <= d\\);"));
});
test("12.4: 等価チェーン (a = b = c)", () => {
  check("equal_chain ≔ a = b = c", new RegExp("const equal_chain = \\(a === b\\) && \\(b === c\\);"));
});
test("12.5: 定数との二重比較 (1 ≤ α ≤ 3)", () => {
  check("unit_range ≔ 1 ≤ α ≤ 3", new RegExp("const unit_range = α => \\(1 <= α\\) && \\(α <= 3\\);"));
});

// ===== Test Group: 集合演算 (Set Operations) =====
test("13.1: 共通部分 (A ∩ B)", () => {
  check("both ≔ A ∩ B", new RegExp("const both = new Set\\(\\[\\.\\.\\.A\\]\\.filter\\(x => B\\.has\\(x\\)\\)\\);"));
});
test("13.2: 和集合 (A ∪ B)", () => {
  check("all ≔ A ∪ B", new RegExp("const all = new Set\\(\\[\\.\\.\\.A, \\.\\.\\.B\\]\\);"));
});
test("13.3: 差集合 (A ∖ B)", () => {
  check("only_a ≔ A ∖ B", new RegExp("const only_a = new Set\\(\\[\\.\\.\\.A\\]\\.filter\\(x => !B\\.has\\(x\\)\\)\\);"));
});
test("13.4: 直積 (A × B)", () => {
  check("pairs ≔ A × B", new RegExp("const pairs = new Set\\(\\[\\.\\.\\.A\\]\\.flatMap\\(a => \\[\\.\\.\\.B\\]\\.map\\(b => \\[a, b\\]\\)\\)\\);"));
});
test("13.5: 部分集合 (A ⊆ B)", () => {
  check("sub ≔ A ⊆ B", new RegExp("const sub = \\(\\[\\.\\.\\.A\\]\\.every\\(x => B\\.has\\(x\\)\\)\\);"));
});
test("13.6: 真部分集合 (A ⊂ B)", () => {
  check("psub ≔ A ⊂ B", new RegExp("const psub = \\(\\[\\.\\.\\.A\\]\\.every\\(x => B\\.has\\(x\\)\\) && A\\.size < B\\.size\\);"));
});
test("13.7: 帰属と共通部分の優先順位 (α ∈ A ∩ B)", () => {
  check("has_all ≔ α ∈ A ∩ B", new RegExp("const has_all = α => \\(new Set\\(\\[\\.\\.\\.A\\]\\.filter\\(x => B\\.has\\(x\\)\\)\\)\\.has\\(α\\)\\);"));
});
test("13.8: 積より和が低い優先順位 (A ∪ B ∩ C)", () => {
  check("prec ≔ A ∪ B ∩ C", new RegExp("const prec = new Set\\(\\[\\.\\.\\.A, \\.\\.\\.new Set\\(\\[\\.\\.\\.B\\]\\.filter\\(x => C\\.has\\(x\\)\\)\\)\\]\\);"));
});
test("13.9: 部分集合のチェーン (A ⊆ B ⊆ C)", () => {
  check("chain_sub ≔ A ⊆ B ⊆ C", new RegExp("const chain_sub = \\(\\[\\.\\.\\.A\\]\\.every\\(x => B\\.has\\(x\\)\\)\\) && \\(\\[\\.\\.\\.B\\]\\.every\\(x => C\\.has\\(x\\)\\)\\);"));
});

// ===== Test Group: パイプライン演算子 (Pipeline Operator) =====
test("14.1: 関数参照へのパイプ (x |> f)", () => {
  check("result ≔ x |> f", new RegExp("const result = f\\(x\\);"));
});
test("14.2: 複数引数関数へのパイプ (x |> f(a, b))", () => {
  check("result ≔ x |> f(a, b)", new RegExp("const result = f\\(x, a, b\\);"));
});
test("14.3: 連鎖パイプライン (README例)", () => {
  check("result ≔ numbers |> filter(isPrime) |> map(square) |> sum", new RegExp("const result = sum\\(map\\(filter\\(numbers, isPrime\\), square\\)\\);"));
});
test("14.4: 引数なし関数呼び出し (x |> f())", () => {
  check("result ≔ x |> f()", new RegExp("const result = f\\(x\\);"));
});
test("14.5: 算術より緩い優先順位 (x + 1 |> f)", () => {
  check("result ≔ x + 1 |> f", new RegExp("const result = f\\(\\(x \\+ 1\\)\\);"));
});
test("14.6: アロー関数を右辺に (x |> (y ↦ y * 2))", () => {
  check("result ≔ x |> (y ↦ y * 2)", new RegExp("const result = \\(y => \\(y \\* 2\\)\\)\\(x\\);"));
});
test("14.7: メソッド呼び出しへのパイプ (x |> obj.method(y))", () => {
  check("result ≔ x |> obj.method(y)", new RegExp("const result = obj\\.method\\(x, y\\);"));
});
test("14.8: 右辺が関数でない場合はエラー", () => {
  check("result ≔ x |> a + b", null, false);
});
test("14.9: 左結合の連鎖 (x |> f |> g)", () => {
  check("result ≔ x |> f |> g", new RegExp("const result = g\\(f\\(x\\)\\);"));
});
test("14.10: 合成関数へのパイプ (x |> f ∘ g)", () => {
  check("result ≔ x |> f ∘ g", new RegExp("const result = \\(\\(\\(\\.\\.\\.args\\) => f\\(g\\(\\.\\.\\.args\\)\\)\\)\\)\\(x\\);"));
});

// ===== Test Group: 量化 (Quantifiers) =====
test("15.1: 全称量化 (∀ → every)", () => {
  check("all_adult ≔ ∀ α ∈ users : α.age ≥ 18", new RegExp("const all_adult = \\[\\.\\.\\.users\\]\\.every\\(α => \\(α\\.age >= 18\\)\\);"));
});
test("15.2: 存在量化 (∃ → some)", () => {
  check("has_adult ≔ ∃ α ∈ users : α.age ≥ 18", new RegExp("const has_adult = \\[\\.\\.\\.users\\]\\.some\\(α => \\(α\\.age >= 18\\)\\);"));
});
test("15.3: 非存在量化 (∄ → !some)", () => {
  check("no_minor ≔ ∄ α ∈ users : α.age < 18", new RegExp("const no_minor = !\\[\\.\\.\\.users\\]\\.some\\(α => \\(α\\.age < 18\\)\\);"));
});
test("15.4: 複数行の本体 (改行後も続く)", () => {
  check("all_positive ≔ ∀ α ∈ nums :\n    α > 0", new RegExp("const all_positive = \\[\\.\\.\\.nums\\]\\.every\\(α => \\(α > 0\\)\\);"));
});
test("15.5: 束縛変数は暗黙引数に含めない", () => {
  check("mixed ≔ ∀ α ∈ users : α.age ≥ β", new RegExp("const mixed = β => \\[\\.\\.\\.users\\]\\.every\\(α => \\(α\\.age >= β\\)\\);"));
});
test("15.6: 集合演算の優先順位 (A ∩ B)", () => {
  check("prec ≔ ∀ α ∈ A ∩ B : α > 0", new RegExp("const prec = \\[\\.\\.\\.new Set\\(\\[\\.\\.\\.A\\]\\.filter\\(x => B\\.has\\(x\\)\\)\\)\\]\\.every\\(α => \\(α > 0\\)\\);"));
});

// ===== Test Group: 総和・総積 (Sum & Product) =====
test("16.1: 総和 (∑ → reduce +)", () => {
  check("total ≔ ∑ α ∈ numbers : α", new RegExp("const total = \\[\\.\\.\\.numbers\\]\\.reduce\\(\\(acc, α\\) => acc \\+ α, 0\\);"));
});
test("16.2: 総積 (∏ → reduce *)", () => {
  check("product ≔ ∏ α ∈ numbers : α", new RegExp("const product = \\[\\.\\.\\.numbers\\]\\.reduce\\(\\(acc, α\\) => acc \\* α, 1\\);"));
});
test("16.3: 総和の本体 (α²)", () => {
  check("sum_sq ≔ ∑ α ∈ numbers : α²", new RegExp("const sum_sq = \\[\\.\\.\\.numbers\\]\\.reduce\\(\\(acc, α\\) => acc \\+ \\(α \\*\\* 2\\), 0\\);"));
});
test("16.4: 総和の複合本体 (α.price * α.qty)", () => {
  check("weighted ≔ ∑ α ∈ items : α.price * α.qty", new RegExp("const weighted = \\[\\.\\.\\.items\\]\\.reduce\\(\\(acc, α\\) => acc \\+ \\(α\\.price \\* α\\.qty\\), 0\\);"));
});
test("16.5: 束縛変数は暗黙引数に含めない", () => {
  check("mixed ≔ ∑ α ∈ nums : α + β", new RegExp("const mixed = β => \\[\\.\\.\\.nums\\]\\.reduce\\(\\(acc, α\\) => acc \\+ \\(α \\+ β\\), 0\\);"));
});
test("16.6: 複数行の本体", () => {
  check("multi ≔ ∏ α ∈ xs :\n    α + 1", new RegExp("const multi = \\[\\.\\.\\.xs\\]\\.reduce\\(\\(acc, α\\) => acc \\* \\(α \\+ 1\\), 1\\);"));
});
test("16.7: 範囲との組み合わせ (1‥10)", () => {
  check("sum_range ≔ ∑ α ∈ 1‥10 : α", new RegExp("const sum_range = \\[\\.\\.\\.range\\(1, 10\\)\\]\\.reduce\\(\\(acc, α\\) => acc \\+ α, 0\\);"));
});

// ===== Test Group: エラーケース (Error Cases) =====
test("8.1: 不正な文字 (should fail)", () => {
  check("invalid ≔ @", null, false);
});

// ===== Additional coverage (formerly comprehensive.js) =====
test("Test 5: Mathematical constant π", () => {
  check("circumference ≔ 2 * π * α", new RegExp("const circumference = α => \\(\\(2 \\* Math\\.PI\\) \\* α\\);"));
});
test("Test 6: Powers - square (²)", () => {
  check("quad ≔ 4 * α²", new RegExp("const quad = α => \\(\\(4 \\* \\(α \\*\\* 2\\)\\)\\);"));
});
test("Test 7: Powers - cube (³)", () => {
  check("cube ≔ α³", new RegExp("const cube = α => \\(α \\*\\* 3\\);"));
});
test("Test 8: Nested member access", () => {
  check("getX ≔ α.point.x", new RegExp("const getX = α => α\\.point\\.x;"));
});
test("Test 9: Array indexing", () => {
  check("getFirst ≔ α[0]", new RegExp("const getFirst = α => α\\[0\\];"));
});
test("Test 10: Mixed operations", () => {
  check("mixed ≔ (α + β) * γ - δ / ε", new RegExp("const mixed = \\(α, β, γ, δ, ε\\) => "));
});
test("Test 12: Complex nested expression", () => {
  check("pythagorean ≔ √(α² + β²)", new RegExp("const pythagorean = \\(α, β\\) => Math\\.sqrt\\(\\(\\(α \\*\\* 2\\) \\+ \\(β \\*\\* 2\\)\\)\\);"));
});
test("Test 13: Set membership", () => {
  check("member ≔ α ∈ set", new RegExp("const member = α => \\(set\\.has\\(α\\)\\);"));
});
test("Test 14: Set non-membership", () => {
  check("not_member ≔ α ∉ set", new RegExp("const not_member = α => \\(!set\\.has\\(α\\)\\);"));
});
test("Test 15: Range", () => {
  check("range_def ≔ 1‥10", new RegExp("const range_def = range\\(1, 10\\);"));
});
test("Test 16: Exclusive range", () => {
  check("exclusive ≔ 0‥<n", new RegExp("const exclusive = range\\(0, n, true\\);"));
});
test("Test 17: Variable range", () => {
  check("var_range ≔ a‥b", new RegExp("const var_range = range\\(a, b\\);"));
});
