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

test('∮ over a function reference passes the function directly to contour', () => {
  const result = compile('r ≔ ∮ f dz');
  assert.ok(result.includes('const r = contour(f);'));
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

// ---- Elementary function differentiation (chain rule) ----

test('∂sin(α)/∂α emits Math.cos(α)', () => {
  const result = compile('p ≔ ∂sin(α)/∂α');
  assert.equal(programBody(result), 'const p = α => Math.cos(α);');
});

test('∂cos(α)/∂α emits (-Math.sin(α))', () => {
  const result = compile('p ≔ ∂cos(α)/∂α');
  assert.equal(programBody(result), 'const p = α => (-Math.sin(α));');
});

test('∂exp(α)/∂α emits Math.exp(α)', () => {
  const result = compile('p ≔ ∂exp(α)/∂α');
  assert.equal(programBody(result), 'const p = α => Math.exp(α);');
});

test('∂ln(α)/∂α emits (1 / α)', () => {
  const result = compile('p ≔ ∂ln(α)/∂α');
  assert.equal(programBody(result), 'const p = α => (1 / α);');
});

test('Chain rule: ∂(sin(α)²)/∂α', () => {
  const result = compile('p ≔ ∂(sin(α)²)/∂α');
  assert.equal(programBody(result), 'const p = α => ((2 * Math.sin(α)) * Math.cos(α));');
});

// ---- General power rule (variable exponent) ----

test('∂(α^α)/∂α uses the general power rule', () => {
  const result = compile('p ≔ ∂(α^α)/∂α');
  assert.equal(programBody(result), 'const p = α => ((α ** α) * (Math.log(α) + 1));');
});

test('∂(2^α)/∂α: variable exponent with constant base', () => {
  const result = compile('p ≔ ∂(2^α)/∂α');
  assert.equal(programBody(result), 'const p = α => ((2 ** α) * Math.log(2));');
});

test('∂(α^β)/∂α: exponent constant w.r.t. α keeps the classic rule', () => {
  const result = compile('p ≔ ∂(α^β)/∂α');
  assert.equal(programBody(result), 'const p = (α, β) => (β * (α ** (β - 1)));');
});

// ---- Numeric execution of elementary/general-power derivatives ----

test('∂sin(α)/∂α at 0 ≈ 1', () => {
  const { p } = run('p ≔ ∂sin(α)/∂α', ['p']);
  assert.ok(Math.abs(p(0) - 1) < 1e-6, `got ${p(0)}`);
});

test('∂cos(α)/∂α at 0 ≈ 0', () => {
  const { p } = run('p ≔ ∂cos(α)/∂α', ['p']);
  assert.ok(Math.abs(p(0)) < 1e-6, `got ${p(0)}`);
});

test('∂exp(α)/∂α at 0 ≈ 1', () => {
  const { p } = run('p ≔ ∂exp(α)/∂α', ['p']);
  assert.ok(Math.abs(p(0) - 1) < 1e-6, `got ${p(0)}`);
});

test('∂ln(α)/∂α at 1 ≈ 1', () => {
  const { p } = run('p ≔ ∂ln(α)/∂α', ['p']);
  assert.ok(Math.abs(p(1) - 1) < 1e-6, `got ${p(1)}`);
});

test('∂(α^α)/∂α at 2 ≈ 2²·(ln 2 + 1)', () => {
  const { p } = run('p ≔ ∂(α^α)/∂α', ['p']);
  assert.ok(Math.abs(p(2) - 4 * (Math.log(2) + 1)) < 1e-6, `got ${p(2)}`);
});

test('∂(2^α)/∂α at 3 ≈ 2³·ln 2', () => {
  const { p } = run('p ≔ ∂(2^α)/∂α', ['p']);
  assert.ok(Math.abs(p(3) - 8 * Math.log(2)) < 1e-6, `got ${p(3)}`);
});

test('f′ of α ↦ sin(α) at 0 ≈ 1', () => {
  const { p } = run('f ≔ α ↦ sin(α)\np ≔ f′', ['p']);
  assert.ok(Math.abs(p(0) - 1) < 1e-2, `got ${p(0)}`);
});

test('(sin(α))″ at 0 ≈ 0', () => {
  const { p } = run('p ≔ (sin(α))″', ['p']);
  assert.ok(Math.abs(p(0)) < 2e-2, `got ${p(0)}`);
});

test('∂cos(α)/∂α evaluates (-Math.sin(α)): at π/2 ≈ -1', () => {
  const { p } = run('p ≔ ∂cos(α)/∂α', ['p']);
  assert.ok(Math.abs(p(Math.PI / 2) - (-1)) < 1e-6, `got ${p(Math.PI / 2)}`);
});

// ===== Contour integral ∮ (complex mode) =====
// Execute the generated code with `new Function` and return the defined
// bindings. `params` lets free Latin variables be injected as function
// parameters (e.g. `age` in `adult ≔ ⟦age ≥ 18⟧`).
function runWith(code, names, params = []) {
  const js = compile(code);
  const f = new Function(...params, js + `; return { ${names.join(', ')} };`);
  return f;
}

test('∮ (1/α) dα compiles to a complex-mode contour arrow', () => {
  const result = compile('r ≔ ∮ (1/α) dα');
  assert.match(result, /contour\(α =>\s*\(?cdiv\(1, α\)\)?/);
});

test('∮ (α^2) dα compiles to cpow(α, 2)', () => {
  const result = compile('r ≔ ∮ (α^2) dα');
  assert.ok(result.includes('cpow(α, 2)'));
});

test('∮ α² dα (superscript) compiles to cpow(α, 2)', () => {
  const result = compile('r ≔ ∮ α² dα');
  assert.ok(result.includes('cpow(α, 2)'));
});

test('∮ (1/(α - 2)) dα compiles to csub(α, 2) inside cdiv', () => {
  const result = compile('r ≔ ∮ (1/(α - 2)) dα');
  assert.match(result, /contour\(α =>\s*\(?cdiv\(1, \(?csub\(α, 2\)\)?\)?\)?/);
});

test('∮ (exp(α)/α) dα compiles to cdiv(cexp(α), α)', () => {
  const result = compile('r ≔ ∮ (exp(α)/α) dα');
  assert.ok(result.includes('cdiv(cexp(α), α)'));
});

test('∮ (√α/α) dα maps √ to csqrt inside the integrand', () => {
  const result = compile('r ≔ ∮ (√α/α) dα');
  assert.ok(result.includes('csqrt(α)'));
});

test('∮ α⁻¹ dα (superscript inverse) compiles to cpow(α, -1)', () => {
  const result = compile('r ≔ ∮ α⁻¹ dα');
  assert.ok(result.includes('cpow(α, -1)'));
});

test('complex mode does not leak into plain arithmetic outside ∮', () => {
  const result = compile('r ≔ ∮ (1/α) dα\ns ≔ 1 + 2');
  assert.ok(result.includes('const s = (1 + 2);'));
  assert.ok(!result.includes('cadd(1, 2)'));
});

test('free Greek letter β becomes an implicit argument of ∮', () => {
  const result = compile('r ≔ ∮ (1/(α - β)) dα');
  assert.match(result, /const r = β =>/);
  assert.ok(result.includes('csub(α, β)'));
});

// ---- Runtime: Cauchy's residue theorem around the unit circle ----
// ∮ returns a complex object { re, im }. Cauchy's residue theorem gives
// ∮ f(z) dz = 2πi · Res(f, 0) when all poles of f lie inside the unit circle.

test('∮ (1/α) dα = 2πi (residue of 1/z at z=0 is 1)', () => {
  const { r } = runWith('r ≔ ∮ (1/α) dα', ['r'])();
  assert.ok(Math.abs(r.im - 2 * Math.PI) < 1e-6, `got ${JSON.stringify(r)}`);
  assert.ok(Math.abs(r.re) < 1e-9, `got ${JSON.stringify(r)}`);
});

test('∮ (α^2) dα = 0 (analytic, no poles)', () => {
  const { r } = runWith('r ≔ ∮ (α^2) dα', ['r'])();
  assert.ok(Math.abs(r.re) < 1e-9, `got ${JSON.stringify(r)}`);
  assert.ok(Math.abs(r.im) < 1e-6, `got ${JSON.stringify(r)}`);
});

test('∮ (1/(α - 0.5)) dα = 2πi (pole at 0.5 is inside the unit circle)', () => {
  const { r } = runWith('r ≔ ∮ (1/(α - 0.5)) dα', ['r'])();
  assert.ok(Math.abs(r.im - 2 * Math.PI) < 1e-6, `got ${JSON.stringify(r)}`);
  assert.ok(Math.abs(r.re) < 1e-9, `got ${JSON.stringify(r)}`);
});

test('∮ (1/(α - 2)) dα = 0 (pole at 2 is outside the unit circle)', () => {
  const { r } = runWith('r ≔ ∮ (1/(α - 2)) dα', ['r'])();
  assert.ok(Math.abs(r.re) < 1e-9, `got ${JSON.stringify(r)}`);
  assert.ok(Math.abs(r.im) < 1e-6, `got ${JSON.stringify(r)}`);
});

test('∮ (exp(α)/α) dα = 2πi (Cauchy formula, residue e^0 = 1)', () => {
  const { r } = runWith('r ≔ ∮ (exp(α)/α) dα', ['r'])();
  assert.ok(Math.abs(r.im - 2 * Math.PI) < 1e-6, `got ${JSON.stringify(r)}`);
  assert.ok(Math.abs(r.re) < 1e-9, `got ${JSON.stringify(r)}`);
});

test('∮ α⁻¹ dα = 2πi (superscript inverse)', () => {
  const { r } = runWith('r ≔ ∮ α⁻¹ dα', ['r'])();
  assert.ok(Math.abs(r.im - 2 * Math.PI) < 1e-6, `got ${JSON.stringify(r)}`);
  assert.ok(Math.abs(r.re) < 1e-9, `got ${JSON.stringify(r)}`);
});

test('cre/cim helpers extract the real and imaginary parts', () => {
  const { a, b } = runWith('r ≔ ∮ (1/α) dα\na ≔ cre(r)\nb ≔ cim(r)', ['a', 'b'])();
  assert.ok(Math.abs(a) < 1e-9, `got a=${a}`);
  assert.ok(Math.abs(b - 2 * Math.PI) < 1e-6, `got b=${b}`);
});

test('implicit β: ∮ (1/(α - β)) dα is a function of β; the pole location decides the value', () => {
  const { r } = runWith('r ≔ ∮ (1/(α - β)) dα', ['r'])();
  assert.equal(typeof r, 'function');
  const inside = r(0.5); // pole at 0.5 → inside the unit circle → 2πi
  assert.ok(Math.abs(inside.im - 2 * Math.PI) < 1e-6, `got ${JSON.stringify(inside)}`);
  assert.ok(Math.abs(inside.re) < 1e-9, `got ${JSON.stringify(inside)}`);
  const outside = r(2); // pole at 2 → outside the unit circle → 0
  assert.ok(Math.abs(outside.re) < 1e-9, `got ${JSON.stringify(outside)}`);
  assert.ok(Math.abs(outside.im) < 1e-6, `got ${JSON.stringify(outside)}`);
});

// ---- Parse error ----

test('∮ without a differential throws', () => {
  assert.throws(() => compile('r ≔ ∮ α²'), /differential/);
});

