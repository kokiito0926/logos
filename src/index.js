/**
 * Logos Language Compiler
 * Minimal implementation with Lexer, Parser, and JavaScript Generator
 */

const SUBSCRIPT_MAP = {
	"₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
	"₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
	"ₐ": "a", "ₑ": "e", "ₒ": "o", "ₓ": "x", "ₕ": "h",
	"ₖ": "k", "ₗ": "l", "ₘ": "m", "ₙ": "n", "ₚ": "p",
	"ₛ": "s", "ₜ": "t"
};

const SUPERSCRIPT_MAP = {
	"⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
	"⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
	"⁻": "-", "⁺": "+"
};

function isSubscriptChar(ch) {
	return SUBSCRIPT_MAP[ch] !== undefined || /[₀-₉]/.test(ch);
}

export class Lexer {
	constructor(input) {
		this.input = input;
		this.pos = 0;
	}

	peek(offset = 0) {
		return this.input[this.pos + offset];
	}

	advance() {
		return this.input[this.pos++];
	}

	skipWhitespace() {
		// Skip spaces and tabs but keep newlines/carriage returns as significant tokens
		while (this.pos < this.input.length && /[ \t]/.test(this.peek())) {
			this.advance();
		}
	}

	tokenize() {
		const tokens = [];

		while (this.pos < this.input.length) {
			// Treat CR, LF, or CRLF as significant newline tokens so the parser can detect multi-line blocks
			if (this.peek() === '\r') {
				this.advance();
				if (this.peek() === '\n') this.advance();
				tokens.push({ type: "NEWLINE", value: "\n" });
				continue;
			}
			if (this.peek() === '\n') {
				this.advance();
				tokens.push({ type: "NEWLINE", value: "\n" });
				continue;
			}
			this.skipWhitespace();
			if (this.pos >= this.input.length) break;
			// After skipping spaces, handle any newline characters that remained (e.g., blank lines)
			if (this.peek() === '\r') {
				this.advance();
				if (this.peek() === '\n') this.advance();
				tokens.push({ type: "NEWLINE", value: "\n" });
				continue;
			}
			if (this.peek() === '\n') {
				this.advance();
				tokens.push({ type: "NEWLINE", value: "\n" });
				continue;
			}
			const char = this.peek();

			// Superscript numbers / signs (e.g. ⁻¹, ⁴, ¹⁰)
			if (/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]/.test(char)) {
				let superStr = "";
				while (this.pos < this.input.length && /[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]/.test(this.peek())) {
					superStr += SUPERSCRIPT_MAP[this.advance()];
				}
				const val = parseFloat(superStr);
				tokens.push({ type: "SUPERSCRIPT", value: val });
				continue;
			}

			// π is special (constant, not identifier)
			if (char === "π") {
				this.advance();
				tokens.push({ type: "PI", value: "π" });
				continue;
			}

			// ∞ is a mathematical constant
			if (char === "∞") {
				this.advance();
				tokens.push({ type: "INFINITY", value: "∞" });
				continue;
			}

			// Subscript characters (₀, ₁, ..., ₙ etc.) — emitted as a separate SUBSCRIPT token
			if (isSubscriptChar(char)) {
				let subStr = "";
				while (this.pos < this.input.length && isSubscriptChar(this.peek())) {
					const c = this.advance();
					subStr += SUBSCRIPT_MAP[c] ?? c;
				}
				tokens.push({ type: "SUBSCRIPT", value: subStr });
				continue;
			}

			// Identifiers (Greek letters, Latin letters, underscores, digits)
			if (/[a-zA-Z_α-ω]/.test(char)) {
				let ident = "";
				while (this.pos < this.input.length && /[a-zA-Z0-9_α-ω]/.test(this.peek())) {
					ident += this.advance();
				}
				tokens.push({ type: "IDENT", value: ident });
				continue;
			}

			// Numbers
			if (/\d/.test(char)) {
				let num = "";
				while (this.pos < this.input.length && /[\d.]/.test(this.peek())) {
					num += this.advance();
				}
				tokens.push({ type: "NUMBER", value: parseFloat(num) });
				continue;
			}

			// Operators and symbols
			// Check for ≔ first (Unicode character)
			if (this.peek() === "≔") {
				this.advance();
				tokens.push({ type: "ASSIGN", value: "≔" });
				continue;
			}

			const twoChar = this.input.substr(this.pos, 2);
			if (twoChar === ":=") {
				this.advance();
				this.advance();
				tokens.push({ type: "ASSIGN", value: "≔" });
				continue;
			}

			const symbolMap = {
				"+": "PLUS",
				"-": "MINUS",
				"*": "MUL",
				"/": "DIV",
				"^": "POW",
				"(": "LPAREN",
				")": "RPAREN",
				"[": "LBRACKET",
				"]": "RBRACKET",
				".": "DOT",
				",": "COMMA",
				":": "COLON",
				"√": "SQRT",
				π: "PI",
				"=": "EQ",
				"≠": "NEQ",
				"<": "LT",
				">": "GT",
				"≤": "LTE",
				"≥": "GTE",
				"∧": "AND",
				"∨": "OR",
				"¬": "NOT",
				"∀": "FORALL",
				"∃": "EXISTS",
				"∈": "IN",
				"∉": "NOTIN",
				"⊤": "TRUE",
				"⊥": "FALSE",
				"∅": "EMPTYSET",
				"⇒": "IMPLIES",
				"⇔": "EQUIV",
				"⊕": "XOR",
				"≡": "CONGRUENT",
				"≈": "APPROX",
				"←": "ASSIGN_RE",
				"↦": "MAPSTO",
				"→": "ARROW",
				"∘": "COMPOSE",
				"‥": "RANGE",
			};

			if (symbolMap[char]) {
				tokens.push({ type: symbolMap[char], value: this.advance() });
				continue;
			}

			throw new Error(`Unexpected character: ${char} at position ${this.pos}`);
		}

