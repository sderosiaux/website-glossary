import { readFileSync, writeFileSync } from "fs";
import { relative, dirname } from "path";
import type { DiagramInfo, GeneratedImage } from "./types.js";

// Regex to match code blocks
const CODE_BLOCK_REGEX = /```[a-z]*\n([\s\S]*?)```/g;

// Box-drawing characters that indicate a diagram
const BOX_CHARS = /[┌┐└┘│─├┤┬┴┼▼▲◄►╔╗╚╝║═╠╣╦╩╬]/;

// Arrow-based diagrams (vertical flow with arrows and bracketed labels)
const ARROW_DIAGRAM = /(?:↓|↑|→|←|⟶|⟵|⇒|⇐|⇓|⇑)[\s\S]*(?:\[.+\]|↓|↑|→|←)/;

// Check if a position is inside an HTML comment
function isInsideComment(content: string, position: number): boolean {
  const before = content.slice(0, position);
  const lastCommentStart = before.lastIndexOf("<!-- ORIGINAL_DIAGRAM");
  if (lastCommentStart === -1) return false;
  const lastCommentEnd = before.lastIndexOf("-->");
  return lastCommentStart > lastCommentEnd;
}

// Check if content is a diagram
function isDiagram(codeContent: string): boolean {
  return BOX_CHARS.test(codeContent) || ARROW_DIAGRAM.test(codeContent);
}

// Count already-converted diagrams in a file (inside ORIGINAL_DIAGRAM comments)
function countConvertedDiagrams(content: string): number {
  const matches = content.match(/<!-- ORIGINAL_DIAGRAM\n```/g);
  return matches ? matches.length : 0;
}

interface ReplaceOptions {
  useWebp?: boolean;
}

const DEFAULT_OPTIONS: ReplaceOptions = {
  useWebp: true,
};

export function replaceDiagram(
  generatedImage: GeneratedImage,
  options: ReplaceOptions = {}
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { diagram, webpPath, pngPath } = generatedImage;

  // Read the file
  const content = readFileSync(diagram.filePath, "utf-8");

  // Find the specific code block to replace
  // Start index after existing converted diagrams (same as detection)
  let diagramMatchIndex = countConvertedDiagrams(content);
  let replacedContent = content;

  CODE_BLOCK_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CODE_BLOCK_REGEX.exec(content)) !== null) {
    const codeContent = match[1];
    const matchPosition = match.index;

    // Skip code blocks inside HTML comments (already converted diagrams)
    if (isInsideComment(content, matchPosition)) {
      continue;
    }

    // Check if this is a diagram code block
    if (isDiagram(codeContent)) {
      // Is this the diagram we're looking for?
      if (diagramMatchIndex === diagram.index) {
        // Calculate relative path from markdown file to image
        const mdDir = dirname(diagram.filePath);
        const imagePath = opts.useWebp ? webpPath : pngPath;
        const relativeImagePath = relative(mdDir, imagePath);

        // Build alt text
        const altText = diagram.label || `${diagram.slug} diagram ${diagram.index + 1}`;

        // Build replacement - keep original as HTML comment for regeneration
        const replacement = `![${altText}](${relativeImagePath})\n\n<!-- ORIGINAL_DIAGRAM\n${match[0]}\n-->`;

        // Replace this specific occurrence
        replacedContent =
          content.slice(0, matchPosition) +
          replacement +
          content.slice(matchPosition + match[0].length);

        break; // Found and replaced, exit loop
      }
      diagramMatchIndex++;
    }
  }

  // Write the updated file
  writeFileSync(diagram.filePath, replacedContent, "utf-8");
}

export function replaceAllDiagrams(generatedImages: GeneratedImage[]): void {
  // Group by file path to handle multiple diagrams per file correctly
  const byFile = new Map<string, GeneratedImage[]>();

  for (const img of generatedImages) {
    const existing = byFile.get(img.diagram.filePath) || [];
    existing.push(img);
    byFile.set(img.diagram.filePath, existing);
  }

  // Process each file, replacing diagrams in reverse order
  // (to preserve line numbers for earlier diagrams)
  for (const [, images] of byFile) {
    // Sort by index descending
    images.sort((a, b) => b.diagram.index - a.diagram.index);

    for (const img of images) {
      replaceDiagram(img);
    }
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Replace diagrams module loaded. Use from main orchestrator.");
}
