import type { Grant } from "@sparky/auth-core";

export interface LlmConnection {
  id: string;
  provider: string;
  name: string;
  grant: Grant;
  credPrefix: string;
  host?: string;
  model?: string;
  thinking?: number;
  knowledge?: boolean;
  assistant?: boolean;
  createdAt: string;
}

export interface LlmDefault {
  id: string;
  name: string;
}
