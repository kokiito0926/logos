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
