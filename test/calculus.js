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

test('Partial derivative ∂(α² + β²)/∂α selects coordinate 0', () => {
  const result = compile('p ≔ ∂(α² + β²)/∂α');
  assert.ok(result.includes('function partial('));
  assert.equal(programBody(result), 'const p = partial((α, β) => ((α ** 2) + (β ** 2)), 0);');
});

test('Partial derivative ∂(α² + β²)/∂β selects coordinate 1', () => {
  const result = compile('p ≔ ∂(α² + β²)/∂β');
  assert.equal(programBody(result), 'const p = partial((α, β) => ((α ** 2) + (β ** 2)), 1);');
});

test('Partial derivative of a function reference ∂f/∂α', () => {
  const result = compile('p ≔ ∂f/∂α');
  assert.equal(programBody(result), 'const p = partial(f, 0);');
});

test('Gradient of a field expression ∇(α² + β²)', () => {
  const result = compile('g ≔ ∇(α² + β²)');
  assert.ok(result.includes('function gradient('));
  assert.equal(programBody(result), 'const g = gradient((α, β) => ((α ** 2) + (β ** 2)));');
});

test('Gradient of a function reference ∇f', () => {
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
