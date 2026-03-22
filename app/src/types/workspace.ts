export interface WorkspaceSpace {
  attachments: number;
  conversations: number;
  cwd: number;
  knowledge: number;
  total: number;
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  knowledgeSearch?: "keyword" | "hybrid";
}
