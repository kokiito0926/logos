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
 * Runtime helpers for calculus symbols (∫, ∂, ∇). This prelude is prepended to
 * the generated JavaScript only when the source program uses one of those
 * symbols. All helpers use numerical methods:
 *   - simpson:   composite Simpson's rule for definite integrals
 *   - integrate: indefinite ∫ returns a function (lo, hi) => ∫_lo^hi f
 *   - partial:   ∂f/∂xᵢ returns a function (...point) => central finite
 *                difference of f along coordinate index i
 *   - gradient:  ∇f returns a vector field (...point) => [∂f/∂x1, ∂f/∂x2, ...]
 */
const CALCULUS_PRELUDE = `// Logos calculus runtime helpers (generated because ∫, ∂, or ∇ is used)
function simpson(a, b, f, n = 1000) {
    if (n % 2 !== 0) n++;
    const h = (b - a) / n;
    let sum = f(a) + f(b);
    for (let i = 1; i < n; i++) {
        sum += (i % 2 === 0 ? 2 : 4) * f(a + i * h);
    }
    return (sum * h) / 3;
}
function integrate(f) {
    return (lo, hi) => simpson(lo, hi, f);
}
function partial(f, index, h = 1e-6) {
    return (...point) => {
        const hi = [...point];
        hi[index] += h;
        const lo = [...point];
        lo[index] -= h;
        return (f(...hi) - f(...lo)) / (2 * h);
    };
}
function gradient(f, h = 1e-6) {
    const n = f.length || 1;
    return (...point) => Array.from({ length: n }, (_, i) => {
        const hi = [...point];
        hi[i] += h;
        const lo = [...point];
        lo[i] -= h;
        return (f(...hi) - f(...lo)) / (2 * h);
    });
}
`;


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
				"∫": "INT",
				"∂": "PARTIAL",
				"∇": "NABLA",
				"∮": "CONTOUR",
				"′": "PRIME",
				"″": "DOUBLE_PRIME",
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
			// `expr /∂ var` is not division: it is the trailing part of a
			// partial derivative (∂ expr /∂ var). Stop so the enclosing
			// parsePrimary PARTIAL handler can consume it.
			if (this.peek().type === "DIV" && this.peek(1) && this.peek(1).type === "PARTIAL") {
				break;
			}
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
			} else if (this.match("PRIME", "DOUBLE_PRIME")) {
				// Prime notation: f′ → first derivative, f″ → second derivative.
				const prime = this.advance();
				expr = { type: "Prime", expr, order: prime.type === "DOUBLE_PRIME" ? 2 : 1 };
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

		// Partial derivative: ∂ expr /∂ var  (e.g. ∂(α² + β²)/∂α)
		if (token.type === "PARTIAL") {
			this.advance(); // consume ∂
			const expr = this.parseExpression(); // stops before `/∂ var` (see parseMultiplicative)
			this.expect("DIV");
			this.expect("PARTIAL");
			const varName = this.expect("IDENT").value;
			return { type: "PartialDerivative", expr, var: varName };
		}

		// Integral: ∫ lower⁺upper f d<var>  (e.g. ∫₀¹ α² dα) or ∫ f d<var>
		if (token.type === "INT") {
			this.advance(); // consume ∫
			let lower = null;
			let upper = null;
			if (this.match("SUBSCRIPT")) {
				const sub = this.advance();
				lower = isNaN(Number(sub.value))
					? { type: "Variable", name: sub.value }
					: { type: "Literal", value: Number(sub.value) };
			}
			if (this.match("SUPERSCRIPT")) {
				upper = { type: "Literal", value: this.advance().value };
			}
			if ((lower !== null) !== (upper !== null)) {
				throw new Error("Integral ∫ requires both a lower and an upper bound (e.g. ∫₀¹ f dα) or neither");
			}
			const integrand = this.parseExpression(); // stops before `d <var>` or `dα`
			const next = this.peek();
			const nextNext = this.peek(1);
			if (next && next.type === "IDENT") {
				// `dα`, `dx`, `df` … the lexer fuses `d` and the variable into a
				// single identifier, so split off a leading `d`.
				const m = /^d([a-zA-Z_α-ω])$/.exec(next.value);
				if (m) {
					this.advance(); // consume d<var>
					return { type: "Integral", integrand, var: m[1], lower, upper };
				}
				// `d α` written with a space → two separate tokens.
				if (next.value === "d" && nextNext && nextNext.type === "IDENT") {
					this.advance(); // consume d
					const varName = this.advance().value;
					return { type: "Integral", integrand, var: varName, lower, upper };
				}
			}
			throw new Error(`Integral ∫ requires a differential "d<variable>" (e.g. ∫₀¹ α² dα), got ${next ? next.type : "EOF"}`);
		}

		// Gradient / nabla: ∇f (f is a function reference) or ∇(expr) (a field expression)
		if (token.type === "NABLA") {
			this.advance(); // consume ∇
			const expr = this.parseUnary();
			return { type: "Gradient", expr };
		}

		// Contour integral needs a complex-number runtime — not implemented yet.
		if (token.type === "CONTOUR") {
			throw new Error("∮（周回積分）は複素数ランタイムが必要なため、現在は実装されていません");
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

/**
 * True if `node` may depend on the variable `varName` (used to decide whether
 * a power/exponent is constant w.r.t. the differentiation variable).
 */
// Builtin math function names recognized in function calls; the generator
// emits the corresponding Math.* member so the output is valid JS.
const BUILTIN_MATH_FUNCS = {
	sin: "Math.sin",
	cos: "Math.cos",
	exp: "Math.exp",
	ln: "Math.log",
	sqrt: "Math.sqrt",
};

function sameNode(a, b) {
	if (a.type !== b.type) return false;
	switch (a.type) {
		case "Literal":
			return a.value === b.value;
		case "Variable":
		case "Constant":
			return a.name === b.name;
		case "UnaryOp":
			return a.op === b.op && sameNode(a.argument, b.argument);
		case "BinaryOp":
			return a.op === b.op && sameNode(a.left, b.left) && sameNode(a.right, b.right);
		case "FunctionCall":
			return (
				sameNode(a.callee, b.callee) &&
				a.args.length === b.args.length &&
				a.args.every((x, i) => sameNode(x, b.args[i]))
			);
		default:
			return false;
	}
}

function dependsOn(node, varName) {
	if (node.type === "Variable") return node.name === varName;
	if (node.type === "Literal" || node.type === "Constant") return false;
	if (node.type === "UnaryOp") return dependsOn(node.argument, varName);
	if (node.type === "BinaryOp") return dependsOn(node.left, varName) || dependsOn(node.right, varName);
	if (node.type === "FunctionCall") {
		return dependsOn(node.callee, varName) || node.args.some((a) => dependsOn(a, varName));
	}
	// Be conservative: unknown node shapes are treated as depending on the var.
	return true;
}

/**
 * Symbolically differentiate `expr` with respect to `varName`, returning a new
 * AST node for the exact derivative, or null when the expression is not
 * symbolically differentiable (function references, non-arithmetic operators,
 * etc.). Supports: constant rule, power rule, sum/difference, product,
 * quotient, and d/dx of sqrt.
 */
function differentiate(expr, varName) {
	switch (expr.type) {
		case "Literal":
		case "Constant":
			return { type: "Literal", value: 0 };

		case "Variable":
			return expr.name === varName
				? { type: "Literal", value: 1 }
				: { type: "Literal", value: 0 };

		case "UnaryOp": {
			// Numeric negation: d(−u) = −u'. Logical negation is not differentiable.
			if (expr.op === "-") {
				const d = differentiate(expr.argument, varName);
				if (d === null) return null;
				return { type: "UnaryOp", op: "-", argument: d };
			}
			return null;
		}

		case "BinaryOp": {
			const { left, right, op } = expr;
			if (op === "+" || op === "-") {
				const dl = differentiate(left, varName);
				const dr = differentiate(right, varName);
				if (dl === null || dr === null) return null;
				return { type: "BinaryOp", op, left: dl, right: dr };
			}
			if (op === "*") {
				const dl = differentiate(left, varName);
				const dr = differentiate(right, varName);
				if (dl === null || dr === null) return null;
				// d(uv) = u'v + uv'
				return {
					type: "BinaryOp",
					op: "+",
					left: { type: "BinaryOp", op: "*", left: dl, right },
					right: { type: "BinaryOp", op: "*", left, right: dr },
				};
			}
			if (op === "/") {
				const dl = differentiate(left, varName);
				const dr = differentiate(right, varName);
				if (dl === null || dr === null) return null;
				// d(u/v) = (u'v − uv') / v²
				const num = {
					type: "BinaryOp",
					op: "-",
					left: { type: "BinaryOp", op: "*", left: dl, right },
					right: { type: "BinaryOp", op: "*", left, right: dr },
				};
				const den = { type: "BinaryOp", op: "**", left: right, right: { type: "Literal", value: 2 } };
				return { type: "BinaryOp", op: "/", left: num, right: den };
			}
			if (op === "**") {
				// Power rule (constant exponent): d(u^v) = v·u^(v−1)·u'
				if (!dependsOn(right, varName)) {
					const dl = differentiate(left, varName);
					if (dl === null) return null;
					const vMinus1 = { type: "BinaryOp", op: "-", left: right, right: { type: "Literal", value: 1 } };
					const pow = { type: "BinaryOp", op: "**", left, right: vMinus1 };
					const coef = { type: "BinaryOp", op: "*", left: right, right: pow };
					return { type: "BinaryOp", op: "*", left: coef, right: dl };
				}
				// General power rule (variable exponent):
				// d(u^v) = u^v·(v'·ln(u) + v·u'/u)
				const dl = differentiate(left, varName);
				const dr = differentiate(right, varName);
				if (dl === null || dr === null) return null;
				const lnu = {
					type: "FunctionCall",
					callee: { type: "Variable", name: "ln" },
					args: [left],
				};
				const vPrimeLn = { type: "BinaryOp", op: "*", left: dr, right: lnu };
				const vDivU = {
					type: "BinaryOp",
					op: "/",
					left: { type: "BinaryOp", op: "*", left: right, right: dl },
					right: left,
				};
				const inner = { type: "BinaryOp", op: "+", left: vPrimeLn, right: vDivU };
				return { type: "BinaryOp", op: "*", left: expr, right: inner };
			}
			// Set ops, comparisons, composition, etc. — not differentiable.
			return null;
		}

		case "FunctionCall": {
			const calleeName =
				expr.callee && expr.callee.type === "Variable" ? expr.callee.name : null;
			// d(sqrt(u)) = u' / (2·sqrt(u))
			if (calleeName === "Math.sqrt" && expr.args.length === 1) {
				const du = differentiate(expr.args[0], varName);
				if (du === null) return null;
				const den = { type: "BinaryOp", op: "*", left: { type: "Literal", value: 2 }, right: expr };
				return { type: "BinaryOp", op: "/", left: du, right: den };
			}
			// Elementary functions (chain rule): d(f(u)) = f'(u)·u'
			if (expr.args.length === 1) {
				const u = expr.args[0];
				const du = differentiate(u, varName);
				if (du === null) return null;
				const mkCall = (name) => ({
					type: "FunctionCall",
					callee: { type: "Variable", name },
					args: [u],
				});
				if (calleeName === "sin") {
					return { type: "BinaryOp", op: "*", left: mkCall("cos"), right: du };
				}
				if (calleeName === "cos") {
					return {
						type: "BinaryOp",
						op: "*",
						left: { type: "UnaryOp", op: "-", argument: mkCall("sin") },
						right: du,
					};
				}
				if (calleeName === "exp") {
					return { type: "BinaryOp", op: "*", left: mkCall("exp"), right: du };
				}
				if (calleeName === "ln") {
					// d(ln u) = u' / u
					return { type: "BinaryOp", op: "/", left: du, right: u };
				}
			}
			return null;
		}

		default:
			return null;
	}
}

function isZero(node) {
	return node.type === "Literal" && node.value === 0;
}

function isOne(node) {
	return node.type === "Literal" && node.value === 1;
}

/**
 * Light simplification of an expression tree (constant folding, x±0, x·1,
 * x·0, x/1, x^1, x^0) so symbolic derivatives come out readable (e.g. 2α
 * instead of (2·α^(1)·1 + 0)).
 */
function simplifyExpr(node) {
	if (node.type === "BinaryOp") {
		const left = simplifyExpr(node.left);
		const right = simplifyExpr(node.right);
		const op = node.op;
		// Constant folding for arithmetic literals.
		if (left.type === "Literal" && right.type === "Literal" && ["+", "-", "*", "/", "**"].includes(op)) {
			const a = left.value;
			const b = right.value;
			if (op === "+") return { type: "Literal", value: a + b };
			if (op === "-") return { type: "Literal", value: a - b };
			if (op === "*") return { type: "Literal", value: a * b };
			if (op === "/" && b !== 0) return { type: "Literal", value: a / b };
			if (op === "**") return { type: "Literal", value: a ** b };
		}
		if (op === "+" && isZero(right)) return left;
		if (op === "+" && isZero(left)) return right;
		if (op === "-" && isZero(right)) return left;
		if (op === "*" && isOne(right)) return left;
		if (op === "*" && isOne(left)) return right;
		if (op === "*" && isZero(right)) return { type: "Literal", value: 0 };
		if (op === "*" && isZero(left)) return { type: "Literal", value: 0 };
		if (op === "/" && isOne(right)) return left;
		if (op === "/" && isZero(left)) return { type: "Literal", value: 0 };
		if (op === "/" && sameNode(left, right)) return { type: "Literal", value: 1 };
		if (op === "**" && isOne(right)) return left;
		if (op === "**" && isZero(right)) return { type: "Literal", value: 1 };
		if (op === "**" && isOne(left)) return { type: "Literal", value: 1 };
		if (op === "**" && isZero(left)) return { type: "Literal", value: 0 };
		return { type: "BinaryOp", op, left, right };
	}
	if (node.type === "UnaryOp") {
		const argument = simplifyExpr(node.argument);
		if (node.op === "-") {
			// −0 → 0, −(literal) → negated literal, −(−x) → x
			if (argument.type === "Literal") return { type: "Literal", value: -argument.value };
			if (argument.type === "UnaryOp" && argument.op === "-") return argument.argument;
		}
		return { type: "UnaryOp", op: node.op, argument };
	}
	if (node.type === "FunctionCall") {
		return { type: "FunctionCall", callee: node.callee, args: node.args.map(simplifyExpr) };
	}
	// Literal, Variable, Constant, and other leaves are already minimal.
	return node;
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
		// Set to true when ∫, ∂, or ∇ is generated; controls whether the
		// calculus runtime prelude is prepended to the output.
		this.usesCalculus = false;
	}

	generate() {
		const statements = this.ast.body.map((stmt) => this.generateStatement(stmt));
		const body = statements.join("\n");
		return this.usesCalculus ? `${CALCULUS_PRELUDE}${body}` : body;
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
			if (expr.op === "-") {
				return `(-${this.generateExpression(expr.argument)})`;
			}
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
			let callee = this.generateExpression(expr.callee);
			// Map known math function names to JS Math.* (e.g. sin(α) → Math.sin(α)).
			if (expr.callee && expr.callee.type === "Variable" && BUILTIN_MATH_FUNCS[expr.callee.name]) {
				callee = BUILTIN_MATH_FUNCS[expr.callee.name];
			}
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

		if (expr.type === "Integral") {
			this.usesCalculus = true;
			// `∫ f dα` where f is a function reference → simpson/integrate(f).
			if (expr.integrand.type === "Variable" && expr.integrand.name !== expr.var) {
				const f = this.generateExpression(expr.integrand);
				if (expr.lower && expr.upper) {
					const lower = this.generateExpression(expr.lower);
					const upper = this.generateExpression(expr.upper);
					return `simpson(${lower}, ${upper}, ${f})`;
				}
				return `integrate(${f})`;
			}
			// Otherwise bind the integration variable to an arrow:
			// `∫₀¹ α² dα` → simpson(0, 1, α => (α ** 2)).
			const integrand = this.generateExpression({
				type: "ArrowFunction",
				params: [expr.var],
				body: expr.integrand,
			});
			if (expr.lower && expr.upper) {
				const lower = this.generateExpression(expr.lower);
				const upper = this.generateExpression(expr.upper);
				return `simpson(${lower}, ${upper}, ${integrand})`;
			}
			return `integrate(${integrand})`;
		}

		if (expr.type === "PartialDerivative") {
			// `∂f/∂α` where f is a function reference → differentiate along its
			// first coordinate: partial(f, 0).
			if (expr.expr.type === "Variable" && expr.expr.name !== expr.var) {
				this.usesCalculus = true;
				return `partial(${this.generateExpression(expr.expr)}, 0)`;
			}
			// Bind every free Greek letter of the field to an arrow parameter:
			// `∂(α² + β²)/∂β` → (α, β) => (2 * β).
			const tempGen = new Generator({ body: [] });
			tempGen.collectImplicitVars(expr.expr, this.currentLocals);
			const params = Array.from(tempGen.usedImplicitVars).sort();
			// Exact symbolic derivative when the field is differentiable:
			// `∂(α² + β²)/∂α` → (α, β) => (2 * α).
			const derivative = differentiate(expr.expr, expr.var);
			if (derivative !== null) {
				const exact = simplifyExpr(derivative);
				return this.generateExpression({
					type: "ArrowFunction",
					params,
					body: exact,
				});
			}
			// Numeric fallback (finite differences) for non-symbolic fields.
			this.usesCalculus = true;
			const index = params.indexOf(expr.var);
			if (index === -1) {
				// var is not a Greek letter present in the field; fall back to
				// the first coordinate.
				const arrow = this.generateExpression({
					type: "ArrowFunction",
					params: [expr.var],
					body: expr.expr,
				});
				return `partial(${arrow}, 0)`;
			}
			const arrow = this.generateExpression({
				type: "ArrowFunction",
				params,
				body: expr.expr,
			});
			return `partial(${arrow}, ${index})`;
		}

		if (expr.type === "Gradient") {
			// `∇f` where f is a function reference → gradient(f).
			if (expr.expr.type === "Variable") {
				this.usesCalculus = true;
				return `gradient(${this.generateExpression(expr.expr)})`;
			}
			// Bind every free Greek letter of the field as arrow parameters.
			const tempGen = new Generator({ body: [] });
			tempGen.collectImplicitVars(expr.expr, this.currentLocals);
			const params = Array.from(tempGen.usedImplicitVars).sort();
			// Symbolic gradient when every partial derivative is exact:
			// `∇(α² + β²)` → (α, β) => [(2 * α), (2 * β)].
			const components = [];
			let symbolic = true;
			for (const p of params) {
				const d = differentiate(expr.expr, p);
				if (d === null) {
					symbolic = false;
					break;
				}
				components.push(this.generateExpression(simplifyExpr(d)));
			}
			if (symbolic) {
				const paramsStr = params.length === 1 ? params[0] : params.length === 0 ? "()" : `(${params.join(", ")})`;
				return `${paramsStr} => [${components.join(", ")}]`;
			}
			// Numeric fallback (finite differences).
			this.usesCalculus = true;
			const arrow = this.generateExpression({
				type: "ArrowFunction",
				params,
				body: expr.expr,
			});
			return `gradient(${arrow})`;
		}

		if (expr.type === "Prime") {
			// `f′` / `f″` on a function reference → numeric partial derivative
			// along the first coordinate: partial(f, 0), partial(partial(f, 0), 0).
			if (expr.expr.type === "Variable") {
				this.usesCalculus = true;
				let inner = `partial(${this.generateExpression(expr.expr)}, 0)`;
				for (let i = 1; i < expr.order; i++) {
					inner = `partial(${inner}, 0)`;
				}
				return inner;
			}
			// Inline arrow: `(α ↦ α²)′` → differentiate the body w.r.t. the
			// first parameter: α => (2 * α).
			if (expr.expr.type === "ArrowFunction") {
				const arrowExpr = expr.expr;
				if (arrowExpr.params.length === 0) {
					throw new Error("Prime (′) on an arrow requires at least one parameter");
				}
				const varName = arrowExpr.params[0];
				let derivative = arrowExpr.body;
				let numeric = false;
				for (let i = 0; i < expr.order; i++) {
					const d = differentiate(derivative, varName);
					if (d === null) {
						numeric = true;
						break;
					}
					derivative = simplifyExpr(d);
				}
				if (!numeric) {
					const paramsStr = arrowExpr.params.length === 1 ? arrowExpr.params[0] : `(${arrowExpr.params.join(", ")})`;
					return `${paramsStr} => ${this.generateExpression(derivative)}`;
				}
				this.usesCalculus = true;
				return `partial(${this.generateExpression(arrowExpr)}, 0)`;
			}
			// Field expression: `(α²)′` → exact derivative w.r.t. the first free
			// Greek variable of the expression: α => (2 * α).
			const tempGen = new Generator({ body: [] });
			tempGen.collectImplicitVars(expr.expr, this.currentLocals);
			const params = Array.from(tempGen.usedImplicitVars).sort();
			if (params.length === 0) {
				throw new Error("Prime (′) requires a function reference or an expression containing a Greek variable");
			}
			const varName = params[0];
			let derivative = expr.expr;
			let numeric = false;
			for (let i = 0; i < expr.order; i++) {
				const d = differentiate(derivative, varName);
				if (d === null) {
					numeric = true;
					break;
				}
				derivative = simplifyExpr(d);
			}
			if (!numeric) {
				return this.generateExpression({
					type: "ArrowFunction",
					params,
					body: derivative,
				});
			}
			this.usesCalculus = true;
			const arrow = this.generateExpression({
				type: "ArrowFunction",
				params,
				body: expr.expr,
			});
			return `partial(${arrow}, 0)`;
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
		} else if (expr.type === "Integral") {
			// Bounds are evaluated in the outer scope.
			if (expr.lower) this.collectImplicitVars(expr.lower, enclosingLocals);
			if (expr.upper) this.collectImplicitVars(expr.upper, enclosingLocals);
			// The integration variable is bound inside the generated arrow
			// (var => integrand); other free Greek letters are captured from
			// the enclosing scope.
			const tempGen = new Generator({ body: [] });
			tempGen.collectImplicitVars(expr.integrand, enclosingLocals);
			tempGen.usedImplicitVars.forEach((v) => {
				if (v !== expr.var) {
					this.usedImplicitVars.add(v);
				}
			});
		} else if (expr.type === "PartialDerivative") {
			// `∂f/∂α` where f is a function reference captures f from the
			// enclosing scope; the differentiation variable α only selects the
			// coordinate and is not bound. For a field expression
			// `∂(expr)/∂α` the derivative is self-contained: every free Greek
			// letter of expr becomes an arrow parameter, so nothing leaks.
			if (expr.expr.type === "Variable" && expr.expr.name !== expr.var) {
				const name = expr.expr.name;
				const greekLetters = /^[α-ω](_[0-9a-zA-Z]+)?$/;
				if (greekLetters.test(name) && !enclosingLocals.has(name)) {
					this.usedImplicitVars.add(name);
				}
			}
		} else if (expr.type === "Gradient") {
			// `∇f` where f is a function reference captures f from the enclosing
			// scope. For a field expression `∇(expr)` the gradient is
			// self-contained: every free Greek letter of expr becomes an arrow
			// parameter, so nothing leaks.
			if (expr.expr.type === "Variable") {
				const name = expr.expr.name;
				const greekLetters = /^[α-ω](_[0-9a-zA-Z]+)?$/;
				if (greekLetters.test(name) && !enclosingLocals.has(name)) {
					this.usedImplicitVars.add(name);
				}
			}
		} else if (expr.type === "Prime") {
			// `f′` where f is a function reference captures f from the enclosing
			// scope (like ∂f/∂α). For an arrow `(α ↦ …)′` or a field expression
			// `(expr)′` the derivative is self-contained, so nothing leaks.
			if (expr.expr.type === "Variable") {
				const name = expr.expr.name;
				const greekLetters = /^[α-ω](_[0-9a-zA-Z]+)?$/;
				if (greekLetters.test(name) && !enclosingLocals.has(name)) {
					this.usedImplicitVars.add(name);
				}
			}
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