		tokens.push({ type: "EOF", value: null });
		return tokens;
	}
}

export class Parser {
	constructor(tokens) {
		this.tokens = tokens;
		this.pos = 0;
	}

	peek(offset = 0) {
		return this.tokens[this.pos + offset];
	}

	advance() {
		return this.tokens[this.pos++];
	}

	expect(type) {
		const token = this.peek();
		if (token.type !== type) {
			throw new Error(`Expected ${type}, got ${token.type}`);
		}
		return this.advance();
	}

	match(...types) {
		return types.includes(this.peek().type);
	}

	parse() {
		const statements = [];
		while (!this.match("EOF")) {
			// Skip newlines separating statements (blank lines allowed)
			while (this.match("NEWLINE")) {
				this.advance();
			}
			if (this.match("EOF")) break;
			const stmt = this.parseStatement();
			if (stmt) statements.push(stmt);
		}
		return { type: "Program", body: statements };
	}

	parseStatement() {
		const token = this.peek();
		if (token.type === "IDENT") {
			const name = token.value;
			this.advance();
			if (this.match("ASSIGN")) {
				this.advance(); // consume ≔
				// Support block-style definitions:
				if (this.match("NEWLINE")) {
					this.advance();
					const innerDefs = [];
					while (this.match("IDENT") && this.peek(1) && this.peek(1).type === "ASSIGN") {
						const innerName = this.advance().value;
						this.advance(); // consume ASSIGN
						const innerValue = this.parseExpression();
						innerDefs.push({ type: "Definition", name: innerName, value: innerValue });
						if (this.match("NEWLINE")) {
							this.advance();
							if (this.match("NEWLINE")) {
								this.advance();
								break;
							} else {
								continue;
							}
						} else {
							break;
						}
					}
					const finalExpr = this.parseExpression();
					return { type: "Definition", name, value: { type: "Block", body: innerDefs, expr: finalExpr } };
				} else {
					const value = this.parseExpression();
					return { type: "Definition", name, value };
				}
			}
		}
		throw new Error(`Unexpected token: ${token.type}`);
	}

