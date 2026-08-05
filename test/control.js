import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LogosCompiler } from '../src/index.js';

function compile(code) {
  return new LogosCompiler().compile(code);
}

// Execute the generated code with `new Function` and return the defined
// bindings. `params` lets free Latin variables be injected as function
// parameters (e.g. `age` in `adult ≔ ⟦age ≥ 18⟧`).
function run(code, names, params = []) {
  const js = compile(code);
  const f = new Function(...params, js + `; return { ${names.join(', ')} };`);
  return f;
}

// ---- Iverson brackets ⟦P⟧ ----

test('Iverson bracket with a Latin variable (no implicit args)', () => {
  const result = compile('adult ≔ ⟦age ≥ 18⟧');
  assert.equal(result, 'const adult = ((age >= 18) ? 1 : 0);');
});

test('Iverson bracket with a Greek variable becomes an implicit arg', () => {
  const result = compile('g ≔ ⟦α ≥ 18⟧');
  assert.equal(result, 'const g = α => ((α >= 18) ? 1 : 0);');
});

test('Iverson bracket inside arithmetic', () => {
  const result = compile('points ≔ 10 * ⟦α ≥ 18⟧');
  assert.equal(result, 'const points = α => (10 * ((α >= 18) ? 1 : 0));');
});

// ---- Minimalization μ α (P(α)) ----

test('μ minimalization as a constant', () => {
  const result = compile('n ≔ μ α (α² ≥ 100)');
  assert.equal(
    result,
    'const n = (() => { let α = 0; while (!(((α ** 2) >= 100))) α++; return α; })();'
  );
});

test('μ minimalization with an implicit argument (β)', () => {
  const result = compile('first_ge ≔ μ α (α² ≥ β)');
  assert.equal(
    result,
    'const first_ge = β => (() => { let α = 0; while (!(((α ** 2) >= β))) α++; return α; })();'
  );
});

test('μ minimalization with a complex body expression', () => {
  const result = compile('m ≔ μ α (α² + 3*α > 40)');
  assert.equal(
    result,
    'const m = (() => { let α = 0; while (!((((α ** 2) + (3 * α)) > 40))) α++; return α; })();'
  );
});

test('μ minimalization inside a block', () => {
  const result = compile(
    'g ≔\n' +
    '    γ ≔ μ α (α² ≥ δ)\n' +
    '    γ'
  );
  assert.equal(
    result,
    'const g = δ => {\n' +
    '    const γ = (() => { let α = 0; while (!(((α ** 2) >= δ))) α++; return α; })();\n' +
    '    return γ;\n' +
    '};'
  );
});

// ---- if/else via ⇒ / ⊤ (case chains) ----

test('abs: 2-branch case chain compiles to a nested ternary', () => {
  const result = compile(
    'abs ≔\n' +
    '    α ≥ 0 ⇒ α\n' +
    '    ⊤     ⇒ −α'
  );
  assert.equal(
    result,
    'const abs = α => {\n' +
    '    return ((α >= 0) ? α : (-α));\n' +
    '};'
  );
});

test('clamp: 3-branch case chain compiles to a nested ternary', () => {
  const result = compile(
    'clamp ≔\n' +
    '    α < 0 ⇒ 0\n' +
    '    α > 10 ⇒ 10\n' +
    '    ⊤ ⇒ α'
  );
  assert.equal(
    result,
    'const clamp = α => {\n' +
    '    return ((α < 0) ? 0 : ((α > 10) ? 10 : α));\n' +
    '};'
  );
});

test('case chain preceded by a side-effect statement', () => {
  const result = compile(
    'f ≔\n' +
    '    print(α)\n' +
    '    α ≥ 0 ⇒ α\n' +
    '    ⊤     ⇒ −α'
  );
  assert.equal(
    result,
    'const f = α => {\n' +
    '    print(α);\n' +
    '    return ((α >= 0) ? α : (-α));\n' +
    '};'
  );
});

