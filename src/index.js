/**
 * Logos Language Compiler
 * Minimal implementation with Lexer, Parser, and JavaScript Generator
 */

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
		while (this.pos < this.input.length && /\s/.test(this.peek())) {
			this.advance();
		}
	}

	tokenize() {
		const tokens = [];

		while (this.pos < this.input.length) {
			this.skipWhitespace();
			if (this.pos >= this.input.length) break;

			const char = this.peek();

			// Greek letters
			if (/[α-ω]/.test(char)) {
				tokens.push({ type: "IDENT", value: this.advance() });
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

			// Numbers
			if (/\d/.test(char)) {
				let num = "";
				while (this.pos < this.input.length && /[\d.]/.test(this.peek())) {
					num += this.advance();
				}
				tokens.push({ type: "NUMBER", value: parseFloat(num) });
				continue;
			}

			// Identifiers (regular)
			if (/[a-zA-Z_]/.test(char)) {
				let ident = "";
				while (this.pos < this.input.length && /[a-zA-Z0-9_]/.test(this.peek())) {
					ident += this.advance();
				}
				tokens.push({ type: "IDENT", value: ident });
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
				"²": "SQ",
				"³": "CUB",
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
		this.implicitVars = new Set(["α", "β", "γ", "δ", "ε", "ζ", "η", "θ"]);
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
				const value = this.parseExpression();
				return { type: "Definition", name, value };
			}
		}

		throw new Error(`Unexpected token: ${token.type}`);
	}

	parseExpression() {
		return this.parseLogicalOr();
	}

	parseLogicalOr() {
		let left = this.parseLogicalAnd();

		while (this.match("OR")) {
			this.advance();
			const right = this.parseLogicalAnd();
			left = { type: "BinaryOp", op: "||", left, right };
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
		let left = this.parseAdditive();
		const operatorMap = {
			EQ: "===",
			NEQ: "!==",
			LT: "<",
			GT: ">",
			LTE: "<=",
			GTE: ">=",
		};

		while (this.match("EQ", "NEQ", "LT", "GT", "LTE", "GTE")) {
			const token = this.advance();
			const right = this.parseAdditive();
			left = { type: "BinaryOp", op: operatorMap[token.type], left, right };
		}

		return left;
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
		let left = this.parsePostfix();

		while (this.match("POW", "SQ", "CUB")) {
			const token = this.advance();
			let right;

			if (token.type === "SQ") {
				right = { type: "Literal", value: 2 };
			} else if (token.type === "CUB") {
				right = { type: "Literal", value: 3 };
			} else {
				right = this.parsePostfix();
			}

			left = { type: "BinaryOp", op: "**", left, right };
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

		if (token.type === "IDENT") {
			const value = token.value;
			this.advance();
			// π is a special constant when used as identifier
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
			const expr = this.generateExpression(stmt.value);

			// Collect implicit variables used
			this.collectImplicitVars(stmt.value);

			// Get list of implicit args
			const implicitArgs = Array.from(this.usedImplicitVars).sort();

			if (implicitArgs.length === 0) {
				// No implicit args, simple constant
				return `const ${stmt.name} = ${expr};`;
			} else if (implicitArgs.length === 1) {
				// Single implicit arg
				return `const ${stmt.name} = ${implicitArgs[0]} => ${expr};`;
			} else {
				// Multiple implicit args
				return `const ${stmt.name} = (${implicitArgs.join(", ")}) => ${expr};`;
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
			throw new Error(`Unknown constant: ${expr.name}`);
		}

		if (expr.type === "UnaryOp") {
			return `(!${this.generateExpression(expr.argument)})`;
		}

		if (expr.type === "BinaryOp") {
			const left = this.generateExpression(expr.left);
			const right = this.generateExpression(expr.right);
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
		const greekLetters = /^[α-ω]$/;

		if (expr.type === "Variable" && greekLetters.test(expr.name)) {
			this.usedImplicitVars.add(expr.name);
		} else if (expr.type === "UnaryOp") {
			this.collectImplicitVars(expr.argument);
		} else if (expr.type === "BinaryOp") {
			this.collectImplicitVars(expr.left);
			this.collectImplicitVars(expr.right);
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
