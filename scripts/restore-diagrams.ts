#!/usr/bin/env npx tsx

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// Image comes BEFORE the comment: ![caption](images/...) \n\n <!-- ORIGINAL_DIAGRAM \n ``` ... ``` \n -->
const ORIGINAL_DIAGRAM_REGEX = /!\[.*?\]\(images\/diagrams\/[^\)]+\)\n\n<!-- ORIGINAL_DIAGRAM\n(```[\s\S]*?```)\n-->/g;

function restoreFile(filePath: string): number {
  const content = readFileSync(filePath, "utf-8");
  let restoredCount = 0;

  const newContent = content.replace(ORIGINAL_DIAGRAM_REGEX, (match, diagram) => {
    restoredCount++;
    return diagram;
  });

  if (restoredCount > 0) {
    writeFileSync(filePath, newContent);
    console.log(`  Restored ${restoredCount} diagram(s) in ${filePath}`);
  }

  return restoredCount;
}

function scanDirectory(dir: string): string[] {
  const mdFiles: string[] = [];

  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry.startsWith(".") || entry === "node_modules") continue;

    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      mdFiles.push(...scanDirectory(fullPath));
    } else if (entry.endsWith(".md")) {
      mdFiles.push(fullPath);
    }
  }

  return mdFiles;
}

function main() {
  const dir = process.argv[2] || ".";

  console.log("=== Restore ASCII Diagrams from HTML Comments ===\n");
  console.log(`Scanning directory: ${dir}\n`);

  const files = scanDirectory(dir);
  let totalRestored = 0;

  for (const file of files) {
    totalRestored += restoreFile(file);
  }

  console.log(`\nTotal diagrams restored: ${totalRestored}`);
}

main();
