import { getModel, getModels } from "@mariozechner/pi-ai";
import { refreshGitHubCopilotToken } from "@mariozechner/pi-ai/oauth";
import type { Logger } from "../../../logger.types";
import type { LlmConnection } from "../../../settings/llm.types";
import type { Agent } from "../../agent.types";
import type { ModelDefinition, ProviderAdapter } from "../../registry.types";
import type { Credentials } from "../../cred";
import { RecoverableAgent } from "../agent.recoverable";
import { createPiAgent } from "./pi.agent";

/** Copilot enforces lower input limits than pi-ai's contextWindow for some models */
const CONTEXT_OVERRIDES: Record<string, number> = {
  "gpt-4o": 64000,
};

export function createPiCopilotAdapter(
  credentials: Credentials,
  log: Logger,
  options: { credPrefix: string },
): ProviderAdapter {
  let cachedModels: ModelDefinition[] | null = null;
  let cachedApiToken: string | null = null;

  const getCredential = (key: string) => credentials.get(`${options.credPrefix}.${key}`);

  async function getShortLivedCopilotApiToken(): Promise<string> {
    const githubToken = await getCredential("token");
    if (!githubToken) throw new Error("No GitHub token found — please authenticate with Copilot");

    const creds = await refreshGitHubCopilotToken(githubToken);
    cachedApiToken = creds.access;
    return cachedApiToken;
  }

  return {
    id: "copilot",
    name: "GitHub Copilot",

    async dispose() {
      log.info("Disposing pi-ai Copilot adapter");
      cachedModels = null;
      cachedApiToken = null;
    },

    async models(): Promise<ModelDefinition[]> {
      if (cachedModels) return cachedModels;

      try {
        const models = getModels("github-copilot");
        cachedModels = models.map((m) => ({
          id: m.id,
          label: m.name,
          contextWindow: CONTEXT_OVERRIDES[m.id] ?? m.contextWindow,
          maxOutputTokens: m.maxTokens,
          supportsThinking: m.reasoning,
          supportsTools: true,
          supportsAttachments: m.input.includes("image")
            ? ["png", "jpg", "jpeg", "gif", "webp"]
            : undefined,
          webSearch: "local" as const,
        }));
        return cachedModels;
      } catch (err) {
        log.warn("Failed to get Copilot models from pi-ai", { error: String(err) });
        return [];
      }
    },

    async validate(): Promise<boolean> {
      const token = await getCredential("token");
      return !!token;
    },

    createAgent(conn: LlmConnection, _agentOpts?: { webSearch?: boolean }): Agent {
      const modelId = conn.model ?? "gpt-4o";
      const thinkingLevel = conn.thinking ?? 0;

      const makeAgent = (apiKey: string): Agent => {
        const model = getModel("github-copilot", modelId as any);
        if (!model) throw new Error(`Unknown Copilot model: ${modelId}`);
        return createPiAgent({ model, apiKey, thinkingLevel, log });
      };

      const inner: Agent = {
        async *stream(turn) {
          const apiKey = cachedApiToken ?? await getShortLivedCopilotApiToken();
          yield* makeAgent(apiKey).stream(turn);
        },
      };

      return new RecoverableAgent(inner, [
        {
          match: (err) => err.includes("401") || err.includes("unauthorized"),
          recover: async () => {
            log.info("Copilot API token expired, refreshing");
            const freshKey = await getShortLivedCopilotApiToken();
            return makeAgent(freshKey);
          },
        },
      ], log);
    },

    async reconnect(): Promise<boolean> {
      cachedModels = null;
      cachedApiToken = null;
      return true;
    },
  };
}
