import { LogosCompiler } from '../src/index.js';

function test(name, code, expectedPattern, shouldPass = true) {
  console.log(`\n========== ${name} ==========`);
  console.log(`Input: ${code}`);

  try {
    const compiler = new LogosCompiler();
    const result = compiler.compile(code);

    if (!shouldPass) {
      console.log(`✗ FAILED: Expected to fail but passed`);
      return;
    }

    console.log(`✓ Output: ${result}`);

    if (expectedPattern && !expectedPattern.test(result)) {
      console.log(`✗ Pattern check FAILED: ${expectedPattern}`);
    } else if (expectedPattern) {
      console.log('✓ Pattern matched');
    }
    return result;
  } catch (error) {
    if (shouldPass) {
      console.log(`✗ FAILED: ${error.message}`);
    } else {
      console.log(`✓ Expected failure: ${error.message}`);
    }
  }
}

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║       LOGOS LANGUAGE - COMPREHENSIVE TEST SUITE        ║');
console.log('╚════════════════════════════════════════════════════════╝');

console.log('\n▶ Test Group: 暗黙引数 (Implicit Arguments)');
test(
  '1.1: 単一暗黙引数',
  `square ≔ α²`,
  /const square = α => \(α \*\* 2\);/
);

test(
  '1.2: 複数暗黙引数 (2つ)',
  `add ≔ α + β`,
  /const add = \(α, β\) => \(\(α \+ β\)\)|const add = \(α, β\) => \(α \+ β\)/
);

test(
  '1.3: 複数暗黙引数 (3つ)',
  `sum3 ≔ α + β + γ`,
  /const sum3 = \(α, β, γ\) => /
);

test(
  '1.4: 複数暗黙引数 (4つ)',
  `sum4 ≔ α + β + γ + δ`,
  /const sum4 = \(α, β, γ, δ\) => /
);

console.log('\n▶ Test Group: 暗黙戻り値 (Implicit Return)');
test(
  '2.1: 常数は戻り値なし',
  `pi_value ≔ π`,
  /const pi_value = Math\.PI;/
);

test(
  '2.2: 数値リテラルは戻り値なし',
  `forty_two ≔ 42`,
  /const forty_two = 42;/
);

console.log('\n▶ Test Group: メンバーアクセス (Member Access)');
test(
  '3.1: 単一メンバーアクセス',
  `getX ≔ α.x`,
  /const getX = α => α\.x;/
);

test(
  '3.2: 複数メンバーアクセス (距離計算)',
  `distance ≔ √((α.x - β.x)² + (α.y - β.y)²)`,
  /const distance = \(α, β\) => Math\.sqrt/
);

test(
  '3.3: ネストされたメンバーアクセス',
  `getNestedX ≔ α.point.x`,
  /const getNestedX = α => α\.point\.x;/
);

console.log('\n▶ Test Group: 比較演算子 (Comparison Operators)');
test(
  '3.4: 等価比較',
  `same ≔ α = β`,
  /const same = \(α, β\) => \(α === β\);/
);
test(
  '3.5: 非等価比較',
  `different ≔ α ≠ β`,
  /const different = \(α, β\) => \(α !== β\);/
);
test(
  '3.6: 大小比較',
  `withinLimit ≔ α ≤ 10`,
  /const withinLimit = α => \(α <= 10\);/
);
test(
  '3.7: 優先順位',
  `adult ≔ α.age + 1 ≥ β * 2`,
  /const adult = \(α, β\) => \(\(α.age \+ 1\) >= \(β \* 2\)\);/
);
console.log('\n▶ Test Group: 論理演算子 (Logical Operators)');
test(
  '3.8: 否定',
  `allowed ≔ ¬α.banned`,
  /const allowed = α => \(!α\.banned\);/
);
test(
  '3.9: 論理積',
  `allowed ≔ α.active ∧ β.verified`,
  /const allowed = \(α, β\) => \(α\.active && β\.verified\);/
);
test(
  '3.10: 論理和',
  `visible ≔ α.public ∨ α.owner = β`,
  /const visible = \(α, β\) => \(α\.public \|\| \(α\.owner === β\)\);/
);
test(
  '3.11: 論理演算子の優先順位',
  `allowed ≔ ¬α.banned ∧ β.admin ∨ γ.override`,
  /const allowed = \(α, β, γ\) => \(\(\(!α\.banned\) && β\.admin\) \|\| γ\.override\);/
);
console.log('\n▶ Test Group: 数学関数 (Math Functions)');
test(
  '4.1: 平方根関数',
  `sqrt2 ≔ √(2)`,
  /const sqrt2 = Math\.sqrt\(2\);/
);

