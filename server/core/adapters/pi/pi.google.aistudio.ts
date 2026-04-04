import { getModel, getModels } from "@mariozechner/pi-ai";
import type { Logger } from "../../../logger.types";
import type { LlmConnection } from "../../../settings/llm.types";
import type { Agent } from "../../agent.types";
import type { ModelDefinition, ProviderAdapter } from "../../registry.types";
import type { Credentials } from "../../cred";
import { RecoverableAgent } from "../agent.recoverable";
import { createPiAgent } from "./pi.agent";
import type { ContentBlockHandler, ContentBlockEvent } from "./pi.agent";

const BLOCKED_MODELS = new Set([
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
  "gemini-live-2.5-flash",
  "gemini-live-2.5-flash-preview-native-audio",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
]);

const PREVIEW_MODELS = /preview/;

export function createPiGoogleAIStudioAdapter(
  credentials: Credentials,
  log: Logger,
  options: { credPrefix: string },
): ProviderAdapter {
  let cachedModels: ModelDefinition[] | null = null;

  const getCredential = (key: string) => credentials.get(`${options.credPrefix}.${key}`);

  return {
    id: "google-ai-studio",
    name: "Google AI Studio",
    searchModel: "gemini-2.5-flash",

    async dispose() {
      log.info("Disposing pi-ai Google AI Studio adapter");
      cachedModels = null;
    },

    async models(): Promise<ModelDefinition[]> {
      if (cachedModels) return cachedModels;

      try {
        const models = getModels("google")
          .filter((m) => !BLOCKED_MODELS.has(m.id))
          .filter((m) => !PREVIEW_MODELS.test(m.id));
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
        log.warn("Failed to get Google AI Studio models from pi-ai", { error: String(err) });
        return [];
      }
    },

    async validate(): Promise<boolean> {
      const token = await getCredential("token");
      return !!token;
    },

    createAgent(conn: LlmConnection, agentOpts?: { webSearch?: boolean }): Agent {
      const modelId = conn.model ?? "gemini-2.5-flash";
      const thinkingLevel = conn.thinking ?? 0;

      const createInner = async (): Promise<Agent> => {
        const token = await getCredential("token");
        if (!token) throw new Error("No Google AI Studio API key found — add your key in Settings → LLM");

        const model = getModel("google", modelId as any);
        if (!model) throw new Error(`Unknown Google AI Studio model: ${modelId}`);

        const onPayload = agentOpts?.webSearch
          ? (payload: unknown) => {
              const p = payload as any;
              const req = p.request ?? p;
              if (!req.tools) req.tools = [];
              req.tools.push({ google_search: {} });
              return p;
            }
          : undefined;

        const onContentBlock: ContentBlockHandler = (block) => {
          const b = block as Record<string, unknown>;
          if (b.type !== "grounding_metadata") return undefined;
          const meta = b.metadata as any;
          const events: ContentBlockEvent[] = [];
          const queries: string[] = meta?.webSearchQueries || meta?.web_search_queries || [];
          for (const query of queries) {
            events.push({ type: "server_tool.start", id: `google_search_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: "web_search", input: { query } });
          }
          const chunks: any[] = meta?.groundingChunks || meta?.grounding_chunks || [];
          const citations = chunks
            .filter((c: any) => c.web)
            .map((c: any) => `- [${c.web.domain || c.web.title || c.web.uri}](${c.web.uri})`)
            .join("\n");
          if (citations) events.push({ type: "citations", text: citations, label: "Links" });
          return events.length > 0 ? events : undefined;
        };

        return createPiAgent({ model, apiKey: token, thinkingLevel, log, onPayload, onContentBlock });
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
