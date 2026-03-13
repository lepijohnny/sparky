import type { Model, Api } from "@mariozechner/pi-ai";
import type { Logger } from "../../../logger.types";
import type { LlmConnection } from "../../../settings/llm.types";
import type { Agent } from "../../agent.types";
import type { ModelDefinition, ProviderAdapter } from "../../registry.types";
import { createPiAgent } from "./pi.agent";

const THINKING_FAMILIES = ["qwen3", "deepseek-r1", "phi4"];

function supportsThinking(name: string): boolean {
  return THINKING_FAMILIES.some((f) => name.toLowerCase().startsWith(f));
}

function formatLabel(name: string): string {
  const [base, tag] = name.split(":");
  const label = base
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return tag ? `${label} ${tag.toUpperCase()}` : label;
}

const CACHE_TTL = 30_000;

interface OllamaModel {
  name: string;
  details?: { family?: string; families?: string[] };
}

interface OllamaShowResponse {
  model_info?: Record<string, unknown>;
  parameters?: string;
}

interface CacheEntry {
  models: ModelDefinition[];
  expires: number;
}

async function fetchShowInfo(
  host: string,
  model: string,
): Promise<{ contextWindow?: number; parameterSize: number; supportsVision: boolean }> {
  try {
    const res = await fetch(`${host}/api/show`, {
      method: "POST",
      body: JSON.stringify({ name: model }),
    });
    if (!res.ok) return { parameterSize: 0, supportsVision: false };
    const json = (await res.json()) as OllamaShowResponse;
    const info = json.model_info ?? {};

    const ctxKey = Object.keys(info).find((k) => k.endsWith("context_length"));
    const contextWindow = ctxKey ? (info[ctxKey] as number) : undefined;

    const paramKey = Object.keys(info).find((k) => k.endsWith("parameter_count"));
    const paramCount = paramKey ? (info[paramKey] as number) : 0;
    const parameterSize = Math.round(paramCount / 1_000_000_000);

    const supportsVision = Object.keys(info).some((k) => k.includes("projector"));

    return { contextWindow, parameterSize, supportsVision };
  } catch {
    return { parameterSize: 0, supportsVision: false };
  }
}

function buildOllamaModel(modelId: string, host: string, contextWindow?: number): Model<Api> {
  return {
    id: modelId,
    name: modelId,
    api: "openai-completions" as Api,
    provider: "ollama",
    baseUrl: `${host}/v1`,
    headers: {},
    reasoning: supportsThinking(modelId),
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: contextWindow ?? 8192,
    maxTokens: 4096,
  };
}

export function createPiOllamaAdapter(log: Logger): ProviderAdapter {
  const cache = new Map<string, CacheEntry>();

  return {
    id: "ollama",
    name: "Ollama",

    async dispose() {
      log.info("Disposing pi-ai Ollama adapter");
      cache.clear();
    },

    async models(conn?: LlmConnection): Promise<ModelDefinition[]> {
      const host = conn?.host ?? "http://localhost:11434";

      const cached = cache.get(host);
      if (cached && cached.expires > Date.now()) return cached.models;

      try {
        const res = await fetch(`${host}/api/tags`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { models?: OllamaModel[] };

        const models = await Promise.all(
          (json.models ?? []).map(async (m) => {
            const showInfo = await fetchShowInfo(host, m.name);
            return {
              id: m.name,
              label: formatLabel(m.name),
              contextWindow: showInfo.contextWindow,
              supportsThinking: supportsThinking(m.name),
              supportsTools: true,
              ...(showInfo.supportsVision ? { supportsAttachments: ["png", "jpg", "jpeg", "gif", "webp"] as string[] } : {}),
              webSearch: "local" as const,
            };
          }),
        );

        cache.set(host, { models, expires: Date.now() + CACHE_TTL });
        log.debug("Fetched Ollama models", { host, count: models.length });
        return models;
      } catch (err) {
        log.warn("Failed to fetch Ollama models", { host, error: String(err) });
        return [];
      }
    },

    createAgent(conn: LlmConnection, _agentOpts?: { webSearch?: boolean }): Agent {
      const host = conn.host ?? "http://localhost:11434";
      const modelId = conn.model ?? "";
      const thinkingLevel = conn.thinking ?? 0;

      if (!modelId) {
        return {
          async *stream() {
            yield { type: "error" as const, message: "No model configured on connection" };
            yield { type: "done" as const };
          },
        };
      }

      const cached = cache.get(host);
      const modelDef = cached?.models.find((m) => m.id === modelId);
      const model = buildOllamaModel(modelId, host, modelDef?.contextWindow);

      if (thinkingLevel <= 0) {
        model.reasoning = false;
      }

      return createPiAgent({ model, apiKey: "ollama", thinkingLevel, log });
    },

    async validate(conn?: LlmConnection): Promise<boolean> {
      const host = conn?.host ?? "http://localhost:11434";
      try {
        const res = await fetch(`${host}/api/tags`);
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
