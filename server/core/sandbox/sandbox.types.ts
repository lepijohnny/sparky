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
  /** Size in bytes on disk */
  size: number;
  /** Path on disk */
  path: string;
}

export type AllowlistEntry = string;
