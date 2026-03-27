import type { EventBus } from "./bus";
import type { Configuration } from "./config";
import type { Registry } from "./registry";
import { supportedAttachmentExtensions } from "./md.converter";

export function createRegistryCrud(bus: EventBus, config: Configuration, registry: Registry): void {
  bus.on("core.registry.model", async (data) => {
    const markitExts = supportedAttachmentExtensions();
    const empty = { provider: "", model: "", label: "", supportsThinking: false, supportsAttachments: undefined as string[] | undefined };
    const mergeAttachments = (imageExts?: string[]) => imageExts ? [...new Set([...imageExts, ...markitExts])] : markitExts;

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
          return { provider: data.provider, model: found.id, label: found.label, supportsThinking: !!found.supportsThinking, contextWindow: found.contextWindow, supportsAttachments: mergeAttachments(found.supportsAttachments) };
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

    return { provider: defaultConn.provider, model: model.id, label: model.label, supportsThinking: !!model.supportsThinking, contextWindow: model.contextWindow, supportsAttachments: mergeAttachments(model.supportsAttachments) };
  });
}
