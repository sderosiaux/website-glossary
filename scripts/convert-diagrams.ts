#!/usr/bin/env npx tsx

import { detectDiagrams } from "./detect-diagrams.js";
import { generateDiagramImage } from "./generate-diagram-image.js";
import { optimizeImage } from "./optimize-image.js";
import { replaceDiagram } from "./replace-diagrams.js";
import type { DiagramInfo, GeneratedImage, ConversionResult } from "./types.js";
import { mkdirSync } from "fs";

interface Options {
  dryRun: boolean;
  directory: string;
  outputDir: string;
  concurrency: number;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);

  return {
    dryRun: args.includes("--dry-run"),
    directory: args.find((a) => !a.startsWith("-")) || ".",
    outputDir: args.find((a, i) => args[i - 1] === "--output") || "./images/diagrams",
    concurrency: parseInt(args.find((a, i) => args[i - 1] === "--concurrency") || "3"),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processWithRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 2000
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries) throw error;
      console.log(`  Retry ${attempt}/${retries} after error: ${(error as Error).message}`);
      await sleep(delay * attempt);
    }
  }
  throw new Error("Unreachable");
}

async function main() {
  const options = parseArgs();

  console.log("=== ASCII Diagram to Image Converter ===\n");

  // Check API key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey && !options.dryRun) {
    console.error("Error: GEMINI_API_KEY environment variable required");
    console.error("Set it with: export GEMINI_API_KEY='your-key'");
    process.exit(1);
  }

  // Detect diagrams
  console.log(`Scanning directory: ${options.directory}`);
  const diagrams = detectDiagrams(options.directory);

  console.log(`Found ${diagrams.length} diagrams in ${new Set(diagrams.map((d) => d.fileName)).size} files\n`);

  if (diagrams.length === 0) {
    console.log("No diagrams to process.");
    return;
  }

  // Dry run mode - just show what would be done
  if (options.dryRun) {
    console.log("DRY RUN MODE - No changes will be made\n");
    for (const d of diagrams) {
      console.log(`Would process: ${d.fileName}:${d.lineStart}-${d.lineEnd}`);
      console.log(`  Label: ${d.label || "(auto-generated)"}`);
      console.log(`  Output: ${options.outputDir}/${d.slug}-${d.index}.webp`);
      console.log();
    }
    console.log(`\nTotal: ${diagrams.length} diagrams would be converted`);
    console.log(`Run without --dry-run to execute`);
    return;
  }

  // Ensure output directory exists
  mkdirSync(options.outputDir, { recursive: true });

  // Process diagrams
  const results: ConversionResult[] = [];
  let completed = 0;

  for (const diagram of diagrams) {
    completed++;
    const progress = `[${completed}/${diagrams.length}]`;

    console.log(`${progress} Processing: ${diagram.fileName}:${diagram.lineStart}`);

    try {
      // Generate image
      console.log(`  Generating image with Gemini...`);
      const rawImagePath = await processWithRetry(() =>
        generateDiagramImage(diagram, options.outputDir, apiKey!)
      );

      // Optimize
      console.log(`  Optimizing...`);
      const optimized = await optimizeImage(rawImagePath, diagram, options.outputDir);

      // Replace in markdown
      console.log(`  Updating markdown...`);
      replaceDiagram(optimized);

      results.push({ diagram, success: true, imagePath: optimized.webpPath });
      console.log(`  Done: ${optimized.webpPath}`);
    } catch (error) {
      const err = error as Error;
      console.error(`  Error: ${err.message}`);
      results.push({ diagram, success: false, error: err.message });
    }

    // Rate limiting - be nice to the API
    if (completed < diagrams.length) {
      await sleep(1000);
    }
  }

  // Summary
  console.log("\n=== Summary ===");
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\nFailed diagrams:");
    for (const f of failed) {
      console.log(`  - ${f.diagram.fileName}:${f.diagram.lineStart}: ${f.error}`);
    }
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
