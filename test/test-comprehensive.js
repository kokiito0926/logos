import { LogosCompiler } from '../src/logos.js';

function test(name, code, expectedPattern) {
  console.log(`\n========== ${name} ==========`);
  console.log(`Input:\n${code}`);
  
  try {
    const compiler = new LogosCompiler();
    const result = compiler.compile(code);
    console.log(`\n✓ Output:\n${result}`);
    
    if (expectedPattern) {
      if (expectedPattern.test(result)) {
        console.log('✓ Matches expected pattern');
      } else {
        console.log('✗ FAILED: Does not match expected pattern');
        console.log(`Expected pattern: ${expectedPattern}`);
      }
    }
    return result;
  } catch (error) {
    console.log(`✗ FAILED: ${error.message}`);
  }
}

// Test 1: Simple function with single implicit argument
test(
  'Test 1: Simple function - single implicit arg',
  `square ≔ α²`,
  /const square = α => \(α \*\* 2\);/
);

// Test 2: Distance function with two implicit arguments
test(
  'Test 2: Distance function - multiple implicit args',
  `distance ≔ √((α.x - β.x)² + (α.y - β.y)²)`,
  /const distance = \(α, β\) => Math\.sqrt/
);

// Test 3: Implicit return value with multiple lines
test(
  'Test 3: Multi-line with intermediate variables',
  `magnitude ≔
    γ ≔ α.x * α.x
    δ ≔ α.y * α.y
    
    √(γ + δ)`,
  /const magnitude = α => Math\.sqrt/
);

// Test 4: Three implicit arguments
test(
  'Test 4: Three implicit arguments',
  `sum3 ≔ α + β + γ`,
  /const sum3 = \(α, β, γ\) => \(\(α \+ β\) \+ γ\);/
);

// Test 5: Mathematical constants (π)
test(
  'Test 5: Mathematical constant π',
  `circumference ≔ 2 * π * α`,
  /const circumference = α => \(\(2 \* Math\.PI\) \* α\);/
);

// Test 6: Powers with different superscripts
test(
  'Test 6: Powers - square (²)',
  `quad ≔ 4 * α²`,
  /const quad = α => \(\(4 \* \(α \*\* 2\)\);/
);

// Test 7: Powers with cubes
test(
  'Test 7: Powers - cube (³)',
  `cube ≔ α³`,
  /const cube = α => \(α \*\* 3\);/
);

// Test 8: Nested member access
test(
  'Test 8: Nested member access',
  `getX ≔ α.point.x`,
  /const getX = α => α\.point\.x;/
);

// Test 9: Array access
test(
  'Test 9: Array indexing',
  `getFirst ≔ α\[0\]`,
  /const getFirst = α => α\[0\];/
);

// Test 10: Mixed operations
test(
  'Test 10: Mixed operations',
  `mixed ≔ (α + β) * γ - δ / ε`,
  /const mixed = \(α, β, γ, δ, ε\) => /
);

// Test 11: No implicit arguments (constant)
test(
  'Test 11: Constant with no implicit args',
  `pi_value ≔ π`,
  /const pi_value = Math\.PI;/
);

// Test 12: Complex nested expression
test(
  'Test 12: Complex nested expression',
  `pythagorean ≔ √(α² + β²)`,
  /const pythagorean = \(α, β\) => Math\.sqrt\(\(\(α \*\* 2\) \+ \(β \*\* 2\)\)\);/
);

console.log('\n========== Summary ==========');
console.log('All tests completed!');
