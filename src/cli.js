#!/usr/bin/env node

import path from "node:path";
import { argv, echo, fs } from "zx";
import { LogosCompiler } from "./index.js";

function main() {
	if (argv.help || argv.h) {
		echo(`
Usage: zx src/cli.zx.js <input-file> [options]

Options:
  --output, -o <file>  Save output to a file (default: stdout)
  --verbose, -v        Show tokens, AST, and generated JavaScript
  --help, -h           Show this help message

Examples:
  zx src/cli.zx.js program.logos
  zx src/cli.zx.js program.logos --output program.js
`);
		return;
	}

	const input = argv._[0];
	const output = argv.output ?? argv.o;
	const verbose = Boolean(argv.verbose ?? argv.v);

	if (!input) {
		console.error("Error: Input file required. Run with --help for usage information.");
		process.exitCode = 1;
		return;
	}

	if (!input.endsWith(".logos")) {
		console.error("Error: Input file must have a .logos extension.");
		process.exitCode = 1;
		return;
	}

	if (!fs.existsSync(input)) {
		console.error(`Error: File not found: ${input}`);
		process.exitCode = 1;
		return;
	}

	try {
		const code = fs.readFileSync(input, "utf8");
		const jsCode = new LogosCompiler().compile(code, verbose);
		const defaultOutput = path.join(
			path.dirname(input),
			`${path.basename(input, path.extname(input))}.js`,
		);

		if (output) {
			fs.outputFileSync(output, jsCode, "utf8");
			echo(`Output written to: ${output}`);
			return;
		}

		echo(`Generated JavaScript${fs.existsSync(defaultOutput) ? ` (would save to: ${defaultOutput})` : ""}:`);
		echo("─".repeat(60));
		echo(jsCode);
		echo("─".repeat(60));
		echo(`To save output: zx src/cli.zx.js ${input} -o ${defaultOutput}`);
	} catch (error) {
		console.error(`Error: Compilation error: ${error.message}`);
		process.exitCode = 1;
		if (verbose && error.stack) console.error(error.stack);
	}
}

main();