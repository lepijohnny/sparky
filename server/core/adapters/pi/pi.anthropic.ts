import { getModel, getModels } from "@mariozechner/pi-ai";
import { refreshAnthropicToken } from "@mariozechner/pi-ai/oauth";
import type { Logger } from "../../../logger.types";
import type { LlmConnection } from "../../../settings/llm.types";
import type { Agent } from "../../agent.types";
import type { ModelDefinition, ProviderAdapter } from "../../registry.types";
import type { Credentials } from "../../cred";
import { RecoverableAgent } from "../agent.recoverable";
import { createPiAgent } from "./pi.agent";
import type { ContentBlockHandler, ContentBlockEvent } from "./pi.agent";

function isUsableModel(id: string): boolean {
  if (id.startsWith("claude-3-")) return false;
  if (id.endsWith("-latest")) return false;
  return true;
}

export function createPiAnthropicAdapter(
  id: string,
  name: string,
  credentials: Credentials,
  log: Logger,
  options: { credPrefix: string; isOAuth: boolean },
): ProviderAdapter {
  let cachedModels: ModelDefinition[] | null = null;

  const getCredential = (key: string) => credentials.get(`${options.credPrefix}.${key}`);
  const setCredential = (key: string, value: string) => credentials.set(`${options.credPrefix}.${key}`, value);

  return {
    id,
    name,
    searchModel: "claude-haiku-4-5",

    async dispose() {
      log.info("Disposing pi-ai Anthropic adapter", { id });
      cachedModels = null;
    },

    async models(): Promise<ModelDefinition[]> {
      if (cachedModels) return cachedModels;

      try {
        const models = getModels("anthropic").filter((m) => isUsableModel(m.id));
        cachedModels = models.map((m) => ({
          id: m.id,
          label: m.name,
          contextWindow: m.contextWindow,
          supportsThinking: m.reasoning,
          supportsTools: true,
          supportsAttachments: m.input.includes("image")
            ? ["png", "jpg", "jpeg", "gif", "webp"]
            : undefined,
          webSearch: "native" as const,
        }));
        return cachedModels;
      } catch (err) {
        log.warn("Failed to get Anthropic models from pi-ai", { error: String(err) });
        return [];
      }
    },

    async validate(): Promise<boolean> {
      const token = await getCredential("token");
      return !!token;
    },

    createAgent(conn: LlmConnection, agentOpts?: { webSearch?: boolean }): Agent {
      const modelId = conn.model ?? "claude-sonnet-4-20250514";
      const thinkingLevel = conn.thinking ?? 0;

      const createInner = async (): Promise<Agent> => {
        const token = await getCredential("token");
        if (!token) throw new Error(`No credentials found for ${options.credPrefix}.token`);

        const model = getModel("anthropic", modelId as any);
        if (!model) throw new Error(`Unknown Anthropic model: ${modelId}`);

        const onPayload = agentOpts?.webSearch
          ? (payload: unknown) => {
              const p = payload as any;
              if (!p.tools) p.tools = [];
              p.tools.push({ type: "web_search_20250305", name: "web_search", max_uses: 1 });
              return p;
            }
          : undefined;

        const onContentBlock: ContentBlockHandler | undefined = agentOpts?.webSearch
          ? (block) => {
              const b = block as Record<string, unknown>;
              const events: ContentBlockEvent[] = [];
              if (b.type === "server_tool_use") {
                events.push({ type: "server_tool.start", id: b.id as string, name: b.name as string, input: (b.input ?? {}) as Record<string, unknown> });
              } else if (b.type === "web_search_tool_result") {
                const results = ((b.content as unknown[]) || []).filter((r: any) => r.type === "web_search_result");
                const citations = results.map((r: any) => `- [${r.title}](${r.url})`).join("\n");
                if (citations) events.push({ type: "citations", text: citations });
              }
              return events.length > 0 ? events : undefined;
            }
          : undefined;

        return createPiAgent({ model, apiKey: token, thinkingLevel, log, onPayload, onContentBlock });
      };

      const inner: Agent = {
        async *stream(turn) {
          const agent = await createInner();
          yield* agent.stream(turn);
        },
      };

      const recoveryActions = options.isOAuth
        ? [
            {
              match: (err: string) =>
                err.includes("401") || err.includes("unauthorized") || err.includes("authentication"),
              recover: async () => {
                const refreshToken = await getCredential("refreshToken");
                if (!refreshToken) throw new Error("No refresh token available");

                log.info("Refreshing Anthropic OAuth token via pi-ai");

                const newCreds = await refreshAnthropicToken(refreshToken);
                await setCredential("token", newCreds.access);
                await setCredential("refreshToken", newCreds.refresh);

                log.info("Anthropic OAuth token refreshed successfully");

                return {
                  async *stream(turn) {
                    const agent = await createInner();
                    yield* agent.stream(turn);
                  },
                } as Agent;
              },
            },
          ]
        : [];

      return new RecoverableAgent(inner, recoveryActions, log);
    },

    async reconnect(): Promise<boolean> {
      cachedModels = null;
      return true;
    },
  };
}
