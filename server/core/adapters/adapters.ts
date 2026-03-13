import type { Logger } from "../../logger.types";
import type { Credentials } from "../cred";
import type { ProviderAdapter } from "../registry.types";
import { createPiAnthropicAdapter } from "./pi/pi.anthropic";
import { createPiCopilotAdapter } from "./pi/pi.copilot";
import { createPiGoogleAdapter } from "./pi/pi.google";
import { createPiOllamaAdapter } from "./pi/pi.ollama";

export interface AdapterCatalog {
  getById(id: string): ProviderAdapter | undefined;
  all(): ProviderAdapter[];
}

export function createAdapters(cred: Credentials, log: Logger): AdapterCatalog {
  const map = new Map<string, ProviderAdapter>([
    ["anthropic-oauth", createPiAnthropicAdapter("anthropic-oauth", "Anthropic", cred, log, { credPrefix: "llm.anthropic-oauth.pkce", isOAuth: true })],
    ["anthropic-api", createPiAnthropicAdapter("anthropic-api", "Anthropic", cred, log, { credPrefix: "llm.anthropic-api.pat", isOAuth: false })],
    ["google", createPiGoogleAdapter(cred, log, { credPrefix: "llm.google.pkce" })],
    ["ollama", createPiOllamaAdapter(log)],
    ["copilot", createPiCopilotAdapter(cred, log, { credPrefix: "llm.copilot.device" })],
  ]);

  return {
    getById: (id) => map.get(id),
    all: () => [...map.values()],
  };
}
