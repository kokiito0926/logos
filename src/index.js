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


/**
 * Collect the names from `innerNames` that occur as free variables in `expr`
 * (respecting shadowing by arrow params and quantifier bound vars).
 */
function collectInnerRefs(expr, innerNames) {
	const refs = new Set();

	function walk(node, bound) {
		if (node.type === "Variable") {
			if (innerNames.has(node.name) && !bound.has(node.name)) {
				refs.add(node.name);
			}
			return;
		}
		if (node.type === "ArrowFunction") {
			const nextBound = new Set(bound);
			node.params.forEach((p) => nextBound.add(p));
			walk(node.body, nextBound);
			return;
		}
		if (node.type === "Quantifier") {
			const nextBound = new Set(bound);
			nextBound.add(node.var);
			walk(node.collection, bound);
			walk(node.body, nextBound);
			return;
		}
		if (node.type === "UnaryOp") {
			walk(node.argument, bound);
			return;
		}
		if (node.type === "BinaryOp") {
			walk(node.left, bound);
			walk(node.right, bound);
			return;
		}
		if (node.type === "ChainComparison") {
			node.comparisons.forEach((c) => {
				walk(c.left, bound);
				walk(c.right, bound);
			});
			return;
		}
		if (node.type === "Range") {
			walk(node.start, bound);
			walk(node.end, bound);
			return;
		}
		if (node.type === "MemberAccess") {
			walk(node.object, bound);
			return;
		}
		if (node.type === "IndexAccess") {
			walk(node.object, bound);
			walk(node.index, bound);
			return;
		}
		if (node.type === "FunctionCall") {
			walk(node.callee, bound);
			node.args.forEach((arg) => walk(arg, bound));
			return;
		}
		if (node.type === "Pipeline") {
			walk(node.input, bound);
			walk(node.func, bound);
			return;
		}
		if (node.type === "Block") {
			// The block's own definitions shadow outer names inside the block.
			const nextBound = new Set(bound);
			node.statements.forEach((s) => {
				if (s.type === "Definition") nextBound.add(s.name);
			});
			node.statements.forEach((s) => {
				if (s.type === "Definition") walk(s.value, nextBound);
				else walk(s.expr, nextBound);
			});
			return;
		}
		// Literal, Constant — leaves
	}

	walk(expr, new Set());
	return refs;
}

