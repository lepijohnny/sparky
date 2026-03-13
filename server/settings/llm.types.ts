import type { Grant } from "@sparky/auth-core";

export interface LlmConnection {
  /** Unique connection id (uuid) */
  id: string;
  /** Provider id from registry, e.g. "anthropic-oauth" */
  provider: string;
  /** Display name, e.g. "Claude Pro / Max (OAuth)" */
  name: string;
  /** Grant type used, e.g. "pkce" | "pat" | "device" | "local" */
  grant: Grant;
  /** Credential prefix in cred store, e.g. "llm.anthropic-oauth.pkce" */
  credPrefix: string;
  /** Host URL for local providers (e.g. "http://localhost:11434") */
  host?: string;
  /** Selected model id, e.g. "claude-sonnet-4-20250514" */
  model?: string;
  /** Thinking/reasoning effort level (0=off, 1=minimal, 2=low, 3=medium, 4=high, 5=max) */
  thinking?: number;
  /** Whether knowledge sources are searched for context */
  knowledge?: boolean;
  /** Whether this connection can be used as the app assistant */
  assistant?: boolean;
  /** ISO timestamp of when the connection was created */
  createdAt: string;
}

export interface LlmDefault {
  /** Connection id */
  id: string;
  /** Display name for quick reference */
  name: string;
}
