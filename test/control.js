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

// ---- μ block form: variable-update loops (μ α with ← statements) ----

test('μ block form: accumulated sum via ← updates', () => {
  const result = compile(
    'total ≔ μ s\n' +
    '    s ← s + α\n' +
    '    α ← α + 1\n' +
    '    α > 10'
  );
  assert.equal(
    result,
    'const total = (() => { let s = 0; let α = 0; while (!((α > 10))) { (s = (s + α)); (α = (α + 1)); } return s; })();'
  );
});

test('μ block form: bound variable updated via ← returns its final value', () => {
  const result = compile(
    'n ≔ μ α\n' +
    '    α ← α + 2\n' +
    '    α ≥ 10'
  );
  assert.equal(
    result,
    'const n = (() => { let α = 0; while (!((α >= 10))) { (α = (α + 2)); } return α; })();'
  );
});

test('μ block form: auto-increments the bound variable when not reassigned', () => {
  const result = compile(
    'c ≔ μ α\n' +
    '    α² ≥ 100'
  );
  assert.equal(
    result,
    'const c = (() => { let α = 0; while (!(((α ** 2) >= 100))) { α++; } return α; })();'
  );
});

test('μ block form: helper variable (not the bound variable)', () => {
  const result = compile(
    'h ≔ μ α\n' +
    '    s ← s + 1\n' +
    '    s ≥ 3'
  );
  assert.equal(
    result,
    'const h = (() => { let α = 0; let s = 0; while (!((s >= 3))) { (s = (s + 1)); α++; } return α; })();'
  );
});

test('μ block form: runtime accumulated sum', () => {
  const { total } = run(
    'total ≔ μ s\n' +
    '    s ← s + α\n' +
    '    α ← α + 1\n' +
    '    α > 10',
    ['total']
  )();
  assert.equal(total, 55);
});

test('μ block form: implicit argument β captured from the loop body', () => {
  const { m } = run(
    'm ≔ μ α\n' +
    '    α ← α + β\n' +
    '    α ≥ 100',
    ['m']
  )();
  assert.equal(m(20), 100);
  assert.equal(m(10), 100);
});

test('μ block form: block-local definitions referenced by the loop', () => {
  const { count } = run(
    'count ≔\n' +
    '    step ≔ 3\n' +
    '    result ≔ μ α\n' +
    '        α ← α + step\n' +
    '        α ≥ ν\n' +
    '    result',
    ['count']
  )();
  assert.equal(count(10), 12);
  assert.equal(count(7), 9);
});

test('μ block form: forward reference to a later block-local def', () => {
  const { f } = run(
    'f ≔\n' +
    '    total ≔ μ α\n' +
    '        α ← α + step\n' +
    '        α ≥ 10\n' +
    '    step ≔ 2\n' +
    '    total',
    ['f']
  )();
  assert.equal(f(), 10);
});

test('μ block form: condition-only block behaves like the simple form', () => {
  const { sq } = run(
    'sq ≔ μ α\n' +
    '    α² ≥ 81',
    ['sq']
  )();
  assert.equal(sq, 9);
});

test('μ block form: explicit update overrides auto-increment', () => {
  const { n } = run(
    'n ≔ μ α\n' +
    '    α ← α + 3\n' +
    '    α ≥ 10',
    ['n']
  )();
  assert.equal(n, 12);
});

test('μ block form rejects a trailing reassignment as the condition', () => {
  assert.throws(
    () => compile(
      'x ≔ μ α\n' +
      '    α ← α + 1'
    ),
    /最後の文は再代入/
  );
});

test('μ block form rejects non-expression statements', () => {
  assert.throws(
    () => compile(
      'x ≔ μ α\n' +
      '    z ≔ 1\n' +
      '    α ≥ 5'
    ),
    /式文（再代入 ← と条件式）のみ/
  );
});

