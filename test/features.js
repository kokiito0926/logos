import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LogosCompiler } from '../src/index.js';

// Compile a Logos snippet to JS.
function compile(code) {
  return new LogosCompiler().compile(code);
}

// Compile `code`, then evaluate the definition `name` and return its value.
// For a function definition this yields the function itself; for a constant
// definition it yields the constant.
function runValue(code, name, params = []) {
  const js = compile(code);
  const f = new Function(...params, js + `; return ${name};`);
  return f();
}

// ===== Test Group: 行コメント (# Comment) =====
test("C.1: インラインコメントは無視される", () => {
  assert.equal(compile('x ≔ 1 # 説明'), 'const x = 1;');
});
test("C.2: インラインコメント＋末尾改行", () => {
  assert.equal(compile('x ≔ 1 # 説明\n'), 'const x = 1;');
});
test("C.3: 定義間にコメントのみの行", () => {
  assert.equal(compile('x ≔ 1\n# コメント\nb ≔ 2'), 'const x = 1;\nconst b = 2;');
});
test("C.4: EOF直前のコメント（末尾改行なし）", () => {
  assert.equal(compile('x ≔ 1\n# done'), 'const x = 1;');
});
test("C.5: ブロック内のコメントのみの行（単一式ブロックは展開）", () => {
  assert.equal(compile('f ≔\n    # コメント\n    α + 1'), 'const f = α => (α + 1);');
});
test("C.6: ブロック内定義後のインラインコメント", () => {
  assert.equal(
    compile('f ≔\n    γ ≔ α + 1  # 途中\n    γ'),
    'const f = α => {\n    const γ = (α + 1);\n    return γ;\n};'
  );
});
test("C.7: 括弧内のコメント（括弧内の改行は無意味）", () => {
  assert.equal(compile('g ≔ (α + # コメント\n    β)'), 'const g = (α, β) => (α + β);');
});
test("C.8: コメント付き定義の実行時評価", () => {
  assert.equal(new Function(compile('x ≔ 1 # 説明') + '; return x;')(), 1);
});

// ===== Test Group: 床関数・天井関数 (Floor & Ceiling) =====
test("F.1: 床関数 ⌊α⌋ は Math.floor に変換", () => {
  assert.equal(compile('f ≔ ⌊α⌋'), 'const f = α => Math.floor(α);');
});
test("F.2: 天井関数 ⌈α⌉ は Math.ceil に変換", () => {
  assert.equal(compile('c ≔ ⌈α⌉'), 'const c = α => Math.ceil(α);');
});
test("F.3: 床関数の複合引数", () => {
  assert.equal(compile('r ≔ ⌊α + β⌋'), 'const r = (α, β) => Math.floor((α + β));');
});
test("F.4: 床関数の定数", () => {
  assert.equal(compile('r ≔ ⌊3.7⌋'), 'const r = Math.floor(3.7);');
});
test("F.5: 天井関数の定数", () => {
  assert.equal(compile('r ≔ ⌈2.1⌉'), 'const r = Math.ceil(2.1);');
});
test("F.6: 算術との混在", () => {
  assert.equal(compile('r ≔ ⌊α⌋ + ⌈β⌉'), 'const r = (α, β) => (Math.floor(α) + Math.ceil(β));');
});
test("F.7: べき乗式への床関数", () => {
  assert.equal(compile('r ≔ ⌊α²⌋'), 'const r = α => Math.floor((α ** 2));');
});
test("F.8: 床関数の実行時評価", () => {
  const f = runValue('f ≔ ⌊α⌋', 'f');
  assert.equal(typeof f, 'function');
  assert.equal(f(3.7), 3);
  assert.equal(f(-1.2), -2);
  assert.equal(f(4), 4);
});
test("F.9: 天井関数の実行時評価", () => {
  const c = runValue('c ≔ ⌈α⌉', 'c');
  assert.equal(typeof c, 'function');
  assert.equal(c(3.2), 4);
  assert.equal(c(-1.2), -1);
  assert.equal(c(4), 4);
});
test("F.10: 床関数の複合引数の実行時評価", () => {
  const r = runValue('r ≔ ⌊α + β⌋', 'r', ['α', 'β']);
  assert.equal(r(2.5, 1.2), 3);
});
test("F.11: 床・天井の混在の実行時評価", () => {
  const r = runValue('r ≔ ⌊α⌋ + ⌈β⌉', 'r', ['α', 'β']);
  // Math.floor(2.7) + Math.ceil(1.2) === 2 + 2 === 4
  assert.equal(r(2.7, 1.2), 4);
});
test("F.12: 床関数の定数の実行時評価", () => {
  assert.equal(runValue('r ≔ ⌊3.7⌋', 'r'), 3);
});