	parseExpression() {
		return this.parseAssignment();
	}

	parseAssignment() {
		let left = this.parseRange();

		if (this.match("ASSIGN_RE")) {
			this.advance();
			const right = this.parseAssignment();
			return { type: "BinaryOp", op: "=", left, right };
		}

		return left;
	}

	parseRange() {
		let left = this.parseArrow();

		// Range: a‥b → range(a, b), 0‥<n → range(0, n, true) (exclusive upper bound)
		if (this.match("RANGE")) {
			this.advance(); // consume ‥
			let exclusive = false;
			if (this.match("LT")) {
				this.advance(); // consume <
				exclusive = true;
			}
			const right = this.parseArrow();
			return { type: "Range", start: left, end: right, exclusive };
		}

		return left;
	}

	parseArrow() {
		// Single param arrow: ident ↦ expr or ident → expr
		if (this.match("IDENT") && this.peek(1) && (this.peek(1).type === "MAPSTO" || this.peek(1).type === "ARROW")) {
			const param = this.advance().value;
			this.advance(); // consume ↦ or →
			const body = this.parseArrow();
			return { type: "ArrowFunction", params: [param], body };
		}

		// Multi param arrow: (a, b) ↦ expr
		if (this.match("LPAREN")) {
			let isArrow = false;
			let i = 1;
			while (this.pos + i < this.tokens.length) {
				const t = this.tokens[this.pos + i];
				if (t.type === "RPAREN") {
					const next = this.tokens[this.pos + i + 1];
					if (next && (next.type === "MAPSTO" || next.type === "ARROW")) {
						isArrow = true;
					}
					break;
				}
				i++;
			}
			if (isArrow) {
				this.advance(); // LPAREN
				const params = [];
				if (!this.match("RPAREN")) {
					params.push(this.expect("IDENT").value);
					while (this.match("COMMA")) {
						this.advance();
						params.push(this.expect("IDENT").value);
					}
				}
				this.expect("RPAREN");
				this.advance(); // MAPSTO or ARROW
				const body = this.parseArrow();
				return { type: "ArrowFunction", params, body };
			}
		}

		return this.parseImplies();
	}

	parseImplies() {
		let left = this.parseEquiv();

		while (this.match("IMPLIES")) {
			this.advance();
			const right = this.parseEquiv();
			left = { type: "BinaryOp", op: "⇒", left, right };
		}

		return left;
	}

	parseEquiv() {
		let left = this.parseLogicalOr();

		while (this.match("EQUIV")) {
			this.advance();
			const right = this.parseLogicalOr();
			left = { type: "BinaryOp", op: "⇔", left, right };
		}

		return left;
	}

	parseLogicalOr() {
		let left = this.parseLogicalAnd();

		while (this.match("OR", "XOR")) {
			const token = this.advance();
			const right = this.parseLogicalAnd();
			const op = token.type === "XOR" ? "⊕" : "||";
			left = { type: "BinaryOp", op, left, right };
		}

		return left;
	}

	parseLogicalAnd() {
		let left = this.parseComparison();

		while (this.match("AND")) {
			this.advance();
			const right = this.parseComparison();
			left = { type: "BinaryOp", op: "&&", left, right };
		}

		return left;
	}

