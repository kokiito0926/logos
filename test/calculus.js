import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LogosCompiler } from '../src/index.js';

function compile(code) {
  return new LogosCompiler().compile(code);
}

// Strip the injected prelude, returning only the program's own statements.
function programBody(js) {
  const lines = js.split('\n');
  const idx = lines.findIndex((l) => l.startsWith('const ') || l.startsWith('function '));
  // findIndex may hit a prelude function line; search for the const lines instead.
  const start = lines.findIndex((l) => l.startsWith('const '));
  return lines.slice(start).join('\n');
}

test('Definite integral ∫₀¹ α² dα compiles to simpson(0, 1, α => α²)', () => {
  const result = compile('r ≔ ∫₀¹ α² dα');
  assert.ok(result.includes('function simpson('));
  assert.equal(programBody(result), 'const r = simpson(0, 1, α => (α ** 2));');
});

test('Definite integral with spaced differential d α compiles the same', () => {
  const result = compile('r ≔ ∫₀¹ α² d α');
  assert.equal(programBody(result), 'const r = simpson(0, 1, α => (α ** 2));');
});

test('Definite integral of a Latin variable ∫₀¹ x dx', () => {
  const result = compile('r ≔ ∫₀¹ x dx');
  assert.equal(programBody(result), 'const r = simpson(0, 1, x => x);');
});

test('Definite integral over a function reference ∫₀¹ f dα', () => {
  const result = compile('f ≔ α ↦ α²\nr ≔ ∫₀¹ f dα');
  const body = programBody(result).split('\n');
  assert.equal(body[0], 'const f = α => (α ** 2);');
  assert.equal(body[1], 'const r = simpson(0, 1, f);');
});

test('Indefinite integral ∫ f(α) dα compiles to integrate(α => f(α))', () => {
  const result = compile('F ≔ ∫ f(α) dα');
  assert.equal(programBody(result), 'const F = integrate(α => f(α));');
});

test('Partial derivative ∂(α² + β²)/∂α is exact (symbolic)', () => {
  const result = compile('p ≔ ∂(α² + β²)/∂α');
  assert.ok(!result.includes('function partial('));
  assert.equal(programBody(result), 'const p = (α, β) => (2 * α);');
});

test('Partial derivative ∂(α² + β²)/∂β is exact (symbolic)', () => {
  const result = compile('p ≔ ∂(α² + β²)/∂β');
  assert.equal(programBody(result), 'const p = (α, β) => (2 * β);');
});

test('Partial derivative of a function reference ∂f/∂α uses numeric partial', () => {
  const result = compile('p ≔ ∂f/∂α');
  assert.equal(programBody(result), 'const p = partial(f, 0);');
});

test('Gradient of a field expression ∇(α² + β²) is exact (symbolic)', () => {
  const result = compile('g ≔ ∇(α² + β²)');
  assert.ok(!result.includes('function gradient('));
  assert.equal(programBody(result), 'const g = (α, β) => [(2 * α), (2 * β)];');
});

test('Gradient of a function reference ∇f uses numeric gradient', () => {
  const result = compile('g ≔ ∇f');
  assert.equal(programBody(result), 'const g = gradient(f);');
});

test('Prelude is injected only when a calculus symbol is used', () => {
  const withInt = compile('r ≔ ∫₀¹ α² dα');
  assert.ok(withInt.includes('function simpson('));
  const plain = compile('r ≔ α + 1');
  assert.ok(!plain.includes('function simpson('));
  assert.ok(!plain.includes('function partial('));
  assert.ok(!plain.includes('function gradient('));
});

test('∮ throws: contour integral needs a complex-number runtime', () => {
  assert.throws(() => compile('r ≔ ∮ f dz'), /∮/);
});

test('Integral with only one bound throws', () => {
  assert.throws(() => compile('r ≔ ∫₀ α² dα'), /both a lower and an upper bound/);
  assert.throws(() => compile('r ≔ ∫¹ α² dα'), /both a lower and an upper bound/);
});

test('Integral without a differential throws', () => {
  assert.throws(() => compile('r ≔ ∫₀¹ α²'), /differential/);
});

// ---- Numeric execution of the generated code ----

function run(code, names) {
  const js = compile(code);
  const f = new Function(js + `; return { ${names.join(', ')} };`);
  return f();
}

test('∫₀¹ α² dα ≈ 1/3', () => {
  const { r } = run('r ≔ ∫₀¹ α² dα', ['r']);
  assert.ok(Math.abs(r - 1 / 3) < 1e-9, `got ${r}`);
});

test('∫₀¹ α³ dα ≈ 1/4', () => {
  const { r } = run('r ≔ ∫₀¹ α³ dα', ['r']);
  assert.ok(Math.abs(r - 0.25) < 1e-9, `got ${r}`);
});

test('Indefinite integral F(lo, hi) is callable', () => {
  const { F } = run('F ≔ ∫ α² dα', ['F']);
  assert.ok(Math.abs(F(0, 1) - 1 / 3) < 1e-9, `got ${F(0, 1)}`);
});

test('∂(α² + β²)/∂α at (2, 3) ≈ 4', () => {
  const { p } = run('p ≔ ∂(α² + β²)/∂α', ['p']);
  assert.ok(Math.abs(p(2, 3) - 4) < 1e-5, `got ${p(2, 3)}`);
});