test(
  '4.2: π定数',
  `tau ≔ 2 * π`,
  /const tau = .*Math\.PI/
);
test(
  '4.3: ∞定数',
  `unbounded ≔ ∞`,
  /const unbounded = Infinity;/
);

console.log('\n▶ Test Group: べき乗表記 (Power Notation)');
test(
  '5.1: 二乗記号 (²)',
  `sq ≔ α²`,
  /const sq = α => \(α \*\* 2\);/
);

test(
  '5.2: 三乗記号 (³)',
  `cb ≔ α³`,
  /const cb = α => \(α \*\* 3\);/
);

test(
  '5.3: 複数べき乗',
  `powers ≔ α² + β³`,
  /const powers = \(α, β\) => /
);

console.log('\n▶ Test Group: 複合操作 (Complex Operations)');
test(
  '6.1: 四則演算の組み合わせ',
  `calc ≔ (α + β) * γ`,
  /const calc = \(α, β, γ\) => .*α.*\+.*β.*\*.*γ/
);

test(
  '6.2: 複雑な数式',
  `quadratic ≔ α * α + β * α + γ`,
  /const quadratic = \(α, β, γ\) => /
);

test(
  '6.3: ユークリッド距離 (Euclidean distance)',
  `euclidean ≔ √(α² + β²)`,
  /const euclidean = \(α, β\) => Math\.sqrt\(\(\(α \*\* 2\) \+ \(β \*\* 2\)\)\);/
);

console.log('\n▶ Test Group: 配列アクセス (Array Access)');
test(
  '7.1: 配列インデックスアクセス',
  `first ≔ α[0]`,
  /const first = α => α\[0\];/
);

test(
  '7.2: 変数インデックス',
  `getAt ≔ α[β]`,
  /const getAt = \(α, β\) => α\[β\];/
);

console.log('\n▶ Test Group: 新規演算子・リテラル (Star-1 Features)');
test(
  '9.1: 真偽値リテラル (⊤, ⊥)',
  `t_val ≔ ⊤`,
  /const t_val = true;/
);
test(
  '9.2: 偽リテラル (⊥)',
  `f_val ≔ ⊥`,
  /const f_val = false;/
);
test(
  '9.3: 空集合 (∅)',
  `empty_set ≔ ∅`,
  /const empty_set = new Set\(\);/
);
test(
  '9.4: 含意演算子 (⇒)',
  `implies ≔ α ⇒ β`,
  /const implies = \(α, β\) => \(!α \|\| β\);/
);
test(
  '9.5: 同値演算子 (⇔)',
  `equiv ≔ α ⇔ β`,
  /const equiv = \(α, β\) => \(α === β\);/
);
test(
  '9.6: 排他的論理和 (⊕)',
  `xor_val ≔ α ⊕ β`,
  /const xor_val = \(α, β\) => \(α !== β\);/
);
test(
  '9.7: 合同演算子 (≡)',
  `congruent ≔ α ≡ β`,
  /const congruent = \(α, β\) => \(α === β\);/
);
test(
  '9.8: 近似演算子 (≈)',
  `approx ≔ α ≈ β`,
  /const approx = \(α, β\) => almostEqual\(α, β\);/
);

console.log('\n▶ Test Group: 星2機能 (Star-2 Features)');
test(
  '10.1: 代入演算子 (←)',
  `assign_test ≔ α ← β`,
  /const assign_test = \(α, β\) => \(α = β\);/
);
test(
  '10.2: 単一引数マッピング (↦)',
  `square_explicit ≔ x ↦ x²`,
  /const square_explicit = x => \(x \*\* 2\);/
);
test(
  '10.3: 複数引数マッピング ((a,b) ↦)',
  `add_explicit ≔ (x, y) ↦ x + y`,
  /const add_explicit = \(x, y\) => \(x \+ y\);/
);
test(
  '10.4: 関数合成 (∘)',
  `composed ≔ f ∘ g`,
  /const composed = \(\(\.\.\.args\) => f\(g\(\.\.\.args\)\)\);/
);