// ===== Test Group: 階乗 (Factorial !) =====
test("G.1: 定数の階乗 5! は factorial(5) に変換（プレリュード付き）", () => {
  const js = compile('r ≔ 5!');
  assert.ok(js.startsWith('// Logos factorial runtime'));
  assert.ok(js.includes('function factorial('));
  assert.ok(js.endsWith('const r = factorial(5);'));
});
test("G.2: ギリシャ変数の階乗 α! は α => factorial(α) に変換", () => {
  assert.ok(compile('f ≔ α!').endsWith('const f = α => factorial(α);'));
});
test("G.3: 括弧付き式の階乗 (α + 1)! は factorial((α + 1)) に変換", () => {
  assert.ok(compile('r ≔ (α + 1)!').endsWith('const r = α => factorial((α + 1));'));
});
test("G.4: 階乗と加算の混在 α! + 1 は (factorial(α) + 1) に変換", () => {
  assert.ok(compile('r ≔ α! + 1').endsWith('const r = α => (factorial(α) + 1);'));
});
test("G.5: 二重階乗 5!! は factorial(factorial(5)) にネスト", () => {
  assert.ok(compile('r ≔ 5!!').endsWith('const r = factorial(factorial(5));'));
});
test("G.6: 二つの階乗 5! + 2! は (factorial(5) + factorial(2)) に変換", () => {
  assert.ok(compile('x ≔ 5! + 2!').endsWith('const x = (factorial(5) + factorial(2));'));
});
test("G.7: 定数の階乗の実行時評価（5! = 120, 0! = 1, 1! = 1）", () => {
  assert.equal(runValue('r ≔ 5!', 'r'), 120);
  assert.equal(runValue('r ≔ 0!', 'r'), 1);
  assert.equal(runValue('r ≔ 1!', 'r'), 1);
});
test("G.8: 関数定義の階乗の実行時評価（f(5) = 120, f(0) = 1）", () => {
  const f = runValue('f ≔ α!', 'f');
  assert.equal(f(5), 120);
  assert.equal(f(0), 1);
});
test("G.9: 二重階乗の実行時評価（3!! = 720）", () => {
  assert.equal(runValue('r ≔ 3!!', 'r'), 720);
});
test("G.10: 混在式の実行時評価（5! + 2! = 122）", () => {
  assert.equal(runValue('x ≔ 5! + 2!', 'x'), 122);
});
test("G.11: 複合式の階乗の実行時評価（(α + 1)! で α=4 なら 120）", () => {
  const r = runValue('r ≔ (α + 1)!', 'r', ['α']);
  assert.equal(r(4), 120);
});
test("G.12: 負数の階乗は例外を投げる", () => {
  const f = runValue('f ≔ α!', 'f');
  assert.throws(() => f(-1));
});
test("G.13: 階乗を使わないときはプレリュードが付かない", () => {
  assert.ok(!compile('x ≔ 1').includes('function factorial('));
});
test("G.14: 優先順位（α²! は factorial((α ** 2))）", () => {
  assert.ok(compile('r ≔ α²!').endsWith('const r = α => factorial((α ** 2));'));
});

// ===== Test Group: 集合の内包表記 (Set Comprehension) =====
test("H.1: 恒等写像 { x | x ∈ S } は new Set([...S].map(x => x)) に変換", () => {
  assert.ok(compile('s ≔ { x | x ∈ S }').endsWith('const s = new Set([...S].map(x => x));'));
});
test("H.2: 二乗の本体 { x² | x ∈ S } は new Set([...S].map(x => (x ** 2))) に変換", () => {
  assert.ok(compile('s ≔ { x² | x ∈ S }').endsWith('const s = new Set([...S].map(x => (x ** 2)));'));
});
test("H.3: ギリシャ束縛変数＋ギリシャ集合は暗黙引数（{ α² | α ∈ β } → β => …）", () => {
  assert.ok(compile('s ≔ { α² | α ∈ β }').endsWith('const s = β => new Set([...β].map(α => (α ** 2)));'));
});
test("H.4: 外側のギリシャ変数を捕捉、束縛変数は局所（{ x + γ | x ∈ S } → γ => …）", () => {
  assert.ok(compile('s ≔ { x + γ | x ∈ S }').endsWith('const s = γ => new Set([...S].map(x => (x + γ)));'));
});
test("H.5: 算術本体 { x + 1 | x ∈ S } は new Set([...S].map(x => (x + 1))) に変換", () => {
  assert.ok(compile('s ≔ { x + 1 | x ∈ S }').endsWith('const s = new Set([...S].map(x => (x + 1)));'));
});
test("H.6: 配列入力の実行時評価（[1,2,3,4] → {1,4,9,16}）", () => {
  const js = compile('s ≔ { x² | x ∈ S }');
  const s = new Function('S', js + '; return s;')([1, 2, 3, 4]);
  assert.ok(s instanceof Set);
  assert.deepEqual([...s], [1, 4, 9, 16]);
});
test("H.7: Set入力の実行時評価（{2,3,5} → {4,9,25}）", () => {
  const js = compile('s ≔ { x² | x ∈ S }');
  const s = new Function('S', js + '; return s;')(new Set([2, 3, 5]));
  assert.ok(s instanceof Set);
  assert.deepEqual([...s].sort((a, b) => a - b), [4, 9, 25]);
});
test("H.8: 空のコレクションは空の Set を返す（サイズ0）", () => {
  const js = compile('s ≔ { x² | x ∈ S }');
  const s = new Function('S', js + '; return s;')([]);
  assert.ok(s instanceof Set);
  assert.equal(s.size, 0);
});
test("H.9: 束縛変数の影付け実行時評価（f([1,2,3]) = {1,4,9}）", () => {
  const f = runValue('f ≔ { α² | α ∈ β }', 'f');
  assert.ok(typeof f === 'function');
  const r = f([1, 2, 3]);
  assert.ok(r instanceof Set);
  assert.deepEqual([...r].sort((a, b) => a - b), [1, 4, 9]);
});
test("H.10: 空集合リテラル ∅ は影響を受けない", () => {
  assert.equal(compile('y ≔ ∅'), 'const y = new Set();');
});
test("H.11: パイプライン |> は影響を受けない", () => {
  assert.equal(compile('z ≔ x |> f'), 'const z = f(x);');
});
test("H.12: ネストした内包表記 { { y | y ∈ x } | x ∈ S }", () => {
  assert.ok(
    compile('s ≔ { { y | y ∈ x } | x ∈ S }').endsWith(
      'const s = new Set([...S].map(x => new Set([...x].map(y => y))));'
    )
  );
});
