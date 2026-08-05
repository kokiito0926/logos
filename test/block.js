import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LogosCompiler } from '../src/index.js';

function compile(code) {
  return new LogosCompiler().compile(code);
}

test('Greek-letter inner names are substituted (original bug)', () => {
  const result = compile(
    'magnitude \u2254\n' +
    '    \u03b3 \u2254 \u03b1.x * \u03b1.x\n' +
    '    \u03b4 \u2254 \u03b1.y * \u03b1.y\n\n' +
    '    \u221a(\u03b3 + \u03b4)'
  );
  assert.equal(
    result,
    'const magnitude = \u03b1 => Math.sqrt(((\u03b1.x * \u03b1.x) + (\u03b1.y * \u03b1.y)));'
  );
});

test('Dependency chain between inner definitions', () => {
  const result = compile(
    'f \u2254\n' +
    '    h \u2254 \u03b1 + 1\n' +
    '    k \u2254 h * 2\n\n' +
    '    k'
  );
  assert.equal(result, 'const f = \u03b1 => ((\u03b1 + 1) * 2);');
});

test('Dependency chain with later definition referenced first', () => {
  const result = compile(
    'f \u2254\n' +
    '    k \u2254 h * 2\n' +
    '    h \u2254 \u03b1 + 1\n\n' +
    '    k'
  );
  assert.equal(result, 'const f = \u03b1 => ((\u03b1 + 1) * 2);');
});

test('Mixed ASCII and Greek inner names', () => {
  const result = compile(
    'f \u2254\n' +
    '    \u03b3 \u2254 \u03b1.x * \u03b1.x\n' +
    '    k \u2254 \u03b3 + 1\n\n' +
    '    \u221a(k)'
  );
  assert.equal(result, 'const f = \u03b1 => Math.sqrt(((\u03b1.x * \u03b1.x) + 1));');
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

test('Inner name shadowed by an arrow parameter is not substituted', () => {
  const result = compile(
    'f \u2254\n' +
    '    \u03b3 \u2254 \u03b1.x * \u03b1.x\n' +
    '    g \u2254 \u03b3 \u21a6 \u03b3 + 1\n\n' +
    '    g(\u03b3)'
  );
  assert.equal(
    result,
    'const f = \u03b1 => \u03b3 => (\u03b3 + 1)((\u03b1.x * \u03b1.x));'
  );
});
