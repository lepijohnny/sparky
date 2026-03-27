import { beforeEach, describe, expect, test } from "vitest";
import { noopLogger } from "../../logger";
import type { LlmConnection } from "../../settings/llm.types";
import { createEventBus, type EventBus } from "../bus";
import type { ConfigManager } from "../config";
import type { Registry } from "../registry";
import { createRegistryCrud } from "../registry.crud";
import type { ModelDefinition, ProviderAdapter } from "../registry.types";

// ── Helpers ──────────────────────────────────────────────────────────

const MODEL_A: ModelDefinition = { id: "model-a", label: "Model A" };
const MODEL_B: ModelDefinition = { id: "model-b", label: "Model B" };
const MODEL_C: ModelDefinition = { id: "model-c", label: "Model C" };

function mockAdapter(id: string, models: ModelDefinition[]): ProviderAdapter {
  return {
    id,
    name: id,
    models: async () => models,
    createAgent: () => { throw new Error("not implemented"); },
    validate: async () => true,
  };
}

function mockRegistry(adapters: ProviderAdapter[]): Registry {
  const map = new Map(adapters.map((a) => [a.id, a]));
  return { get: (id: string) => map.get(id), dispose: async () => {} };
}

function mockConfig(conns: LlmConnection[], defaultId?: string): ConfigManager {
  return {
    get: (key: string) => {
      if (key === "llms") return conns;
      if (key === "llmDefault") return defaultId ? { id: defaultId } : null;
      return null;
    },
  } as unknown as ConfigManager;
}

function conn(id: string, provider: string, model?: string): LlmConnection {
  return { id, provider, name: `${provider} conn`, grant: "pat", credPrefix: `llm.${provider}.pat`, model, createdAt: "" } as LlmConnection;
}

// ── Tests ────────────────────────────────────────────────────────────

let bus: EventBus;

beforeEach(() => {
  bus = createEventBus(noopLogger);
});

describe("core.registry.model", () => {
  test("given existing provider+model, when resolving, then returns exact match", async () => {
    const registry = mockRegistry([mockAdapter("anthropic", [MODEL_A, MODEL_B])]);
    const config = mockConfig([conn("c1", "anthropic", "model-a")], "c1");
    createRegistryCrud(bus, config, registry);

    const result = await bus.emit("core.registry.model", { provider: "anthropic", model: "model-b" });
    expect(result).toMatchObject({ provider: "anthropic", model: "model-b", label: "Model B", supportsThinking: false });
  });

  test("given unknown model, when resolving, then falls back to default", async () => {
    const registry = mockRegistry([mockAdapter("anthropic", [MODEL_A])]);
    const config = mockConfig([conn("c1", "anthropic", "model-a")], "c1");
    createRegistryCrud(bus, config, registry);

    const result = await bus.emit("core.registry.model", { provider: "anthropic", model: "nonexistent" });
    expect(result).toMatchObject({ provider: "anthropic", model: "model-a", label: "Model A", supportsThinking: false });
  });

  test("given unknown provider, when resolving, then falls back to default", async () => {
    const registry = mockRegistry([mockAdapter("anthropic", [MODEL_A])]);
    const config = mockConfig([conn("c1", "anthropic", "model-a")], "c1");
    createRegistryCrud(bus, config, registry);

    const result = await bus.emit("core.registry.model", { provider: "unknown", model: "model-a" });
    expect(result).toMatchObject({ provider: "anthropic", model: "model-a", label: "Model A", supportsThinking: false });
  });

  test("given provider without model, when resolving, then picks first model", async () => {
    const registry = mockRegistry([mockAdapter("anthropic", [MODEL_A, MODEL_B])]);
    const config = mockConfig([conn("c1", "anthropic")], "c1");
    createRegistryCrud(bus, config, registry);

    const result = await bus.emit("core.registry.model", { provider: "anthropic" });
    expect(result).toMatchObject({ provider: "anthropic", model: "model-a", label: "Model A", supportsThinking: false });
  });

  test("given empty request, when resolving, then returns default connection model", async () => {
    const registry = mockRegistry([mockAdapter("anthropic", [MODEL_A])]);
    const config = mockConfig([conn("c1", "anthropic", "model-a")], "c1");
    createRegistryCrud(bus, config, registry);

    const result = await bus.emit("core.registry.model", {});
    expect(result).toMatchObject({ provider: "anthropic", model: "model-a", label: "Model A", supportsThinking: false });
  });

  test("given default connection without model, when resolving, then picks first available", async () => {
    const registry = mockRegistry([mockAdapter("ollama", [MODEL_B, MODEL_C])]);
    const config = mockConfig([conn("c1", "ollama")], "c1");
    createRegistryCrud(bus, config, registry);

    const result = await bus.emit("core.registry.model", {});
    expect(result).toMatchObject({ provider: "ollama", model: "model-b", label: "Model B", supportsThinking: false });
  });

  test("given no connections, when resolving, then returns empty", async () => {
    const registry = mockRegistry([mockAdapter("anthropic", [MODEL_A])]);
    const config = mockConfig([]);
    createRegistryCrud(bus, config, registry);

    const result = await bus.emit("core.registry.model", {});
    expect(result).toMatchObject({ provider: "", model: "", label: "", supportsThinking: false });
  });

  test("given no default set and empty request, when resolving, then returns empty", async () => {
    const registry = mockRegistry([mockAdapter("anthropic", [MODEL_A])]);
    const config = mockConfig([conn("c1", "anthropic")]);
    createRegistryCrud(bus, config, registry);

    const result = await bus.emit("core.registry.model", {});
    expect(result).toMatchObject({ provider: "", model: "", label: "", supportsThinking: false });
  });

  test("given adapter with no models, when resolving, then returns empty", async () => {
    const registry = mockRegistry([mockAdapter("anthropic", [])]);
    const config = mockConfig([conn("c1", "anthropic")], "c1");
    createRegistryCrud(bus, config, registry);

    const result = await bus.emit("core.registry.model", {});
    expect(result).toMatchObject({ provider: "", model: "", label: "", supportsThinking: false });
  });

  test("given multiple providers, when resolving non-default, then returns correct provider", async () => {
    const anthropicAdapter = mockAdapter("anthropic", [MODEL_A]);
    const ollamaAdapter = mockAdapter("ollama", [MODEL_B]);
    const registry = mockRegistry([anthropicAdapter, ollamaAdapter]);
    const config = mockConfig(
      [conn("c1", "anthropic", "model-a"), conn("c2", "ollama", "model-b")],
      "c1",
    );
    createRegistryCrud(bus, config, registry);

    const result = await bus.emit("core.registry.model", { provider: "ollama", model: "model-b" });
    expect(result).toMatchObject({ provider: "ollama", model: "model-b", label: "Model B", supportsThinking: false });
  });
});
