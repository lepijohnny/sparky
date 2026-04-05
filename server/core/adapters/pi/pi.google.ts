import { getModel, getModels } from "@mariozechner/pi-ai";
import { refreshGoogleCloudToken } from "@mariozechner/pi-ai/oauth";
import type { Logger } from "../../../logger.types";
import type { LlmConnection } from "../../../settings/llm.types";
import type { Agent } from "../../agent.types";
import type { ModelDefinition, ProviderAdapter } from "../../registry.types";
import type { Credentials } from "../../cred";
import { RecoverableAgent } from "../agent.recoverable";
import { createPiAgent } from "./pi.agent";
import type { ContentBlockHandler, ContentBlockEvent } from "./pi.agent";

export function createPiGoogleAdapter(
  credentials: Credentials,
  log: Logger,
  options: { credPrefix: string },
): ProviderAdapter {
  let cachedModels: ModelDefinition[] | null = null;

  const getCredential = (key: string) => credentials.get(`${options.credPrefix}.${key}`);
  const setCredential = (key: string, value: string) => credentials.set(`${options.credPrefix}.${key}`, value);

  return {
    id: "google",
    name: "Google Gemini",
    searchModel: "gemini-2.5-flash",

    async dispose() {
      log.info("Disposing pi-ai Google adapter");
      cachedModels = null;
    },

    async models(): Promise<ModelDefinition[]> {
      if (cachedModels) return cachedModels;

      try {
        const models = getModels("google-gemini-cli");
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
        log.warn("Failed to get Google models from pi-ai", { error: String(err) });
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
        if (!token) throw new Error("No Google credentials found — please authenticate with Google");
        const projectId = await getCredential("projectId") ?? "";
        if (!projectId) throw new Error("No Google Cloud project found. Enable Gemini API (Cloud Code Assist) in your Google Cloud project first, then re-authenticate.");

        const model = getModel("google-gemini-cli", modelId as any);
        if (!model) throw new Error(`Unknown Google model: ${modelId}`);

        const apiKey = JSON.stringify({ token, projectId });
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

        return createPiAgent({ model, apiKey, thinkingLevel, log, onPayload, onContentBlock, nudgeToolUse: true, thinkingBudgets: { minimal: 512 } });
      };

      const inner: Agent = {
        async *stream(turn) {
          const agent = await createInner();
          yield* agent.stream(turn);
        },
      };

      return new RecoverableAgent(inner, [
        {
          match: (err) => err.includes("401") || err.includes("unauthorized") || err.includes("UNAUTHENTICATED"),
          recover: async () => {
            const refreshToken = await getCredential("refreshToken");
            if (!refreshToken) throw new Error("No refresh token available");

            log.info("Refreshing Google OAuth token via pi-ai");
            const newCreds = await refreshGoogleCloudToken(refreshToken, "");
            await setCredential("token", newCreds.access);
            if (newCreds.refresh) await setCredential("refreshToken", newCreds.refresh);

            log.info("Google OAuth token refreshed successfully");
            return createInner();
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