export class Lexer {
	constructor(input) {
		this.input = input;
		this.pos = 0;
		// Depth of open parentheses/brackets. While non-zero, newlines and
		// indentation are insignificant (multi-line parenthesized expressions).
		this.parenDepth = 0;
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
		// Indentation stack of open block levels (base level is 0).
		const indentStack = [0];
		// True while we have not yet read any token on the current line.
		let lineStart = true;

		const emitNewline = () => {
			// Newlines inside parentheses/brackets are insignificant.
			if (this.parenDepth === 0) {
				tokens.push({ type: "NEWLINE", value: "\n" });
			}
		};

		while (this.pos < this.input.length) {
			// At the start of a line, measure indentation and emit INDENT/DEDENT.
			if (lineStart) {
				lineStart = false;
				// Inside parentheses/brackets, line structure is insignificant.
				if (this.parenDepth > 0) {
					this.skipWhitespace();
					continue;
				}
				let indent = 0;
				while (this.pos < this.input.length && /[ \t]/.test(this.peek())) {
					indent += this.peek() === "\t" ? 4 : 1;
					this.advance();
				}
				if (this.pos >= this.input.length) break;
				// Blank line: does not affect indentation, but emits a NEWLINE below.
				if (this.peek() === "\r" || this.peek() === "\n") continue;

				const current = indentStack[indentStack.length - 1];
				if (indent > current) {
					indentStack.push(indent);
					tokens.push({ type: "INDENT", value: indent });
				} else if (indent < current) {
					while (indentStack.length > 1 && indentStack[indentStack.length - 1] > indent) {
						indentStack.pop();
						tokens.push({ type: "DEDENT", value: null });
					}
					if (indentStack[indentStack.length - 1] !== indent) {
						throw new Error(`Inconsistent indentation: expected ${indentStack[indentStack.length - 1]}, got ${indent}`);
					}
				}
				continue;
			}

			// Treat CR, LF, or CRLF as significant newline tokens so the parser can detect multi-line blocks
			if (this.peek() === '\r') {
				this.advance();
				if (this.peek() === '\n') this.advance();
				emitNewline();
				lineStart = true;
				continue;
			}
			if (this.peek() === '\n') {
				this.advance();
				emitNewline();
				lineStart = true;
				continue;
			}
			this.skipWhitespace();
			if (this.pos >= this.input.length) break;
			// After skipping spaces, handle any newline characters that remained (e.g., blank lines)
			if (this.peek() === '\r') {
				this.advance();
				if (this.peek() === '\n') this.advance();
				emitNewline();
				lineStart = true;
				continue;
			}
			if (this.peek() === '\n') {
				this.advance();
				emitNewline();
				lineStart = true;
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

			if (twoChar === "|>") {
				this.advance();
				this.advance();
				tokens.push({ type: "PIPE", value: "|>" });
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
				"∄": "NOTEXISTS",
				"∑": "SUM",
				"∏": "PRODUCT",
				"∈": "IN",
				"∉": "NOTIN",
				"∩": "INTERSECT",
				"∪": "UNION",
				"⊆": "SUBSET",
				"⊂": "PROPER_SUBSET",
				"∖": "SETDIFF",
				"×": "CARTESIAN",
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

			// Track bracket depth so newlines inside parens/brackets are insignificant.
			if (char === "(" || char === "[") this.parenDepth++;
			if (char === ")" || char === "]") this.parenDepth = Math.max(0, this.parenDepth - 1);

			if (symbolMap[char]) {
				tokens.push({ type: symbolMap[char], value: this.advance() });
				continue;
			}

			throw new Error(`Unexpected character: ${char} at position ${this.pos}`);
		}

		// Close any open indentation levels at end of input.
		while (indentStack.length > 1) {
			indentStack.pop();
			tokens.push({ type: "DEDENT", value: null });
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

	parseStatement(inBlock = false) {
		const token = this.peek();
		if (token.type === "IDENT" && this.peek(1) && this.peek(1).type === "ASSIGN") {
			const name = this.advance().value;
			this.advance(); // consume ≔
			// Support block-style definitions:
			if (this.match("NEWLINE")) {
				while (this.match("NEWLINE")) {
					this.advance();
				}
				if (!this.match("INDENT")) {
					throw new Error(`Expected INDENT after block definition, got ${this.peek().type}`);
				}
				this.advance();
				const statements = this.parseBlockStatements();
				return { type: "Definition", name, value: { type: "Block", statements } };
			} else {
				const value = this.parseExpression();
				return { type: "Definition", name, value };
			}
		}
		if (inBlock) {
			// Expression statement inside a block (function call, reassignment, return value...)
			const expr = this.parseExpression();
			return { type: "ExprStmt", expr };
		}
		throw new Error(`Unexpected token: ${token.type}`);
	}

	parseBlockStatements() {
		const statements = [];
		while (!this.match("DEDENT") && !this.match("EOF")) {
			while (this.match("NEWLINE")) {
				this.advance();
			}
			if (this.match("DEDENT") || this.match("EOF")) break;
			const stmt = this.parseStatement(true);
			statements.push(stmt);
		}
		this.expect("DEDENT");
		if (statements.length === 0) {
			throw new Error("Empty block");
		}
		return statements;
	}

	parseExpression() {
		return this.parseQuantifier();
	}

	parseQuantifier() {
		if (this.match("FORALL", "EXISTS", "NOTEXISTS", "SUM", "PRODUCT")) {
			const quant = this.advance();
			const boundVar = this.expect("IDENT").value;
			this.expect("IN");
			const collection = this.parseExpression();
			this.expect("COLON");
			// Body may start on the next line (optionally indented)
			while (this.match("NEWLINE")) {
				this.advance();
			}
			let body;
			if (this.match("INDENT")) {
				this.advance();
				body = this.parseExpression();
				while (this.match("NEWLINE")) {
					this.advance();
				}
				this.expect("DEDENT");
			} else {
				body = this.parseExpression();
			}
			const quantifier =
				quant.type === "FORALL" ? "∀" :
				quant.type === "EXISTS" ? "∃" :
				quant.type === "NOTEXISTS" ? "∄" :
				quant.type === "SUM" ? "∑" : "∏";
			return { type: "Quantifier", quantifier, var: boundVar, collection, body };
		}
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

		return this.parsePipeline();
	}

	parsePipeline() {
		// Pipeline: a |> f(b) |> g  →  g(f(a, b))
		// Binds loosest (right after arrow functions), so the left side captures
		// the full expression (e.g. x + 1 |> f means f(x + 1)).
		let left = this.parseImplies();

		while (this.match("PIPE")) {
			this.advance();
			const right = this.parseImplies();
			const isCallable = ["Variable", "MemberAccess", "FunctionCall", "ArrowFunction"].includes(right.type)
				|| (right.type === "BinaryOp" && right.op === "∘");
			if (!isCallable) {
				throw new Error(`Pipeline operator (|>) requires a function call or reference on the right-hand side, got ${right.type}`);
			}
			left = { type: "Pipeline", input: left, func: right };
		}

		return left;
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
			SUBSET: "⊆",
			PROPER_SUBSET: "⊂",
		};

		let left = this.parseSetUnion();
		if (!this.match("EQ", "NEQ", "CONGRUENT", "APPROX", "LT", "GT", "LTE", "GTE", "IN", "NOTIN", "SUBSET", "PROPER_SUBSET")) {
			return left;
		}

		// Chain comparison: 0 ≤ α ≤ 10 → (0 <= α) && (α <= 10)
		// Each right operand also becomes the left operand of the next comparison.
		const comparisons = [];
		while (this.match("EQ", "NEQ", "CONGRUENT", "APPROX", "LT", "GT", "LTE", "GTE", "IN", "NOTIN", "SUBSET", "PROPER_SUBSET")) {
			const token = this.advance();
			const right = this.parseSetUnion();
			comparisons.push({ left, op: operatorMap[token.type], right });
			left = right;
		}

		if (comparisons.length === 1) {
			const { left: l, op, right } = comparisons[0];
			return { type: "BinaryOp", op, left: l, right };
		}

		return { type: "ChainComparison", comparisons };
	}

	// Set operations bind tighter than comparisons (so α ∈ A ∩ B means α ∈ (A ∩ B))
	// but looser than arithmetic: ∪ < ∩ < ∖ < ×
	parseSetUnion() {
		let left = this.parseSetIntersect();

		while (this.match("UNION")) {
			this.advance();
			const right = this.parseSetIntersect();
			left = { type: "BinaryOp", op: "∪", left, right };
		}

		return left;
	}

	parseSetIntersect() {
		let left = this.parseAdditive();

		while (this.match("INTERSECT")) {
			this.advance();
			const right = this.parseAdditive();
			left = { type: "BinaryOp", op: "∩", left, right };
		}

		return left;
	}

	parseAdditive() {
		let left = this.parseMultiplicative();

		while (this.match("PLUS", "MINUS", "SETDIFF")) {
			const op = this.advance().value;
			const right = this.parseMultiplicative();
			left = { type: "BinaryOp", op, left, right };
		}

		return left;
	}

	parseMultiplicative() {
		let left = this.parseUnary();

		while (this.match("MUL", "DIV", "CARTESIAN")) {
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
			} else if (this.match("LPAREN")) {
				// Function call: f(a, b) → f(a, b)
				this.advance();
				const args = [];
				if (!this.match("RPAREN")) {
					args.push(this.parseExpression());
					while (this.match("COMMA")) {
						this.advance();
						args.push(this.parseExpression());
					}
				}
				this.expect("RPAREN");
				expr = { type: "FunctionCall", callee: expr, args };
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
			return { type: "FunctionCall", callee: { type: "Variable", name: "Math.sqrt" }, args: [arg] };
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

/**
 * Order a list of block definitions so each definition appears after every
 * definition it references (dependencies first), allowing forward references.
 * Throws on circular references.
 */
function topoSortDefs(defs) {
	const byName = new Map(defs.map((d) => [d.name, d]));
	const innerNames = new Set(defs.map((d) => d.name));
	const state = new Map(); // name -> 0 (visiting) | 1 (done)
	const order = [];

	function visit(name) {
		if (state.get(name) === 1) return;
		if (state.get(name) === 0) throw new Error(`Circular reference in block: ${name}`);
		state.set(name, 0);
		const def = byName.get(name);
		if (def) {
			for (const dep of collectInnerRefs(def.value, innerNames)) {
				visit(dep);
			}
		}
		state.set(name, 1);
		order.push(name);
	}

	for (const d of defs) visit(d.name);
	return order;
}

export class Generator {
	constructor(ast) {
		this.ast = ast;
		this.usedImplicitVars = new Set();
		// Names in scope around the block currently being generated (used so a
		// nested block does not treat an enclosing block's locals as its own
		// implicit arguments).
		this.currentLocals = new Set();
		this.blockDepth = 0;
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
				// A block whose body is a single expression is equivalent to a
				// plain expression definition (implicit return).
				if (stmt.value.statements.length === 1 && stmt.value.statements[0].type === "ExprStmt") {
					return this.generateExpressionDefinition(stmt.name, stmt.value.statements[0].expr);
				}
				const arrow = this.generateBlockExpression(stmt.value, new Set());
				return `const ${stmt.name} = ${arrow};`;
			} else {
				return this.generateExpressionDefinition(stmt.name, stmt.value);
			}
		}
		throw new Error(`Unknown statement type: ${stmt.type}`);
	}

	generateExpressionDefinition(name, value) {
		this.collectImplicitVars(value);
		const implicitArgs = Array.from(this.usedImplicitVars).sort();
		let expr = this.generateExpression(value);
		if (value && value.type === 'BinaryOp' && value.op === '*' && value.left && value.left.type === 'Literal' && value.right && value.right.type === 'BinaryOp' && value.right.op === '**') {
			expr = `(${expr})`;
		}
		if (implicitArgs.length === 0) {
			return `const ${name} = ${expr};`;
		} else if (implicitArgs.length === 1) {
			return `const ${name} = ${implicitArgs[0]} => ${expr};`;
		} else {
			return `const ${name} = (${implicitArgs.join(", ")}) => ${expr};`;
		}
	}

	generateBlockExpression(block, enclosingLocals) {
		const stmts = block.statements;

		// A block whose body is a single expression is an implicit-return function.
		if (stmts.length === 1 && stmts[0].type === "ExprStmt") {
			this.usedImplicitVars = new Set();
			this.collectImplicitVars(stmts[0].expr, enclosingLocals);
			const implicitArgs = Array.from(this.usedImplicitVars).sort();
			let expr = this.generateExpression(stmts[0].expr);
			if (stmts[0].expr.type === 'BinaryOp' && stmts[0].expr.op === '*' && stmts[0].expr.left.type === 'Literal' && stmts[0].expr.right.type === 'BinaryOp' && stmts[0].expr.right.op === '**') {
				expr = `(${expr})`;
			}
			const paramStr = implicitArgs.length === 0 ? "()" : implicitArgs.length === 1 ? implicitArgs[0] : `(${implicitArgs.join(", ")})`;
			return `${paramStr} => ${expr}`;
		}

		const localNames = new Set(stmts.filter((s) => s.type === "Definition").map((s) => s.name));
		const childLocals = new Set([...enclosingLocals, ...localNames]);

		// Implicit arguments: free Greek-letter variables referenced by the block
		// body, excluding the block's own local definitions.
		this.usedImplicitVars = new Set();
		for (const s of stmts) {
			if (s.type === "Definition") {
				this.collectImplicitVars(s.value, childLocals);
			} else {
				this.collectImplicitVars(s.expr, childLocals);
			}
		}
		localNames.forEach((n) => this.usedImplicitVars.delete(n));
		const implicitArgs = Array.from(this.usedImplicitVars).sort();

		// Emit local definitions in dependency order so forward references work.
		const defs = stmts.filter((s) => s.type === "Definition");
		const defOrder = topoSortDefs(defs);
		const defByName = new Map(defs.map((d) => [d.name, d]));

		const prevLocals = this.currentLocals;
		const prevDepth = this.blockDepth;
		this.currentLocals = childLocals;
		this.blockDepth = prevDepth + 1;
		const bodyIndent = "    ".repeat(this.blockDepth);
		const closeIndent = "    ".repeat(prevDepth);
		const bodyLines = [];
		for (const name of defOrder) {
			const value = this.generateExpression(defByName.get(name).value);
			bodyLines.push(`${bodyIndent}const ${name} = ${value};`);
		}
		// Side-effecting expression statements (everything except the last).
		for (let i = 0; i < stmts.length - 1; i++) {
			const s = stmts[i];
			if (s.type === "ExprStmt") {
				bodyLines.push(`${bodyIndent}${this.generateExpression(s.expr)};`);
			}
		}
		// Implicit return: the value of the last statement.
		const last = stmts[stmts.length - 1];
		const returnStr = last.type === "Definition" ? last.name : this.generateExpression(last.expr);
		bodyLines.push(`${bodyIndent}return ${returnStr};`);
		this.currentLocals = prevLocals;
		this.blockDepth = prevDepth;

		const paramStr = implicitArgs.length === 0 ? "()" : implicitArgs.length === 1 ? implicitArgs[0] : `(${implicitArgs.join(", ")})`;
		return `${paramStr} => {\n${bodyLines.join("\n")}\n${closeIndent}}`;
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
			if (expr.op === "∩") {
				return `new Set([...${left}].filter(x => ${right}.has(x)))`;
			}
			if (expr.op === "∪") {
				return `new Set([...${left}, ...${right}])`;
			}
			if (expr.op === "∖") {
				return `new Set([...${left}].filter(x => !${right}.has(x)))`;
			}
			if (expr.op === "×") {
				return `new Set([...${left}].flatMap(a => [...${right}].map(b => [a, b])))`;
			}
			if (expr.op === "⊆") {
				return `([...${left}].every(x => ${right}.has(x)))`;
			}
			if (expr.op === "⊂") {
				return `([...${left}].every(x => ${right}.has(x)) && ${left}.size < ${right}.size)`;
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
			const callee = this.generateExpression(expr.callee);
			const args = expr.args.map((arg) => this.generateExpression(arg)).join(", ");
			return `${callee}(${args})`;
		}

		if (expr.type === "Pipeline") {
			const input = this.generateExpression(expr.input);
			const func = expr.func;

			if (func.type === "FunctionCall") {
				const callee = this.generateExpression(func.callee);
				const args = func.args.map((arg) => this.generateExpression(arg)).join(", ");
				return `${callee}(${args ? `${input}, ${args}` : input})`;
			}

			if (func.type === "Variable" || func.type === "MemberAccess") {
				const callee = this.generateExpression(func);
				return `${callee}(${input})`;
			}

			if (func.type === "ArrowFunction" || (func.type === "BinaryOp" && func.op === "∘")) {
				return `(${this.generateExpression(func)})(${input})`;
			}

			throw new Error(`Pipeline operator (|>) requires a function call or reference on the right-hand side, got ${func.type}`);
		}

		if (expr.type === "Quantifier") {
			const collection = this.generateExpression(expr.collection);
			const body = this.generateExpression(expr.body);
			const arrow = `${expr.var} => ${body}`;
			// Spread the collection so arrays and Sets both work (Set has no .every/.some/.reduce).
			const items = `[...${collection}]`;
			if (expr.quantifier === "∀") {
				return `${items}.every(${arrow})`;
			}
			if (expr.quantifier === "∃") {
				return `${items}.some(${arrow})`;
			}
			if (expr.quantifier === "∄") {
				return `!${items}.some(${arrow})`;
			}
			if (expr.quantifier === "∑") {
				return `${items}.reduce((acc, ${expr.var}) => acc + ${body}, 0)`;
			}
			// ∏: product
			return `${items}.reduce((acc, ${expr.var}) => acc * ${body}, 1)`;
		}

		if (expr.type === "Block") {
			return this.generateBlockExpression(expr, this.currentLocals);
		}

		throw new Error(`Unknown expression type: ${expr.type}`);
	}

	collectImplicitVars(expr, enclosingLocals = new Set()) {
		const greekLetters = /^[α-ω](_[0-9a-zA-Z]+)?$/;

		if (expr.type === "Variable" && greekLetters.test(expr.name) && !enclosingLocals.has(expr.name)) {
			this.usedImplicitVars.add(expr.name);
		} else if (expr.type === "ArrowFunction") {
			const tempGen = new Generator({ body: [] });
			tempGen.collectImplicitVars(expr.body, enclosingLocals);
			tempGen.usedImplicitVars.forEach(v => {
				if (!expr.params.includes(v)) {
					this.usedImplicitVars.add(v);
				}
			});
		} else if (expr.type === "UnaryOp") {
			this.collectImplicitVars(expr.argument, enclosingLocals);
		} else if (expr.type === "BinaryOp") {
			this.collectImplicitVars(expr.left, enclosingLocals);
			this.collectImplicitVars(expr.right, enclosingLocals);
		} else if (expr.type === "ChainComparison") {
			expr.comparisons.forEach((c) => {
				this.collectImplicitVars(c.left, enclosingLocals);
				this.collectImplicitVars(c.right, enclosingLocals);
			});
		} else if (expr.type === "Range") {
			this.collectImplicitVars(expr.start, enclosingLocals);
			this.collectImplicitVars(expr.end, enclosingLocals);
		} else if (expr.type === "MemberAccess") {
			this.collectImplicitVars(expr.object, enclosingLocals);
		} else if (expr.type === "IndexAccess") {
			this.collectImplicitVars(expr.object, enclosingLocals);
			this.collectImplicitVars(expr.index, enclosingLocals);
		} else if (expr.type === "FunctionCall") {
			this.collectImplicitVars(expr.callee, enclosingLocals);
			expr.args.forEach((arg) => this.collectImplicitVars(arg, enclosingLocals));
		} else if (expr.type === "Pipeline") {
			this.collectImplicitVars(expr.input, enclosingLocals);
			this.collectImplicitVars(expr.func, enclosingLocals);
		} else if (expr.type === "Quantifier") {
			// The collection is evaluated in the outer scope, so collect its implicit vars normally.
			this.collectImplicitVars(expr.collection, enclosingLocals);
			// The bound variable shadows the outer scope inside the body: exclude it,
			// but still collect any other implicit vars referenced by the body.
			const tempGen = new Generator({ body: [] });
			tempGen.collectImplicitVars(expr.body, enclosingLocals);
			tempGen.usedImplicitVars.forEach((v) => {
				if (v !== expr.var) {
					this.usedImplicitVars.add(v);
				}
			});
		} else if (expr.type === "Block") {
			// A nested block is self-contained: its own definitions shadow enclosing
			// locals, and its implicit arguments are computed when it is generated.
			// Nothing is contributed to the enclosing scope here.
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
