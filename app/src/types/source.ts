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