test('∂(α² + β²)/∂β at (2, 3) ≈ 6', () => {
  const { p } = run('p ≔ ∂(α² + β²)/∂β', ['p']);
  assert.ok(Math.abs(p(2, 3) - 6) < 1e-5, `got ${p(2, 3)}`);
});

test('∇(α² + β²) at (2, 3) ≈ [4, 6]', () => {
  const { g } = run('g ≔ ∇(α² + β²)', ['g']);
  const [a, b] = g(2, 3);
  assert.ok(Math.abs(a - 4) < 1e-5 && Math.abs(b - 6) < 1e-5, `got [${a}, ${b}]`);
});

test('Partial derivative of a function reference', () => {
  const { p } = run('f ≔ (α, β) ↦ α * β\np ≔ ∂f/∂α', ['p']);
  // ∂(αβ)/∂α = β, evaluated at (5, 7) → 7
  assert.ok(Math.abs(p(5, 7) - 7) < 1e-5, `got ${p(5, 7)}`);
});

test('Integral inside a block uses the block local γ', () => {
  const js = compile('g ≔\n    γ ≔ 2\n    ∫₀¹ γ * α dα');
  const f = new Function(js + '; return g;');
  // ∫₀¹ 2α dα = 1
  assert.ok(Math.abs(f()() - 1) < 1e-9, `got ${f()()}`);
});

// ---- Symbolic differentiation (exact, no numerical prelude) ----

test('∂(α * β)/∂α uses the product rule', () => {
  const result = compile('p ≔ ∂(α * β)/∂α');
  assert.equal(programBody(result), 'const p = (α, β) => β;');
});

test('∂(1 / α)/∂α uses the quotient rule', () => {
  const result = compile('p ≔ ∂(1 / α)/∂α');
  assert.equal(programBody(result), 'const p = α => (-1 / (α ** 2));');
});

test('∂(√α)/∂α differentiates sqrt', () => {
  const result = compile('p ≔ ∂(√α)/∂α');
  assert.equal(programBody(result), 'const p = α => (1 / (2 * Math.sqrt(α)));');
});

test('∂α/∂α = 1', () => {
  const result = compile('p ≔ ∂α/∂α');
  assert.equal(programBody(result), 'const p = α => 1;');
});

test('Product rule is numerically exact', () => {
  const { p } = run('p ≔ ∂(α * β)/∂α', ['p']);
  assert.equal(p(5, 7), 7);
});

test('Quotient rule is numerically exact', () => {
  const { p } = run('p ≔ ∂(1 / α)/∂α', ['p']);
  assert.ok(Math.abs(p(2) - (-0.25)) < 1e-12, `got ${p(2)}`);
});

test('Sqrt derivative is numerically exact', () => {
  const { p } = run('p ≔ ∂(√α)/∂α', ['p']);
  assert.ok(Math.abs(p(4) - 0.25) < 1e-12, `got ${p(4)}`);
});

test('∂(α² + β²)/∂α is exact at (2, 3) = 4', () => {
  const { p } = run('p ≔ ∂(α² + β²)/∂α', ['p']);
  assert.equal(p(2, 3), 4);
});

test('Symbolic derivative emits no numerical prelude', () => {
  const result = compile('p ≔ ∂(α²)/∂α');
  assert.ok(!result.includes('function partial('));
  assert.ok(!result.includes('function gradient('));
  assert.ok(!result.includes('function simpson('));
});

// ---- Prime notation (′) ----

test('f′ compiles to partial(f, 0)', () => {
  const result = compile('p ≔ f′');
  assert.equal(programBody(result), 'const p = partial(f, 0);');
});

test('f″ compiles to nested partial (second derivative)', () => {
  const result = compile('p ≔ f″');
  assert.equal(programBody(result), 'const p = partial(partial(f, 0), 0);');
});

test('(α ↦ α²)′ differentiates the arrow body', () => {
  const result = compile('p ≔ (α ↦ α²)′');
  assert.equal(programBody(result), 'const p = α => (2 * α);');
});

test('(α²)′ differentiates w.r.t. the first Greek variable', () => {
  const result = compile('p ≔ (α²)′');
  assert.equal(programBody(result), 'const p = α => (2 * α);');
});

test('(α² + β²)′ differentiates w.r.t. α (first Greek variable)', () => {
  const result = compile('p ≔ (α² + β²)′');
  assert.equal(programBody(result), 'const p = (α, β) => (2 * α);');
});

test('(α²)″ is the exact second derivative', () => {
  const result = compile('p ≔ (α²)″');
  assert.equal(programBody(result), 'const p = α => 2;');
});

test('(α³)″ is numerically exact at 2', () => {
  const { p } = run('p ≔ (α³)″', ['p']);
  assert.equal(p(2), 12);
});

test('f′ of a defined function is numerically correct', () => {
  const { p } = run('f ≔ (α, β) ↦ α * β\np ≔ f′', ['p']);
  assert.ok(Math.abs(p(5, 7) - 7) < 1e-5, `got ${p(5, 7)}`);
});

test('f″ of a defined cubic is numerically correct', () => {
  const { p } = run('f ≔ α ↦ α³\np ≔ f″', ['p']);
  assert.ok(Math.abs(p(2) - 12) < 1e-2, `got ${p(2)}`);
});

test('Prime on an expression without Greek variables throws', () => {
  assert.throws(() => compile('p ≔ (2 + 3)′'), /Greek variable/);
});
