import type { AuthFlowDefinition } from "@sparky/auth-core";

export type { AuthFlowDefinition };

export interface ModelDefinition {
  id: string;
  label: string;
  contextWindow?: number;
  supportsThinking?: boolean;
  supportsTools?: boolean;
  supportsAttachments?: string[];
}

export interface ProviderDefinition {
  id: string;
  name: string;
  models: ModelDefinition[];
  warning?: string;
}