console.log('\n▶ Test Group: 下付き・上付き文字 (Subscripts & Superscripts)');
test(
  '11.1: 下付き添字の添字アクセス (x₀, x₁)',
  `point ≔ x₀ + x₁`,
  /const point = \(x\[0\] \+ x\[1\]\);/
);
test(
  '11.2: 暗黙引数付き下付き文字 (α₁, β₂)',
  `dist_sub ≔ α₁ + β₂`,
  /const dist_sub = \(α, β\) => \(α\[1\] \+ β\[2\]\);/
);
test(
  '11.3: 負の指数 (x⁻¹)',
  `inverse ≔ α⁻¹`,
  /const inverse = α => \(α \*\* -1\);/
);
test(
  '11.4: 4乗・複数桁の指数 (α⁴, x¹⁰)',
  `poly ≔ α⁴ + β¹⁰`,
  /const poly = \(α, β\) => \(\(α \*\* 4\) \+ \(β \*\* 10\)\);/
);

console.log('\n▶ Test Group: チェーン比較 (Chain Comparison)');
test(
  '12.1: 二重比較 (0 ≤ α ≤ 10)',
  `in_range ≔ 0 ≤ α ≤ 10`,
  /const in_range = α => \(0 <= α\) && \(α <= 10\);/
);
test(
  '12.2: 異なる演算子の混在 (0 ≤ α < 10)',
  `between ≔ 0 ≤ α < 10`,
  /const between = α => \(0 <= α\) && \(α < 10\);/
);
test(
  '12.3: 三項チェーン (a = b ≠ c ≤ d)',
  `chain3 ≔ a = b ≠ c ≤ d`,
  /const chain3 = \(a === b\) && \(b !== c\) && \(c <= d\);/
);
test(
  '12.4: 等価チェーン (a = b = c)',
  `equal_chain ≔ a = b = c`,
  /const equal_chain = \(a === b\) && \(b === c\);/
);
test(
  '12.5: 定数との二重比較 (1 ≤ α ≤ 3)',
  `unit_range ≔ 1 ≤ α ≤ 3`,
  /const unit_range = α => \(1 <= α\) && \(α <= 3\);/
);

console.log('\n▶ Test Group: 集合演算 (Set Operations)');
test(
  '13.1: 共通部分 (A ∩ B)',
  `both ≔ A ∩ B`,
  /const both = new Set\(\[\.\.\.A\]\.filter\(x => B\.has\(x\)\)\);/
);
test(
  '13.2: 和集合 (A ∪ B)',
  `all ≔ A ∪ B`,
  /const all = new Set\(\[\.\.\.A, \.\.\.B\]\);/
);
test(
  '13.3: 差集合 (A ∖ B)',
  `only_a ≔ A ∖ B`,
  /const only_a = new Set\(\[\.\.\.A\]\.filter\(x => !B\.has\(x\)\)\);/
);
test(
  '13.4: 直積 (A × B)',
  `pairs ≔ A × B`,
  /const pairs = new Set\(\[\.\.\.A\]\.flatMap\(a => \[\.\.\.B\]\.map\(b => \[a, b\]\)\)\);/
);
test(
  '13.5: 部分集合 (A ⊆ B)',
  `sub ≔ A ⊆ B`,
  /const sub = \(\[\.\.\.A\]\.every\(x => B\.has\(x\)\)\);/
);
test(
  '13.6: 真部分集合 (A ⊂ B)',
  `psub ≔ A ⊂ B`,
  /const psub = \(\[\.\.\.A\]\.every\(x => B\.has\(x\)\) && A\.size < B\.size\);/
);
test(
  '13.7: 帰属と共通部分の優先順位 (α ∈ A ∩ B)',
  `has_all ≔ α ∈ A ∩ B`,
  /const has_all = α => \(new Set\(\[\.\.\.A\]\.filter\(x => B\.has\(x\)\)\)\.has\(α\)\);/
);
test(
  '13.8: 積より和が低い優先順位 (A ∪ B ∩ C)',
  `prec ≔ A ∪ B ∩ C`,
  /const prec = new Set\(\[\.\.\.A, \.\.\.new Set\(\[\.\.\.B\]\.filter\(x => C\.has\(x\)\)\)\]\);/
);
test(
  '13.9: 部分集合のチェーン (A ⊆ B ⊆ C)',
  `chain_sub ≔ A ⊆ B ⊆ C`,
  /const chain_sub = \(\[\.\.\.A\]\.every\(x => B\.has\(x\)\)\) && \(\[\.\.\.B\]\.every\(x => C\.has\(x\)\)\);/
);

