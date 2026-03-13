/** Source — top-level entity: a file, folder, or URL */
export interface Source {
  id: string;
  name: string;
  type: "file" | "folder" | "url";
  location: string;
  fileCount: number;
  chunkCount: number;
  mode: "keyword" | "hybrid";
  status: "pending" | "indexing" | "ready" | "error" | "cancelled";
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/** SourceFile — one per actual file or URL within a source */
export interface SourceFile {
  id: string;
  sourceId: string;
  name: string;
  path: string;
  ext: string;
  size: number;
  chunkCount: number;
  status: "pending" | "indexing" | "ready" | "error";
  error?: string;
}

/** Chunk — embedded text unit */
export interface Chunk {
  id: string;
  sourceFileId: string;
  content: string;
  startOffset: number;
  endOffset: number;
  tokenEstimate: number;
  section?: string;
}

/** Result returned by an extractor */
export interface ExtractionResult {
  text: string;
  sections?: { offset: number; label?: string }[];
}

/** Interface all file extractors must implement */
export interface FileExtractor {
  name?: string;
  extensions: string[];
  extract(target: string, log: (msg: string) => void, options?: Record<string, unknown>): AsyncGenerator<ExtractionResult>;
}

/** Search result from hybrid retrieval */
export interface SearchResult {
  chunkId: string;
  sourceId: string;
  sourceFileName: string;
  content: string;
  section?: string;
  score: number;
}
