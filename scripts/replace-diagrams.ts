import { readFileSync, writeFileSync } from "fs";
import { relative, dirname } from "path";
import type { DiagramInfo, GeneratedImage } from "./types.js";

// Regex to match code blocks
const CODE_BLOCK_REGEX = /```[a-z]*\n([\s\S]*?)```/g;
const BOX_CHARS = /[┌┐└┘│─├┤┬┴┼▼▲◄►╔╗╚╝║═╠╣╦╩╬]/;

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
  let matchIndex = 0;
  let diagramMatchIndex = 0;
  let replacedContent = content.replace(CODE_BLOCK_REGEX, (match, codeContent) => {
    // Check if this is a diagram code block
    if (BOX_CHARS.test(codeContent)) {
      // Is this the diagram we're looking for?
      if (diagramMatchIndex === diagram.index) {
        diagramMatchIndex++;

        // Calculate relative path from markdown file to image
        const mdDir = dirname(diagram.filePath);
        const imagePath = opts.useWebp ? webpPath : pngPath;
        const relativeImagePath = relative(mdDir, imagePath);

        // Build alt text
        const altText = diagram.label || `${diagram.slug} diagram ${diagram.index + 1}`;

        // Build replacement - keep original as HTML comment for regeneration
        return `![${altText}](${relativeImagePath})\n\n<!-- ORIGINAL_DIAGRAM\n${match}\n-->`;
      }
      diagramMatchIndex++;
    }

    matchIndex++;
    return match;
  });

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
