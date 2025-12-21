export interface ArticleMeta {
  title: string;
  description: string;
  topics: string[];
}

export interface DiagramInfo {
  filePath: string;
  fileName: string;
  slug: string;
  lineStart: number;
  lineEnd: number;
  label: string | null;
  surroundingText: string;
  rawDiagram: string;
  index: number;
  articleMeta: ArticleMeta;
}

export interface GeneratedImage {
  diagram: DiagramInfo;
  pngPath: string;
  webpPath: string;
}

export interface ConversionResult {
  diagram: DiagramInfo;
  success: boolean;
  imagePath?: string;
  error?: string;
}