	parseComparison() {
		const operatorMap = {
			EQ: "===",
			NEQ: "!==",
			CONGRUENT: "===",
			APPROX: "≈",
			LT: "<",
			GT: ">",
			LTE: "<=",
			GTE: ">=",
			IN: "∈",
			NOTIN: "∉",
		};

		let left = this.parseAdditive();
		if (!this.match("EQ", "NEQ", "CONGRUENT", "APPROX", "LT", "GT", "LTE", "GTE", "IN", "NOTIN")) {
			return left;
		}

		// Chain comparison: 0 ≤ α ≤ 10 → (0 <= α) && (α <= 10)
		// Each right operand also becomes the left operand of the next comparison.
		const comparisons = [];
		while (this.match("EQ", "NEQ", "CONGRUENT", "APPROX", "LT", "GT", "LTE", "GTE", "IN", "NOTIN")) {
			const token = this.advance();
			const right = this.parseAdditive();
			comparisons.push({ left, op: operatorMap[token.type], right });
			left = right;
		}

		if (comparisons.length === 1) {
			const { left: l, op, right } = comparisons[0];
			return { type: "BinaryOp", op, left: l, right };
		}

		return { type: "ChainComparison", comparisons };
	}

	parseAdditive() {
		let left = this.parseMultiplicative();

		while (this.match("PLUS", "MINUS")) {
			const op = this.advance().value;
			const right = this.parseMultiplicative();
			left = { type: "BinaryOp", op, left, right };
		}

		return left;
	}

	parseMultiplicative() {
		let left = this.parseUnary();

		while (this.match("MUL", "DIV")) {
			const op = this.advance().value;
			const right = this.parseUnary();
			left = { type: "BinaryOp", op, left, right };
		}

		return left;
	}

	parseUnary() {
		if (this.match("NOT")) {
			this.advance();
			return { type: "UnaryOp", op: "!", argument: this.parseUnary() };
		}

		return this.parseExponentiation();
	}

	parseExponentiation() {
		let left = this.parseCompose();

		while (this.match("POW", "SQ", "CUB", "SUPERSCRIPT")) {
			const token = this.advance();
			let right;

			if (token.type === "SQ") {
				right = { type: "Literal", value: 2 };
			} else if (token.type === "CUB") {
				right = { type: "Literal", value: 3 };
			} else if (token.type === "SUPERSCRIPT") {
				right = { type: "Literal", value: token.value };
			} else {
				right = this.parsePostfix();
			}

			left = { type: "BinaryOp", op: "**", left, right };
		}

		return left;
	}

	parseCompose() {
		let left = this.parsePostfix();

		while (this.match("COMPOSE")) {
			this.advance();
			const right = this.parsePostfix();
			left = { type: "BinaryOp", op: "∘", left, right };
		}

		return left;
	}

	parsePostfix() {
		let expr = this.parsePrimary();

		while (true) {
			if (this.match("DOT")) {
				this.advance();
				const prop = this.expect("IDENT").value;
				expr = { type: "MemberAccess", object: expr, property: prop };
			} else if (this.match("LBRACKET")) {
				this.advance();
				const index = this.parseExpression();
				this.expect("RBRACKET");
				expr = { type: "IndexAccess", object: expr, index };
			} else if (this.match("SUBSCRIPT")) {
				// Unicode subscript: x₀ → x[0], x₁ → x[1]
				const sub = this.advance();
				const indexNode = isNaN(Number(sub.value))
					? { type: "Variable", name: sub.value }
					: { type: "Literal", value: Number(sub.value) };
				expr = { type: "IndexAccess", object: expr, index: indexNode };
			} else {
				break;
			}
		}

		return expr;
	}

	parsePrimary() {
		const token = this.peek();

		if (token.type === "NUMBER") {
			this.advance();
			return { type: "Literal", value: token.value };
		}

		if (token.type === "TRUE") {
			this.advance();
			return { type: "Literal", value: true };
		}

		if (token.type === "FALSE") {
			this.advance();
			return { type: "Literal", value: false };
		}

		if (token.type === "EMPTYSET") {
			this.advance();
			return { type: "Constant", name: "∅" };
		}

		if (token.type === "IDENT") {
			const value = token.value;
			this.advance();
			if (value === "π") {
				return { type: "Constant", name: "π" };
			}
			return { type: "Variable", name: value };
		}

		if (token.type === "PI") {
			this.advance();
			return { type: "Constant", name: "π" };
		}

		if (token.type === "INFINITY") {
			this.advance();
			return { type: "Constant", name: "∞" };
		}

		if (token.type === "SQRT") {
			this.advance();
			const arg = this.parsePrimary();
			return { type: "FunctionCall", name: "sqrt", args: [arg] };
		}

		if (token.type === "LPAREN") {
			this.advance();
			const expr = this.parseExpression();
			this.expect("RPAREN");
			return expr;
		}

		throw new Error(`Unexpected token: ${token.type} at position ${this.pos}`);
	}
}