test('μ simple form still compiles unchanged', () => {
  const result = compile('n ≔ μ α (α² ≥ 100)');
  assert.equal(
    result,
    'const n = (() => { let α = 0; while (!(((α ** 2) >= 100))) α++; return α; })();'
  );
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

// ===== Block form (inner definitions) =====
test('Greek-letter inner names are substituted (original bug)', () => {
  const result = compile(
    'magnitude \u2254\n' +
    '    \u03b3 \u2254 \u03b1.x * \u03b1.x\n' +
    '    \u03b4 \u2254 \u03b1.y * \u03b1.y\n\n' +
    '    \u221a(\u03b3 + \u03b4)'
  );
  assert.equal(
    result,
    'const magnitude = \u03b1 => {\n' +
    '    const \u03b3 = (\u03b1.x * \u03b1.x);\n' +
    '    const \u03b4 = (\u03b1.y * \u03b1.y);\n' +
    '    return Math.sqrt((\u03b3 + \u03b4));\n' +
    '};'
  );
});

test('Dependency chain between inner definitions', () => {
  const result = compile(
    'f \u2254\n' +
    '    h \u2254 \u03b1 + 1\n' +
    '    k \u2254 h * 2\n\n' +
    '    k'
  );
  assert.equal(
    result,
    'const f = \u03b1 => {\n' +
    '    const h = (\u03b1 + 1);\n' +
    '    const k = (h * 2);\n' +
    '    return k;\n' +
    '};'
  );
});

test('Dependency chain with later definition referenced first', () => {
  const result = compile(
    'f \u2254\n' +
    '    k \u2254 h * 2\n' +
    '    h \u2254 \u03b1 + 1\n\n' +
    '    k'
  );
  assert.equal(
    result,
    'const f = \u03b1 => {\n' +
    '    const h = (\u03b1 + 1);\n' +
    '    const k = (h * 2);\n' +
    '    return k;\n' +
    '};'
  );
});

test('Mixed ASCII and Greek inner names', () => {
  const result = compile(
    'f \u2254\n' +
    '    \u03b3 \u2254 \u03b1.x * \u03b1.x\n' +
    '    k \u2254 \u03b3 + 1\n\n' +
    '    \u221a(k)'
  );
  assert.equal(
    result,
    'const f = \u03b1 => {\n' +
    '    const \u03b3 = (\u03b1.x * \u03b1.x);\n' +
    '    const k = (\u03b3 + 1);\n' +
    '    return Math.sqrt(k);\n' +
    '};'
  );
});

test('Cyclic reference between inner definitions throws', () => {
  assert.throws(
    () =>
      compile(
        'f \u2254\n' +
        '    a \u2254 b + 1\n' +
        '    b \u2254 a + 1\n\n' +
        '    a'
      ),
    /Circular reference in block: a/
  );
});

test('Cyclic reference through a chain throws', () => {
  assert.throws(
    () =>
      compile(
        'f \u2254\n' +
        '    a \u2254 b + 1\n' +
        '    b \u2254 c + 1\n' +
        '    c \u2254 a + 1\n\n' +
        '    a'
      ),
    /Circular reference in block: a/
  );
});

test('Single-line definition still works (regression guard)', () => {
  const result = compile('square \u2254 \u03b1\u00b2');
  assert.equal(result, 'const square = \u03b1 => (\u03b1 ** 2);');
});

test('Single-expression block flattens to inline arrow', () => {
  const result = compile('square \u2254\n    \u03b1\u00b2');
  assert.equal(result, 'const square = \u03b1 => (\u03b1 ** 2);');
});

test('Inner name shadowed by an arrow parameter is not substituted', () => {
  const result = compile(
    'f \u2254\n' +
    '    \u03b3 \u2254 \u03b1.x * \u03b1.x\n' +
    '    g \u2254 \u03b3 \u21a6 \u03b3 + 1\n\n' +
    '    g(\u03b3)'
  );
  assert.equal(
    result,
    'const f = \u03b1 => {\n' +
    '    const \u03b3 = (\u03b1.x * \u03b1.x);\n' +
    '    const g = \u03b3 => (\u03b3 + 1);\n' +
    '    return g(\u03b3);\n' +
    '};'
  );
});

test('Nested blocks produce properly indented scopes', () => {
  const result = compile(
    'f \u2254\n' +
    '    g \u2254\n' +
    '        \u03b4 \u2254 \u03b1 + 1\n' +
    '        \u03b4\n' +
    '    g'
  );
  assert.equal(
    result,
    'const f = () => {\n' +
    '    const g = \u03b1 => {\n' +
    '        const \u03b4 = (\u03b1 + 1);\n' +
    '        return \u03b4;\n' +
    '    };\n' +
    '    return g;\n' +
    '};'
  );
});

test('Multi-line parenthesized expression inside a block', () => {
  const result = compile(
    'distance \u2254\n' +
    '    \u03b3 \u2254 \u03b1.x - \u03b2.x\n' +
    '    \u03b4 \u2254 \u03b1.y - \u03b2.y\n' +
    '    \u221a(\n' +
    '        \u03b3\u00b2 +\n' +
    '        \u03b4\u00b2\n' +
    '    )'
  );
  assert.equal(
    result,
    'const distance = (\u03b1, \u03b2) => {\n' +
    '    const \u03b3 = (\u03b1.x - \u03b2.x);\n' +
    '    const \u03b4 = (\u03b1.y - \u03b2.y);\n' +
    '    return Math.sqrt(((\u03b3 ** 2) + (\u03b4 ** 2)));\n' +
    '};'
  );
});

test('Side-effect function-call statement before the result', () => {
  const result = compile(
    'f \u2254\n' +
    '    g \u2254 \u03b1 + 1\n' +
    '    print(g)\n' +
    '    g'
  );
  assert.equal(
    result,
    'const f = \u03b1 => {\n' +
    '    const g = (\u03b1 + 1);\n' +
    '    print(g);\n' +
    '    return g;\n' +
    '};'
  );
});

test('Reassignment (re-assignment arrow) as an expression statement', () => {
  const result = compile(
    'f \u2254\n' +
    '    acc \u2254 0\n' +
    '    acc \u2190 acc + 1\n' +
    '    acc'
  );
  assert.equal(
    result,
    'const f = () => {\n' +
    '    const acc = 0;\n' +
    '    (acc = (acc + 1));\n' +
    '    return acc;\n' +
    '};'
  );
});

test('Blank lines inside a block are ignored', () => {
  const result = compile(
    'f \u2254\n' +
    '    \u03b3 \u2254 \u03b1 + 1\n' +
    '\n' +
    '\n' +
    '    \u03b3'
  );
  assert.equal(
    result,
    'const f = \u03b1 => {\n' +
    '    const \u03b3 = (\u03b1 + 1);\n' +
    '    return \u03b3;\n' +
    '};'
  );
});

test('Quantifier with indented body inside a block', () => {
  const result = compile(
    'f \u2254\n' +
    '    s \u2254 \u2211 \u03b1 \u2208 xs :\n' +
    '        \u03b1 + 1\n' +
    '    s'
  );
  assert.equal(
    result,
    'const f = () => {\n' +
    '    const s = [...xs].reduce((acc, \u03b1) => acc + (\u03b1 + 1), 0);\n' +
    '    return s;\n' +
    '};'
  );
});

test('Unindented block body throws (indentation enforced)', () => {
  assert.throws(() => compile('f \u2254\n\u03b3 \u2254 1'), /Expected INDENT after block definition/);
});

test('Inconsistent indentation inside a block throws', () => {
  assert.throws(
    () => compile('f \u2254\n    \u03b3 \u2254 \u03b1 + 1\n  \u03b3'),
    /Inconsistent indentation/
  );
});

test('Empty block throws', () => {
  assert.throws(() => compile('f \u2254\n    '), /Expected INDENT after block definition|Empty block/);
});
