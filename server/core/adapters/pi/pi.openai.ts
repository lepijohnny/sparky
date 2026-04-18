import { getModel, getModels } from "@mariozechner/pi-ai";
import { refreshOpenAICodexToken } from "@mariozechner/pi-ai/oauth";
import type { Logger } from "../../../logger.types";
import type { LlmConnection } from "../../../settings/llm.types";
import type { Agent } from "../../agent.types";
import type { ModelDefinition, ProviderAdapter } from "../../registry.types";
import type { Credentials } from "../../cred";
import { RecoverableAgent } from "../agent.recoverable";
import { createPiAgent } from "./pi.agent";

function isUsableApiModel(id: string): boolean {
  if (id.includes("-oss-")) return false;
  if (id.includes("safeguard")) return false;
  if (id.includes("deep-research")) return false;
  if (id.includes("codex")) return false;
  return true;
}

export function createPiOpenAIApiAdapter(
  credentials: Credentials,
  log: Logger,
  options: { credPrefix: string },
): ProviderAdapter {
  let cachedModels: ModelDefinition[] | null = null;

  const getCredential = (key: string) => credentials.get(`${options.credPrefix}.${key}`);

  return {
    id: "openai-api",
    name: "OpenAI",
    searchModel: "gpt-4o-mini",

    async dispose() {
      log.info("Disposing pi-ai OpenAI API adapter");
      cachedModels = null;
    },

    async models(): Promise<ModelDefinition[]> {
      if (cachedModels) return cachedModels;

      try {
        const models = getModels("openai").filter((m) => isUsableApiModel(m.id));
        cachedModels = models.map((m) => ({
          id: m.id,
          label: m.name,
          contextWindow: m.contextWindow,
          maxOutputTokens: m.maxTokens,
          supportsThinking: m.reasoning,
          supportsTools: true,
          supportsAttachments: m.input.includes("image")
            ? ["png", "jpg", "jpeg", "gif", "webp"]
            : undefined,
        }));
        return cachedModels;
      } catch (err) {
        log.warn("Failed to get OpenAI API models from pi-ai", { error: String(err) });
        return [];
      }
    },

    async validate(): Promise<boolean> {
      const token = await getCredential("token");
      return !!token;
    },

    createAgent(conn: LlmConnection, agentOpts?: { webSearch?: boolean }): Agent {
      const modelId = conn.model ?? getModels("openai").filter((m) => isUsableApiModel(m.id))[0]?.id ?? "gpt-4o";
      const thinkingLevel = conn.thinking ?? 0;

      const createInner = async (): Promise<Agent> => {
        const token = await getCredential("token");
        if (!token) throw new Error(`No credentials found for ${options.credPrefix}.token`);

        const model = getModel("openai", modelId as any);
        if (!model) throw new Error(`Unknown OpenAI model: ${modelId}`);

        const onPayload = agentOpts?.webSearch
          ? (payload: unknown) => {
              const p = payload as any;
              if (!p.tools) p.tools = [];
              p.tools.push({ type: "web_search" });
              return p;
            }
          : undefined;

        return createPiAgent({ model, apiKey: token, thinkingLevel, log, onPayload });
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

export function createPiOpenAIOAuthAdapter(
  credentials: Credentials,
  log: Logger,
  options: { credPrefix: string },
): ProviderAdapter {
  let cachedModels: ModelDefinition[] | null = null;

  const getCredential = (key: string) => credentials.get(`${options.credPrefix}.${key}`);
  const setCredential = (key: string, value: string) => credentials.set(`${options.credPrefix}.${key}`, value);

  return {
    id: "openai-oauth",
    name: "OpenAI",

    async dispose() {
      log.info("Disposing pi-ai OpenAI OAuth adapter");
      cachedModels = null;
    },

    async models(): Promise<ModelDefinition[]> {
      if (cachedModels) return cachedModels;

      try {
        const models = getModels("openai-codex");
        cachedModels = models.map((m) => ({
          id: m.id,
          label: m.name,
          contextWindow: m.contextWindow,
          maxOutputTokens: m.maxTokens,
          supportsThinking: m.reasoning,
          supportsTools: true,
          supportsAttachments: m.input.includes("image")
            ? ["png", "jpg", "jpeg", "gif", "webp"]
            : undefined,
        }));
        return cachedModels;
      } catch (err) {
        log.warn("Failed to get OpenAI Codex models from pi-ai", { error: String(err) });
        return [];
      }
    },

    async validate(): Promise<boolean> {
      const token = await getCredential("token");
      return !!token;
    },

    createAgent(conn: LlmConnection): Agent {
      const modelId = conn.model ?? getModels("openai-codex")[0]?.id ?? "gpt-5.2";
      const thinkingLevel = conn.thinking ?? 0;

      const createInner = async (): Promise<Agent> => {
        const token = await getCredential("token");
        if (!token) throw new Error(`No credentials found for ${options.credPrefix}.token`);

        const model = getModel("openai-codex", modelId as any);
        if (!model) throw new Error(`Unknown OpenAI model: ${modelId}`);

        return createPiAgent({ model, apiKey: token, thinkingLevel, log });
      };

      const inner: Agent = {
        async *stream(turn) {
          const agent = await createInner();
          yield* agent.stream(turn);
        },
      };

      return new RecoverableAgent(inner, [
        {
          match: (err: string) =>
            err.includes("401") || err.includes("unauthorized") || err.includes("authentication"),
          recover: async () => {
            const refreshToken = await getCredential("refreshToken");
            if (!refreshToken) throw new Error("No refresh token available");

            log.info("Refreshing OpenAI OAuth token via pi-ai");

            const newCreds = await Promise.race([
              refreshOpenAICodexToken(refreshToken),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error("OpenAI token refresh timed out after 30s")), 30_000)),
            ]);
            await setCredential("token", newCreds.access);
            await setCredential("refreshToken", newCreds.refresh);

            log.info("OpenAI OAuth token refreshed successfully");

            return {
              async *stream(turn) {
                const agent = await createInner();
                yield* agent.stream(turn);
              },
            } as Agent;
          },
        },
      ], log);
    },

    async reconnect(): Promise<boolean> {
      cachedModels = null;
      return true;
    },
  };
}
