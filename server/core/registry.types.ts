import type { AuthFlowDefinition } from "@sparky/auth-core";
import type { LlmConnection } from "../settings/llm.types";
import type { Agent } from "./agent.types";

export interface ModelDefinition {
  id: string;
  label: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsThinking?: boolean;
  supportsTools?: boolean;
  supportsAttachments?: string[];
  webSearch?: "native" | "local" | (string & {});
}

/** Unified provider adapter — every provider implements this */
export interface ProviderAdapter {
  readonly id: string;
  readonly name: string;
  /** Cheapest model id for web search side-calls, or undefined if provider has no native search */
  readonly searchModel?: string;
  models(conn?: LlmConnection): Promise<ModelDefinition[]>;
  createAgent(conn: LlmConnection, options?: { webSearch?: boolean }): Agent;
  validate(conn?: LlmConnection): Promise<boolean>;
  dispose?(): Promise<void>;
  reconnect?(): Promise<boolean>;
}

/** Serializable provider info sent to the frontend */
export interface ProviderDefinition {
  id: string;
  name: string;
  models: ModelDefinition[];
  warning?: string;
}

/** Full registry list response — providers + auth flows */
export interface RegistryListResponse {
  providers: ProviderDefinition[];
  flows: AuthFlowDefinition[];
}
