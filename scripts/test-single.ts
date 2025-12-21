#!/usr/bin/env npx tsx

import { detectDiagrams } from "./detect-diagrams.js";
import { generateDiagramImage } from "./generate-diagram-image.js";
import { optimizeImage } from "./optimize-image.js";
import { replaceDiagram } from "./replace-diagrams.js";
import { mkdirSync } from "fs";

const TARGET_FILE = process.argv[2] || "apache-iceberg.md";
const OUTPUT_DIR = "./images/diagrams";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY required");
    process.exit(1);
  }

  // Detect all diagrams and filter to target file
  const allDiagrams = detectDiagrams(".");
  const diagrams = allDiagrams.filter((d) => d.fileName === TARGET_FILE);

  if (diagrams.length === 0) {
    console.log(`No diagrams found in ${TARGET_FILE}`);
    return;
  }

  console.log(`Found ${diagrams.length} diagram(s) in ${TARGET_FILE}\n`);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const diagram of diagrams) {
    console.log(`Processing: ${diagram.fileName}:${diagram.lineStart}`);
    console.log(`Label: ${diagram.label || "(none)"}`);
    console.log(`Article: ${diagram.articleMeta.title}`);
    console.log(`Topics: ${diagram.articleMeta.topics.join(", ")}`);
    console.log(`Context: ${diagram.surroundingText.slice(0, 200)}...`);
    console.log(`\nASCII:\n${diagram.rawDiagram}\n`);

    console.log("Generating image...");
    const rawPath = await generateDiagramImage(diagram, OUTPUT_DIR, apiKey);
    console.log(`Generated: ${rawPath}`);

    console.log("Optimizing...");
    const optimized = await optimizeImage(rawPath, diagram, OUTPUT_DIR);
    console.log(`WebP: ${optimized.webpPath}`);
    console.log(`PNG: ${optimized.pngPath}`);

    console.log("Replacing in markdown...");
    replaceDiagram(optimized);
    console.log("Done!\n");
  }
}

main().catch(console.error);
