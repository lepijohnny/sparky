import { getModel, getModels } from "@mariozechner/pi-ai";
import type { Logger } from "../../../logger.types";
import type { LlmConnection } from "../../../settings/llm.types";
import type { Agent } from "../../agent.types";
import type { ModelDefinition, ProviderAdapter } from "../../registry.types";
import type { Credentials } from "../../cred";
import { RecoverableAgent } from "../agent.recoverable";
import { createPiAgent } from "./pi.agent";

const BLOCKED_MODELS = new Set([
  "devstral-small-2505",
  "magistral-small",
  "mistral-nemo",
  "open-mistral-7b",
  "open-mixtral-8x7b",
  "open-mixtral-8x22b",
]);

export function createPiMistralAdapter(
  credentials: Credentials,
  log: Logger,
  options: { credPrefix: string },
): ProviderAdapter {
  let cachedModels: ModelDefinition[] | null = null;

  const getCredential = (key: string) => credentials.get(`${options.credPrefix}.${key}`);

  return {
    id: "mistral",
    name: "Mistral",

    async dispose() {
      log.info("Disposing pi-ai Mistral adapter");
      cachedModels = null;
    },

    async models(): Promise<ModelDefinition[]> {
      if (cachedModels) return cachedModels;

      try {
        const models = getModels("mistral").filter((m) => !BLOCKED_MODELS.has(m.id));
        cachedModels = models.map((m) => ({
          id: m.id,
          label: m.name,
          contextWindow: m.contextWindow,
          maxOutputTokens: m.maxTokens,
          supportsThinking: m.reasoning,
          supportsTools: true,
          webSearch: "local" as const,
          supportsAttachments: m.input.includes("image")
            ? ["png", "jpg", "jpeg", "gif", "webp"]
            : undefined,
        }));
        return cachedModels;
      } catch (err) {
        log.warn("Failed to get Mistral models from pi-ai", { error: String(err) });
        return [];
      }
    },

    async validate(): Promise<boolean> {
      const token = await getCredential("token");
      return !!token;
    },

    createAgent(conn: LlmConnection): Agent {
      const modelId = conn.model ?? getModels("mistral").filter((m) => !BLOCKED_MODELS.has(m.id))[0]?.id ?? "mistral-large-latest";
      const thinkingLevel = conn.thinking ?? 0;

      const createInner = async (): Promise<Agent> => {
        const token = await getCredential("token");
        if (!token) throw new Error(`No credentials found for ${options.credPrefix}.token`);

        const model = getModel("mistral", modelId as any);
        if (!model) throw new Error(`Unknown Mistral model: ${modelId}`);

        return createPiAgent({ model, apiKey: token, thinkingLevel, log });
      };

      const inner: Agent = {
        async *stream(turn) {
          const agent = await createInner();
          yield* agent.stream(turn);
        },
      };

      return new RecoverableAgent(inner, [], log);
    },

    async reconnect(): Promise<boolean> {
      cachedModels = null;
      return true;
    },
  };
}