export class Generator {
	constructor(ast) {
		this.ast = ast;
		this.usedImplicitVars = new Set();
	}

	generate() {
		const statements = this.ast.body.map((stmt) => this.generateStatement(stmt));
		return statements.join("\n");
	}

	generateStatement(stmt) {
		if (stmt.type === "Definition") {
			this.usedImplicitVars = new Set();
			
			if (stmt.value && stmt.value.type === "ArrowFunction") {
				const arrowStr = this.generateExpression(stmt.value);
				return `const ${stmt.name} = ${arrowStr};`;
			}

			if (stmt.value && stmt.value.type === "Block") {
				stmt.value.body.forEach((d) => this.collectImplicitVars(d.value));
				this.collectImplicitVars(stmt.value.expr);
				const innerNames = new Set(stmt.value.body.map((d) => d.name));
				innerNames.forEach((n) => this.usedImplicitVars.delete(n));
				const implicitArgs = Array.from(this.usedImplicitVars).sort();
				let finalExprStr = this.generateExpression(stmt.value.expr);
				stmt.value.body.forEach((d) => {
					const innerStr = this.generateExpression(d.value);
					finalExprStr = finalExprStr.replace(new RegExp(`\\b${d.name}\\b`, 'g'), innerStr);
				});
				if (implicitArgs.length === 0) {
					return `const ${stmt.name} = ${finalExprStr};`;
				} else if (implicitArgs.length === 1) {
					return `const ${stmt.name} = ${implicitArgs[0]} => ${finalExprStr};`;
				} else {
					return `const ${stmt.name} = (${implicitArgs.join(", ")}) => ${finalExprStr};`;
				}
			} else {
				this.collectImplicitVars(stmt.value);
				const implicitArgs = Array.from(this.usedImplicitVars).sort();
				let expr = this.generateExpression(stmt.value);
				if (stmt.value && stmt.value.type === 'BinaryOp' && stmt.value.op === '*' && stmt.value.left && stmt.value.left.type === 'Literal' && stmt.value.right && stmt.value.right.type === 'BinaryOp' && stmt.value.right.op === '**') {
					expr = `(${expr})`;
				}
				if (implicitArgs.length === 0) {
					return `const ${stmt.name} = ${expr};`;
				} else if (implicitArgs.length === 1) {
					return `const ${stmt.name} = ${implicitArgs[0]} => ${expr};`;
				} else {
					return `const ${stmt.name} = (${implicitArgs.join(", ")}) => ${expr};`;
				}
			}
		}
		throw new Error(`Unknown statement type: ${stmt.type}`);
	}

