import sharp from "sharp";
import { dirname } from "path";
import { mkdirSync, unlinkSync } from "fs";
import type { DiagramInfo, GeneratedImage } from "./types.js";

interface OptimizeOptions {
  maxWidth?: number;
  webpQuality?: number;
  pngCompressionLevel?: number;
}

const DEFAULT_OPTIONS: OptimizeOptions = {
  maxWidth: 800,
  webpQuality: 85,
  pngCompressionLevel: 9,
};

export async function optimizeImage(
  inputPath: string,
  diagram: DiagramInfo,
  outputDir: string,
  options: OptimizeOptions = {}
): Promise<GeneratedImage> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const baseName = `${diagram.slug}-${diagram.index}`;
  const webpPath = `${outputDir}/${baseName}.webp`;
  const pngPath = `${outputDir}/${baseName}.png`;

  // Ensure output directory exists
  mkdirSync(dirname(webpPath), { recursive: true });

  // Load image into buffer first (avoids same-file conflict)
  const imageBuffer = await sharp(inputPath).toBuffer();
  const metadata = await sharp(imageBuffer).metadata();

  // Resize if needed
  const resizeOptions =
    metadata.width && metadata.width > opts.maxWidth!
      ? { width: opts.maxWidth }
      : undefined;

  // Generate WebP (primary format)
  await sharp(imageBuffer)
    .resize(resizeOptions)
    .webp({ quality: opts.webpQuality })
    .toFile(webpPath);

  // Generate PNG fallback
  await sharp(imageBuffer)
    .resize(resizeOptions)
    .png({ compressionLevel: opts.pngCompressionLevel })
    .toFile(pngPath);

  // Remove the raw input file
  if (inputPath !== pngPath && inputPath !== webpPath) {
    try {
      unlinkSync(inputPath);
    } catch {}
  }

  return {
    diagram,
    pngPath,
    webpPath,
  };
}

// CLI usage for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: npx tsx optimize-image.ts <input-image>");
    process.exit(1);
  }

  const testDiagram: DiagramInfo = {
    filePath: "test.md",
    fileName: "test.md",
    slug: "test",
    lineStart: 1,
    lineEnd: 10,
    label: null,
    rawDiagram: "",
    index: 0,
  };

  optimizeImage(inputPath, testDiagram, "./images/diagrams")
    .then((result) => {
      console.log("Optimized:");
      console.log(`  WebP: ${result.webpPath}`);
      console.log(`  PNG:  ${result.pngPath}`);
    })
    .catch((err) => console.error("Error:", err));
}