console.log('\n▶ Test Group: パイプライン演算子 (Pipeline Operator)');
test(
  '14.1: 関数参照へのパイプ (x |> f)',
  `result ≔ x |> f`,
  /const result = f\(x\);/
);
test(
  '14.2: 複数引数関数へのパイプ (x |> f(a, b))',
  `result ≔ x |> f(a, b)`,
  /const result = f\(x, a, b\);/
);
test(
  '14.3: 連鎖パイプライン (README例)',
  `result ≔ numbers |> filter(isPrime) |> map(square) |> sum`,
  /const result = sum\(map\(filter\(numbers, isPrime\), square\)\);/
);
test(
  '14.4: 引数なし関数呼び出し (x |> f())',
  `result ≔ x |> f()`,
  /const result = f\(x\);/
);
test(
  '14.5: 算術より緩い優先順位 (x + 1 |> f)',
  `result ≔ x + 1 |> f`,
  /const result = f\(\(x \+ 1\)\);/
);
test(
  '14.6: アロー関数を右辺に (x |> (y ↦ y * 2))',
  `result ≔ x |> (y ↦ y * 2)`,
  /const result = \(y => \(y \* 2\)\)\(x\);/
);
test(
  '14.7: メソッド呼び出しへのパイプ (x |> obj.method(y))',
  `result ≔ x |> obj.method(y)`,
  /const result = obj\.method\(x, y\);/
);
test(
  '14.8: 右辺が関数でない場合はエラー',
  `result ≔ x |> a + b`,
  null,
  false
);
test(
  '14.9: 左結合の連鎖 (x |> f |> g)',
  `result ≔ x |> f |> g`,
  /const result = g\(f\(x\)\);/
);
test(
  '14.10: 合成関数へのパイプ (x |> f ∘ g)',
  `result ≔ x |> f ∘ g`,
  /const result = \(\(\(\.\.\.args\) => f\(g\(\.\.\.args\)\)\)\)\(x\);/
);

console.log('\n▶ Test Group: 量化 (Quantifiers)');
test(
  '15.1: 全称量化 (∀ → every)',
  `all_adult ≔ ∀ α ∈ users : α.age ≥ 18`,
  /const all_adult = users\.every\(α => \(α\.age >= 18\)\);/
);
test(
  '15.2: 存在量化 (∃ → some)',
  `has_adult ≔ ∃ α ∈ users : α.age ≥ 18`,
  /const has_adult = users\.some\(α => \(α\.age >= 18\)\);/
);
test(
  '15.3: 非存在量化 (∄ → !some)',
  `no_minor ≔ ∄ α ∈ users : α.age < 18`,
  /const no_minor = !users\.some\(α => \(α\.age < 18\)\);/
);
test(
  '15.4: 複数行の本体 (改行後も続く)',
  `all_positive ≔ ∀ α ∈ nums :
    α > 0`,
  /const all_positive = nums\.every\(α => \(α > 0\)\);/
);
test(
  '15.5: 束縛変数は暗黙引数に含めない',
  `mixed ≔ ∀ α ∈ users : α.age ≥ β`,
  /const mixed = β => users\.every\(α => \(α\.age >= β\)\);/
);
test(
  '15.6: 集合演算の優先順位 (A ∩ B)',
  `prec ≔ ∀ α ∈ A ∩ B : α > 0`,
  /const prec = new Set\(\[\.\.\.A\]\.filter\(x => B\.has\(x\)\)\)\.every\(α => \(α > 0\)\);/
);

console.log('\n▶ Test Group: エラーケース (Error Cases)');
test(
  '8.1: 不正な文字 (should fail)',
  `invalid ≔ @`,
  null,
  false
);

console.log('\n╔════════════════════════════════════════════════════════╗');
console.log('║                   TEST COMPLETED                       ║');
console.log('╚════════════════════════════════════════════════════════╝');


