export interface WorkspaceSpace {
  attachments: number;
  conversations: number;
  knowledge: number;
  total: number;
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  sandbox?: boolean;
  sandboxImage?: string;
  knowledgeSearch?: "keyword" | "hybrid";
}

export interface QemuStatus {
  installed: boolean;
  path?: string;
  version?: string;
  installCommand: string;
  platform: "macos" | "linux" | "unsupported";
}

export interface SandboxImage {
  id: string;
  name: string;
  description?: string;
  tools: string[];
  size: number;
  path: string;
}

export type AllowlistEntry = string;
