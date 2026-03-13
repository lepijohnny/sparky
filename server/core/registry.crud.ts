import type { EventBus } from "./bus";
import type { Configuration } from "./config";
import type { Registry } from "./registry";

export function createRegistryCrud(bus: EventBus, config: Configuration, registry: Registry): void {
  bus.on("core.registry.model", async (data) => {
    const empty = { provider: "", model: "", label: "", supportsThinking: false, supportsAttachments: undefined as string[] | undefined };

    const conns = config.get("llms") ?? [];
    const defaultId = config.get("llmDefault")?.id;
    const defaultConn = conns.find((c) => c.id === defaultId);

    if (data.provider) {
      const adapter = registry.get(data.provider);
      if (adapter) {
        const conn = conns.find((c) => c.provider === data.provider) ?? defaultConn;
        const models = await adapter.models(conn);
        const found = data.model
          ? models.find((m) => m.id === data.model)
          : models[0];
        if (found) {
          return { provider: data.provider, model: found.id, label: found.label, supportsThinking: !!found.supportsThinking, contextWindow: found.contextWindow, supportsAttachments: found.supportsAttachments };
        }
      }
    }

    if (!defaultConn) return empty;

    const adapter = registry.get(defaultConn.provider);
    if (!adapter) return empty;

    const models = await adapter.models(defaultConn);
    const model = defaultConn.model
      ? models.find((m) => m.id === defaultConn.model)
      : models[0];

    if (!model) return empty;

    return { provider: defaultConn.provider, model: model.id, label: model.label, supportsThinking: !!model.supportsThinking, contextWindow: model.contextWindow, supportsAttachments: model.supportsAttachments };
  });
}
