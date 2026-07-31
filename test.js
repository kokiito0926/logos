import { LogosCompiler } from "./logos.js";

console.log("\n========== Test 1: Simple function ==========");
const code1 = `square ≔ α²`;
const compiler = new LogosCompiler();
const result1 = compiler.compile(code1, true);
console.log("\nFinal Output:\n" + result1);

console.log("\n========== Test 2: Distance function ==========");
const code2 = `distance ≔ √((α.x - β.x)² + (α.y - β.y)²)`;
const result2 = compiler.compile(code2, true);
console.log("\nFinal Output:\n" + result2);