test('case chain with an inner definition inside the block', () => {
  const result = compile(
    'f ≔\n' +
    '    γ ≔ α + 1\n' +
    '    γ > 5 ⇒ γ\n' +
    '    ⊤ ⇒ α'
  );
  assert.equal(
    result,
    'const f = α => {\n' +
    '    const γ = (α + 1);\n' +
    '    return ((γ > 5) ? γ : α);\n' +
    '};'
  );
});

test('bare ⊤ ⇒ A simplifies to just A', () => {
  const result = compile('f ≔ ⊤ ⇒ α');
  assert.equal(result, 'const f = α => α;');
});

test('single logical implication α ⇒ β is preserved (regression guard)', () => {
  const result = compile('f ≔ α ⇒ β');
  assert.equal(result, 'const f = (α, β) => (!α || β);');
});

// ---- Unary / binary minus ----

test('U+2212 unary minus', () => {
  const result = compile('neg ≔ −α');
  assert.equal(result, 'const neg = α => (-α);');
});

test('ASCII unary minus', () => {
  const result = compile('neg2 ≔ -α');
  assert.equal(result, 'const neg2 = α => (-α);');
});

test('U+2212 binary minus', () => {
  const result = compile('d ≔ α − β');
  assert.equal(result, 'const d = (α, β) => (α - β);');
});

test('ASCII binary minus still works', () => {
  const result = compile('d2 ≔ α - β');
  assert.equal(result, 'const d2 = (α, β) => (α - β);');
});

// ---- Runtime behavior of the generated code ----

test('abs returns the absolute value', () => {
  const { abs } = run(
    'abs ≔\n' +
    '    α ≥ 0 ⇒ α\n' +
    '    ⊤     ⇒ −α',
    ['abs']
  )();
  assert.equal(abs(-5), 5);
  assert.equal(abs(3), 3);
  assert.equal(abs(0), 0);
});

test('adult Iverson bracket evaluates to 0/1', () => {
  const adult = run('adult ≔ ⟦age ≥ 18⟧', ['adult'], ['age']);
  assert.equal(adult(17).adult, 0);
  assert.equal(adult(18).adult, 1);
  assert.equal(adult(21).adult, 1);
});

test('Iverson bracket inside arithmetic evaluates at runtime', () => {
  const { points } = run('points ≔ 10 * ⟦α ≥ 18⟧', ['points'])();
  assert.equal(points(17), 0);
  assert.equal(points(18), 10);
});

test('μ minimalization finds the smallest α with P(α)', () => {
  const { n } = run('n ≔ μ α (α² ≥ 100)', ['n'])();
  assert.equal(n, 10);
});

test('μ minimalization with implicit argument β', () => {
  const { first_ge } = run('first_ge ≔ μ α (α² ≥ β)', ['first_ge'])();
  assert.equal(first_ge(50), 8);
  assert.equal(first_ge(100), 10);
});

test('μ minimalization with a complex body', () => {
  const { m } = run('m ≔ μ α (α² + 3*α > 40)', ['m'])();
  // α² + 3α > 40 → α = 6 (36 + 18 = 54 > 40), α = 5 (25 + 15 = 40, not >)
  assert.equal(m, 6);
});

test('clamp clamps into [0, 10]', () => {
  const { clamp } = run(
    'clamp ≔\n' +
    '    α < 0 ⇒ 0\n' +
    '    α > 10 ⇒ 10\n' +
    '    ⊤ ⇒ α',
    ['clamp']
  )();
  assert.equal(clamp(-5), 0);
  assert.equal(clamp(5), 5);
  assert.equal(clamp(20), 10);
});

test('logical implication behaves like (!P || A)', () => {
  const { f } = run('f ≔ α ⇒ β', ['f'])();
  assert.equal(f(true, true), true);
  assert.equal(f(true, false), false);
  assert.equal(f(false, true), true);
});

test('unary minus negates at runtime', () => {
  const { neg } = run('neg ≔ −α', ['neg'])();
  assert.equal(neg(3), -3);
});
