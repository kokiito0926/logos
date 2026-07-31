#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LogosCompiler } from "./logos.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// CLI Helper Functions
// ============================================================================

function printUsage() {
	console.log(`
╔══════════════════════════════════════════════════════════╗
║           LOGOS Language - Compiler CLI                 ║
╚══════════════════════════════════════════════════════════╝

Usage: logos-cli <input-file> [options]

Options:
  --output, -o <file>   Save output to file (default: stdout)
  --verbose, -v         Show detailed compilation info
  --help, -h           Show this help message

Examples:
  logos-cli program.logos
  logos-cli program.logos --output program.js
  logos-cli program.logos -o program.js -v
  `);
}

function parseArgs(args) {
	const options = {
		input: null,
		output: null,
		verbose: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--help" || arg === "-h") {
			printUsage();
			process.exit(0);
		} else if (arg === "--verbose" || arg === "-v") {
			options.verbose = true;
		} else if (arg === "--output" || arg === "-o") {
			if (i + 1 < args.length) {
				options.output = args[++i];
			} else {
				console.error("Error: --output requires a file path");
				process.exit(1);
			}
		} else if (!arg.startsWith("-")) {
			if (!options.input) {
				options.input = arg;
			}
		}
	}

	return options;
}

function readFile(filePath) {
	try {
		return fs.readFileSync(filePath, "utf8");
	} catch (error) {
		console.error(`Error reading file: ${filePath}`);
		console.error(`  ${error.message}`);
		process.exit(1);
	}
}

function writeFile(filePath, content) {
	try {
		fs.writeFileSync(filePath, content, "utf8");
		console.log(`✓ Output written to: ${filePath}`);
	} catch (error) {
		console.error(`Error writing file: ${filePath}`);
		console.error(`  ${error.message}`);
		process.exit(1);
	}
}

function getFileInfo(filePath) {
	const ext = path.extname(filePath);
	const name = path.basename(filePath, ext);
	const dir = path.dirname(filePath);

	return {
		original: filePath,
		name,
		dir,
		output: path.join(dir, `${name}.js`),
	};
}

// ============================================================================
// Main CLI Logic
// ============================================================================

function main() {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		printUsage();
		process.exit(0);
	}

	const options = parseArgs(args);

	if (!options.input) {
		console.error("Error: Input file required");
		console.error("Run with --help for usage information");
		process.exit(1);
	}

	// Validate file exists
	if (!fs.existsSync(options.input)) {
		console.error(`Error: File not found: ${options.input}`);
		process.exit(1);
	}

	// Validate file extension
	if (!options.input.endsWith(".logos")) {
		console.error(`Error: Input file must have .logos extension`);
		process.exit(1);
	}

	try {
		// Read input file
		const code = readFile(options.input);

		if (options.verbose) {
			console.log(`📄 Input file: ${options.input}`);
			console.log(`📝 File size: ${code.length} bytes`);
			console.log(`\n▶ Compiling...`);
		}

		// Compile
		const compiler = new LogosCompiler();
		const jsCode = compiler.compile(code, options.verbose);

		if (options.verbose) {
			console.log(`\n✓ Compilation successful!`);
			console.log(`📦 Output size: ${jsCode.length} bytes`);
		}

		// Output
		const fileInfo = getFileInfo(options.input);
		const outputPath = options.output || fileInfo.output;

		if (options.output) {
			// Write to specified file
			writeFile(outputPath, jsCode);
		} else {
			// Check if default output file would overwrite
			if (fs.existsSync(outputPath)) {
				console.log(`📝 Generated JavaScript (would save to: ${outputPath}):`);
			} else {
				console.log(`📝 Generated JavaScript:`);
			}
			console.log("─".repeat(60));
			console.log(jsCode);
			console.log("─".repeat(60));
			console.log(`\nTo save output: logos-cli ${options.input} -o ${outputPath}`);
		}
	} catch (error) {
		console.error("\n❌ Compilation error:");
		console.error(`  ${error.message}`);
		if (options.verbose) {
			console.error(`\nStack trace:\n${error.stack}`);
		}
		process.exit(1);
	}
}

// ============================================================================
// Entry Point
// ============================================================================

main();
