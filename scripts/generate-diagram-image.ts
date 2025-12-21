import { GoogleGenerativeAI } from "@google/generative-ai";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type { DiagramInfo } from "./types.js";

// DO NOT CHANGE - User-specified model for diagram generation
const MODEL_NAME = "gemini-3-pro-image-preview";

function buildPrompt(diagram: DiagramInfo): string {
  const { articleMeta, label, surroundingText, rawDiagram } = diagram;

  const contextParts: string[] = [];
  if (articleMeta.title) {
    contextParts.push(`Article: "${articleMeta.title}"`);
  }
  if (articleMeta.topics.length > 0) {
    contextParts.push(`Topics: ${articleMeta.topics.join(", ")}`);
  }
  if (label) {
    contextParts.push(`Diagram title: "${label}"`);
  }
  if (surroundingText) {
    contextParts.push(`Surrounding text: "${surroundingText}"`);
  }

  const context = contextParts.length > 0 ? `Context:\n${contextParts.join("\n")}\n` : "";

  return `Convert this ASCII diagram into a clean, professional technical illustration.

${context}
ASCII diagram:
\`\`\`
${rawDiagram}
\`\`\`

First, analyze the diagram type (tree/hierarchy, flow, architecture, sequence, comparison, etc.) and choose the most appropriate visual layout.

Visual style:
- Modern, minimalist design (like Stripe or Linear documentation)
- White background with padding (at least 20px on all sides) - content should not touch edges
- Dark gray (#374151) boxes with subtle rounded corners (6px)
- Blue accent (#3B82F6) for arrows and connections
- Clean sans-serif typography
- No shadows, flat design
- Generous spacing between elements - avoid cramped layouts
- Labels should have breathing room, not overlap with arrows or boxes
- Image should be wider rather than taller when needed for readability
- Leave significant whitespace margins around the entire diagram

Critical rules:
- Preserve the EXACT structure, labels, and relationships from the ASCII
- Do not add, remove, or rename any elements
- Do NOT add any title or heading text to the image - the diagram should stand alone without a title

Generate the image.`;
}

export async function generateDiagramImage(
  diagram: DiagramInfo,
  outputDir: string,
  apiKey: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      responseModalities: ["image", "text"],
    } as any,
  });

  const prompt = buildPrompt(diagram);

  const result = await model.generateContent(prompt);
  const response = result.response;

  // Extract image from response
  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) {
    throw new Error("No response parts received from Gemini");
  }

  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith("image/")) {
      const imageData = part.inlineData.data;
      const buffer = Buffer.from(imageData, "base64");

      // Create output path
      const fileName = `${diagram.slug}-${diagram.index}.png`;
      const outputPath = join(outputDir, fileName);

      // Ensure directory exists
      mkdirSync(dirname(outputPath), { recursive: true });

      // Write image
      writeFileSync(outputPath, buffer);

      return outputPath;
    }
  }

  throw new Error("No image data in Gemini response");
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY environment variable required");
    process.exit(1);
  }

  // Test with a sample diagram
  const testDiagram: DiagramInfo = {
    filePath: "test.md",
    fileName: "test.md",
    slug: "test",
    lineStart: 1,
    lineEnd: 10,
    label: "Test Architecture",
    rawDiagram: `
┌──────────┐     ┌──────────┐
│ Producer │────▶│  Kafka   │
└──────────┘     └────┬─────┘
                      │
                      ▼
                ┌──────────┐
                │ Consumer │
                └──────────┘
    `.trim(),
    index: 0,
  };

  generateDiagramImage(testDiagram, "./images/diagrams", apiKey)
    .then((path) => console.log(`Generated: ${path}`))
    .catch((err) => console.error("Error:", err));
}