	generateExpression(expr) {
		if (expr.type === "Literal") {
			return String(expr.value);
		}

		if (expr.type === "Variable") {
			return expr.name;
		}

		if (expr.type === "Constant") {
			if (expr.name === "π") return "Math.PI";
			if (expr.name === "∞") return "Infinity";
			if (expr.name === "∅") return "new Set()";
			throw new Error(`Unknown constant: ${expr.name}`);
		}

		if (expr.type === "ArrowFunction") {
			const paramsStr = expr.params.length === 1 ? expr.params[0] : `(${expr.params.join(", ")})`;
			const bodyStr = this.generateExpression(expr.body);
			return `${paramsStr} => ${bodyStr}`;
		}

		if (expr.type === "Range") {
			const start = this.generateExpression(expr.start);
			const end = this.generateExpression(expr.end);
			return expr.exclusive
				? `range(${start}, ${end}, true)`
				: `range(${start}, ${end})`;
		}

		if (expr.type === "UnaryOp") {
			return `(!${this.generateExpression(expr.argument)})`;
		}

		if (expr.type === "ChainComparison") {
			return expr.comparisons
				.map((c) => this.generateExpression({ type: "BinaryOp", op: c.op, left: c.left, right: c.right }))
				.join(" && ");
		}

		if (expr.type === "BinaryOp") {
			const left = this.generateExpression(expr.left);
			const right = this.generateExpression(expr.right);
			if (expr.op === "⇒") {
				return `(!${left} || ${right})`;
			}
			if (expr.op === "⇔") {
				return `(${left} === ${right})`;
			}
			if (expr.op === "⊕") {
				return `(${left} !== ${right})`;
			}
			if (expr.op === "≈") {
				return `almostEqual(${left}, ${right})`;
			}
			if (expr.op === "∈") {
				return `(${right}.has(${left}))`;
			}
			if (expr.op === "∉") {
				return `(!${right}.has(${left}))`;
			}
			if (expr.op === "∘") {
				return `((...args) => ${left}(${right}(...args)))`;
			}
			return `(${left} ${expr.op} ${right})`;
		}

		if (expr.type === "MemberAccess") {
			const obj = this.generateExpression(expr.object);
			return `${obj}.${expr.property}`;
		}

		if (expr.type === "IndexAccess") {
			const obj = this.generateExpression(expr.object);
			const idx = this.generateExpression(expr.index);
			return `${obj}[${idx}]`;
		}

		if (expr.type === "FunctionCall") {
			const args = expr.args.map((arg) => this.generateExpression(arg)).join(", ");
			if (expr.name === "sqrt") {
				return `Math.sqrt(${args})`;
			}
			throw new Error(`Unknown function: ${expr.name}`);
		}

		throw new Error(`Unknown expression type: ${expr.type}`);
	}

	collectImplicitVars(expr) {
		const greekLetters = /^[α-ω](_[0-9a-zA-Z]+)?$/;

		if (expr.type === "Variable" && greekLetters.test(expr.name)) {
			this.usedImplicitVars.add(expr.name);
		} else if (expr.type === "ArrowFunction") {
			const tempGen = new Generator({ body: [] });
			tempGen.collectImplicitVars(expr.body);
			tempGen.usedImplicitVars.forEach(v => {
				if (!expr.params.includes(v)) {
					this.usedImplicitVars.add(v);
				}
			});
		} else if (expr.type === "UnaryOp") {
			this.collectImplicitVars(expr.argument);
		} else if (expr.type === "BinaryOp") {
			this.collectImplicitVars(expr.left);
			this.collectImplicitVars(expr.right);
		} else if (expr.type === "ChainComparison") {
			expr.comparisons.forEach((c) => {
				this.collectImplicitVars(c.left);
				this.collectImplicitVars(c.right);
			});
		} else if (expr.type === "Range") {
			this.collectImplicitVars(expr.start);
			this.collectImplicitVars(expr.end);
		} else if (expr.type === "MemberAccess") {
			this.collectImplicitVars(expr.object);
		} else if (expr.type === "IndexAccess") {
			this.collectImplicitVars(expr.object);
			this.collectImplicitVars(expr.index);
		} else if (expr.type === "FunctionCall") {
			expr.args.forEach((arg) => this.collectImplicitVars(arg));
		}
	}
}

export class LogosCompiler {
	compile(code, verbose = false) {
		// Step 1: Lexing
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		if (verbose) console.log("Tokens:", tokens);

		// Step 2: Parsing
		const parser = new Parser(tokens);
		const ast = parser.parse();
		if (verbose) console.log("AST:", JSON.stringify(ast, null, 2));

		// Step 3: Code Generation
		const generator = new Generator(ast);
		const jsCode = generator.generate();
		if (verbose) console.log("Generated JS:", jsCode);

		return jsCode;
	}
}
