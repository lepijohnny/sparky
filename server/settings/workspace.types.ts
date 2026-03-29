export interface Workspace {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  /** Knowledge search mode: "keyword" (BM25 only) or "hybrid" (BM25 + semantic). Default: "keyword" */
  knowledgeSearch?: "keyword" | "hybrid";
}

export interface WorkspaceSpace {
  conversations: number;
  knowledge: number;
  attachments: number;
  cwd: number;
  tools: number;
  total: number;
}
