#!/usr/bin/env npx tsx

import { readFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join, basename } from "path";
import { generateDiagramImage } from "./generate-diagram-image.js";
import { optimizeImage } from "./optimize-image.js";
import type { DiagramInfo, ArticleMeta } from "./types.js";

// Extract diagrams from ORIGINAL_DIAGRAM comments where image is missing
function extractMissingDiagrams(directory: string): DiagramInfo[] {
  const diagrams: DiagramInfo[] = [];
  const files = readdirSync(directory).filter((f) => f.endsWith(".md"));

  // Regex to match image reference followed by ORIGINAL_DIAGRAM comment
  const pattern = /!\[([^\]]*)\]\((images\/diagrams\/([^)]+)\.webp)\)\n\n<!-- ORIGINAL_DIAGRAM\n```\n([\s\S]*?)\n```\n-->/g;

  for (const file of files) {
    const filePath = join(directory, file);
    const content = readFileSync(filePath, "utf-8");
    const slug = file.replace(/\.md$/, "");

    // Extract frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const articleMeta: ArticleMeta = { title: "", description: "", topics: [] };
    if (fmMatch) {
      const yaml = fmMatch[1];
      articleMeta.title = yaml.match(/title:\s*"([^"]+)"/)?.[1] || "";
      articleMeta.description = yaml.match(/description:\s*"([^"]+)"/)?.[1] || "";
    }

    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;

    while ((match = pattern.exec(content)) !== null) {
      const [, label, imagePath, imageSlug, rawDiagram] = match;
      const fullImagePath = join(directory, imagePath);

      // Only process if image doesn't exist
      if (!existsSync(fullImagePath)) {
        // Extract index from slug (e.g., "consumer-lag-monitoring-0" -> 0)
        const indexMatch = imageSlug.match(/-(\d+)$/);
        const index = indexMatch ? parseInt(indexMatch[1]) : 0;

        diagrams.push({
          filePath,
          fileName: file,
          slug: imageSlug.replace(/-\d+$/, ""),
          lineStart: 0,
          lineEnd: 0,
          label,
          surroundingText: "",
          rawDiagram: rawDiagram.trim(),
          index,
          articleMeta,
        });
      }
    }
  }

  return diagrams;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY environment variable required");
    process.exit(1);
  }

  const directory = process.argv[2] || ".";
  const outputDir = "./images/diagrams";
  const concurrency = parseInt(process.argv[3] || "5");

  console.log("=== Generate Missing Diagram Images ===\n");

  mkdirSync(outputDir, { recursive: true });

  const diagrams = extractMissingDiagrams(directory);
  console.log(`Found ${diagrams.length} diagrams with missing images\n`);

  if (diagrams.length === 0) {
    console.log("All images already exist!");
    return;
  }

  let processed = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < diagrams.length; i += concurrency) {
    const batch = diagrams.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map(async (diagram) => {
        const imageSlug = `${diagram.slug}-${diagram.index}`;
        console.log(`Processing: ${imageSlug}`);

        try {
          // Generate PNG
          const pngPath = await generateDiagramImage(diagram, outputDir, apiKey);

          // Optimize to WebP and PNG
          const result = await optimizeImage(pngPath, diagram, outputDir);

          console.log(`  ✓ Generated: ${result.webpPath}`);
          return result.webpPath;
        } catch (error) {
          console.error(`  ✗ Failed: ${imageSlug} - ${(error as Error).message}`);
          throw error;
        }
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        processed++;
      } else {
        failed++;
      }
    }

    // Rate limiting
    if (i + concurrency < diagrams.length) {
      await sleep(1000);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);
