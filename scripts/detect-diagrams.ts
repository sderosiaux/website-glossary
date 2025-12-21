import { readFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import type { DiagramInfo, ArticleMeta } from "./types.js";

// Box-drawing characters that indicate a diagram
const BOX_CHARS = /[┌┐└┘│─├┤┬┴┼▼▲◄►╔╗╚╝║═╠╣╦╩╬]/;

// Arrow-based diagrams (vertical flow with arrows and bracketed labels)
const ARROW_DIAGRAM = /(?:↓|↑|→|←|⟶|⟵|⇒|⇐|⇓|⇑)[\s\S]*(?:\[.+\]|↓|↑|→|←)/;

// Regex to match code blocks (with or without language specifier)
const CODE_BLOCK_REGEX = /```[a-z]*\n([\s\S]*?)```/g;

// Check if a position is inside an HTML comment
function isInsideComment(content: string, position: number): boolean {
  const before = content.slice(0, position);
  const lastCommentStart = before.lastIndexOf("<!-- ORIGINAL_DIAGRAM");
  if (lastCommentStart === -1) return false;
  const lastCommentEnd = before.lastIndexOf("-->");
  return lastCommentStart > lastCommentEnd;
}

// Extract YAML frontmatter
function extractFrontmatter(content: string): ArticleMeta {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return { title: "", description: "", topics: [] };
  }

  const yaml = match[1];
  const title = yaml.match(/title:\s*"([^"]+)"/)?.[1] || "";
  const description = yaml.match(/description:\s*"([^"]+)"/)?.[1] || "";
  const topicsMatch = yaml.match(/topics:\n((?:\s+-\s+.+\n?)+)/);
  const topics = topicsMatch
    ? topicsMatch[1].match(/-\s+(.+)/g)?.map((t) => t.replace(/^-\s+/, "")) || []
    : [];

  return { title, description, topics };
}

function slugify(fileName: string): string {
  return fileName
    .replace(/\.md$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

interface ExtractedContext {
  label: string | null;
  surroundingText: string;
}

function extractContext(content: string, codeBlockStart: number): ExtractedContext {
  const beforeBlock = content.slice(0, codeBlockStart);
  const lines = beforeBlock.split("\n");

  let label: string | null = null;
  const contextLines: string[] = [];

  // Get up to 10 lines before the code block for context
  const startIdx = Math.max(0, lines.length - 10);
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines and frontmatter
    if (!line || line === "---") continue;

    // Skip code block markers
    if (line.startsWith("```")) continue;

    // Check if this is a label (last non-empty line, short, ends with colon)
    if (i >= lines.length - 3 && !label) {
      if (line.endsWith(":") || (line.length < 80 && !line.includes("."))) {
        label = line.replace(/:$/, "").trim();
        continue;
      }
    }

    // Add to context (skip headers for cleaner context)
    if (!line.startsWith("#")) {
      contextLines.push(line);
    }
  }

  return {
    label,
    surroundingText: contextLines.slice(-5).join(" ").slice(0, 500), // Last 5 lines, max 500 chars
  };
}

function getLineNumber(content: string, charIndex: number): number {
  return content.slice(0, charIndex).split("\n").length;
}

// Count already-converted diagrams in a file (inside ORIGINAL_DIAGRAM comments)
function countConvertedDiagrams(content: string): number {
  const matches = content.match(/<!-- ORIGINAL_DIAGRAM\n```/g);
  return matches ? matches.length : 0;
}

export function detectDiagrams(directory: string): DiagramInfo[] {
  const diagrams: DiagramInfo[] = [];
  const files = readdirSync(directory).filter((f) => f.endsWith(".md"));

  for (const file of files) {
    const filePath = join(directory, file);
    const content = readFileSync(filePath, "utf-8");
    const slug = slugify(file);
    const articleMeta = extractFrontmatter(content);

    let match: RegExpExecArray | null;

    // Start index after existing converted diagrams to avoid filename collisions
    let fileIndex = countConvertedDiagrams(content);

    // Reset regex
    CODE_BLOCK_REGEX.lastIndex = 0;

    while ((match = CODE_BLOCK_REGEX.exec(content)) !== null) {
      const codeContent = match[1];

      // Check if this code block contains diagram patterns and is not inside a comment
      const isDiagram = BOX_CHARS.test(codeContent) || ARROW_DIAGRAM.test(codeContent);
      if (isDiagram && !isInsideComment(content, match.index)) {
        const lineStart = getLineNumber(content, match.index);
        const lineEnd = getLineNumber(content, match.index + match[0].length);
        const { label, surroundingText } = extractContext(content, match.index);

        diagrams.push({
          filePath,
          fileName: file,
          slug,
          lineStart,
          lineEnd,
          label,
          surroundingText,
          rawDiagram: codeContent.trim(),
          index: fileIndex,
          articleMeta,
        });

        fileIndex++;
      }
    }
  }

  return diagrams;
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] || ".";
  const diagrams = detectDiagrams(dir);

  console.log(`Found ${diagrams.length} diagrams in ${new Set(diagrams.map((d) => d.fileName)).size} files\n`);

  for (const d of diagrams) {
    console.log(`${d.fileName}:${d.lineStart}-${d.lineEnd}`);
    console.log(`  Label: ${d.label || "(none)"}`);
    console.log(`  Lines: ${d.rawDiagram.split("\n").length}`);
    console.log();
  }

  // Output JSON manifest
  console.log("\n--- JSON Manifest ---");
  console.log(JSON.stringify(diagrams, null, 2));
}
