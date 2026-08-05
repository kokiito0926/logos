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

// ---- Codegen: contour integral ∮ f dα around the unit circle ----
// The contour integral binds the integration variable α inside a generated
// arrow and rewrites arithmetic to complex-number helpers (cdiv, cpow, ...).
// Assertions use key substrings so they tolerate the wrapping parens of the
// arrow body (e.g. `contour(α => cdiv(1, α))` vs `contour(α => (cdiv(1, α)))`).

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
  const { r } = run('r ≔ ∮ (1/α) dα', ['r'])();
  assert.ok(Math.abs(r.im - 2 * Math.PI) < 1e-6, `got ${JSON.stringify(r)}`);
  assert.ok(Math.abs(r.re) < 1e-9, `got ${JSON.stringify(r)}`);
});

test('∮ (α^2) dα = 0 (analytic, no poles)', () => {
  const { r } = run('r ≔ ∮ (α^2) dα', ['r'])();
  assert.ok(Math.abs(r.re) < 1e-9, `got ${JSON.stringify(r)}`);
  assert.ok(Math.abs(r.im) < 1e-6, `got ${JSON.stringify(r)}`);
});

test('∮ (1/(α - 0.5)) dα = 2πi (pole at 0.5 is inside the unit circle)', () => {
  const { r } = run('r ≔ ∮ (1/(α - 0.5)) dα', ['r'])();
  assert.ok(Math.abs(r.im - 2 * Math.PI) < 1e-6, `got ${JSON.stringify(r)}`);
  assert.ok(Math.abs(r.re) < 1e-9, `got ${JSON.stringify(r)}`);
});

test('∮ (1/(α - 2)) dα = 0 (pole at 2 is outside the unit circle)', () => {
  const { r } = run('r ≔ ∮ (1/(α - 2)) dα', ['r'])();
  assert.ok(Math.abs(r.re) < 1e-9, `got ${JSON.stringify(r)}`);
  assert.ok(Math.abs(r.im) < 1e-6, `got ${JSON.stringify(r)}`);
});

test('∮ (exp(α)/α) dα = 2πi (Cauchy formula, residue e^0 = 1)', () => {
  const { r } = run('r ≔ ∮ (exp(α)/α) dα', ['r'])();
  assert.ok(Math.abs(r.im - 2 * Math.PI) < 1e-6, `got ${JSON.stringify(r)}`);
  assert.ok(Math.abs(r.re) < 1e-9, `got ${JSON.stringify(r)}`);
});

test('∮ α⁻¹ dα = 2πi (superscript inverse)', () => {
  const { r } = run('r ≔ ∮ α⁻¹ dα', ['r'])();
  assert.ok(Math.abs(r.im - 2 * Math.PI) < 1e-6, `got ${JSON.stringify(r)}`);
  assert.ok(Math.abs(r.re) < 1e-9, `got ${JSON.stringify(r)}`);
});

test('cre/cim helpers extract the real and imaginary parts', () => {
  const { a, b } = run('r ≔ ∮ (1/α) dα\na ≔ cre(r)\nb ≔ cim(r)', ['a', 'b'])();
  assert.ok(Math.abs(a) < 1e-9, `got a=${a}`);
  assert.ok(Math.abs(b - 2 * Math.PI) < 1e-6, `got b=${b}`);
});

test('implicit β: ∮ (1/(α - β)) dα is a function of β; the pole location decides the value', () => {
  const { r } = run('r ≔ ∮ (1/(α - β)) dα', ['r'])();
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
