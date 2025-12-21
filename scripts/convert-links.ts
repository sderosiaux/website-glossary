#!/usr/bin/env npx tsx

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";

const BASE_URL = "https://conduktor.io/glossary";

// Match markdown links to local .md files: [text](./slug.md) or [text](slug.md)
const LOCAL_LINK_REGEX = /\[([^\]]+)\]\(\.?\/?([a-z0-9-]+)\.md\)/g;

function convertLinks(filePath: string): number {
  const content = readFileSync(filePath, "utf-8");
  let convertedCount = 0;

  const newContent = content.replace(LOCAL_LINK_REGEX, (match, text, slug) => {
    convertedCount++;
    return `[${text}](${BASE_URL}/${slug})`;
  });

  if (convertedCount > 0) {
    writeFileSync(filePath, newContent);
    console.log(`  Converted ${convertedCount} link(s) in ${filePath}`);
  }

  return convertedCount;
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
  const dryRun = process.argv.includes("--dry-run");

  console.log("=== Convert Local Links to Absolute URLs ===\n");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Scanning directory: ${dir}`);
  if (dryRun) console.log("DRY RUN MODE - No changes will be made");
  console.log();

  const files = scanDirectory(dir);
  let totalConverted = 0;

  for (const file of files) {
    if (dryRun) {
      const content = readFileSync(file, "utf-8");
      const matches = [...content.matchAll(LOCAL_LINK_REGEX)];
      if (matches.length > 0) {
        console.log(`Would convert ${matches.length} link(s) in ${file}:`);
        for (const match of matches) {
          console.log(`  ${match[0]} -> [${match[1]}](${BASE_URL}/${match[2]})`);
        }
        totalConverted += matches.length;
      }
    } else {
      totalConverted += convertLinks(file);
    }
  }

  console.log(`\nTotal links ${dryRun ? "would be " : ""}converted: ${totalConverted}`);
}

main();
