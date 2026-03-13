import type { Logger } from "../logger.types";
import type { LlmConnection } from "../settings/llm.types";
import type { AuthManager } from "./auth/auth";
import type { EventBus } from "./bus";
import type { Configuration } from "./config";
import type { AdapterCatalog } from "./adapters/adapters";
import type { ModelDefinition, ProviderAdapter, ProviderDefinition, RegistryListResponse } from "./registry.types";

export interface Registry {
  get(id: string): ProviderAdapter | undefined;
  dispose(): Promise<void>;
}

export function createRegistry(bus: EventBus, config: Configuration, adapters: AdapterCatalog, auth: AuthManager, log: Logger): Registry {

  function findConnection(providerId: string): LlmConnection | undefined {
    return (config.get("llms") ?? []).find((c) => c.provider === providerId);
  }

  function findConnectionById(id: string): LlmConnection | undefined {
    return (config.get("llms") ?? []).find((c) => c.id === id);
  }

  async function fetchProvider(adapter: ProviderAdapter): Promise<ProviderDefinition> {
    const conn = findConnection(adapter.id);
    const base = { id: adapter.id, name: adapter.name };

    try {
      const models = await Promise.race([
        adapter.models(conn),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Model fetch timed out")), 5000)),
      ]);
      return { ...base, models };
    } catch (err) {
      const warning = err instanceof Error ? err.message : String(err);
      log.warn("Failed to fetch models", { provider: adapter.id, error: warning });
      return { ...base, models: [], warning };
    }
  }

  bus.on("core.registry.list", async (): Promise<RegistryListResponse> => {
    const providers = await Promise.all(
      adapters.all().map((adapter) => fetchProvider(adapter)),
    );
    const flows = auth.definitions() ?? [];
    log.debug("Listing providers", { count: providers.length, flows: flows.length });
    return { providers, flows };
  });

  bus.on("core.registry.models", async (data): Promise<{ models: ModelDefinition[] }> => {
    const adapter = adapters.getById(data.provider);
    if (!adapter) return { models: [] };
    const conn = data.connectionId
      ? findConnectionById(data.connectionId)
      : findConnection(data.provider);
    return { models: await adapter.models(conn) };
  });

  bus.on("core.registry.validate", async (data): Promise<{ ok: boolean; error?: string }> => {
    const adapter = adapters.getById(data.provider);
    if (!adapter) return { ok: false, error: `Unknown provider: ${data.provider}` };
    const conn = data.host
      ? { host: data.host } as LlmConnection
      : findConnection(data.provider);
    try {
      const ok = await adapter.validate(conn);
      return ok ? { ok: true } : { ok: false, error: "Connection failed" };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  return {
    get(id) {
      return adapters.getById(id);
    },

    async dispose() {
      log.info("Disposing registry");
      await Promise.allSettled(
        adapters.all()
          .filter((a) => a.dispose)
          .map((a) => a.dispose!()),
      );
      log.info("Registry disposed");
    },
  };
}
